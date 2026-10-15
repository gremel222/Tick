/**
 * store.js — настройки, прогресс, интервальное повторение и достижения.
 * Всё хранится локально (localStorage), экспортируется/импортируется одним JSON.
 */

const KEY = 'blender-academy/v1';

const DEFAULTS = () => ({
  version: 1,
  settings: {
    theme: 'dark',
    showRu: true,
    fontScale: 1,
    trainerLen: 10,
  },
  progress: {
    visited: {},        // id страницы → timestamp
    marked: {},         // id страницы → true («изучено»)
    lessons: {},        // id урока → { stepsDone: [индексы], done: bool, quiz: {correct, total}, ts }
    modules: {},        // id модуля → percent
  },
  trainers: {
    keys: { plays: 0, correct: 0, best: 0, hardest: {} },
    find: { plays: 0, correct: 0, best: 0 },
    quiz: { plays: 0, correct: 0, best: 0 },
  },
  srs: {},              // cardId → { due, ivl, ef, reps }
  achievements: {},     // id → timestamp
  streak: { days: 0, last: null, best: 0 },
});

let state = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      progress: { ...base.progress, ...(parsed.progress || {}) },
      trainers: { ...base.trainers, ...(parsed.trainers || {}) },
      srs: parsed.srs || {},
      achievements: parsed.achievements || {},
      streak: { ...base.streak, ...(parsed.streak || {}) },
    };
  } catch {
    return DEFAULTS();
  }
}

export function initStore() {
  state = load();
  touchStreak();
  return state;
}

export const get = () => state || (state = load());

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* приватный режим — работаем без сохранения */ }
  for (const fn of listeners) fn(state);
}

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ── настройки ── */
export function setSetting(k, v) {
  get().settings[k] = v;
  save();
  if (k === 'theme') applyTheme(v);
  if (k === 'fontScale') document.documentElement.style.fontSize = `${16 * v}px`;
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#16181d');
}

/* ── прогресс ── */
export function visit(id) {
  const p = get().progress;
  if (!p.visited[id]) {
    p.visited[id] = Date.now();
    save();
  }
}

export function toggleMark(id) {
  const p = get().progress;
  if (p.marked[id]) delete p.marked[id];
  else p.marked[id] = true;
  save();
  return !!p.marked[id];
}

export const isMarked = (id) => !!get().progress.marked[id];
export const visitedCount = () => Object.keys(get().progress.visited).length;
export const markedCount = () => Object.keys(get().progress.marked).length;

/* ── уроки ── */
export function lessonState(id) {
  const l = get().progress.lessons[id];
  return l || { stepsDone: [], done: false, quiz: { correct: 0, total: 0 }, ts: 0 };
}

export function saveLesson(id, patch) {
  const p = get().progress;
  p.lessons[id] = { ...lessonState(id), ...patch, ts: Date.now() };
  save();
  return p.lessons[id];
}

export function toggleStep(id, index) {
  const st = lessonState(id);
  const set = new Set(st.stepsDone);
  if (set.has(index)) set.delete(index);
  else set.add(index);
  return saveLesson(id, { stepsDone: [...set] });
}

/* ── тренажёры ── */
export function trainerResult(kind, { correct, total, detail }) {
  const t = get().trainers[kind] || (get().trainers[kind] = { plays: 0, correct: 0, best: 0 });
  t.plays += 1;
  t.correct += correct;
  if (correct > t.best) t.best = correct;
  if (kind === 'keys' && detail) {
    for (const [key, ok] of Object.entries(detail)) {
      const rec = t.hardest[key] || (t.hardest[key] = { ok: 0, fail: 0 });
      if (ok) rec.ok++; else rec.fail++;
    }
  }
  save();
  return t;
}

/* ── SRS (лёгкий SM-2) ── */
export function srsAdd(cardId) {
  const s = get().srs;
  if (!s[cardId]) s[cardId] = { due: Date.now(), ivl: 0, ef: 2.5, reps: 0 };
  save();
  return s[cardId];
}

export function srsGrade(cardId, grade) {  // grade: 0 — забыл, 1 — вспомнил, 2 — легко
  const s = get().srs;
  const c = s[cardId] || (s[cardId] = { due: Date.now(), ivl: 0, ef: 2.5, reps: 0 });
  c.ef = Math.max(1.3, c.ef + (grade === 0 ? -0.25 : grade === 1 ? 0 : 0.12));
  c.reps += 1;
  c.ivl = grade === 0 ? 1 : Math.round((c.ivl || 1) * c.ef);
  c.due = Date.now() + c.ivl * 24 * 3600 * 1000;
  save();
  return c;
}

export function srsDue() {
  const now = Date.now();
  return Object.entries(get().srs).filter(([, c]) => c.due <= now).map(([id]) => id);
}

export const srsCount = () => Object.keys(get().srs).length;

/* ── достижения ── */
export const ACHIEVEMENTS = [
  { id: 'first-step', title: 'Первый шаг', hint: 'Открыть любой урок', icon: '🎓' },
  { id: 'reader', title: 'Читатель', hint: 'Открыть 25 страниц справочника', icon: '📚' },
  { id: 'scholar', title: 'Начитанный', hint: 'Открыть 200 страниц справочника', icon: '🧠' },
  { id: 'explorer', title: 'Исследователь', hint: 'Заглянуть в 10 разделов', icon: '🧭' },
  { id: 'asking', title: 'Любознательный', hint: 'Задать 10 вопросов', icon: '❓' },
  { id: 'hotkeys', title: 'Мастер клавиш', hint: '10 правильных ответов в тренажёре клавиш', icon: '⌨️' },
  { id: 'navigator', title: 'Навигатор интерфейса', hint: '10 правильных ответов в тренажёре «Найди опцию»', icon: '🖱️' },
  { id: 'quizzer', title: 'Знаток', hint: '10 правильных ответов в квизе', icon: '🎯' },
  { id: 'finisher', title: 'Первый модуль', hint: 'Завершить любой модуль курса', icon: '🏅' },
  { id: 'streak3', title: 'Три дня подряд', hint: 'Заниматься 3 дня подряд', icon: '🔥' },
  { id: 'master', title: 'Знаток Blender', hint: 'Отметить 100 страниц как изученные', icon: '👑' },
];

export function unlock(id) {
  const a = get().achievements;
  if (a[id]) return false;
  a[id] = Date.now();
  save();
  return true;
}

export function checkAchievements({ asked } = {}) {
  const s = get();
  const unlocked = [];
  const tryUnlock = (cond, id) => { if (cond && unlock(id)) unlocked.push(id); };
  tryUnlock(Object.keys(s.progress.lessons).length > 0, 'first-step');
  tryUnlock(visitedCount() >= 25, 'reader');
  tryUnlock(visitedCount() >= 200, 'scholar');
  tryUnlock(markedCount() >= 100, 'master');
  tryUnlock(s.trainers.keys.correct >= 10, 'hotkeys');
  tryUnlock(s.trainers.find.correct >= 10, 'navigator');
  tryUnlock(s.trainers.quiz.correct >= 10, 'quizzer');
  tryUnlock(s.streak.days >= 3, 'streak3');
  if (asked) tryUnlock((s.progress.asked || 0) >= 10, 'asking');
  return unlocked;
}

export function countAsk() {
  const p = get().progress;
  p.asked = (p.asked || 0) + 1;
  save();
}

export const askedCount = () => get().progress.asked || 0;

export function sectionsTouched(ids) {
  const seen = new Set();
  const v = get().progress.visited;
  for (const id of Object.keys(v)) {
    const top = id.split('/')[0];
    if (ids.includes(top)) seen.add(top);
  }
  return seen.size;
}

/* ── серия дней ── */
export function touchStreak() {
  const s = get().streak;
  const today = new Date().toISOString().slice(0, 10);
  if (s.last === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  s.days = s.last === yesterday ? s.days + 1 : 1;
  s.last = today;
  s.best = Math.max(s.best || 0, s.days);
  save();
}

/* ── экспорт/импорт/сброс ── */
export const exportJson = () => JSON.stringify(get(), null, 2);

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Некорректный файл');
  state = { ...DEFAULTS(), ...parsed };
  save();
  applyTheme(state.settings.theme);
  return state;
}

export function resetAll() {
  state = DEFAULTS();
  save();
  applyTheme(state.settings.theme);
  return state;
}
