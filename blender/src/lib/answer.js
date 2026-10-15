/**
 * answer.js — превращает результаты поиска в готовый ответ на русском.
 *
 * Принцип: никаких выдумок. Ответ всегда собирается из базы руководства,
 * и к каждому ответу приложены источники (страница справочника + официальная ссылка).
 */

import { tokenize } from './text.js';

const RU_SECTION = {
  getting_started: 'Начало работы',
  interface: 'Интерфейс пользователя',
  editors: 'Редакторы',
  scene_layout: 'Сцены и объекты',
  modeling: 'Моделирование',
  sculpt_paint: 'Скульптинг и рисование',
  grease_pencil: 'Grease Pencil',
  animation: 'Анимация и риггинг',
  physics: 'Физика',
  render: 'Рендеринг',
  compositing: 'Композитинг',
  movie_clip: 'Отслеживание движения',
  video_editing: 'Редактирование видео',
  files: 'Файлы и система данных',
  addons: 'Аддоны',
  advanced: 'Дополнительно',
  troubleshooting: 'Устранение неполадок',
  glossary: 'Словарь',
  contribute: 'Участие в разработке',
  api: 'Python API',
};

const prettify = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function makeAnswerUtils(index, terms) {
  const docs = index.docs || [];
  const byId = new Map(docs.map((d) => [d.id, d]));

  const ruOf = (term) => {
    if (!term) return '';
    const map = terms?.en2ru || {};
    return map[term] || map[term.trim()] || '';
  };

  const crumb = (id) => {
    const parts = String(id || '').split('/');
    const out = [];
    if (parts[0]) out.push({ id: parts[0], title: RU_SECTION[parts[0]] || prettify(parts[0]) });
    for (let i = 1; i < parts.length; i++) {
      const sub = parts.slice(0, i + 1).join('/');
      const page = byId.get(sub) || byId.get(sub + '/index');
      out.push({ id: sub, title: page ? page.t : prettify(parts[i]) });
    }
    return out;
  };

  return { ruOf, crumb, byId, docs };
}

/** Собирает ответ по результатам поиска. */
export function buildAnswer(query, res, utils) {
  const { ruOf, crumb, byId } = utils;
  const { a, keys, anchors, results, suggestions } = res;
  const sources = [];
  const pushSource = (d, why) => {
    if (!d) return;
    if (sources.some((s) => s.doc.id === d.id)) return;
    sources.push({ doc: d, why });
  };

  const out = {
    query,
    kind: 'none',
    title: '',
    subtitle: '',
    body: '',
    detail: '',
    keys: [],
    anchors: [],
    path: [],
    sources,
    suggestions: suggestions || [],
    confidence: 'low',
  };

  const topAnchor = anchors[0];
  const topDoc = results[0]?.doc;
  const exactKey = keys.find((k) => k.score >= 9 || (k.curated && k.score >= 7.5));
  const rawLower = String(query || '').toLowerCase().trim();
  // Сильное совпадение по названию страницы (в том числе через алиас — «боковая панель» → Sidebar)
  const docTitleExact = !!topDoc && ((topDoc.t || '').toLowerCase() === rawLower ||
    (topDoc.tr && topDoc.tr.toLowerCase() === rawLower) ||
    (results[0]?.terms || []).some((t) => t.startsWith('alias:')));

  // 1. Горячие клавиши: запрос похож на комбинацию или спрашивают про клавишу
  const keyAllowed = a.keyInput || a.wantsKey
    || (exactKey?.curated && exactKey.score >= 8 && a.tokens.length <= 6);
  if (exactKey && keyAllowed) {
    out.kind = 'key';
    const d = exactKey.doc;
    out.keys = keys.slice(0, 6).map((k) => ({ ...k, doc: k.doc || { id: '', t: k.label } }));
    out.title = `Клавиша ${exactKey.key}`;
    out.subtitle = exactKey.label;
    out.body = `${exactKey.detail || exactKey.label}.` + (exactKey.why ? ` ${exactKey.why}` : '') +
      (d && d.id ? ` Раздел справочника: ${crumb(d.id).map((c) => c.title).join(' → ')}.` : '');
    out.path = d && d.id ? crumb(d.id) : [];
    if (d && d.id) pushSource(d, 'горячая клавиша');
    out.confidence = 'high';
  }

  // 2. Определение опции — самый ценный ответ на «что делает …»
  const anchorBacked = topAnchor && (topAnchor.rank === undefined || topAnchor.rank < 6 || topAnchor.score >= 9);
  if (out.kind === 'none' && topAnchor && topAnchor.score >= 4.5 && anchorBacked && !(docTitleExact && topAnchor.score < 9)) {
    const d = byId.get(topAnchor.doc?.id) || topAnchor.doc;
    const ru = topAnchor.ru || ruOf(topAnchor.t);
    out.kind = 'anchor';
    out.title = topAnchor.t;
    out.subtitle = ru ? `в русском интерфейсе — «${ru}»` : '';
    out.body = topAnchor.x;
    out.anchors = anchors.slice(1, 6);
    out.path = crumb(topAnchor.doc?.id || '');
    pushSource(topAnchor.doc, 'описание опции');
    out.confidence = topAnchor.score >= 7 ? 'high' : 'medium';
  }

  // 3. Ответ по странице руководства
  if (out.kind === 'none' && topDoc) {
    const isApi = topDoc.k === 'api';
    const ru = ruOf(topDoc.t);
    out.kind = isApi ? 'api' : 'doc';
    out.title = topDoc.t;
    out.subtitle = ru && ru !== topDoc.t ? `по-русски — «${ru}»` : (topDoc.id.includes('/') ? topDoc.id : '');
    out.body = topDoc.sum || '';
    out.steps = topDoc.steps || [];
    out.path = crumb(topDoc.id);
    pushSource(topDoc, isApi ? 'справочник Python API' : 'страница руководства');
    out.confidence = (results[0].score || 0) > 6 ? 'high' : 'medium';
  }

  // 4. Ничего не нашлось — честно об этом говорим и предлагаем варианты
  if (out.kind === 'none') {
    out.kind = 'none';
    out.title = 'Точного совпадения не нашлось';
    out.body = 'Попробуйте сформулировать иначе: назовите элемент интерфейса, клавишу или термин. ' +
      'Например: «боковая панель», «clip start», «ctrl+b», «subdivision surface», «почему артефакты глубины».';
    out.confidence = 'low';
  }

  // Источники: добавляем ближайшие страницы
  for (const r of results.slice(0, 6)) pushSource(r.doc, out.kind === 'doc' && r.doc.id === topDoc?.id ? '' : 'похожая страница');
  for (const k of keys.slice(0, 3)) pushSource(k.doc, 'упоминание клавиши');

  return out;
}

/** Подсказки-«чипы» для главной страницы. */
export const SAMPLE_QUESTIONS = [
  'Что делает Clip Start',
  'Как открыть боковую панель',
  'Горячая клавиша рендера',
  'ctrl+b',
  'Что такое пропорциональное редактирование',
  'Как переключиться в Edit Mode',
  'Что делает Passepartout',
  'Как работает 3D-курсор',
  'bpy.ops.mesh.primitive_cube_add',
  'Почему артефакты буфера глубины',
  'Что такое overlays',
  'Как включить рентген',
];
