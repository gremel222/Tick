/** learn.js — курс: модули, уроки, задания с самопроверкой. */

import { h, frag, renderMarkup, toast } from '../lib/dom.js';
import * as store from '../lib/store.js';
import { go, getSearch } from '../app.js';
import { COURSE, moduleProgress, nextLesson, findLessonById } from '../../content/course.js';
import { breadcrumbs, markButtons, queryParam } from './parts.js';

/* ─────────────────────── список модулей ─────────────────────── */

export function learnScreen(parts, ctx) {
  const wrap = h('div');
  const utils = ctx.utils;
  wrap.append(
    h('h1', { text: 'Курс «Blender с нуля до уверенной работы»' }),
    h('p', { class: 'lead' }, `Модули и уроки на русском: разбор интерфейса, вьюпорта, боковой панели, моделирования, материалов и рендера. В каждом уроке — задания «сделай в Blender» с самопроверкой и квиз. Всего ${COURSE.length} модулей, ${COURSE.reduce((s, m) => s + m.lessons.length, 0)} уроков.`));

  const next = nextLesson();
  if (next) {
    wrap.append(h('div', { class: 'card', style: 'border-left:3px solid var(--accent)' },
      h('div', { class: 'spread' },
        h('div', {},
          h('div', { class: 'tiny faint', text: 'Следующий урок' }),
          h('div', { style: 'font-weight:650;font-size:17px', text: next.lesson.title }),
          h('div', { class: 'small muted', text: next.module.title })),
        h('a', { class: 'btn btn-primary', href: `#/lesson/${next.module.id}/${next.lesson.id}`, text: 'Начать →' }))));
  }

  for (const m of COURSE) {
    const prog = moduleProgress(m);
    wrap.append(h('section', { style: 'margin-top:26px' },
      h('div', { class: 'spread' },
        h('div', {},
          h('h2', { style: 'margin:0', text: `${m.icon} ${m.title}` }),
          h('div', { class: 'small muted', text: m.summary })),
        h('div', { class: 'nowrap small faint', text: `${prog.done}/${prog.total} · ${prog.pct}%` })),
      h('div', { class: 'bar', style: 'margin:10px 0 14px' }, h('i', { style: `width:${prog.pct}%` })),
      h('div', { class: 'grid cols-2' }, m.lessons.map((l) => {
        const st = store.lessonState(l.id);
        return h('a', { class: 'card card-hover', href: `#/lesson/${m.id}/${l.id}`, style: 'display:block' },
          h('div', { class: 'spread' },
            h('div', { style: 'font-weight:600', text: l.title }),
            st.done ? h('span', { class: 'badge badge-green', text: '✓' }) : h('span', { class: 'tiny faint', text: `${l.minutes} мин` })),
          h('div', { class: 'small muted', style: 'margin-top:6px', text: l.goals[0] }));
      }))));
  }
  return wrap;
}

/* ─────────────────────── урок ─────────────────────── */

export function lessonScreen(parts, ctx) {
  const moduleId = parts[1] || queryParam('m');
  const lessonId = parts[2] || queryParam('l');
  const found = findLessonById(moduleId, lessonId);
  if (!found) {
    return h('div', { class: 'card' }, h('h3', { text: 'Урок не найден' }), h('a', { class: 'btn', href: '#/learn', text: 'К списку модулей' }));
  }
  const { module: mod, lesson } = found;
  const state = store.lessonState(lesson.id);
  const utils = ctx.utils;
  const markup = (s) => renderMarkup(s, { ru: utils?.ruOf, onLink: (id) => go(`doc/${id}`) });
  const wrap = h('div');

  const allTasks = lesson.tasks.length;
  const tasksDone = state.stepsDone.length;
  const quizCorrect = state.quiz.correct || 0;
  const quizTotal = lesson.quiz.length;
  const finished = state.done;

  wrap.append(
    h('div', { class: 'breadcrumbs' },
      h('a', { href: '#/learn', text: 'Курс' }), h('span', { text: '→' }),
      h('span', { text: mod.title }), h('span', { text: '→' }), h('span', { text: lesson.title })),
    h('div', { class: 'spread', style: 'align-items:flex-start' },
      h('div', {},
        h('h1', { style: 'margin-bottom:6px', text: lesson.title }),
        h('div', { class: 'row' },
          h('span', { class: 'badge', text: `${lesson.minutes} мин` }),
          h('span', { class: 'badge', text: `${quizTotal} вопросов` }),
          h('span', { class: 'badge', text: `${allTasks} заданий` }),
          finished ? h('span', { class: 'badge badge-green', text: '✓ пройден' }) : null)),
      h('div', { class: 'row' }, h('button', {
        class: 'btn btn-sm', onclick: () => { go('learn'); },
      }, '← К курсу'))),
    h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'tiny faint', text: 'Цели урока' }),
      h('ul', { style: 'margin:8px 0 0' }, lesson.goals.map((g) => h('li', {}, markup(g))))));

  // ── теория ──
  lesson.sections.forEach((sec, si) => {
    const block = h('section', { style: 'margin-top:22px' });
    if (sec.h) block.append(h('h2', { text: sec.h }));
    if (sec.p) for (const p of [].concat(sec.p)) block.append(h('p', {}, markup(p)));
    if (sec.ul) block.append(h('ul', {}, sec.ul.map((x) => h('li', {}, markup(x)))));
    if (sec.ol) block.append(h('ol', {}, sec.ol.map((x) => h('li', {}, markup(x)))));
    if (sec.keys) block.append(h('div', { class: 'card' },
      h('div', { class: 'tiny faint', text: 'Клавиши' }),
      h('div', { class: 'row', style: 'margin-top:8px' }, sec.keys.map(([k, label]) =>
        h('span', { class: 'badge' }, h('kbd', { text: k }), h('span', { class: 'muted small', text: label }))))));
    if (sec.steps) {
      block.append(h('div', {}, sec.steps.map((s, i) => h('div', { class: 'lesson-step' },
        h('div', { style: 'font-weight:600', text: `${i + 1}. ${s.t}` }),
        s.d ? h('div', { class: 'small muted' }, markup(s.d)) : null))));
    }
    if (sec.note) block.append(h('div', { class: 'card', style: 'border-left:3px solid var(--accent)' }, h('div', { class: 'small' }, markup(sec.note))));
    if (sec.table) {
      const cell = (tag) => ({ style: 'border:1px solid var(--line-soft);padding:7px 9px;vertical-align:top' });
      const headRow = h('tr', {}, sec.table.head.map((c) => h('th', cell('th'), markup(c))));
      const bodyRows = sec.table.rows.map((r) => h('tr', {}, r.map((c) => h('td', cell('td'), markup(c)))));
      block.append(h('table', { class: 'small', style: 'width:100%;border-collapse:collapse' },
        h('thead', {}, headRow), h('tbody', {}, bodyRows)));
    }
    wrap.append(block);
  });

  // ── задания ──
  if (lesson.tasks.length) {
    const tasksBox = h('div', { style: 'margin-top:26px' });
    tasksBox.append(h('h2', { text: 'Практика: сделайте в Blender' }));
    lesson.tasks.forEach((t, i) => {
      const done = state.stepsDone.includes(i);
      const cb = h('input', { type: 'checkbox', ...(done ? { checked: true } : {}) });
      cb.addEventListener('change', () => {
        const st = store.toggleStep(lesson.id, i);
        row.classList.toggle('done', cb.checked);
        updateSummary(st);
      });
      const row = h('label', { class: `lesson-task${done ? ' done' : ''}`, style: 'display:block' },
        h('div', { class: 'check' }, cb, h('div', {}, markup(t))));
      tasksBox.append(row);
    });
    wrap.append(tasksBox);
  }

  // ── квиз ──
  if (lesson.quiz.length) {
    const quizBox = h('div', { style: 'margin-top:26px' });
    quizBox.append(h('h2', { text: 'Проверка знаний' }), h('p', { class: 'small muted', text: 'Отвечайте без подглядывания — результат сохранится в прогрессе.' }));
    let correctNow = 0;
    let answered = 0;

    lesson.quiz.forEach((q, qi) => {
      const opts = h('div');
      const feedback = h('div', { class: 'small', style: 'margin-top:8px' });
      const buttons = q.options.map((opt, oi) => {
        const b = h('button', { class: 'quiz-opt', text: opt });
        b.addEventListener('click', () => {
          if (b.dataset.locked) return;
          [...opts.children].forEach((c) => (c.dataset.locked = '1'));
          const ok = oi === q.correct;
          b.classList.add(ok ? 'correct' : 'wrong');
          if (!ok) opts.children[q.correct]?.classList.add('correct');
          answered++;
          if (ok) correctNow++;
          feedback.append(h('div', { class: ok ? 'badge badge-green' : 'badge badge-red', text: ok ? 'Верно' : 'Неверно' }),
            q.why ? h('div', { class: 'muted', style: 'margin-top:6px' }, markup(q.why)) : null);
          const prev = store.lessonState(lesson.id);
          store.saveLesson(lesson.id, { quiz: { correct: Math.max(prev.quiz?.correct || 0, correctNow), total: quizTotal } });
          updateSummary(store.lessonState(lesson.id));
          if (answered === lesson.quiz.length) finish();
        });
        return b;
      });
      opts.append(...buttons);
      quizBox.append(h('div', { class: 'card', style: 'margin-bottom:12px' },
        h('div', { style: 'font-weight:600;margin-bottom:8px', text: `${qi + 1}. ${q.q}` }), opts, feedback));
    });
    wrap.append(quizBox);
  }

  // ── завершение ──
  const summary = h('div', { class: 'card', style: 'margin-top:24px' });
  const updateSummary = (st) => {
    const tasksPart = `${st.stepsDone.length}/${allTasks} заданий`;
    const quizPart = st.quiz?.total ? `квиз ${st.quiz.correct}/${st.quiz.total}` : 'квиз не пройден';
    const ready = st.stepsDone.length >= allTasks && (!quizTotal || (st.quiz?.correct || 0) >= Math.ceil(quizTotal * 0.6));
    summary.replaceChildren(
      h('div', { class: 'spread' },
        h('div', {},
          h('div', { style: 'font-weight:600', text: st.done ? '✓ Урок пройден' : ready ? 'Всё готово — отметить урок?' : 'Продолжайте: отметьте задания и пройдите квиз' }),
          h('div', { class: 'small muted', text: `${tasksPart} · ${quizPart}` })),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn btn-primary btn-sm', disabled: !ready && !st.done,
            onclick: () => {
              store.saveLesson(lesson.id, { done: true });
              const unlocked = store.checkAchievements();
              toast(unlocked.length ? `Урок пройден! Достижение: ${unlocked.map((x) => store.ACHIEVEMENTS.find((a) => a.id === x)?.title).join(', ')}` : 'Урок пройден!');
              render();
            },
          }, st.done ? 'Пройдено' : 'Отметить урок пройденным'),
          nextBtn(lesson.id))));
  };
  const render = () => { const n = lessonScreen(parts, ctx); document.querySelector('main .main-slot').replaceChildren(n); };
  const finish = () => { updateSummary(store.lessonState(lesson.id)); };
  wrap.append(summary);
  updateSummary(state);

  // ── ссылки на справочник ──
  if (lesson.refs?.length) {
    wrap.append(h('div', { style: 'margin-top:24px' },
      h('h2', { text: 'Разобрать подробнее в справочнике' }),
      h('div', {}, lesson.refs.map((r) => h('a', { class: 'tree-link', href: `#/doc/${r.id}` },
        h('span', { class: 'dot' }), h('span', { text: r.title || r.id }))))));
  }

  return wrap;
}

function nextBtn(currentId) {
  const all = COURSE.flatMap((m) => m.lessons.map((l) => ({ m, l })));
  const i = all.findIndex((x) => x.l.id === currentId);
  const next = all[i + 1];
  if (!next) return h('a', { class: 'btn btn-sm', href: '#/train', text: 'К тренажёрам →' });
  return h('a', { class: 'btn btn-sm', href: `#/lesson/${next.m.id}/${next.l.id}`, text: 'Следующий урок →' });
}
