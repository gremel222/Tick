/** parts.js — общие элементы интерфейса: строка поиска, карточки источников, хлебные крошки. */

import { h, frag, renderMarkup, highlight, icon, toast } from '../lib/dom.js';
import * as data from '../lib/data.js';
import * as store from '../lib/store.js';
import { getSearch, go, onDataProgress } from '../app.js';

/** Строка поиска с автодополнением. */
/** Параметр из хэш-строки: #/doc/editors/3dview/sidebar?hl=clip → 'clip'. */
export function queryParam(name) {
  const hash = String(location.hash || '');
  const qs = hash.split('?')[1] || '';
  try {
    return new URLSearchParams(qs).get(name) || '';
  } catch {
    return '';
  }
}

export function searchBox({ big = false, autofocus = false, placeholder = 'Поиск по справочнику…', value = '', onSubmit } = {}) {
  const input = h('input', {
    type: 'search', placeholder, value, autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Поиск по справочнику',
  });
  const box = h('div', { class: `searchbox${big ? ' big' : ''}` }, icon('search', big ? 22 : 18), input,
    big ? null : h('span', { class: 'hint nowrap', text: '/' }));

  const list = h('div', { class: 'suggest', style: 'display:none' });
  const holder = h('div', { style: 'position:relative' }, box, list);

  const hide = () => { list.style.display = 'none'; };
  const show = (items) => {
    if (!items.length) return hide();
    list.style.display = 'block';
    list.replaceChildren(...items.map((it) => h('button', {
      class: 'suggest-item', type: 'button',
      onclick: () => { hide(); input.value = it.title; submit(it.title); },
    },
      h('span', { text: it.title }),
      it.sub ? h('span', { class: 'tiny faint', text: ` ${it.sub}` }) : null)));
  };

  let engineReady = false;
  const ensure = () => {
    if (engineReady) return;
    getSearch().then(() => { engineReady = true; suggestionTick(); }).catch(() => {});
  };

  let lastQ = '';
  const suggestionTick = async () => {
    const q = input.value.trim();
    if (q.length < 2 || q === lastQ) return;
    lastQ = q;
    try {
      const s = await getSearch();
      engineReady = true;
      show(s.suggest(q));
    } catch { hide(); }
  };

  input.addEventListener('input', () => { ensure(); suggestionTick(); });
  input.addEventListener('focus', () => { ensure(); suggestionTick(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { hide(); submit(input.value); }
    else if (e.key === 'Escape') { hide(); input.blur(); }
  });
  document.addEventListener('click', (e) => { if (!holder.contains(e.target)) hide(); });

  const submit = (q) => {
    const query = String(q || '').trim();
    if (!query) return;
    if (onSubmit) onSubmit(query);
    else go(`ask/${encodeURIComponent(query)}`);
  };
  box.addEventListener('click', () => input.focus());
  if (autofocus) setTimeout(() => input.focus(), 60);

  holder.input = input;
  return holder;
}

/** Карточка источника (страница справочника). */
export function sourceCard(src, utils, query) {
  const d = src.doc;
  const words = query ? query.split(/\s+/).filter((w) => w.length > 2) : [];
  const ru = utils?.ruOf ? utils.ruOf(d.t) : '';
  return h('a', { class: 'source', href: `#/doc/${d.id}` },
    h('div', { class: 'spread' },
      h('div', {},
        h('div', { class: 'source-title' }, highlight(d.t, words), ru && ru !== d.t ? h('span', { class: 'ru-label tiny', text: ` · ${ru}` }) : null),
        h('div', { class: 'source-sum' }, highlight(d.sum || '', words, 180))),
      h('div', { class: 'tiny faint nowrap', text: d.k === 'api' ? 'Python API' : 'Руководство' })),
    h('div', { class: 'source-path', text: d.id }),
    src.why ? h('div', { class: 'tiny faint', text: src.why }) : null);
}

/** Хлебные крошки: раздел → подраздел → страница. */
export function breadcrumbs(path, { keepLast = true } = {}) {
  const items = keepLast ? path : path.slice(0, -1);
  return h('div', { class: 'breadcrumbs' }, items.map((c, i) =>
    frag(
      i ? h('span', { text: '→' }) : null,
      i === items.length - 1 && keepLast ? h('span', { text: c.title }) : h('a', { href: `#/doc/${c.id}`, text: c.title }),
    )));
}

/** Кнопка «отметить как изученное» + «в повторение». */
export function markButtons(docId, rerender) {
  const marked = store.isMarked(docId);
  return h('div', { class: 'row', style: 'margin-top:14px' },
    h('button', {
      class: `btn btn-sm ${marked ? 'btn-primary' : ''}`,
      onclick: () => { const now = store.toggleMark(docId); toast(now ? 'Отмечено как изученное' : 'Отметка снята'); rerender && rerender(); },
    }, marked ? '✓ Изучено' : 'Отметить как изученное'),
    h('button', {
      class: 'btn btn-sm btn-ghost',
      onclick: () => { store.srsAdd('doc:' + docId); toast('Страница поставлена в повторение'); },
    }, '🔁 В повторение'),
    h('a', { class: 'btn btn-sm btn-ghost', href: data.officialUrl(docId, 'ru'), target: '_blank', rel: 'noopener' }, 'Оригинал (RU) ↗'),
    h('a', { class: 'btn btn-sm btn-ghost', href: data.officialUrl(docId, 'en'), target: '_blank', rel: 'noopener' }, 'EN ↗'));
}

/** Индикатор загрузки данных для строки поиска. */
export function loadingNote(text = 'Загружаю базу знаний…') {
  const el = h('div', { class: 'small faint', text });
  const t0 = Date.now();
  onDataProgress(() => { el.textContent = `${text} ${((Date.now() - t0) / 1000).toFixed(1)} с`; });
  return el;
}

export { renderMarkup, highlight, h, frag, icon };
