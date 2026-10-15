/**
 * md.mjs — парсер Markdown-зеркала справочного руководства Blender (сборка Sphinx → Markdown).
 *
 * Особенности формата зеркала, которые здесь учтены:
 *   • Определения (опции интерфейса):  «Термин» → строка из пробелов → описание
 *   • Admonitions: отдельная строка «Note» / «Warning» / «Hint» → пустая строка → текст
 *   • Клавиши: `Ctrl`-`B`  (несколько code-span через дефис)
 *   • UI-элементы в курсиве: _Mode_, _Start_
 *   • Ссылки: [текст](../../relative/path.md)
 *
 * Блок — компактный массив: [type, ...payload]
 *   ['h', уровень, текст]              заголовок
 *   ['p', текст]                       абзац
 *   ['d', термин, текст, blockIdx]     определение опции
 *   ['l', ordered, [пункты]]           список
 *   ['n', вид, текст]                  note / warning / hint / tip / important / see-also / reference
 *   ['c', текст]                       код
 *   ['b', [заголовки], [[ячейки]]]     таблица
 *   ['i', alt]                         изображение
 *   ['cap', текст]                     подпись к изображению
 */

export const ADMON_KINDS = new Set(['note', 'warning', 'tip', 'hint', 'important', 'caution', 'see-also', 'reference', 'example', 'info']);

const ADMON_WORDS = new Map([
  ['note', 'note'], ['примечание', 'note'],
  ['warning', 'warning'], ['предупреждение', 'warning'],
  ['tip', 'tip'], ['совет', 'tip'],
  ['hint', 'hint'], ['подсказка', 'hint'],
  ['important', 'important'], ['важно', 'important'],
  ['caution', 'caution'], ['осторожно', 'caution'],
  ['see also', 'see-also'], ['см. также', 'see-also'],
  ['reference', 'reference'], ['ссылка', 'reference'],
  ['example', 'example'], ['пример', 'example'],
  ['info', 'info'],
]);

/** Слова, которые считаются одиночной клавишей. */
const KEY_TOKEN = /^(Ctrl|Ctrl\+|Shift|Alt|Cmd|Command|Meta|Super|Tab|Esc|Escape|Enter|Return|Space|Spacebar|Backspace|Del|Delete|Ins|Insert|Home|End|PgUp|PgUp\.|PgDn|PageUp|PageDown|Up|Down|Left|Right|Numpad\s?[\d.+\-*\/]+|MMB|RMB|LMB|Wheel|Trackpad|F\d{1,2}|[A-Z0-9]|Numpad)$/i;
const KEY_COMBO = /^(?:(?:Ctrl|Shift|Alt|Cmd|Meta|Super)[-+]?){0,3}(?:Ctrl|Shift|Alt|Cmd|Meta|Super|Tab|Esc|Escape|Enter|Return|Space|Backspace|Del|Delete|Ins|Insert|Home|End|PgUp|PgUp\.|PgDn|PageUp|PageDown|Up|Down|Left|Right|Numpad\s?[\d.+\-*\/]+|MMB|RMB|LMB|Wheel|F\d{1,2}|[A-Za-z0-9]|\d)$/i;

const UI_WORD = /^[A-ZА-Я][A-Za-zА-Яа-я0-9 ,/&+.'()\-]{0,42}$/;

/* ─────────────────────────── подготовка ─────────────────────────── */

/** Убираем мусор, но сохраняем маркер определения (строка только из пробелов). */
export function clean(md) {
  return md
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200e\u200f\ufeff]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split('\n')
    .map((l) => (/^[ \t]+$/.test(l) ? '\u0001' : l.replace(/[ \t]+$/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/* ─────────────────────────── инлайн-разметка ─────────────────────────── */

export function makeInline(basePath) {
  const links = new Set();

  const resolveTarget = (target) => {
    const noAnchor = target.split('#')[0].trim();
    if (!noAnchor) return { url: target };
    if (/^https?:\/\//.test(noAnchor) || noAnchor.startsWith('mailto:')) return { url: target };
    if (noAnchor.includes('_images/')) return { img: true };
    const rel = noAnchor.replace(/\.md$/, '');
    const abs = rel.startsWith('/')
      ? rel.slice(1)
      : posixJoin(dirname(basePath), rel);
    const norm = normalizePath(abs);
    links.add(norm);
    return { id: norm, anchor: target.includes('#') ? target.split('#')[1] : '' };
  };

  const inline = (s) => {
    let out = s;
    // изображения
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt) => `[[img]]${alt}[[/img]]`);
    // ссылки
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => {
      const r = resolveTarget(target);
      if (r.img) return `[[img]]${label}[[/img]]`;
      if (r.url) return `[${label}](${r.url})`;
      return `[${label}](doc:${r.id}${r.anchor ? '#' + r.anchor : ''})`;
    });
    // клавиши: `Ctrl`-`B`, `Shift`-`Tab`, `Ctrl`-`Numpad 1`
    out = out.replace(/`([^`]+)`(?:\s*[-–—]\s*`([^`]+)`(?:\s*[-–—]\s*`([^`]+)`)?)(?:\s*[-–—]\s*`([^`]+)`)?/g, (m, ...groups) => {
      const parts = [];
      for (let i = 0; i < 4; i++) if (groups[i] && typeof groups[i] === 'string') parts.push(groups[i]);
      const combo = parts.join('-');
      const ok = parts.length > 0 && parts.every((p) => KEY_TOKEN.test(p.trim())) && combo.length <= 22;
      return ok ? `[[k]]${combo}[[/k]]` : m;
    });
    // inline-код: одиночные клавиши — как клавиши, остальное — как код
    out = out.replace(/`([^`]+)`/g, (m, code) => {
      const c = code.trim();
      if (KEY_TOKEN.test(c) && c.length <= 14 && !/[_.,()=]/.test(c)) return `[[k]]${c}[[/k]]`;
      return `[[code]]${code}[[/code]]`;
    });
    // UI-элементы курсивом: _Mode_ → [[ui]]Mode[[/ui]]
    out = out.replace(/_([^_\n]{1,44})_/g, (m, inner) => {
      const t = inner.trim();
      if (!UI_WORD.test(t)) return m;
      return `[[ui]]${t}[[/ui]]`;
    });
    return out.replace(/[ \t]{2,}/g, ' ').trim();
  };

  return { inline, links: () => [...links] };
}

/* ─────────────────────────── сам парсер ─────────────────────────── */

export function parseMarkdown(md, basePath) {
  const lines = clean(md).split('\n');
  const { inline, links } = makeInline(basePath);
  const blocks = [];
  const definitions = [];
  const keys = [];
  let title = '';
  const isBlank = (l) => l === undefined || l === '' || l === '\u0001';
  const isMarker = (l) => l === '\u0001';
  const isHeading = (l) => /^#{1,6}\s/.test(l ?? '');
  const isList = (l) => /^\s*(\*|-|\+|#\.|\d+\.)\s+/.test(l ?? '');
  const admonOf = (l) => ADMON_WORDS.get((l ?? '').trim().toLowerCase().replace(/:$/, ''));
  /** Термин определения: строка, за которой идёт строка-маркер. */
  const isDefTerm = (l, next) => l !== undefined && !isBlank(l) && isMarker(next) && !isHeading(l) && !isList(l);

  let i = 0;
  let guard = 0;
  const GUARD_MAX = lines.length * 4 + 1000;
  while (i < lines.length) {
    if (++guard > GUARD_MAX) throw new Error(`parseMarkdown: зацикливание на странице ${basePath} (строка ${i})`);
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // код
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push(['c', buf.join('\n')]);
      continue;
    }

    // заголовок
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (h[1].length === 1) { if (!title) title = inline(h[2]); }
      else blocks.push(['h', h[1].length, inline(h[2])]);
      i++;
      continue;
    }

    // изображение
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      blocks.push(['i', img[1].replace(/^_images\//, '')]);
      i++;
      const cap = lines[i + 1];
      if (cap && !isBlank(cap) && !isHeading(cap) && !isList(cap) && !admonOf(cap) && !isDefTerm(cap, lines[i + 2]) && cap.replace(/\[\[[^\]]*\]\]/g, '').length < 150) {
        blocks.push(['cap', inline(cap)]);
        i += 2;
      }
      continue;
    }

    // таблица
    if (/^\s*\|/.test(line) || (line.includes('|') && /^\s*[-=+|\s]{3,}$/.test(lines[i + 1] ?? ''))) {
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        const raw = lines[i].trim();
        if (/^[-=\s|+]+$/.test(raw)) { i++; continue; }
        rows.push(raw.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim())));
        i++;
      }
      if (rows.length > 1) blocks.push(['b', rows[0], rows.slice(1)]);
      else if (rows.length) blocks.push(['p', rows[0].join(' — ')]);
      continue;
    }

    // список
    if (isList(line)) {
      const items = [];
      let ordered = 0;
      const ind = line.match(/^\s*/)[0].length;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) {
          // список продолжается, если следующая непустая строка — тоже список
          let j = i;
          while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && isList(lines[j]) && lines[j].match(/^\s*/)[0].length >= ind) { i = j; continue; }
          break;
        }
        if (isMarker(l)) break;
        const m = l.match(/^\s*(\*|-|\+|#\.|\d+\.)\s+(.*)$/);
        if (m && l.match(/^\s*/)[0].length <= ind + 3) {
          if (/#\.|\d+\./.test(m[1])) ordered = 1;
          items.push(inline(m[2]));
          i++;
          while (i < lines.length && !isBlank(lines[i]) && !isList(lines[i]) && lines[i].match(/^\s*/)[0].length > ind + 3) {
            items[items.length - 1] += ' ' + inline(lines[i].trim());
            i++;
          }
        } else if (l.match(/^\s*/)[0].length > ind + 3) {
          const m2 = l.match(/^\s*(\*|-|\+|#\.|\d+\.)\s+(.*)$/);
          if (m2 && items.length) items[items.length - 1] += ' • ' + inline(m2[2]);
          i++;
        } else if (isHeading(l) || admonOf(l)) break;
        else break;
      }
      if (items.length) blocks.push(['l', ordered, items]);
      continue;
    }

    // admonition
    const admon = admonOf(line);
    if (admon && isBlank(lines[i + 1])) {
      i += 2;
      const paras = [];
      while (i < lines.length) {
        if (isBlank(lines[i])) {
          let j = i;
          while (j < lines.length && isBlank(lines[j])) j++;
          const nxt = lines[j];
          if (nxt === undefined) break;
          if (isHeading(nxt) || admonOf(nxt) || isList(nxt) || isDefTerm(nxt, lines[j + 1]) || /^```/.test(nxt) || /^!\[/.test(nxt)) break;
          paras.push(inline(nxt));
          i = j + 1;
          continue;
        }
        if (isHeading(lines[i]) || admonOf(lines[i]) || isList(lines[i]) || isDefTerm(lines[i], lines[i + 1])) break;
        paras.push(inline(lines[i]));
        i++;
      }
      if (paras.length) blocks.push(['n', admon, paras.join(' ')]);
      continue;
    }

    // определение (опция интерфейса → описание)
    if (isDefTerm(line, lines[i + 1])) {
      const term = inline(line.trim());
      const blockIdx = blocks.length;
      i += 2;
      while (i < lines.length && isBlank(lines[i])) i++;
      const paras = [];
      let cur = [];
      const flush = () => { if (cur.length) { paras.push(inline(cur.join(' '))); cur = []; } };
      let stop = false;
      while (i < lines.length && !stop) {
        const l = lines[i];
        if (isBlank(l)) {
          let j = i;
          while (j < lines.length && isBlank(lines[j])) j++;
          const nxt = lines[j];
          if (nxt === undefined) { i = j; break; }
          if (isHeading(nxt) || isDefTerm(nxt, lines[j + 1]) || admonOf(nxt) || isList(nxt) ||
              /^```/.test(nxt) || /^!\[/.test(nxt) || /^\s*\|/.test(nxt)) break;
          flush();
          i = j;
          continue;
        }
        if (isHeading(l) || isDefTerm(l, lines[i + 1]) || admonOf(l) || /^```/.test(l) || /^!\[/.test(l)) break;
        if (isList(l)) {
          flush();
          const items = [];
          while (i < lines.length && isList(lines[i])) {
            items.push(inline(lines[i].replace(/^\s*(\*|-|\+|#\.|\d+\.)\s+/, '')));
            i++;
          }
          if (cur.length) flush();
          blocks.push(['d', term, paras.join(' '), blockIdx]);
          definitions.push({ term, text: paras.join(' '), block: blockIdx });
          blocks.push(['l', 0, items]);
          stop = true;
          continue;
        }
        cur.push(l.trim());
        i++;
        if (cur.join(' ').length > 900) break;
      }
      if (!stop) {
        flush();
        const text = paras.join(' ');
        if (text) {
          blocks.push(['d', term, text, blockIdx]);
          definitions.push({ term, text, block: blockIdx });
        } else {
          blocks.push(['h', 4, term]);
        }
      }
      continue;
    }

    // абзац
    const buf = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !isHeading(lines[i]) && !isMarker(lines[i]) && !admonOf(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(['p', inline(buf.join(' '))]);
  }

  // ─── горячие клавиши: ключ + подпись из контекста ───
  let ctx = [];
  for (const b of blocks) {
    if (b[0] === 'h') ctx = [`${ctx[0] ?? ''}`.length ? ctx : [], b[2]].flat().filter(Boolean).slice(-2);
    const textFields = b.slice(1).filter((x) => typeof x === 'string');
    for (const text of textFields) {
      for (const m of text.matchAll(/\[\[k\]\]([^[]+)\[\[\/k\]\]/g)) {
        const key = m[1].trim();
        if (key.length > 16) continue;
        if (!KEY_COMBO.test(key.replace(/\s*-\s*/g, '-'))) continue;
        const label = (ctx[ctx.length - 1] || title || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
        keys.push({ key, label: label.slice(0, 110) });
      }
    }
  }

  return { title, blocks, definitions, keys, links: links() };
}

/* ─────────────────────────── утилиты путей ─────────────────────────── */

function dirname(p) { return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; }

export function posixJoin(a, b) {
  const parts = (a ? a.split('/') : []).concat(b.split('/'));
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function normalizePath(p) { return posixJoin('', p); }
