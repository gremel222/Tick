/** reference.js — справочник: разделы, дерево страниц и читалка. */

import { h, frag, renderMarkup, toast, icon } from '../lib/dom.js';
import * as data from '../lib/data.js';
import * as store from '../lib/store.js';
import { go, getSearch } from '../app.js';
import { searchBox, breadcrumbs, markButtons, loadingNote, queryParam } from './parts.js';
import { COURSE, findLessonForDoc } from '../../content/course.js';

const ADMON_RU = {
  note: 'Примечание', warning: 'Предупреждение', tip: 'Совет', hint: 'Подсказка',
  important: 'Важно', caution: 'Осторожно', 'see-also': 'См. также', reference: 'Справка',
  example: 'Пример', info: 'Информация',
};

/* ─────────────────────── список разделов ─────────────────────── */

export function refScreen(parts, ctx) {
  const sectionId = parts[1] || queryParam('p');
  if (sectionId) return sectionScreen(sectionId, ctx);
  return allSections(ctx);
}

function allSections(ctx) {
  const wrap = h('div');
  const visited = store.get().progress.visited;
  wrap.append(
    h('h1', { text: 'Справочник Blender' }),
    h('p', { class: 'lead' },
      `${ctx.meta.counts.pages} страниц руководства и Python API из зеркала Blender ${ctx.meta.sourceVersion} `,
      h('span', { class: 'faint', text: `(ссылки ведут на актуальную версию ${ctx.meta.targetVersion})` }),
      '. Открывайте раздел и отмечайте изученное — прогресс попадёт в карту знаний.'),
    searchBox({ placeholder: 'Найти страницу: sidebar, overlays, subdivision surface…' }));

  const counts = new Map();
  for (const id of Object.keys(visited)) {
    const top = id.split('/')[0];
    counts.set(top, (counts.get(top) || 0) + 1);
  }

  const list = h('div', { style: 'margin-top:18px' });
  for (const s of ctx.meta.sections) {
    const v = counts.get(s.id) || 0;
    const pct = Math.min(100, Math.round((v / Math.max(1, s.pages)) * 100));
    list.append(h('a', { class: 'tree-head', href: `#/ref/${s.id}`, style: 'margin-bottom:8px;text-decoration:none' },
      h('span', { style: 'font-size:18px', text: sectionEmoji(s.id) }),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { style: 'font-weight:600;color:var(--text)', text: s.ru }),
        h('div', { class: 'tiny faint', text: `${s.pages} страниц · открыто ${v}` }),
        h('div', { class: 'bar', style: 'margin-top:6px;max-width:280px' }, h('i', { style: `width:${pct}%` }))),
      h('span', { class: 'tiny faint nowrap', text: `${pct}%` })));
  }
  wrap.append(list);
  return wrap;
}

const sectionEmoji = (id) => ({
  getting_started: '🚀', interface: '🖥️', editors: '🧰', scene_layout: '🗂️', modeling: '🧱',
  sculpt_paint: '🖌️', grease_pencil: '✏️', animation: '🎞️', physics: '🌀', render: '💡',
  compositing: '🧩', movie_clip: '🎥', video_editing: '🎬', files: '💾', addons: '🧩',
  advanced: '⚙️', troubleshooting: '🛠️', glossary: '📖', contribute: '🤝', api: '🐍',
}[id] || '📄');

/* ─────────────────────── страницы раздела ─────────────────────── */

function sectionScreen(sectionId, ctx) {
  const s = ctx.meta.sections.find((x) => x.id === sectionId);
  const wrap = h('div');
  wrap.append(
    h('div', { class: 'breadcrumbs' }, h('a', { href: '#/ref', text: 'Справочник' }), h('span', { text: '→' }), h('span', { text: s ? s.ru : sectionId })),
    h('h1', { text: s ? s.ru : sectionId }),
    searchBox({ placeholder: 'Фильтр по страницам этого раздела…', onSubmit: (q) => go(`ask/${encodeURIComponent(q)}`) }));

  const body = h('div', { style: 'margin-top:16px', class: 'card' }, h('span', { class: 'muted', text: 'Загружаю список страниц…' }), loadingNote());
  wrap.append(body);

  (async () => {
    let pages;
    try {
      pages = await data.loadSection(sectionId);
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted', text: String(e.message || e) }));
      return;
    }
    const filter = h('input', { type: 'search', placeholder: 'Фильтр по названию или пути…', style: 'width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--line);background:var(--bg-inset);color:var(--text)' });
    const listEl = h('div', { style: 'margin-top:12px;max-height:66vh;overflow:auto' });

    const draw = () => {
      const q = filter.value.trim().toLowerCase();
      const marked = store.get().progress.marked;
      const visited = store.get().progress.visited;
      const items = pages
        .filter((p) => !q || p.t.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
        .sort((a, b) => a.id.localeCompare(b.id));
      listEl.replaceChildren(...items.slice(0, 600).map((p) => h('a', {
        class: `tree-link${marked[p.id] ? ' done' : ''}`, href: `#/doc/${p.id}`,
      },
        h('span', { class: 'dot' }),
        h('span', { text: p.t }),
        p.k === 'api' ? h('span', { class: 'badge tiny', text: 'API' }) : null,
        visited[p.id] ? h('span', { class: 'tiny faint', text: '· открыто' }) : null)));
      if (!items.length) listEl.replaceChildren(h('div', { class: 'empty', text: 'Ничего не найдено' }));
      if (items.length > 600) listEl.append(h('div', { class: 'tiny faint', style: 'padding:8px', text: `Показаны первые 600 из ${items.length} — уточните фильтр` }));
    };
    filter.addEventListener('input', draw);
    body.replaceChildren(h('div', { class: 'row', style: 'justify-content:space-between' },
      h('div', { class: 'small muted', text: `${pages.length} страниц` }),
      s ? null : null), filter, listEl);
    draw();
  })();

  return wrap;
}

/* ─────────────────────── читалка ─────────────────────── */

export function docScreen(parts, ctx) {
  const id = parts.slice(1).join('/') || queryParam('p');
  const wrap = h('div');
  if (!id) { wrap.append(h('div', { class: 'empty', text: 'Страница не указана' })); return wrap; }
  const holder = h('div', {}, h('div', { class: 'card', text: 'Загружаю страницу…' }), loadingNote());
  wrap.append(holder);

  (async () => {
    let doc, section;
    try {
      doc = await data.getDoc(id);
      section = await data.loadSection(id.split('/')[0]);
    } catch (e) {
      holder.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'muted', text: String(e.message || e) })));
      return;
    }
    if (!doc) {
      holder.replaceChildren(h('div', { class: 'card' },
        h('h3', { text: 'Страница не найдена' }),
        h('p', { class: 'muted', text: `В справочнике нет страницы «${id}». Попробуйте поиск.` }),
        h('a', { class: 'btn', href: `#/ask/${encodeURIComponent(id.split('/').pop().replace(/_/g, ' '))}`, text: 'Искать в справочнике' })));
      return;
    }
    store.visit(doc.id);
    const utils = ctx.utils;
    const ruOf = (t) => utils?.ruOf(t) || undefined;
    const markup = (s) => renderMarkup(s, { ru: ruOf, onLink: (target) => go(`doc/${target}`) });

    // оглавление
    const headings = doc.b.flatMap((b, index) => (b[0] === 'h' && b[1] <= 4 ? [{ level: b[1], text: b[2], index }] : []));
    const toc = headings.length > 1 ? h('aside', { class: 'reader-toc card' },
      h('div', { class: 'tiny faint', style: 'margin-bottom:6px', text: 'Содержание' }),
      headings.map((hd) => h('a', { class: `lvl-${hd.level}`, href: `#block-${hd.index}`, text: hd.text.replace(/\[\[[^\]]*\]\]/g, '') })))
      : null;

    const bodyEl = h('div', { class: 'reader-body' });
    doc.b.forEach((b, index) => {
      const node = blockNode(b, index, markup, ruOf, ctx);
      if (node) bodyEl.append(node);
    });

    const kids = section.filter((p) => p.id.startsWith(doc.id + '/') && p.id.split('/').length === doc.id.split('/').length + 1).slice(0, 12);
    const path = utils ? utils.crumb(doc.id) : [{ id: doc.id, title: doc.t }];
    const ruTitle = ruOf(doc.t);
    const lesson = findLessonForDoc(doc.id);

    holder.replaceChildren(
      h('div', { class: 'breadcrumbs' },
        h('a', { href: '#/ref', text: 'Справочник' }), h('span', { text: '→' }),
        h('a', { href: `#/ref/${doc.s}`, text: ctx.meta.sections.find((x) => x.id === doc.s)?.ru || doc.s }), h('span', { text: '→' }),
        h('span', { text: doc.t })),
      h('div', { class: 'spread', style: 'align-items:flex-start' },
        h('div', {},
          h('h1', { style: 'margin-bottom:4px', text: doc.t }),
          ruTitle && ruTitle !== doc.t ? h('div', { class: 'ru-label small', text: `по-русски: «${ruTitle}»` }) : null,
          h('div', { class: 'row', style: 'margin-top:8px' },
            h('span', { class: 'badge', text: doc.k === 'api' ? 'Python API' : 'Руководство' }),
            h('span', { class: 'badge', text: `${doc.b.length} блоков` }),
            h('span', { class: 'badge', text: doc.id }))),
        lesson ? h('a', { class: 'btn btn-primary btn-sm', href: `#/lesson/${lesson.module.id}/${lesson.lesson.id}`, text: '🎓 Урок по теме' }) : null),
      markButtons(doc.id, () => {}),
      h('div', { class: 'reader', style: 'margin-top:20px' }, toc, bodyEl),
      kids.length ? h('div', { style: 'margin-top:26px' },
        h('h2', { text: 'В этом разделе' }),
        h('div', {}, kids.map((p) => h('a', { class: 'tree-link', href: `#/doc/${p.id}` }, h('span', { class: 'dot' }), h('span', { text: p.t }))))) : null,
      h('div', { class: 'foot small faint' },
        h('p', { text: doc.k === 'api' ? 'Источник: Blender Python API Reference (GPL-2.0-or-later).' : 'Источник: Blender Reference Manual (CC BY-SA 4.0). Текст приведён на языке оригинала — русские названия интерфейса подставляются из официального перевода.' }),
        h('p', {}, h('a', { href: data.officialUrl(doc.id, 'ru'), target: '_blank', rel: 'noopener', text: 'Открыть официальную страницу (RU) ↗' }))));
  })();

  return wrap;
}

/* ─────────────────────── рендер блоков ─────────────────────── */

function blockNode(b, index, markup, ruOf, ctx) {
  const id = `block-${index}`;
  switch (b[0]) {
    case 'h': {
      const lvl = Math.min(4, Math.max(2, b[1]));
      return h(`h${lvl}`, { id }, markup(b[2]));
    }
    case 'p':
      return h('p', { id }, markup(b[1]));
    case 'd': {
      const term = b[1];
      const ru = ruOf(term.replace(/\[\[[^\]]*\]\]/g, '').trim());
      return h('div', { class: 'def', id },
        h('div', { class: 'def-term' }, markup(term), ru ? h('span', { class: 'ru-label tiny', text: ` · ${ru}` }) : null,
          h('button', {
            class: 'btn btn-sm btn-ghost', style: 'float:right', title: 'Добавить в повторение',
            onclick: () => { store.srsAdd('anchor:' + (term.replace(/\[\[[^\]]*\]\]/g, '').trim())); toast('В повторении'); },
          }, '🔁')),
        h('div', { class: 'def-text' }, markup(b[2] || '')));
    }
    case 'l': {
      const tag = b[1] ? 'ol' : 'ul';
      return h(tag, { id }, b[2].map((it) => h('li', {}, markup(it))));
    }
    case 'n':
      return h('div', { class: `admon ${b[1]}` }, h('b', { text: ADMON_RU[b[1]] || b[1] }), h('div', {}, markup(b[2])));
    case 'c':
      return h('pre', { id }, b[1]);
    case 'b':
      return h('table', { id },
        h('thead', {}, h('tr', {}, b[1].map((c) => h('th', {}, markup(c))))),
        h('tbody', {}, b[2].map((row) => h('tr', {}, row.map((c) => h('td', {}, markup(c)))))));
    case 'cap':
      return h('div', { class: 'imgcap', text: b[1].replace(/\[\[[^\]]*\]\]/g, '') });
    case 'i':
      return b[1] ? h('div', { class: 'imgcap', text: `🖼 ${b[1]}` }) : null;
    default:
      return null;
  }
}
