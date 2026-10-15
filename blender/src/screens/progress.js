/** progress.js — прогресс, карта знаний, повторение, достижения и настройки. */

import { h, frag, toast } from '../lib/dom.js';
import * as store from '../lib/store.js';
import { COURSE, moduleProgress } from '../../content/course.js';
import { knowledgeMap } from './home.js';
import { go } from '../app.js';

export function progressScreen(parts, ctx) {
  const st = store.get();
  const wrap = h('div');

  wrap.append(h('h1', { text: 'Прогресс и знания' }));

  const lessonsTotal = COURSE.reduce((s, m) => s + m.lessons.length, 0);
  const lessonsDone = Object.values(st.progress.lessons).filter((l) => l.done).length;

  wrap.append(h('div', { class: 'grid cols-4' },
    stat(`${lessonsDone}/${lessonsTotal}`, 'уроков курса'),
    stat(String(store.markedCount()), 'страниц изучено'),
    stat(String(store.visitedCount()), 'страниц открыто'),
    stat(`🔥 ${st.streak.days}`, `дней подряд (рекорд ${st.streak.best})`)));

  // ── повторение ──
  const due = store.srsDue();
  const srsTotal = store.srsCount();
  wrap.append(h('h2', { text: 'Интервальное повторение' }),
    h('p', { class: 'small muted', text: `В повторении ${srsTotal} карточек. К повторению сейчас: ${due.length}.` }));
  if (due.length) {
    const box = h('div', { class: 'card' });
    const cardId = due[0];
    const [kind, ref] = cardId.split(':');
    const label = kind === 'doc' ? `Страница ${ref}` : `Опция ${ref}`;
    box.append(
      h('div', { class: 'tiny faint', text: `${due.length} к повторению` }),
      h('div', { style: 'font-weight:600;font-size:17px;margin:6px 0', text: label }),
      kind === 'doc' ? h('a', { class: 'btn btn-sm', href: `#/doc/${ref}`, text: 'Открыть и вспомнить' }) : null,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn btn-sm', text: 'Забыл', onclick: () => { store.srsGrade(cardId, 0); toast('Вернётся завтра'); r(); } }),
        h('button', { class: 'btn btn-sm btn-primary', text: 'Вспомнил', onclick: () => { store.srsGrade(cardId, 1); toast('Интервал увеличен'); r(); } }),
        h('button', { class: 'btn btn-sm', text: 'Легко', onclick: () => { store.srsGrade(cardId, 2); toast('Ещё реже'); r(); } })));
    wrap.append(box);
  }
  const r = () => { const n = progressScreen(parts, ctx); document.querySelector('main .main-slot').replaceChildren(n); };

  // ── карта знаний ──
  wrap.append(h('h2', { text: 'Карта знаний по разделам' }),
    h('p', { class: 'small muted', text: 'Нажмите на раздел, чтобы открыть список страниц и продолжить.' }),
    knowledgeMap(ctx, (id) => go(`ref/${id}`)));

  // ── модули курса ──
  wrap.append(h('h2', { text: 'Курс' }),
    h('div', { class: 'grid cols-2' }, COURSE.map((m) => {
      const p = moduleProgress(m);
      return h('div', { class: 'card' },
        h('div', { class: 'spread' }, h('div', { style: 'font-weight:600', text: `${m.icon} ${m.title}` }), h('span', { class: 'tiny faint', text: `${p.pct}%` })),
        h('div', { class: 'bar', style: 'margin-top:8px' }, h('i', { style: `width:${p.pct}%` })));
    })));

  // ── достижения ──
  wrap.append(h('h2', { text: 'Достижения' }),
    h('div', { class: 'grid cols-4' }, store.ACHIEVEMENTS.map((a) => {
      const got = !!st.achievements[a.id];
      return h('div', { class: 'card', style: got ? 'border-color:var(--accent-line)' : 'opacity:.6' },
        h('div', { style: 'font-size:22px', text: a.icon }),
        h('div', { style: 'font-weight:600;margin-top:4px', text: a.title }),
        h('div', { class: 'tiny faint', text: a.hint }),
        got ? h('div', { class: 'badge badge-green', style: 'margin-top:8px', text: 'получено' }) : null);
    })));

  // ── тренажёры ──
  wrap.append(h('h2', { text: 'Статистика тренажёров' }),
    h('div', { class: 'grid cols-3' },
      trCard('Горячие клавиши', st.trainers.keys, 10),
      trCard('Найди опцию', st.trainers.find, 8),
      trCard('Квиз', st.trainers.quiz, 10)));

  // ── настройки и данные ──
  wrap.append(h('h2', { text: 'Настройки и данные' }),
    h('div', { class: 'grid cols-2' },
      h('div', { class: 'card' },
        h('h3', { style: 'margin-top:0', text: 'Интерфейс' }),
        toggle('Светлая тема', st.settings.theme === 'light', (v) => { store.setSetting('theme', v ? 'light' : 'dark'); r(); }),
        toggle('Показывать русские названия интерфейса', st.settings.showRu, (v) => { store.setSetting('showRu', v); toast(v ? 'Русские названия включены' : 'Выключено'); }),
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('span', { class: 'small muted', text: 'Длина сессии тренажёра:' }),
          ...[6, 10, 20].map((n) => h('button', {
            class: `btn btn-sm${st.settings.trainerLen === n ? ' btn-primary' : ''}`, text: String(n),
            onclick: () => { store.setSetting('trainerLen', n); r(); },
          }))),
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('span', { class: 'small muted', text: 'Размер шрифта:' }),
          ...[0.9, 1, 1.15].map((n) => h('button', {
            class: `btn btn-sm${st.settings.fontScale === n ? ' btn-primary' : ''}`, text: `${Math.round(n * 100)}%`,
            onclick: () => { store.setSetting('fontScale', n); r(); },
          })))),
      h('div', { class: 'card' },
        h('h3', { style: 'margin-top:0', text: 'Ваши данные' }),
        h('p', { class: 'small muted', text: 'Прогресс хранится только в этом браузере. Экспортируйте JSON, чтобы перенести его на другое устройство.' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm', text: 'Экспорт JSON', onclick: () => {
            const blob = new Blob([store.exportJson()], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: 'blender-academy-progress.json' });
            a.click();
            toast('Файл прогресса сохранён');
          } }),
          h('label', { class: 'btn btn-sm', style: 'cursor:pointer' }, 'Импорт JSON',
            h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { store.importJson(await f.text()); toast('Импортировано'); r(); }
              catch (err) { toast('Не удалось: ' + err.message); }
            } })),
          h('button', { class: 'btn btn-sm btn-ghost', text: 'Сбросить', onclick: () => {
            if (confirm('Удалить весь прогресс, статистику и повторения?')) { store.resetAll(); toast('Сброшено'); r(); }
          } })))));

  return wrap;
}

const stat = (value, label) => h('div', { class: 'card stat' }, h('b', { text: value }), h('span', { text: label }));

function trCard(title, t, max) {
  const total = 0;
  return h('div', { class: 'card' },
    h('div', { style: 'font-weight:600', text: title }),
    h('div', { class: 'small muted', style: 'margin-top:6px', text: `Сессий: ${t.plays} · правильных ответов: ${t.correct} · лучший результат: ${t.best}/${max}` }),
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('i', { style: `width:${Math.round((t.best / max) * 100)}%` })));
}

function toggle(label, value, onChange) {
  const input = h('input', { type: 'checkbox', ...(value ? { checked: true } : {}) });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'row', style: 'margin:8px 0;cursor:pointer' }, input, h('span', { class: 'small', text: label }));
}
