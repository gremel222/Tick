/** trainers.js — тренажёры: горячие клавиши, поиск опции в интерфейсе, квиз по функциям. */

import { h, frag, renderMarkup, toast } from '../lib/dom.js';
import * as store from '../lib/store.js';
import { go, getSearch, ctx as appCtx } from '../app.js';
import { keyTasks, KEYPAD } from '../../content/keys.js';
import { SIM_PANELS } from '../../content/sim.js';
import { loadingNote, queryParam } from './parts.js';

/* ─────────────────────── хаб ─────────────────────── */

export function trainHubScreen(parts, ctx) {
  const st = store.get();
  const due = store.srsDue().length;
  const wrap = h('div');

  wrap.append(
    h('h1', { text: 'Тренажёры' }),
    h('p', { class: 'lead', text: 'Знать все функции Blender — это навык, а не список. Здесь вы тренируете то, что нужно на практике: клавиши, поиск нужной опции в интерфейсе и понимание, что делает каждая настройка.' }));

  if (due) {
    wrap.append(h('div', { class: 'card', style: 'border-left:3px solid var(--accent)' },
      h('div', { class: 'spread' },
        h('div', {}, h('div', { style: 'font-weight:600', text: `🔁 Пора повторить: ${due}` }),
          h('div', { class: 'small muted', text: 'Страницы и опции, которые вы добавили в интервальное повторение.' })),
        h('a', { class: 'btn btn-primary btn-sm', href: '#/progress', text: 'К повторению' }))));
  }

  const cards = [
    { id: 'keys', icon: '⌨️', title: 'Горячие клавиши', text: 'Действие → клавиша. 20 заданий, таймер точности, статистика сложных сочетаний.', stat: `${st.trainers.keys.plays} сессий · рекорд ${st.trainers.keys.best}/10` },
    { id: 'find', icon: '🖱️', title: 'Найди опцию', text: 'Симулятор интерфейса: где включается рентген, где меняется тип проекции, чем закрепить камеру.', stat: `${st.trainers.find.plays} сессий · рекорд ${st.trainers.find.best}/8` },
    { id: 'quiz', icon: '🎯', title: 'Что делает функция', text: 'Квиз по 39 570 описаниям опций: выбираете правильное назначение настройки.', stat: `${st.trainers.quiz.plays} сессий · рекорд ${st.trainers.quiz.best}/10` },
  ];
  wrap.append(h('div', { class: 'grid cols-3', style: 'margin-top:18px' }, cards.map((c) =>
    h('a', { class: 'card card-hover', href: `#/train/${c.id}`, style: 'display:block' },
      h('div', { style: 'font-size:26px', text: c.icon }),
      h('h3', { style: 'margin:6px 0', text: c.title }),
      h('p', { class: 'small muted', text: c.text }),
      h('div', { class: 'tiny faint', text: c.stat }),
      h('div', { class: 'btn btn-sm btn-primary', style: 'margin-top:10px', text: 'Начать' })))));

  wrap.append(h('h2', { text: 'Как это работает' }),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'card' }, h('h3', { text: 'Интервальное повторение' }), h('p', { class: 'small muted', text: 'Добавляйте страницы и опции в повторение (кнопка 🔁 в читалке или в ответе). Алгоритм вернёт их в нужный момент: сначала часто, потом реже.' })),
      h('div', { class: 'card' }, h('h3', { text: 'Без ИИ и без интернета' }), h('p', { class: 'small muted', text: 'Все задания строятся из самого справочника, поэтому «правильный ответ» — это буквально текст официального руководства, а не догадка.' }))));

  return wrap;
}

/* ─────────────────────── роутер тренажёров ─────────────────────── */

export function trainerScreen(parts, ctx) {
  const kind = parts[1] || queryParam('kind');
  if (kind === 'keys') return keysTrainer(ctx);
  if (kind === 'find') return findTrainer(ctx);
  if (kind === 'quiz') return quizTrainer(ctx);
  return trainHubScreen(parts, ctx);
}

/* ─────────────────────── 1. горячие клавиши ─────────────────────── */

function keysTrainer(ctx) {
  const wrap = h('div');
  const LEN = store.get().settings.trainerLen || 10;
  const pool = [...keyTasks()].sort(() => Math.random() - 0.5).slice(0, LEN);
  let index = 0;
  let correct = 0;
  const detail = {};
  const wrapUp = h('div');

  wrap.append(h('h1', { text: '⌨️ Горячие клавиши' }),
    h('p', { class: 'muted', text: 'Соберите сочетание клавиш для действия. Можно нажимать кнопки на клавиатуре-подсказке или вводить вручную.' }));

  const box = h('div', { class: 'card', style: 'border-left:3px solid var(--accent)' });
  wrap.append(box, wrapUp);

  const state = { mods: new Set(), key: '' };

  const draw = () => {
    if (index >= pool.length) return finish();
    const task = pool[index];
    state.mods.clear(); state.key = '';

    const answerLine = h('div', { class: 'row', style: 'margin-top:12px;font-family:var(--mono)' });
    const modBtns = ['Ctrl', 'Shift', 'Alt'].map((m) => h('button', { class: 'btn btn-sm', text: m, onclick: (e) => {
      state.mods.has(m) ? state.mods.delete(m) : state.mods.add(m);
      e.target.classList.toggle('on', state.mods.has(m));
      paint();
    } }));
    const keyGrid = h('div', { class: 'keypad' }, KEYPAD.map((k) => h('button', {
      text: k,
      onclick: (e) => { state.key = k; [...keyGrid.children].forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); paint(); },
    })));

    const typed = h('input', { type: 'text', placeholder: 'или введите: ctrl+shift+z', style: 'flex:1;min-width:180px;padding:9px 12px;border-radius:9px;border:1px solid var(--line);background:var(--bg-inset);color:var(--text)' });
    const hint = h('div', { class: 'small faint', style: 'margin-top:8px' });

    const paint = () => {
      const combo = [state.mods.has('Ctrl') ? 'Ctrl' : '', state.mods.has('Shift') ? 'Shift' : '', state.mods.has('Alt') ? 'Alt' : '', state.key]
        .filter(Boolean).join('+');
      answerLine.replaceChildren(h('span', { class: 'muted small', text: 'Ваш ответ: ' }), h('kbd', { text: combo || '—' }));
    };

    const check = () => {
      const typedVal = typed.value.trim();
      const userCombo = typedVal || [...state.mods, state.key].filter(Boolean).join('+');
      const norm = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/(control|ctl)/g, 'ctrl').replace(/numpad\s?/g, 'numpad ').replace(/[+]$/g, '').split('+').filter(Boolean).sort().join('+');
      const ok = norm(userCombo) === norm(task.key) || task.alt?.some((a) => norm(a) === norm(userCombo));
      detail[task.key] = ok;
      if (ok) correct++;
      const conf = h('div', { class: 'card', style: 'margin-top:12px' },
        h('div', { class: 'row' }, h('span', { class: ok ? 'badge badge-green' : 'badge badge-red', text: ok ? 'Верно' : 'Неверно' })),
        h('p', { style: 'margin:8px 0 0' }, 'Правильно: ', h('kbd', { text: task.key }), task.alt?.length ? h('span', { class: 'muted small', text: ` (или ${task.alt.join(', ')})` }) : null),
        task.why ? h('p', { class: 'small muted', text: task.why }) : null,
        task.doc ? h('a', { class: 'btn btn-sm btn-ghost', href: `#/doc/${task.doc}`, text: 'Открыть в справочнике →' }) : null,
        h('button', { class: 'btn btn-primary btn-sm', style: 'margin-top:10px', text: index + 1 >= pool.length ? 'Показать результат' : 'Дальше →', onclick: () => { index++; draw(); } }));
      hint.replaceChildren();
      box.append(conf);
      box.querySelectorAll('button,input').forEach((el) => { if (!conf.contains(el)) el.disabled = true; });
    };

    box.replaceChildren(
      h('div', { class: 'spread' },
        h('div', { class: 'tiny faint', text: `Задание ${index + 1} из ${pool.length} · верно ${correct}` }),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/train', text: 'Выйти' })),
      h('div', { style: 'font-size:19px;font-weight:650;margin-top:8px', text: task.task }),
      task.detail ? h('div', { class: 'small muted', text: task.detail }) : null,
      h('div', { class: 'row', style: 'margin-top:14px' }, modBtns),
      h('div', { style: 'margin-top:10px' }, keyGrid),
      h('div', { class: 'row', style: 'margin-top:10px' }, typed, h('button', { class: 'btn btn-primary', text: 'Проверить', onclick: check })),
      hint, answerLine);
    hint.append(h('span', { text: 'Подсказка: ' + (task.hint || 'вспомните, в каком редакторе выполняется действие') }));
    paint();
  };

  const finish = () => {
    store.trainerResult('keys', { correct, total: pool.length, detail });
    const unlocked = store.checkAchievements();
    box.replaceChildren(
      h('h2', { style: 'margin-top:0', text: `Результат: ${correct} из ${pool.length}` }),
      h('div', { class: 'bar green' }, h('i', { style: `width:${Math.round((correct / pool.length) * 100)}%` })),
      h('p', { class: 'muted', style: 'margin-top:12px', text: correct >= pool.length * 0.8 ? 'Отличный результат — сочетания отскакивают от зубов.' : correct >= pool.length * 0.5 ? 'Хорошо, но есть над чем поработать.' : 'Стоит повторить уроки по интерфейсу и вьюпорту.' }),
      unlocked.length ? h('p', { class: 'badge badge-green', text: `Достижение: ${unlocked.map((x) => store.ACHIEVEMENTS.find((a) => a.id === x)?.title).join(', ')}` }) : null,
      h('div', { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn btn-primary', text: 'Ещё раз', onclick: () => go('train/keys') }),
        h('button', { class: 'btn', text: 'Сложные сочетания', onclick: showHardest })));
    wrapUp.replaceChildren();
  };

  const showHardest = () => {
    const hard = store.get().trainers.keys.hardest || {};
    const rows = Object.entries(hard).map(([k, v]) => ({ k, fails: v.fail, ok: v.ok }))
      .filter((x) => x.fails).sort((a, b) => b.fails - a.fails).slice(0, 10);
    wrapUp.replaceChildren(h('h2', { text: 'Что даётся труднее всего' }),
      rows.length ? h('div', {}, rows.map((r) => h('div', { class: 'spread', style: 'padding:6px 0;border-bottom:1px solid var(--line-soft)' },
        h('kbd', { text: r.k }), h('span', { class: 'small faint', text: `ошибок: ${r.fails}, верно: ${r.ok}` }))))
        : h('p', { class: 'muted', text: 'Пока нет статистики — пройдите тренажёр.' }));
  };

  draw();
  return wrap;
}

/* ─────────────────────── 2. найди опцию ─────────────────────── */

function findTrainer(ctx) {
  const wrap = h('div');
  const LEN = 8;
  const panels = SIM_PANELS;
  let index = 0;
  let correct = 0;

  // панели бывают двух видов: с вкладками (tabs[].items) и с плоским списком items
  const itemsOf = (p) => (p.tabs
    ? p.tabs.flatMap((t) => (t.items || []).map((it) => ({ ...it, tab: t })))
    : (p.items || []).map((it) => ({ ...it, tab: null })));
  const checklist = panels.flatMap((p) => itemsOf(p).map((it) => ({ ...it, panel: p })));
  const pool = [...checklist].sort(() => Math.random() - 0.5).slice(0, LEN);

  const box = h('div', { class: 'card' });
  wrap.append(
    h('h1', { text: '🖱️ Найди опцию' }),
    h('p', { class: 'muted', text: 'Задание описывает, что нужно сделать. Найдите нужную вкладку и настройку в симуляторе интерфейса — как в реальном Blender.' }),
    box);

  const draw = () => {
    if (index >= pool.length) return finish();
    const task = pool[index];
    let activePanel = panels[0].tabs ? panels[0] : panels[0];
    let activeTab = null;
    const tabsState = new Map(panels.map((p) => [p.id, p.tabs ? p.tabs[0].id : null]));

    const tabsBar = h('div', { class: 'sim-tabs' });
    const itemsBox = h('div', { class: 'sim-items' });
    const feedback = h('div');

    const itemsFor = (panel) => {
      const tab = panel.tabs ? panel.tabs.find((t) => t.id === tabsState.get(panel.id)) : null;
      return (tab ? tab.items : panel.items || []);
    };

    const paintItems = () => {
      const panel = activePanel;
      const items = itemsFor(panel);
      itemsBox.replaceChildren(...items.map((it) => h('button', {
        class: 'sim-item', 
        onclick: (e) => {
          if (it.term === task.term) {
            correct++;
            e.target.classList.add('correct');
            feedback.replaceChildren(h('div', { class: 'card', style: 'margin-top:12px;border-color:var(--green)' },
              h('div', { class: 'badge badge-green', text: 'Верно!' }),
              h('div', { style: 'margin-top:8px' }, `Настройка «${it.term}» действительно находится здесь: ${panel.title}${panel.tabs ? ' → ' + panel.tabs.find((t) => t.id === tabsState.get(panel.id))?.title : ''}.`),
              it.ru ? h('div', { class: 'small ru-label', text: `По-русски: «${it.ru}»` }) : null,
              it.doc ? h('a', { class: 'btn btn-sm btn-ghost', href: `#/doc/${it.doc}`, text: 'Открыть в справочнике →' }) : null,
              h('button', { class: 'btn btn-primary btn-sm', style: 'margin-top:10px', text: index + 1 >= pool.length ? 'Результат' : 'Следующее задание →', onclick: () => { index++; draw(); } })));
          } else {
            e.target.classList.add('wrong');
            feedback.replaceChildren(h('div', { class: 'card', style: 'margin-top:12px' },
              h('span', { class: 'badge badge-red', text: 'Не здесь' }),
              h('div', { class: 'small muted', style: 'margin-top:6px', text: `«${it.term}» — это не то. Ищите в другой вкладке или панели.` })));
          }
        },
      }, h('span', { text: it.term }), it.ru ? h('span', { class: 'tiny faint', text: ` · ${it.ru}` }) : null)));
      if (!items.length) itemsBox.replaceChildren(h('div', { class: 'faint small', text: 'В этой вкладке настроек нет' }));
    };

    const paintTabs = () => {
      const panel = activePanel;
      if (!panel.tabs) {
        tabsBar.style.display = 'none';
        return;
      }
      tabsBar.style.display = 'flex';
      tabsBar.replaceChildren(...panel.tabs.map((t) => h('button', {
        class: t.id === tabsState.get(panel.id) ? 'active' : '',
        text: t.title,
        onclick: () => { tabsState.set(panel.id, t.id); paintTabs(); paintItems(); },
      })));
    };

    box.replaceChildren(
      h('div', { class: 'spread' },
        h('div', { class: 'tiny faint', text: `Задание ${index + 1} из ${pool.length} · верно ${correct}` }),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/train', text: 'Выйти' })),
      h('div', { style: 'font-size:18px;font-weight:650;margin:10px 0 4px', text: task.task }),
      h('div', { class: 'small muted', text: 'Нажмите нужную настройку в симуляторе.' }),
      h('div', { class: 'row', style: 'margin:12px 0 8px' }, panels.map((p) => h('button', {
        class: 'btn btn-sm' + (p.id === activePanel.id ? ' btn-primary' : ''),
        text: p.title,
        onclick: (e) => {
          activePanel = p;
          box.querySelectorAll('.row .btn').forEach((b) => b.classList.remove('btn-primary'));
          e.target.classList.add('btn-primary');
          paintTabs(); paintItems();
        },
      }))),
      h('div', { class: 'sim' },
        h('div', { class: 'sim-panel' }, tabsBar, itemsBox),
        h('div', {}, h('div', { class: 'card' }, h('div', { class: 'tiny faint', text: 'Подсказка' }), h('div', { class: 'small muted', style: 'margin-top:6px', text: task.hint || 'Подумайте, к какому редактору относится задача.' })))),
      feedback);
    paintTabs(); paintItems();
  };

  const finish = () => {
    store.trainerResult('find', { correct, total: pool.length });
    const unlocked = store.checkAchievements();
    box.replaceChildren(
      h('h2', { style: 'margin-top:0', text: `Результат: ${correct} из ${pool.length}` }),
      h('div', { class: 'bar green' }, h('i', { style: `width:${Math.round((correct / pool.length) * 100)}%` })),
      h('p', { class: 'muted', style: 'margin-top:12px', text: 'Чем лучше вы знаете, где что лежит, тем меньше времени тратите на поиск в Blender.' }),
      unlocked.length ? h('p', { class: 'badge badge-green', text: `Достижение: ${unlocked.map((x) => store.ACHIEVEMENTS.find((a) => a.id === x)?.title).join(', ')}` }) : null,
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn btn-primary', text: 'Ещё раз', onclick: () => go('train/find') })));
  };

  draw();
  return wrap;
}

/* ─────────────────────── 3. квиз по функциям ─────────────────────── */

function quizTrainer(ctx) {
  const wrap = h('div');
  const box = h('div', { class: 'card' }, h('div', { class: 'muted', text: 'Готовлю вопросы из справочника…' }), loadingNote());
  wrap.append(h('h1', { text: '🎯 Что делает функция' }), box);
  let engine = null;
  let questions = [];
  let index = 0;
  let correct = 0;
  const LEN = 10;
  const utils = () => appCtx.utils;

  const buildQuestions = () => {
    const anchors = engine.anchors.filter((a) =>
      a.x && a.x.length > 45 && a.x.length < 190 &&
      a.t && a.t.length >= 3 && a.t.length <= 42 &&
      /^[\x20-\x7EА-Яа-яЁё«»"()\/+.,'’\-]+$/.test(a.t) &&
      !/^[\d\s.,:;()\-]+$/.test(a.t));
    const seen = new Set();
    const chosen = [];
    for (const a of anchors.sort(() => Math.random() - 0.5)) {
      if (chosen.length >= LEN) break;
      const key = a.t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const distractors = anchors.filter((b) => b !== a && b.x.length > a.x.length * 0.5 && b.x.length < a.x.length * 2).slice(0, 40);
      if (distractors.length < 3) continue;
      const opts = [a, ...[...distractors].sort(() => Math.random() - 0.5).slice(0, 3)];
      chosen.push({ anchor: a, options: opts.sort(() => Math.random() - 0.5) });
    }
    return chosen;
  };

  const draw = () => {
    if (index >= questions.length) return finish();
    const q = questions[index];
    const a = q.anchor;
    const feedback = h('div');

    const opts = q.options.map((o) => {
      const b = h('button', { class: 'quiz-opt' }, h('span', { text: o.x.slice(0, 190) + (o.x.length > 190 ? '…' : '') }));
      b.addEventListener('click', () => {
        if (b.dataset.locked) return;
        opts.forEach((x) => (x.dataset.locked = '1'));
        const ok = o === a;
        b.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) opts[q.options.indexOf(a)]?.classList.add('correct');
        if (ok) correct++;
        const d = q.options[q.options.indexOf(a)];
        feedback.replaceChildren(h('div', { class: 'card', style: 'margin-top:12px' },
          h('span', { class: ok ? 'badge badge-green' : 'badge badge-red', text: ok ? 'Верно' : 'Неверно' }),
          h('div', { class: 'small muted', style: 'margin-top:8px', text: `Правильный ответ относится к опции «${a.t}»${a.ru ? ` (${a.ru})` : ''} на странице «${d2title(d)}».` }),
          h('div', { class: 'row', style: 'margin-top:10px' },
            h('a', { class: 'btn btn-sm btn-ghost', href: `#/doc/${engine.docs[a.i]?.id || ''}`, text: 'Открыть в справочнике →' }),
            h('button', { class: 'btn btn-primary btn-sm', text: index + 1 >= questions.length ? 'Результат' : 'Дальше →', onclick: () => { index++; draw(); } }))));
      });
      return b;
    });

    box.replaceChildren(
      h('div', { class: 'spread' },
        h('div', { class: 'tiny faint', text: `Вопрос ${index + 1} из ${questions.length} · верно ${correct}` }),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/train', text: 'Выйти' })),
      h('div', { style: 'font-size:19px;font-weight:650;margin:12px 0 4px' },
        'Что делает ', h('span', { class: 'uicode', text: a.t }), a.ru ? h('span', { class: 'ru-label', text: ` (${a.ru})` }) : null, '?'),
      h('div', { class: 'small faint', text: `Раздел: ${engine.docs[a.i]?.id || ''}` }),
      h('div', { style: 'margin-top:14px' }, opts), feedback);
  };

  const d2title = (anchor) => engine.docs[anchor.i]?.t || '';
  const finish = () => {
    store.trainerResult('quiz', { correct, total: questions.length });
    const unlocked = store.checkAchievements();
    box.replaceChildren(
      h('h2', { style: 'margin-top:0', text: `Результат: ${correct} из ${questions.length}` }),
      h('div', { class: 'bar green' }, h('i', { style: `width:${Math.round((correct / Math.max(1, questions.length)) * 100)}%` })),
      h('p', { class: 'muted', style: 'margin-top:12px', text: 'Каждое объяснение взято из официального руководства — можно проверить по ссылке.' }),
      unlocked.length ? h('p', { class: 'badge badge-green', text: `Достижение: ${unlocked.map((x) => store.ACHIEVEMENTS.find((a) => a.id === x)?.title).join(', ')}` }) : null,
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn btn-primary', text: 'Новые вопросы', onclick: () => go('train/quiz') })));
  };

  (async () => {
    engine = await getSearch();
    questions = buildQuestions();
    if (!questions.length) { box.replaceChildren(h('p', { class: 'muted', text: 'Не удалось построить вопросы — проверьте данные.' })); return; }
    draw();
  })();

  return wrap;
}
