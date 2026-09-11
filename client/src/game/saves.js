/* ============================================================
   СОХРАНЕНИЯ (раздел 4.6): snapshot, 5 слотов + auto,
   сервер в полной версии; здесь — localStorage + экспорт JSON.
   ============================================================ */
import { getG } from './engine.js';

const PREFIX = 'pop:saves:';
export const SLOTS = [1, 2, 3, 4, 5];

function storage() {
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch (e) {}
  const mem = new Map();
  return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
}
const LS = storage();

function key(email) { return PREFIX + (email || 'guest'); }

export function listSaves(email) {
  try { return JSON.parse(LS.getItem(key(email)) || '{}'); } catch (e) { return {}; }
}

export function saveToSlot(email, slot, game) {
  if (!game) return false;
  const all = listSaves(email);
  const g = JSON.parse(JSON.stringify(game));
  g.meta.savedAt = Date.now();
  g.meta.slot = slot;
  all[slot] = {
    slot,
    name: g.player.name,
    day: g.world.day,
    level: g.player.level,
    mode: g.deathMode,
    savedAt: g.meta.savedAt,
    createdAt: all[slot]?.createdAt || g.meta.createdAt,
    data: g,
  };
  LS.setItem(key(email), JSON.stringify(all));
  return true;
}

export function autoSave(email) {
  return saveToSlot(email, 'auto', getG());
}

export function loadSlot(email, slot) {
  const all = listSaves(email);
  const s = all[slot];
  if (!s) return null;
  const data = JSON.parse(JSON.stringify(s.data));
  data.meta.slot = slot;
  return data;
}

export function deleteSlot(email, slot) {
  const all = listSaves(email);
  delete all[slot];
  LS.setItem(key(email), JSON.stringify(all));
}

export function lastSaveSlot(email) {
  const all = listSaves(email);
  let best = null, t = 0;
  for (const s of Object.values(all)) if (s.savedAt > t) { t = s.savedAt; best = s.slot; }
  return best;
}

export function exportSave(game) {
  const g = game || getG();
  if (!g) return null;
  return JSON.stringify({ type: 'popadanets-save', version: 1, savedAt: new Date().toISOString(), data: g }, null, 1);
}

export function importSave(json) {
  try {
    const obj = JSON.parse(json);
    if (obj?.type !== 'popadanets-save' || !obj?.data?.player || !obj?.data?.world) return { ok: false, error: 'Это не сохранение «Попаданца».' };
    const d = obj.data;
    if (!d.world.npcs || !d.quests || !d.log) return { ok: false, error: 'Файл повреждён.' };
    return { ok: true, data: d };
  } catch (e) {
    return { ok: false, error: 'Не удалось прочитать файл.' };
  }
}
