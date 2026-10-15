/** home.js — главная: быстрый вопрос, продолжение обучения, карта знаний. */

import { h, icon, toast } from '../lib/dom.js';
import * as store from '../lib/store.js';
import { COURSE, nextLesson } from '../../content/course.js';
import { SAMPLE_QUESTIONS } from '../lib/answer.js';
import { searchBox } from './parts.js';

export function homeScreen(parts, ctx) {
  const meta = ctx.meta;
  const st = store.get();
  const wrap = h('div');

  // ── герой с поиском ──
  wrap.append(h('section', { class: 'search-hero' },
    h('h1', { text: 'Спросите что угодно о Blender' }),
    h('p', { class: 'lead' },
      'Отвечаю по всему справочнику: ', h('b', { text: `${meta.counts.pages} страниц` }),
      ', ', h('b', { text: `${meta.counts.anchors.toLocaleString('ru-RU')} описаний опций` }),
      ', ', h('b', { text: `${meta.counts.keys} горячих клавиш` }),
      '. Без интернета, без сервера — всё работает в браузере.'),
    searchBox({ big: true, autofocus: true, placeholder: 'Например: что делает Clip Start, как открыть боковую панель, ctrl+b…' }),
    h('div', { class: 'chips' }, SAMPLE_QUESTIONS.slice(0, 8).map((q) =>
      h('button', { class: 'chip', text: q, onclick: () => { location.hash = `#/ask/${encodeURIComponent(q)}`; } })))));

  // ── показатели ──
  const lessonsDone = Object.values(st.progress.lessons).filter((l) => l.done).length;
  const totalLessons = COURSE.reduce((s, m) => s + m.lessons.length, 0);
  const stats = h('div', { class: 'grid cols-4' },
    h('div', { class: 'card stat' }, h('b', { text: `${lessonsDone}/${totalLessons}` }), h('span', { text: 'уроков пройдено' })),
    h('div', { class: 'card stat' }, h('b', { text: String(store.markedCount()) }), h('span', { text: 'страниц отмечено' })),
    h('div', { class: 'card stat' }, h('b', { text: String(store.visitedCount()) }), h('span', { text: 'страниц открыто' })),
    h('div', { class: 'card stat' }, h('b', { text: `🔥 ${st.streak.days}` }), h('span', { text: 'дней подряд' })));
  wrap.append(h('h2', { text: 'Ваш прогресс' }), stats);

  // ── продолжить обучение ──
  const next = nextLesson();
  if (next) {
    wrap.append(h('h2', { text: 'Продолжить обучение' }),
      h('div', { class: 'card', style: 'border-left:3px solid var(--accent)' },
        h('div', { class: 'spread' },
          h('div', {},
            h('div', { class: 'tiny faint', text: next.module.title }),
            h('div', { style: 'font-size:18px;font-weight:650', text: next.lesson.title }),
            h('div', { class: 'small muted', text: `${next.lesson.minutes} мин · ${next.lesson.goals[0]}` })),
          h('a', { class: 'btn btn-primary', href: `#/lesson/${next.module.id}/${next.lesson.id}`, text: 'Продолжить →' }))));
  }

  // ── быстрые входы ──
  wrap.append(h('h2', { text: 'Разделы академии' }),
    h('div', { class: 'grid cols-3' },
      card('📚', 'Справочник', `${meta.sections.length} разделов, ${meta.counts.pages} страниц: моделирование, анимация, физика, рендер, Python API.`, '#/ref', 'Открыть'),
      card('🎓', 'Курс на русском', `${COURSE.length} модулей, ${totalLessons} уроков с практикой: от интерфейса до моделей, материалов и рендера.`, '#/learn', 'Учиться'),
      card('🎯', 'Тренажёры', 'Горячие клавиши, «найди опцию» в интерфейсе, квиз по функциям — с интервальным повторением.', '#/train', 'Тренироваться')));

  // ── карта знаний ──
  wrap.append(h('h2', { text: 'Карта знаний' }),
    h('p', { class: 'muted small', text: 'Сколько страниц каждого раздела вы уже открыли. Отмечайте изученное в читалке — прогресс попадёт в карту.' }),
    knowledgeMap(ctx));

  return wrap;
}

function card(emoji, title, text, href, cta) {
  return h('div', { class: 'card card-hover' },
    h('div', { style: 'font-size:24px', text: emoji }),
    h('h3', { style: 'margin:6px 0 6px', text: title }),
    h('p', { class: 'small muted', style: 'min-height:52px', text: text }),
    h('a', { class: 'btn btn-sm', href, text: cta }));
}

/** Мини-heatmap по разделам справочника. */
export function knowledgeMap(ctx, onPick) {
  const visited = store.get().progress.visited;
  const marked = store.get().progress.marked;
  const counts = new Map();
  for (const id of Object.keys(visited)) {
    const top = id.split('/')[0];
    if (!counts.has(top)) counts.set(top, { v: 0, m: 0 });
    counts.get(top).v++;
  }
  for (const id of Object.keys(marked)) {
    const top = id.split('/')[0];
    if (!counts.has(top)) counts.set(top, { v: 0, m: 0 });
    counts.get(top).m++;
  }

  const cells = ctx.meta.sections.map((s) => {
    const c = counts.get(s.id) || { v: 0, m: 0 };
    const pct = Math.min(100, Math.round((c.v / Math.max(1, s.pages)) * 100));
    const cell = h('button', {
      class: 'heat-cell', style: 'text-align:left;cursor:pointer',
      onclick: () => { if (onPick) onPick(s.id); else location.hash = `#/ref/${s.id}`; },
    },
      h('div', { class: 'hn', text: s.ru }),
      h('div', { class: 'hp', text: `${c.v} из ${s.pages} страниц · ${pct}%` }),
      h('div', { class: 'bar', style: 'margin-top:7px' }, h('i', { style: `width:${pct}%` })));
    return cell;
  });
  return h('div', { class: 'heat' }, cells);
}
