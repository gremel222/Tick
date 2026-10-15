/**
 * dom.js — мини-хелперы для построения интерфейса и рендер разметки справочника.
 *
 * Разметка в данных (генерируется сборщиком):
 *   [текст](url)          — внешняя ссылка
 *   [текст](doc:path)     — ссылка на страницу справочника (внутренний роут)
 *   [[k]]Ctrl-B[[/k]]     — клавиша
 *   [[ui]]Mode[[/ui]]     — элемент интерфейса (подсвечивается, показывает русское имя)
 *   [[code]]…[[/code]]    — код
 *   **жирный**, _курсив_
 */

export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(3)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  for (const c of children.flat(3)) if (c !== null && c !== undefined && c !== false) f.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return f;
};

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

const htmlUnescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * Превращает строку разметки в DOM.
 * @param {string} src
 * @param {{ru?: (term: string) => string|undefined, link?: (id: string, anchor: string) => string, onLink?: (id:string)=>void}} opts
 */
export function renderMarkup(src, opts = {}) {
  const out = frag();
  if (!src) return out;
  const s = htmlUnescape(String(src));

  // Разбиваем на токены: специальные маркеры и ссылки, всё прочее — текст
  const parts = [];
  const re = /\[\[k\]\]([\s\S]*?)\[\[\/k\]\]|\[\[ui\]\]([\s\S]*?)\[\[\/ui\]\]|\[\[code\]\]([\s\S]*?)\[\[\/code\]\]|\[\[img\]\]([\s\S]*?)\[\[\/img\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ t: 'k', v: m[1] });
    else if (m[2] !== undefined) parts.push({ t: 'ui', v: m[2] });
    else if (m[3] !== undefined) parts.push({ t: 'code', v: m[3] });
    else if (m[4] !== undefined) parts.push({ t: 'img', v: m[4] });
    else parts.push({ t: 'link', label: m[5], href: m[6] });
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ t: 'text', v: s.slice(last) });

  for (const p of parts) {
    if (p.t === 'k') out.append(h('kbd', { text: p.v.trim() }));
    else if (p.t === 'code') out.append(h('code', { class: 'mono', text: p.v }));
    else if (p.t === 'img') { /* изображения не поставляем — подпись идёт отдельным блоком */ }
    else if (p.t === 'ui') {
      const ru = opts.ru ? opts.ru(p.v.trim()) : undefined;
      out.append(h('span', { class: 'uicode', text: p.v, ...(ru ? { 'data-ru': ru, title: `${p.v} — ${ru}` } : {}) }));
    } else if (p.t === 'link') {
      const href = p.href;
      const label = renderMarkup(p.label, opts);
      if (href.startsWith('doc:')) {
        const [id, anchor] = href.slice(4).split('#');
        const url = opts.link ? opts.link(id, anchor || '') : `#/doc/${id}${anchor ? '#' + anchor : ''}`;
        out.append(h('a', { href: url, onclick: opts.onLink ? (e) => { e.preventDefault(); opts.onLink(id, anchor || ''); } : null }, label));
      } else {
        out.append(h('a', { href, target: '_blank', rel: 'noopener' }, label));
      }
    } else {
      out.append(...inlineText(p.v));
    }
  }
  return out;
}

/** Простейшая инлайн-разметка внутри текста: **жирный**, _курсив_. */
function inlineText(v) {
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|_[^_\n]{1,60}_)/g;
  let last = 0;
  let m;
  while ((m = re.exec(v))) {
    if (m.index > last) nodes.push(document.createTextNode(v.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('**')) nodes.push(h('strong', { text: tok.slice(2, -2) }));
    else nodes.push(h('em', { text: tok.slice(1, -1) }));
    last = re.lastIndex;
  }
  if (last < v.length) nodes.push(document.createTextNode(v.slice(last)));
  return nodes;
}

/** Подсветка совпадений в строке (для результатов поиска). */
export function highlight(text, words, limit = 240) {
  const src = String(text || '').slice(0, limit);
  if (!words || !words.length) return document.createTextNode(src);
  const escaped = words.filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return document.createTextNode(src);
  const re = new RegExp(`(${escaped.join('|')})`, 'giu');
  const out = frag();
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.append(document.createTextNode(src.slice(last, m.index)));
    out.append(h('mark', { text: m[0] }));
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  if (last < src.length) out.append(document.createTextNode(src.slice(last)));
  return out;
}

export function toast(msg, ms = 2400) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const t = h('div', { class: 'toast', text: msg });
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
}

export function icon(name, size = 18) {
  const paths = {
    search: 'M11 4a7 7 0 105.3 11.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z',
    book: 'M4 3h9a3 3 0 013 3v15a3 3 0 00-3-3H4zM4 3v15h9a3 3 0 013 3V6a3 3 0 00-3-3z',
    cap: 'M12 3L2 8l10 5 8-4v6h2V8L12 3zM6 12v4c0 1 2 3 6 3s6-2 6-3v-4l-6 3-6-3z',
    target: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a7 7 0 110 14 7 7 0 010-14zm0 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
    chart: 'M4 20h16v-2H4zM6 16h3V9H6zM11 16h3V4h-3zM16 16h3v-8h-3z',
    sun: 'M12 5a7 7 0 100 14 7 7 0 000-14zm0-5h0v3m0 0V0m0 24v-3m0-18A9 9 0 003 12m18 0a9 9 0 00-9-9',
    home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z',
  };
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${paths[name] || paths.search}"/></svg>`;
  return h('span', { html: svg, class: 'ico' });
}
