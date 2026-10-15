/**
 * dates.js — даты и расчёты по вахтам.
 *
 * Все даты в приложении хранятся строками вида 'ГГГГ-ММ-ДД' («ключ даты», он же
 * формат <input type="date">). Внутри не используем часы, минуты и часовые пояса:
 * считаем только номера локальных календарных дней, поэтому переход на летнее
 * время и часовые пояса ничего не ломают.
 */

const MS_PER_DAY = 86400000;

/* ─────────────────────────── базовые операции ─────────────────────────── */

/** 'ГГГГ-ММ-ДД' → номер дня (целое число, удобно складывать и вычитать). */
export function dayNumber(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Сегодняшний локальный день (ключ). */
export function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Ключ даты → объект Date (локальная полночь). */
export function toDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Прибавить n дней к ключу даты. */
export function addDays(key, n) {
  const dt = new Date(dayNumber(key) * MS_PER_DAY + n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Разница в днях: b − a (может быть отрицательной). */
export function diffDays(a, b) {
  return dayNumber(b) - dayNumber(a);
}

/** Похоже ли на корректный ключ даты. */
export function isValidKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/* ─────────────────────────── формат для человека ─────────────────────────── */

/** 'ГГГГ-ММ-ДД' → 'ДД.ММ.ГГГГ'. */
export function formatDate(key) {
  if (!isValidKey(key)) return '—';
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

/** 'ГГГГ-ММ-ДД' → 'ДД.ММ'. */
export function formatDayMonth(key) {
  if (!isValidKey(key)) return '—';
  const [, m, d] = key.split('-');
  return `${d}.${m}`;
}

/** 'ГГГГ-ММ-ДД' → 'ДД.ММ.ГГГГ (пн)'. */
export function formatDateWeekday(key) {
  return `${formatDate(key)} (${weekday(key)})`;
}

/** Диапазон вахты: 'ДД.ММ.ГГГГ–ДД.ММ.ГГГГ'. */
export function formatRange(from, to) {
  return `${formatDate(from)}–${formatDate(to)}`;
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Короткое название дня недели. */
export function weekday(key) {
  if (!isValidKey(key)) return '';
  return WEEKDAYS[toDate(key).getDay()];
}

/** Русские окончания: plural(3, ['день', 'дня', 'дней']) → 'дня'. */
export function plural(n, forms) {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** 'дней' вместе с числом: 30 → '30 дней'. */
export function formatDays(n) {
  return `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
}

/* ─────────────────────────── вахты ─────────────────────────── */

/** Статус вахты считается по датам, а не хранится в базе. */
export const PLANNED = 'planned';
export const ACTIVE = 'active';
export const DONE = 'done';

export function shiftStatus(shift, today = todayKey()) {
  if (diffDays(today, shift.arrival) > 0) return PLANNED;   // сегодня < заезд — вахта впереди
  if (diffDays(today, shift.workEnd) >= 0) return ACTIVE;   // заезд ≤ сегодня ≤ окончание
  return DONE;                                              // сегодня > окончание
}

/** M — длина вахты в днях (включительно). */
export function shiftLength(shift) {
  return diffDays(shift.arrival, shift.workEnd) + 1;
}

/** N — номер дня вахты: сегодня − заезд + 1. */
export function shiftDayNumber(shift, today = todayKey()) {
  return diffDays(shift.arrival, today) + 1;
}

/** Сколько дней осталось до окончания (в последний день — 0). */
export function shiftDaysLeft(shift, today = todayKey()) {
  return diffDays(today, shift.workEnd);
}

/** Этап: 'road' — в дороге, 'site' — на объекте. */
export function shiftStage(shift, today = todayKey()) {
  // если начало работы совпадает с заездом, «В дороге» не показываем
  if (!shift.workStart || shift.workStart === shift.arrival) return 'site';
  return diffDays(today, shift.workStart) > 0 ? 'road' : 'site';
}

export const STAGE_TITLES = { road: 'В дороге', site: 'На объекте' };

/**
 * Веха вахты — короткая подпись на главном экране.
 * Показываем только у идущей вахты и только одну, приоритет сверху вниз.
 */
export function shiftMilestone(shift, today = todayKey()) {
  if (shiftStatus(shift, today) !== ACTIVE) return null;
  const m = shiftLength(shift);
  const n = shiftDayNumber(shift, today);
  const left = shiftDaysLeft(shift, today);
  if (left === 0) return 'Последний день';
  if (left === 7 && m > 14) return 'Осталась неделя';
  if (n === Math.ceil(m / 2) && m >= 10) return 'Середина вахты';
  return null;
}

/** Пересекаются ли две вахты по датам (границы включительно). */
export function shiftsOverlap(a, b) {
  return dayNumber(a.arrival) <= dayNumber(b.workEnd) && dayNumber(b.arrival) <= dayNumber(a.workEnd);
}

/** 'Дома' N дней = сегодня − окончание последней завершённой вахты. */
export function homeDays(shift, today = todayKey()) {
  return diffDays(shift.workEnd, today);
}

/** Сколько дней до заезда (0 = заезд сегодня). */
export function daysUntil(arrival, today = todayKey()) {
  return diffDays(today, arrival);
}
