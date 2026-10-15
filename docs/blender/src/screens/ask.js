/** ask.js — экран «Ответы»: вопрос на русском → готовый ответ со ссылками на справочник. */

import { h, frag, renderMarkup, icon, toast } from '../lib/dom.js';
import { searchBox, sourceCard, breadcrumbs, loadingNote, queryParam } from './parts.js';
import { getSearch, go } from '../app.js';
import { buildAnswer, SAMPLE_QUESTIONS } from '../lib/answer.js';
import * as store from '../lib/store.js';
import { findLessonForDoc } from '../../content/course.js';

const askedOnce = new Set();

export function askScreen(parts, ctx) {
  const query = parts.slice(1).join('/').trim() || queryParam('q');
  const wrap = h('div');

  wrap.append(h('div', { class: 'search-hero' },
    searchBox({ big: true, autofocus: !query, value: query, placeholder: 'Ваш вопрос: «что делает clip start», «как открыть боковую панель», «ctrl+b»…' })));

  const slot = h('div');
  wrap.append(slot);

  if (!query) {
    slot.append(intro());
    return wrap;
  }

  slot.append(h('div', { class: 'card' }, h('div', { class: 'muted', text: `Ищу «${query}» в справочнике…` }), loadingNote()));

  (async () => {
    let engine;
    try {
      engine = await getSearch();
    } catch (e) {
      slot.replaceChildren(h('div', { class: 'card' }, h('h3', { text: 'Не удалось загрузить базу' }), h('p', { class: 'muted', text: String(e.message || e) })));
      return;
    }
    const res = engine.ask(query);
    const answer = buildAnswer(query, res, ctx.utils);
    if (!askedOnce.has(query)) { askedOnce.add(query); store.countAsk(); const a = store.checkAchievements({ asked: true }); if (a.length) toast(`Достижение: ${a.map((id) => store.ACHIEVEMENTS.find((x) => x.id === id)?.title).join(', ')}`); }
    slot.replaceChildren(renderAnswer(query, answer, ctx), renderAnchors(answer, ctx), renderSources(answer, res, ctx), renderSuggest(res));
  })();

  return wrap;
}

function intro() {
  return frag(
    h('div', { class: 'card' },
      h('h2', { style: 'margin-top:0', text: 'Как спрашивать' }),
      h('p', { class: 'muted', text: 'Пишите как удобно — я перевожу русские термины в термины Blender и ищу по всему руководству и Python API.' }),
      h('div', { class: 'grid cols-2' },
        h('div', {},
          h('h3', { text: 'Что понимаю' }),
          h('ul', { class: 'small muted' },
            h('li', { text: 'названия опций: «что делает Clip Start», «Passepartout»' }),
            h('li', { text: 'действия: «как открыть боковую панель», «как включить рентген»' }),
            h('li', { text: 'клавиши: «ctrl+b», «shift+a», «горячая клавиша рендера»' }),
            h('li', { text: 'Python API: «bpy.ops.mesh.primitive_cube_add»' }),
            h('li', { text: 'русские термины: «сабдивиджн», «отсечение начало», «закрепить за объектом»' }))),
        h('div', {},
          h('h3', { text: 'Примеры' }),
          h('div', { class: 'chips' }, SAMPLE_QUESTIONS.map((q) =>
            h('button', { class: 'chip', text: q, onclick: () => go(`ask/${encodeURIComponent(q)}`) })))))),
  );
}

function renderAnswer(query, answer, ctx) {
  const utils = ctx.utils;
  const markup = (s) => renderMarkup(s, { ru: utils?.ruOf, onLink: (id) => go(`doc/${id}`) });
  const kindLabel = { key: 'Горячая клавиша', anchor: 'Опция интерфейса', doc: 'Страница руководства', api: 'Python API', none: 'Нет точного совпадения' }[answer.kind];
  const kindClass = { key: 'badge-blue', anchor: 'badge-accent', doc: 'badge', api: 'badge-blue', none: 'badge-red' }[answer.kind];

  const topDocId = answer.sources[0]?.doc?.id;
  const lesson = topDocId ? findLessonForDoc(topDocId) : null;

  return h('div', { class: 'card answer' },
    h('div', { class: 'answer-head' },
      h('span', { class: `badge ${kindClass}`, text: kindLabel }),
      answer.confidence === 'high' ? h('span', { class: 'badge badge-green', text: 'точное совпадение' }) : null,
      answer.confidence === 'low' ? h('span', { class: 'badge', text: 'низкая уверенность' }) : null),
    h('div', { class: 'answer-title', text: answer.title }),
    answer.subtitle ? h('div', { class: 'small ru-label', text: answer.subtitle }) : null,
    answer.path?.length ? h('div', { style: 'margin:8px 0' }, breadcrumbs(answer.path)) : null,
    answer.body ? h('div', { class: 'answer-body', style: 'margin-top:10px' }, markup(answer.body)) : null,
    answer.steps?.length ? h('ol', { class: 'small', style: 'margin-top:10px' }, answer.steps.map((s) => h('li', {}, markup(s)))) : null,

    answer.keys.length
      ? h('div', { style: 'margin-top:12px' },
          h('div', { class: 'tiny faint', text: 'Клавиши' }),
          h('div', { class: 'row', style: 'margin-top:6px' }, answer.keys.map((k) => {
            const combo = k.key || k.k || '';
            const label = k.label || k.l || '';
            return h('a', { class: 'btn btn-sm', href: `#/doc/${k.doc?.id || ''}` },
              h('kbd', { text: combo }),
              h('span', { class: 'small muted', text: label.length > 60 ? label.slice(0, 58) + '…' : label }));
          })))
      : null,

    h('div', { class: 'answer-branch' },
      topDocId ? h('a', { class: 'btn btn-primary btn-sm', href: `#/doc/${topDocId}`, text: 'Читать в справочнике' }) : null,
      lesson ? h('a', { class: 'btn btn-sm', href: `#/lesson/${lesson.module.id}/${lesson.lesson.id}`, text: '🎓 Пройти урок по теме' }) : null,
      topDocId ? h('a', { class: 'btn btn-sm btn-ghost', href: `https://docs.blender.org/manual/ru/latest/${topDocId.replace(/\/index$/, '/')}.html`, target: '_blank', rel: 'noopener', text: 'Оригинал (RU) ↗' }) : null,
      topDocId ? h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { store.srsAdd('doc:' + topDocId); toast('Добавлено в повторение'); }, text: '🔁 В повторение' }) : null));
}

function renderAnchors(answer, ctx) {
  if (!answer.anchors?.length) return null;
  const utils = ctx.utils;
  return h('div', { style: 'margin-top:22px' },
    h('h2', { text: 'Похожие опции и понятия' }),
    h('div', {}, answer.anchors.map((a) => h('a', {
      class: 'source', href: `#/doc/${a.doc?.id || ''}`,
    },
      h('div', { class: 'source-title' }, a.t, (a.ru || utils?.ruOf(a.t)) ? h('span', { class: 'ru-label tiny', text: ` · ${a.ru || utils.ruOf(a.t)}` }) : null),
      h('div', { class: 'source-sum', text: (a.x || '').slice(0, 170) })))));
}

function renderSources(answer, res, ctx) {
  const srcs = answer.sources || [];
  return h('div', { class: 'sources' },
    h('h2', { text: 'Источники' }),
    h('p', { class: 'small faint', text: `Найдено за ${res.took.toFixed(0)} мс · проверено по ${srcs.length} страницам справочника. Ответ собран из текста руководства, без домыслов.` }),
    ...srcs.map((s) => sourceCard(s, ctx.utils, answer.query)));
}

function renderSuggest(res) {
  if (!res.suggestions?.length) return null;
  return h('div', { style: 'margin-top:18px' },
    h('div', { class: 'small faint', text: 'Возможно, вы имели в виду:' }),
    h('div', { class: 'chips' }, res.suggestions.map((s) =>
      h('button', { class: 'chip', text: s, onclick: () => go(`ask/${encodeURIComponent(s)}`) }))));
}
