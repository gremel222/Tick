/**
 * lock.js — защита входа по PIN-коду.
 *
 * Как это работает и что здесь честно:
 *   • PIN мы НЕ храним. Храним только SHA-256 от строки «соль:PIN» и саму соль.
 *     По хэшу нельзя восстановить PIN, но и данные он не шифрует — см. ниже.
 *   • Данные в браузере не шифруются. PIN закрывает вход в приложение: без него
 *     не увидеть вахты, суммы и расчётные листки. Но если человек получил доступ
 *     к разблокированному устройству и к хранилищу браузера, базу можно прочитать
 *     инструментами разработчика. Об этом прямо написано в настройках и README.
 *   • Биометрию (Face ID / Touch ID) не используем: в установленном PWA на iOS
 *     стабильной работы нет, поэтому основа защиты — PIN.
 *
 * SHA-256 и случайную соль даёт SubtleCrypto. Он работает только в защищённом
 * контексте (https или localhost) — на GitHub Pages это https, всё в порядке.
 */

export const MIN_PIN = 4;
export const MAX_PIN = 6;
export const WRONG_ATTEMPTS_BEFORE_PAUSE = 5;   // после 5 неверных — пауза
export const FIRST_PAUSE_MS = 30 * 1000;        // первая пауза 30 секунд
export const MAX_PAUSE_MS = 15 * 60 * 1000;     // дальше растёт, но не больше 15 минут
export const AUTO_LOCK_MS = 30 * 1000;          // блокировать, если скрыто дольше 30 секунд

/** Доступен ли SHA-256 в этом браузере и контексте (нужен https или localhost). */
export function pinAvailable() {
  try {
    return typeof crypto !== 'undefined'
      && typeof crypto.subtle !== 'undefined'
      && typeof crypto.subtle.digest === 'function'
      && typeof crypto.getRandomValues === 'function';
  } catch (error) {
    return false;
  }
}

/** PIN из 4–6 цифр. */
export function isValidPin(pin) {
  return new RegExp(`^\\d{${MIN_PIN},${MAX_PIN}}$`).test(String(pin ?? ''));
}

/** Случайная соль в hex (понадобится, чтобы одинаковые PIN давали разные хэши). */
export function randomSalt(bytes = 16) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 от строки. */
export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** Хэш PIN с солью: hashPin('1234', 'abc…') → «9f2c…». */
export function hashPin(pin, saltHex) {
  return sha256(`${saltHex}:${pin}`);
}

/** Совпадает ли введённый PIN с сохранённым хэшем. */
export async function verifyPin(pin, { pinHash, pinSalt }) {
  if (!pinHash || !pinSalt) return false;
  const candidate = await hashPin(pin, pinSalt);
  return candidate === pinHash;
}

/* ─────────────────────────── пауза после ошибок ─────────────────────────── */

/** Сколько ждать после серии неверных попыток: 30 с → 1 мин → 2 мин … максимум 15 мин. */
export function pauseDuration(pauseCount) {
  const step = Math.max(0, Number(pauseCount) || 0);
  return Math.min(FIRST_PAUSE_MS * 2 ** step, MAX_PAUSE_MS);
}

/** Сколько секунд осталось до конца паузы (0 — можно пробовать снова). */
export function pauseLeft(lockUntil, now = Date.now()) {
  const left = (Number(lockUntil) || 0) - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** «30 секунд», «1 минута», «2 минуты 10 секунд» — понятный текст ожидания. */
export function formatWait(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} ${plural(total, ['секунда', 'секунды', 'секунд'])}`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const text = `${minutes} ${plural(minutes, ['минута', 'минуты', 'минут'])}`;
  return rest ? `${text} ${rest} ${plural(rest, ['секунда', 'секунды', 'секунд'])}` : text;
}

function plural(n, forms) {
  const abs = Math.abs(Math.round(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/* ─────────────────────────── блокировка при возврате ─────────────────────────── */

/**
 * Нужно ли заблокировать приложение при возврате.
 * Блокируем, только если PIN включён и приложение было скрыто дольше 30 секунд.
 */
export function shouldAutoLock(hiddenAt, now, pinEnabled) {
  if (!pinEnabled) return false;
  if (!hiddenAt) return false;
  return now - hiddenAt > AUTO_LOCK_MS;
}
