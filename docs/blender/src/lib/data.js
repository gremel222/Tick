/**
 * data.js — загрузка офлайн-базы (сжатые шарды) с кэшем и прогрессом загрузки.
 *
 * Файлы (blender/data/):
 *   meta.json                — манифест
 *   index.json.gz            — поисковый индекс
 *   terms.json.gz            — словарь EN↔RU
 *   docs/<раздел>.json.gz    — тексты страниц
 *   ru/<раздел>.json.gz      — русские тексты (если запускался краулер руководства)
 */

const DATA_BASE = new URL('../../data/', import.meta.url);

let decompressWarned = false;

/** Распаковка gz в браузере без зависимостей. */
export async function fetchGz(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Не удалось загрузить ${url} (${res.status})`);
  if (typeof DecompressionStream === 'undefined') {
    if (!decompressWarned) {
      decompressWarned = true;
      throw new Error('Браузер не поддерживает DecompressionStream — обновите браузер (Chrome 80+, Safari 16.4+, Firefox 113+)');
    }
    throw new Error('Нет поддержки DecompressionStream');
  }
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

const state = {
  meta: null,
  index: null,
  terms: null,
  sections: new Map(),
  hasRu: false,
  loading: new Map(),
  onProgress: null,
};

/** Обёртка: не грузим одно и то же дважды. */
function once(key, fn) {
  if (state.loading.has(key)) return state.loading.get(key);
  const p = fn().catch((e) => { state.loading.delete(key); throw e; });
  state.loading.set(key, p);
  return p;
}

function notify(what) { if (state.onProgress) state.onProgress(what); }

export const onLoad = (fn) => { state.onProgress = fn; };

export async function loadMeta() {
  if (state.meta) return state.meta;
  return once('meta', async () => {
    notify('манифест');
    const res = await fetch(new URL('meta.json', DATA_BASE));
    if (!res.ok) throw new Error('База не найдена: сначала соберите данные (node blender/tools/build-data.mjs)');
    state.meta = await res.json();
    state.hasRu = !!state.meta.hasRu;
    return state.meta;
  });
}

export const meta = () => state.meta;

export async function loadIndex() {
  if (state.index) return state.index;
  return once('index', async () => {
    notify('поисковый индекс');
    state.index = await fetchGz(new URL('index.json.gz', DATA_BASE));
    return state.index;
  });
}

export async function loadTerms() {
  if (state.terms) return state.terms;
  return once('terms', async () => {
    notify('словарь терминов');
    state.terms = await fetchGz(new URL('terms.json.gz', DATA_BASE));
    return state.terms;
  });
}

/** Страницы раздела (с подменой на русскую версию, если она собрана). */
export async function loadSection(id) {
  if (state.sections.has(id)) return state.sections.get(id);
  return once('sec:' + id, async () => {
    notify(`раздел «${id}»`);
    let pages;
    if (state.hasRu) {
      try {
        pages = await fetchGz(new URL(`ru/${id}.json.gz`, DATA_BASE));
      } catch { /* русской версии раздела нет — берём английскую */ }
    }
    if (!pages) pages = await fetchGz(new URL(`docs/${id}.json.gz`, DATA_BASE));
    state.sections.set(id, pages);
    return pages;
  });
}

/** Найти страницу по id (с автозагрузкой её раздела). */
export async function getDoc(id) {
  const clean = String(id || '').replace(/^\/+/, '').replace(/\.md$/, '');
  if (!clean) return null;
  const section = clean.split('/')[0];
  let pages;
  try {
    pages = await loadSection(section);
  } catch {
    return null;
  }
  let doc = pages.find((d) => d.id === clean);
  if (!doc) doc = pages.find((d) => d.id === `${clean}/index`);
  if (!doc) doc = pages.find((d) => d.id === `${clean}/index.html`);
  return doc || null;
}

/** Страница, имя которой ближе всего к запросу (по заголовку). */
export async function findDocByTitle(title) {
  const t = String(title || '').toLowerCase().trim();
  if (!t) return null;
  const idx = await loadIndex();
  const hit = idx.docs.find((d) => (d.t || '').toLowerCase() === t);
  if (!hit) return null;
  return getDoc(hit.id);
}

export const sectionPages = (id) => state.sections.get(id) || null;

/** Ссылки на официальное руководство. */
export function officialUrl(id, lang = 'ru') {
  const version = state.meta?.targetVersion || 'latest';
  const clean = String(id || '').replace(/\/index$/, '/');
  return `https://docs.blender.org/manual/${lang}/${version}/${clean}.html`;
}

/** Учебные ссылки: id страницы → название раздела на русском. */
export function sectionRu(id) {
  const s = state.meta?.sections?.find((x) => x.id === id);
  return s ? s.ru : id;
}

export function sectionTitle(id) {
  return sectionRu(id);
}
