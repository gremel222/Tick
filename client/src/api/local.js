/* ============================================================
   ЛОКАЛЬНЫЕ АККАУНТЫ (прототип).
   В полной версии: argon2id + JWT на сервере, Google OAuth.
   Здесь: e-mail + пароль (SHA-256 с солью), GDPR-экспорт/удаление.
   ============================================================ */

const ACC_KEY = 'pop:accounts';
const SES_KEY = 'pop:session';

function LS() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) {}
  const mem = new Map();
  return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
}
const store = LS();

function readAccounts() {
  try { return JSON.parse(store.getItem(ACC_KEY) || '{}'); } catch (e) { return {}; }
}
function writeAccounts(a) { store.setItem(ACC_KEY, JSON.stringify(a)); }

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function register({ email, password, consent }) {
  email = (email || '').trim().toLowerCase();
  if (!emailRe.test(email)) return { ok: false, error: 'Проверь адрес почты.' };
  if (!password || password.length < 6) return { ok: false, error: 'Пароль — минимум 6 символов.' };
  if (!consent) return { ok: false, error: 'Нужно согласие с условиями и политикой.' };
  const accounts = readAccounts();
  if (accounts[email]) return { ok: false, error: 'Такой аккаунт уже есть. Попробуй войти.' };
  const salt = Math.random().toString(36).slice(2, 12);
  const hash = await sha256hex(salt + ':' + password);
  accounts[email] = { email, salt, hash, createdAt: Date.now(), consents: { tos: true, privacy: true, cookies: true, age: true, at: Date.now() } };
  writeAccounts(accounts);
  store.setItem(SES_KEY, email);
  return { ok: true, email };
}

export async function login(email, password) {
  email = (email || '').trim().toLowerCase();
  const acc = readAccounts()[email];
  if (!acc) return { ok: false, error: 'Нет такого аккаунта.' };
  const hash = await sha256hex(acc.salt + ':' + password);
  if (hash !== acc.hash) return { ok: false, error: 'Неверный пароль.' };
  store.setItem(SES_KEY, email);
  return { ok: true, email };
}

export function current() {
  const email = store.getItem(SES_KEY);
  if (!email) return null;
  return readAccounts()[email] ? { email } : null;
}

export function logout() { store.removeItem(SES_KEY); }

/* GDPR: удаление аккаунта со всеми сейвами */
export function deleteAccount(email) {
  const accounts = readAccounts();
  delete accounts[email];
  writeAccounts(accounts);
  store.removeItem('pop:saves:' + email);
  store.removeItem('pop:settings:' + email);
  store.removeItem(SES_KEY);
}

export function exportAccount(email) {
  const acc = readAccounts()[email];
  if (!acc) return null;
  let saves = {};
  try { saves = JSON.parse(store.getItem('pop:saves:' + email) || '{}'); } catch (e) {}
  return JSON.stringify({
    type: 'popadanets-account-export',
    exportedAt: new Date().toISOString(),
    account: { email: acc.email, createdAt: acc.createdAt, consents: acc.consents },
    saves: Object.values(saves).map(s => ({ slot: s.slot, name: s.name, day: s.day, level: s.level, savedAt: s.savedAt })),
  }, null, 1);
}

/* настройки пользователя (интерфейс и т.п.) */
export function getSettings(email) {
  try { return JSON.parse(store.getItem('pop:settings:' + (email || 'guest')) || '{}'); } catch (e) { return {}; }
}
export function setSettings(email, s) {
  store.setItem('pop:settings:' + (email || 'guest'), JSON.stringify(s));
}

/* лист всех аккаунтов устройства — для локального лидерборда */
export function allLocalStats() {
  const res = [];
  for (const acc of Object.values(readAccounts())) {
    let saves = {};
    try { saves = JSON.parse(store.getItem('pop:saves:' + acc.email) || '{}'); } catch (e) {}
    for (const s of Object.values(saves)) {
      const d = s.data;
      if (!d) continue;
      res.push({
        player: s.name || d.player?.name || 'Безымянный',
        email: acc.email,
        day: d.world?.day || 1,
        level: d.player?.level || 1,
        money: d.player?.money || 0,
        deviations: d.world?.stats?.canonDeviations || 0,
        achievements: (d.achievements || []).length,
        kills: d.world?.stats?.kills || 0,
      });
    }
  }
  return res;
}
