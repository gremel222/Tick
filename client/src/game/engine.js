/* ============================================================
   WORLD ENGINE — ядро «Попаданца» (v0.1)
   Время, состояния, действия, отношения, квесты, ачивки, смерть.
   Модуль без DOM — используется и в браузере, и в тестах.
   ============================================================ */
import { LOCATIONS, NPCS, ITEMS, WEATHER_STATES, SEASONS, QUESTS, ACHIEVEMENTS,
         RECIPES, CANON_EVENTS, VILLAGE_NAME } from './data.js';
import * as memory from './memory.js';
import * as economy from './economy.js';
import * as dialogue from './dialogue.js';
import * as combat from './combat.js';
import { parseAndRun } from './parser.js';

export const TIMESCALE = 96 / 60; // игровых минут за реальную секунду (1 игровой день ≈ 15 реальных минут)
const DAY = 1440;

/* ---------------- СОСТОЯНИЕ ---------------- */
export let G = null;

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(reason) { for (const fn of subs) { try { fn(reason); } catch (e) { console.error(e); } } }

export function uid() { return Math.random().toString(36).slice(2, 9); }
export function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(p) { return Math.random() < p; }

/* ---------------- ИНИЦИАЛИЗАЦИЯ МИРА ---------------- */
export function newGame(charData, opts = {}) {
  const now = Date.now();
  G = {
    version: 1,
    meta: { slot: opts.slot ?? null, createdAt: now, savedAt: now, playedMs: 0, account: opts.account ?? null, deaths: 0 },
    deathMode: charData.deathMode || 'normal',
    player: {
      name: charData.name, age: charData.age,
      pastProfession: charData.pastProfession, pastKnowledge: charData.pastKnowledge || [],
      personality: charData.personality, deathReason: charData.deathReason, worldType: charData.worldType,
      level: 1, xp: 0,
      stats: { strength: 5, agility: 5, endurance: 5, intelligence: 7, perception: 6, charisma: 5, luck: 4 },
      skills: {},
      hp: { current: 100, max: 100 }, energy: { current: 100, max: 100 }, mana: { current: 0, max: 0 },
      hunger: 15, thirst: 25,
      money: 0, inventory: [], equipment: { head: null, body: null, legs: null, weapon: null },
      location: opts.startLocation || 'forest-edge',
    },
    world: {
      day: opts.day ?? 1, min: opts.min ?? 360, weather: 'clear', weatherSince: 360,
      npcs: {},
      prices: economy.initPrices(),
      canon: CANON_EVENTS.map(c => ({ ...c, status: 'planned', deviationReason: null })),
      memory: [], rumors: [],
      stats: { kills: 0, jobsDone: 0, canonDeviations: 0, daysNoCombat: 0, moneyEarned: 0, daysPlayed: 0 },
      flags: { visited: ['forest-edge'], visitedCount: 1, forestDangerBonus: 0, caravanDaysLeft: 0, storyChars: [] },
    },
    quests: { active: [], completed: [] },
    achievements: [],
    log: [],
    history: [],
  };
  for (const npc of NPCS) {
    G.world.npcs[npc.id] = {
      known: false, met: false, talkedTotal: 0, lastTalkDay: 0, jobDoneToday: 0,
      rel: { trust: 0, respect: 0, sympathy: 0, fear: 0, suspicion: 0, attachment: 0, romantic: 0 },
      stageIdx: 0,
    };
  }
  log('title', 'Глава 1. ' + VILLAGE_NAME);
  log('sys', 'Ты стоишь на опушке. Мир живёт своей жизнью — с этой секунды.');
  activateDayQuests();
  notify('new');
  return G;
}

export function loadGame(state) { G = state; economy.ensurePrices(); notify('load'); }
export function getG() { return G; }

/* ---------------- ВРЕМЯ ---------------- */
export function absMin() { return (G.world.day - 1) * DAY + G.world.min; }
export function timeStr() {
  const h = Math.floor(G.world.min / 60), m = Math.floor(G.world.min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function partOfDay() {
  const h = Math.floor(G.world.min / 60);
  if (h < 5) return 'глухая ночь';
  if (h < 8) return 'раннее утро';
  if (h < 12) return 'утро';
  if (h < 17) return 'день';
  if (h < 21) return 'вечер';
  if (h < 23) return 'поздний вечер';
  return 'ночь';
}
export function isNight() { const h = Math.floor(G.world.min / 60); return h < 5 || h >= 21; }
export function seasonIdx() { return Math.floor((G.world.day - 1) / 30) % 4; }
export function seasonName() { return SEASONS[seasonIdx()]; }
export function weatherFx() { return WEATHER_STATES[G.world.weather]?.fx || {}; }
export function weatherName() { return WEATHER_STATES[G.world.weather]?.name || 'Ясно'; }
export function weatherIcon() { return WEATHER_STATES[G.world.weather]?.icon || '☀️'; }

/* Продвижение времени с обработкой последствий. deltaMin — игровые минуты. */
export function advanceTime(deltaMin, opts = {}) {
  if (!G || deltaMin <= 0) return;
  let left = deltaMin;
  const chunk = 30;
  while (left > 0) {
    const step = Math.min(chunk, left);
    G.world.min += step;
    left -= step;
    // граница дня
    if (G.world.min >= DAY) {
      G.world.min -= DAY; G.world.day += 1;
      onNewDay();
    }
    // граница погоды (каждые 360 минут)
    if (Math.floor(absMin() / 360) !== Math.floor((absMin() - step) / 360)) rollWeather();
    // биология (за шаг 30 мин => половина часовой ставки)
    const fx = weatherFx();
    G.player.hunger = Math.min(100, G.player.hunger + 0.6 * (fx.hungerRate || 1));
    G.player.thirst = Math.min(100, G.player.thirst + 0.9 * (fx.thirstRate || 1));
    if (opts.resting) G.player.energy.current = Math.min(G.player.energy.max, G.player.energy.current + 1 * (opts.sleeping ? 4 : 1));
    else G.player.energy.current = Math.max(0, G.player.energy.current - 0.5 * (fx.energyRate || 1));
    // урон от голода/жажды
    if (G.player.hunger >= 100) hurt(1, 'голод');
    if (G.player.thirst >= 100) hurt(1.5, 'жажда');
    // регенерация
    else if (G.player.hp.current < G.player.hp.max && G.player.hunger < 70 && G.player.energy.current > 30)
      G.player.hp.current = Math.min(G.player.hp.max, G.player.hp.current + 0.75);
  }
  if (!opts.silent) notify('time');
}

function rollWeather() {
  const pool = [];
  for (const [k, v] of Object.entries(WEATHER_STATES)) {
    let w = v.w;
    if ((k === 'snow' && seasonIdx() !== 3) || (seasonIdx() === 3 && k === 'heat')) w = 0.1;
    pool.push(...Array(Math.round(w * 10)).fill(k));
  }
  const next = pick(pool);
  if (next !== G.world.weather) {
    G.world.weather = next;
    const w = WEATHER_STATES[next];
    if (!isNight()) log('sys', pick([
      w.icon + ' Погода меняется: ' + w.name.toLowerCase() + '.',
      w.icon + ' Небо решило по-своему. ' + w.name + '.',
    ]));
  }
}

function onNewDay() {
  G.world.stats.daysNoCombat += 1;
  G.world.stats.daysPlayed += 1;
  // экономика: обновление раз в игровой день (раздел 10)
  economy.dailyTick();
  // истечение мелких воспоминаний (30 дней)
  memory.expire();
  // распространение слухов за ночь
  memory.spreadOvernight();
  // канонические события
  memory.canonTick();
  // караван уходит
  if (G.world.flags.caravanDaysLeft > 0) G.world.flags.caravanDaysLeft -= 1;
  if (G.world.flags.caravanDaysLeft === 0 && G.world.flags.caravanWasHere) {
    G.world.flags.caravanWasHere = false;
    log('sys', 'Караван ушёл на север. Пыль осела.');
  }
  log('sys', '— День ' + G.world.day + ', ' + seasonName().toLowerCase() + ' —');
  activateDayQuests();
  checkAchievements();
  notify('day');
}

function activateDayQuests() {
  const byDay = { 1: ['d1-water', 'd1-orient'], 2: ['d2-people', 'd2-explain'], 3: ['d3-job'], 4: ['d4-food'], 5: ['d5-name'], 6: ['d6-realize'], 7: ['d7-choice'] };
  const list = byDay[G.world.day] || [];
  for (const id of list) activateQuest(id);
}

export function activateQuest(id) {
  const def = QUESTS[id];
  if (!def || G.quests.active.some(q => q.id === id) || G.quests.completed.includes(id)) return;
  const inst = { id, goals: {} };
  for (const [k, need] of Object.entries(def.goals)) inst.goals[k] = { have: 0, need };
  G.quests.active.push(inst);
  log('sys', '📌 Новая задача: ' + def.title);
  notify('quest');
}

export function qprog(key, n = 1, opts = {}) {
  let done = false;
  for (const q of G.quests.active) {
    const g = q.goals[key];
    if (g && g.have < g.need) {
      g.have = Math.min(g.need, g.have + n);
      if (g.have >= g.need && Object.values(q.goals).every(x => x.have >= x.need)) { completeQuest(q.id); done = true; }
      else notify('quest');
    }
  }
  return done;
}

export function completeQuest(id) {
  const idx = G.quests.active.findIndex(q => q.id === id);
  if (idx < 0) return;
  const def = QUESTS[id];
  G.quests.active.splice(idx, 1);
  G.quests.completed.push(id);
  const r = def.reward || {};
  if (r.money) { G.player.money += r.money; G.world.stats.moneyEarned += r.money; }
  if (r.potion) addItem('potion', r.potion);
  log('good', '✅ Задача выполнена: ' + def.title + (r.money ? ' (+' + r.money + ' м.)' : ''));
  addXp(30);
  memory.record('minor', 'выполнил поручение: ' + def.title, []);
  notify('quest');
}

/* ---------------- ЛОГ ---------------- */
export function log(kind, text) {
  if (!G) return;
  G.log.push({ d: G.world.day, t: timeStr(), k: kind, x: text });
  if (G.log.length > 250) G.log.splice(0, G.log.length - 250);
  notify('log');
}
export function history(text) {
  if (!G) return;
  G.history.unshift({ day: G.world.day, text });
  if (G.history.length > 400) G.history.length = 400;
}

/* ---------------- ИГРОК: параметры ---------------- */
export function stat(k) { return G.player.stats[k]; }
export function skills() { return G.player.skills; }
export function hasKnowledge(k) { return G.player.pastKnowledge.includes(k); }

export function addSkillXp(id, n) {
  const s = G.player.skills[id] || (G.player.skills[id] = { lvl: 0, xp: 0 });
  s.xp += n;
  while (s.xp >= 50 * (s.lvl + 1)) { s.xp -= 50 * (s.lvl + 1); s.lvl += 1; log('good', 'Навык «' + skillName(id) + '» вырос до ' + s.lvl + '.'); }
}
const SKILL_NAMES = { farming: 'Земледелие', smithing: 'Кузнечное дело', herbalism: 'Травничество', melee: 'Бой', survival: 'Выживание', speech: 'Красноречие', cooking: 'Готовка', crafting: 'Ремесло', trade: 'Торговля' };
export function skillName(id) { return SKILL_NAMES[id] || id; }

export function addXp(n) {
  G.player.xp += n;
  while (G.player.xp >= G.player.level * 100) {
    G.player.xp -= G.player.level * 100;
    G.player.level += 1;
    G.player.hp.max += 10; G.player.energy.max += 5;
    G.player.hp.current = Math.min(G.player.hp.max, G.player.hp.current + 30);
    G.player.stats.strength += 1;
    G.player.stats[pick(['agility', 'endurance', 'perception', 'intelligence', 'charisma', 'luck'])] += 1;
    log('good', '✦ Уровень ' + G.player.level + '! Здоровье и силы растут.');
  }
  notify('player');
}

export function hurt(n, why) {
  G.player.hp.current -= n;
  if (why && G.player.hp.current <= 0) die(why);
  notify('player');
}

export function heal(n) {
  const bonus = hasKnowledge('medicine') ? 1.5 : 1;
  G.player.hp.current = Math.min(G.player.hp.max, G.player.hp.current + n * bonus);
}

/* ---------------- ИНВЕНТАРЬ ---------------- */
export function addItem(id, qty = 1) {
  const it = ITEMS[id]; if (!it) return;
  const slot = G.player.inventory.find(s => s.id === id);
  if (slot) slot.qty += qty; else G.player.inventory.push({ id, qty });
  notify('inv');
}
export function removeItem(id, qty = 1) {
  const slot = G.player.inventory.find(s => s.id === id);
  if (!slot || slot.qty < qty) return false;
  slot.qty -= qty;
  if (slot.qty <= 0) G.player.inventory.splice(G.player.inventory.indexOf(slot), 1);
  notify('inv'); return true;
}
export function countItem(id) { return G.player.inventory.find(s => s.id === id)?.qty || 0; }
export function carryWeight() {
  let w = 0;
  for (const s of G.player.inventory) w += (ITEMS[s.id]?.w || 0) * s.qty;
  for (const slot of Object.values(G.player.equipment)) if (slot) w += ITEMS[slot]?.w || 0;
  return Math.round(w * 10) / 10;
}
export function maxWeight() { return G.player.stats.strength * 5; }

export function equip(itemId) {
  const it = ITEMS[itemId];
  if (!it?.slot || countItem(itemId) < 1) return 'Это нельзя надеть.';
  const prev = G.player.equipment[it.slot];
  G.player.equipment[it.slot] = itemId;
  removeItem(itemId, 1);
  if (prev) addItem(prev, 1);
  log('sys', 'Ты надеваешь: ' + it.name + '.');
  notify('inv');
  return null;
}
export function unequip(slot) {
  const cur = G.player.equipment[slot];
  if (!cur) return;
  G.player.equipment[slot] = null; addItem(cur, 1); notify('inv');
}

export function combatStats() {
  const eq = Object.values(G.player.equipment).filter(Boolean);
  const atkBase = G.player.stats.strength + (skills().melee?.lvl || 0) * 2 + (hasKnowledge('military') ? 2 : 0);
  const weapon = G.player.equipment.weapon ? (ITEMS[G.player.equipment.weapon].atk || 0) : 0;
  const def = eq.reduce((a, id) => a + (ITEMS[id].def || 0), 0) + Math.floor(G.player.stats.agility / 2);
  return { atk: atkBase + weapon, def, weaponName: G.player.equipment.weapon ? ITEMS[G.player.equipment.weapon].name : 'кулаки' };
}

/* ---------------- NPC ---------------- */
export function npcById(id) { return NPCS.find(n => n.id === id); }
export function npcState(id) { return G.world.npcs[id]; }
export function npcLocation(npc, atMin = absMin()) {
  const m = atMin % DAY;
  for (const s of npc.schedule) if (m >= s.s && m < s.e) return s.loc;
  return 'home:' + npc.id;
}
export function npcAction(npc, atMin = absMin()) {
  const m = atMin % DAY;
  for (const s of npc.schedule) if (m >= s.s && m < s.e) return s.a;
  return 'спит';
}
export function npcsAt(locId) {
  return NPCS.filter(n => npcLocation(n) === locId && npcState(n.id).state !== 'dead')
    .map(n => ({ npc: n, action: npcAction(n) }));
}
export function locationDanger(locId) {
  const loc = LOCATIONS[locId];
  if (!loc) return 0;
  let d = loc.danger + (G.world.flags.forestDangerBonus || 0) * (loc.region === 'forest' ? 1 : 0) + (weatherFx().dangerBonus || 0);
  return d;
}

/* отношения: 7 осей + стадия (раздел 3, multi-axis) */
export function relOf(id) { return G.world.npcs[id].rel; }
export function relScore(id) {
  const r = relOf(id);
  return r.trust * 1.2 + r.respect + r.sympathy * 1.2 - r.suspicion * 1.2 - r.fear * 0.8;
}
export function stageIdx(id) { return G.world.npcs[id].stageIdx; }
export function stageName(id) {
  const idx = stageIdx(id);
  const r = relOf(id);
  const names = ['незнакомец', 'знакомый', 'приятный собеседник', 'друг', 'близкий друг'];
  if (idx >= 5) {
    if (r.romantic >= 40 && npcById(id).romance) return r.romantic >= 70 ? 'отношения' : 'симпатия';
    return 'привязанность';
  }
  return names[idx];
}
export function changeRel(id, deltas, why) {
  const r = relOf(id);
  const psy = G.player.personality;
  for (const [k, v] of Object.entries(deltas)) {
    let val = v;
    if (psy === 'kind' && k === 'sympathy' && v > 0) val *= 1.25;
    if (psy === 'hot-tempered' && k === 'suspicion' && v > 0) val *= 1.3;
    if (psy === 'cunning' && k === 'trust' && v > 0) val *= 0.85;
    r[k] = Math.max(-100, Math.min(100, Math.round((r[k] + val) * 10) / 10));
  }
  const before = G.world.npcs[id].stageIdx;
  const score = relScore(id);
  let idx = 0;
  if (score >= 8) idx = 1;
  if (score >= 18) idx = 2;
  if (score >= 34) idx = 3;
  if (score >= 55) idx = 4;
  if (score >= 70) idx = 5;
  if (r.romantic >= 70 && npcById(id).romance) idx = 7;
  else if (r.romantic >= 40 && npcById(id).romance) idx = Math.max(idx, 6);
  G.world.npcs[id].stageIdx = idx;
  if (idx > before) {
    log('good', '_relations: ' + npcById(id).name + ' теперь относится к тебе как: ' + stageName(id) + '.');
    memory.record('minor', 'стал ближе с ' + npcById(id).name, [id]);
  }
  if (idx < before) log('sys', npcById(id).name + ' отдалился. Теперь вы просто: ' + stageName(id) + '.');
  notify('npc');
}

/* ---------------- ДЕЙСТВИЯ (для парсера и кнопок) ---------------- */
export function doAction(a) {
  if (!G) return { ok: false, msg: 'Мир ещё не создан.' };
  if (G.world.flags.dead) return { ok: false, msg: 'Ты мёртв. Это сильно ограничивает планы.' };
  switch (a.type) {
    case 'move': return actMove(a.target);
    case 'look': return actLook();
    case 'examine': return actExamine(a.target, a.kind);
    case 'eat': return actEat(a.item);
    case 'drink': return actDrink(a.item);
    case 'rest': return actRest(a.min || 60);
    case 'sleep': return actSleep();
    case 'wait': return actWait(a.min || 30);
    case 'work': return actWork(a.jobId);
    case 'craft': return actCraft(a.recipe);
    case 'search': return actSearch(a.what);
    case 'give': return dialogue.actGive(a.npc, a.item);
    case 'talk': return dialogue.start(a.npc);
    case 'buy': return dialogue.actBuy(a.npc, a.item, a.qty);
    case 'sell': return dialogue.actSell(a.npc, a.item, a.qty);
    case 'attack': return actAttack(a.target);
    case 'help': return actHelp();
    default: return { ok: false, msg: 'Такого действия нет.' };
  }
}

function checkEnergy(need) {
  if (G.player.energy.current < need) {
    log('bad', 'Сил совсем не осталось. Сначала отдохни.');
    return false;
  }
  return true;
}

function actMove(target) {
  const here = LOCATIONS[G.player.location];
  const cost = here.exits[target];
  if (!cost) return { ok: false, msg: 'Туда отсюда не пройти.' + (target ? ' Путь лежит через другие места.' : '') };
  if (G.player.location === target) return { ok: false, msg: 'Ты уже здесь.' };
  if (!checkEnergy(5)) return { ok: false };
  const loc = LOCATIONS[target];
  // риск встречи (danger 0..3+)
  const danger = locationDanger(target);
  const p = danger * 0.11 + (isNight() ? 0.05 : 0) + (G.world.flags.raidActive && target === 'road-south' ? 0.15 : 0);
  advanceTime(cost, { silent: false });
  G.player.energy.current = Math.max(0, G.player.energy.current - 4);
  if (danger > 0 && chance(p)) {
    log('sys', 'На пути что-то шевельнулось…');
    const foes = rollEncounter(target);
    combat.start(foes, { loc: target, returnTo: G.player.location });
    G.player.location = target;
    markVisited(target);
    return { ok: true, msg: '' };
  }
  G.player.location = target;
  markVisited(target);
  log('sys', 'Ты идёшь. ' + cost + ' минут пути.');
  describeArrival(target);
  history('Перешёл в: ' + loc.name);
  return { ok: true };
}

function markVisited(locId) {
  if (!G.world.flags.visited.includes(locId)) {
    G.world.flags.visited.push(locId);
    G.world.flags.visitedCount = G.world.flags.visited.length;
    qprog('visit2');
    if (locId === 'village-temple') qprog('temple');
  }
}

export function rollEncounter(locId) {
  const region = LOCATIONS[locId].region;
  if (region === 'forest') {
    if (locId === 'forest-deep') return chance(0.3) ? ['oldwolf', 'wolf'] : [pick(['wolf', 'boar', 'wolf'])];
    return [pick(['wolf', 'boar'])];
  }
  if (locId === 'road-south') return chance(0.25) ? ['bandit', 'bandit'] : ['bandit'];
  return ['bandit'];
}

function actLook() {
  qprog('look');
  describeArrival(G.player.location, true);
  return { ok: true };
}

function actExamine(target, kind) {
  if (kind === 'npc') {
    const npc = npcById(target);
    const st = npcState(target);
    st.known = true;
    const r = st.rel;
    log('sys', npc.emoji + ' ' + npc.name + ' — ' + npc.profession + ', ' + npc.age + ' лет. ' + npc.personality.charAt(0).toUpperCase() + npc.personality.slice(1) + '. Сейчас: ' + npcAction(npc) + '.');
    if (st.met) log('sys', 'Отношение к тебе: ' + stageName(target) + '.' + (r.suspicion > 15 ? ' Смотрит настороженно.' : ''));
    return { ok: true };
  }
  if (kind === 'item') {
    const it = ITEMS[target];
    if (!it) return { ok: false, msg: 'Такой вещи при тебе нет.' };
    log('sys', it.emoji + ' ' + it.name + '. ' + it.desc + (it.atk ? ' Урон: +' + it.atk + '.' : '') + (it.def ? ' Защита: +' + it.def + '.' : ''));
    return { ok: true };
  }
  const loc = LOCATIONS[target] || LOCATIONS[G.player.location];
  log('sys', loc.icon + ' ' + loc.name + '. ' + loc.desc);
  return { ok: true };
}

function actEat(itemId) {
  const inv = G.player.inventory;
  let id = itemId;
  if (!id) { const s = inv.find(s => ITEMS[s.id].food); id = s?.id; }
  if (!id || !ITEMS[id]?.food || countItem(id) < 1) return { ok: false, msg: 'Есть нечего. Найди или купи еду.' };
  removeItem(id, 1);
  G.player.hunger = Math.max(0, G.player.hunger - ITEMS[id].food);
  advanceTime(20);
  log('sys', 'Ты ешь ' + ITEMS[id].name.toLowerCase() + '. ' + pick(['Голод отступает.', 'На душе чуть теплее.', 'Простая еда — лучшая еда.']));
  return { ok: true };
}

function actDrink(itemId) {
  const loc = LOCATIONS[G.player.location];
  if (!itemId && countItem('water') > 0) itemId = 'water';
  if (itemId && countItem(itemId) > 0) {
    const it = ITEMS[itemId];
    if (it.drink) {
      removeItem(itemId, 1);
      G.player.thirst = Math.max(0, G.player.thirst - (it.drink || 30));
      if (it.energy) G.player.energy.current = Math.min(G.player.energy.max, G.player.energy.current + it.energy);
      advanceTime(10);
      log('sys', 'Ты делаешь глоток' + (itemId === 'mead' ? ' хмельного мёда. Тепло растекается по груди.' : '. Лучше воды только вода.'));
      qprog('drink');
      return { ok: true };
    }
    if (it.heal) { // зелье/бинт через глагол «выпить/использовать»
      removeItem(itemId, 1);
      const before = G.player.hp.current;
      heal(it.heal);
      advanceTime(10);
      log('good', 'Ты используешь ' + it.name.toLowerCase() + ': +' + Math.round(G.player.hp.current - before) + ' здоровья.');
      return { ok: true };
    }
  }
  if (loc.water) {
    G.player.thirst = Math.max(0, G.player.thirst - 60);
    advanceTime(10);
    log('sys', 'Ты пьёшь из ' + (G.player.location === 'village-square' ? 'колодца на площади. Вода ледяная и вкусная.' : 'ручья. Холодная, зубы сводит.'));
    qprog('drink');
    return { ok: true };
  }
  return { ok: false, msg: 'Здесь нечего пить. Ищи колодец, ручей или купи воду.' };
}

function actRest(mins) {
  if (!checkEnergy(0)) return { ok: false };
  advanceTime(mins, { resting: true });
  G.player.hp.current = Math.min(G.player.hp.max, G.player.hp.current + mins * 0.15);
  log('sys', 'Ты ' + (mins >= 60 ? 'сидишь и дышишь' : 'переводишь дух') + '. Минуты текут.');
  return { ok: true };
}

function actSleep() {
  const loc = G.player.location;
  const villageSafe = ['village-tavern', 'village-temple', 'village-square', 'village-fields', 'village-shop', 'village-smithy'].includes(loc);
  if (!villageSafe && loc !== 'forest-edge') return { ok: false, msg: 'Здесь спать самоубийственно. Вернись в деревню или хотя бы на опушку.' };
  let cost = 0, note = '';
  if (loc === 'village-tavern') {
    if (G.player.money >= 5) { cost = 5; note = 'Комнатка наверху, сенник и одеяло.'; }
    else { cost = 0; note = 'Марта пустила спать у очага — за добрый взгляд и обещание помыть посуду утром.'; }
  } else if (loc === 'village-temple') note = 'Лия молча стелет тебе циновку у тёплого камня.';
  else if (loc === 'forest-edge') note = 'Ты устраиваешься у дерева, вполглаза.';
  else note = 'Ты засыпаешь, где пришлось. Ночь в деревне тихая.';
  G.player.money -= cost;
  // ночь на опушке — риск
  if (loc === 'forest-edge' && chance(0.25)) {
    log('sys', 'Ночью тебя будит рычание…');
    combat.start(rollEncounter('forest-edge'), { loc, returnTo: loc, night: true });
    return { ok: true };
  }
  // до 6 утра
  let mins = (DAY - G.world.min) + 360;
  if (mins > DAY) mins -= DAY;
  advanceTime(mins, { resting: true, sleeping: true });
  G.player.energy.current = G.player.energy.max;
  G.player.hp.current = Math.min(G.player.hp.max, G.player.hp.current + Math.round(G.player.hp.max * 0.25));
  log('good', '🌅 ' + note + ' Ты высыпаешься. Новое утро, день ' + G.world.day + '.');
  memory.record('minor', 'ночевал в деревне', []);
  return { ok: true };
}

function actWait(mins) {
  advanceTime(Math.min(600, Math.max(5, mins)));
  log('sys', 'Ты ждёшь. Время идёт, мир живёт.');
  return { ok: true };
}

function actWork(jobId) {
  const jobs = availableJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) return { ok: false, msg: 'Сейчас такой работы нет. Ищи тех, кому нужна пара рук.' };
  if (!checkEnergy(15)) return { ok: false };
  if (carryWeight() > maxWeight()) return { ok: false, msg: 'С таким грузом далеко не уйдёшь — сначала разбери сумку.' };
  const npc = npcById(job.npcId);
  advanceTime(job.dur);
  const pay = rnd(job.pay[0], job.pay[1]) + (skills()[job.skill]?.lvl || 0);
  G.player.money += pay;
  G.world.stats.moneyEarned += pay;
  G.player.energy.current = Math.max(0, G.player.energy.current - rnd(12, 20));
  G.player.hunger = Math.min(100, G.player.hunger + 8);
  if (job.skill) addSkillXp(job.skill, 12);
  if (job.stat && chance(0.25)) { G.player.stats[job.stat] += 1; log('good', 'Тело крепнет: ' + statName(job.stat) + ' +1.'); }
  G.world.npcs[job.npcId].jobDoneToday += 1;
  G.world.stats.jobsDone += 1;
  changeRel(job.npcId, { respect: 1, trust: 1, sympathy: 0.5 });
  let extra = '';
  if (job.bonus === 'hotmeal') { G.player.hunger = Math.max(0, G.player.hunger - 40); extra = ' Плюс миска похлёбки.'; }
  if (job.bonus === 'herb') { addItem('herb', 1); extra = ' Грета сунула тебе пучок травы — учись, говорит.'; }
  addXp(15 + Math.floor(job.dur / 10));
  qprog('job');
  log('good', '💪 ' + job.title + ': +' + pay + ' м.' + extra);
  history('Отработал: ' + job.title + ' (+' + pay + ' м.)');
  memory.record('minor', 'работал: ' + job.title.toLowerCase(), [job.npcId]);
  return { ok: true };
}

export function availableJobs() {
  const res = [];
  for (const npc of NPCS) {
    if (!npc.job) continue;
    const st = npcState(npc.id);
    if (st.state === 'dead' || st.jobDoneToday >= 2) continue;
    if (npcLocation(npc) !== G.player.location) continue;
    if (npc.job.needRespect && relOf(npc.id).respect < npc.job.needRespect) continue;
    res.push({ ...npc.job, npcId: npc.id, npcName: npc.name });
  }
  return res;
}

const STAT_NAMES = { strength: 'Сила', agility: 'Ловкость', endurance: 'Выносливость', intelligence: 'Интеллект', perception: 'Внимательность', charisma: 'Обаяние', luck: 'Удача' };
export function statName(k) { return STAT_NAMES[k] || k; }

function actCraft(recipeId) {
  const r = RECIPES.find(x => x.id === recipeId);
  if (!r) return { ok: false, msg: 'Ты не знаешь, как это сделать.' };
  for (const [id, n] of Object.entries(r.need)) if (countItem(id) < n) return { ok: false, msg: 'Не хватает материалов: ' + ITEMS[id].name.toLowerCase() + ' ×' + n + '.' };
  for (const [id, n] of Object.entries(r.need)) removeItem(id, n);
  addItem(r.out, 1);
  advanceTime(30);
  addSkillXp('crafting', 8);
  log('good', '🛠 Ты смастерил: ' + ITEMS[r.out].name + '.');
  return { ok: true };
}

function actSearch(what) {
  const loc = G.player.location;
  if (what === 'herbs') {
    if (!['forest-edge', 'forest-deep'].includes(loc)) return { ok: false, msg: 'Травы ищут в лесу — на опушке или в чаще.' };
    if (!checkEnergy(8)) return { ok: false };
    advanceTime(30);
    G.player.energy.current = Math.max(0, G.player.energy.current - 8);
    const per = G.player.stats.perception + (skills().herbalism?.lvl || 0) * 2 + weatherFx().perMod || G.player.stats.perception;
    let n = 1 + (chance(per / 30) ? 1 : 0) + (loc === 'forest-deep' && chance(0.5) ? 1 : 0);
    addItem('herb', n);
    addSkillXp('herbalism', hasKnowledge('chemistry') ? 16 : 8);
    log('good', '🌿 Ты собираешь лечебные травы: +' + n + '.');
    qprog('herbs', n);
    if (loc === 'forest-deep' && chance(0.2)) { log('sys', 'Хруст ветки за спиной…'); combat.start(rollEncounter(loc), { loc, returnTo: loc }); }
    return { ok: true };
  }
  if (what === 'wood') {
    if (loc !== 'forest-edge') return { ok: false, msg: 'Хворост собирают на опушке.' };
    if (!checkEnergy(8)) return { ok: false };
    advanceTime(30);
    G.player.energy.current = Math.max(0, G.player.energy.current - 10);
    addItem('wood', rnd(1, 2));
    log('good', '🪵 Ты собираешь вязанку хвороста.');
    return { ok: true };
  }
  return { ok: false, msg: 'Искать можно травы (в лесу) или хворост (на опушке).' };
}

function actAttack(target) {
  const npc = npcById(target);
  if (!npc) return { ok: false, msg: 'Ты не находишь, на кого напасть.' };
  if (npcLocation(npc) !== G.player.location) return { ok: false, msg: npc.name + ' не здесь.' };
  if (npcState(target).state === 'dead') return { ok: false, msg: npc.name + ' уже мёртв.' };
  const st = npcState(target);
  st.met = true; st.known = true;
  log('bad', 'Ты бросаешься на ' + npc.name + '!');
  const hp = Math.round(40 + (npc.skills.strength || 3) * 8);
  combat.start([{ key: 'npc:' + target, name: npc.name, emoji: npc.emoji, hp, atk: 6 + (npc.skills.melee || 2), def: 2 + (npc.skills.strength || 3) / 2, agi: npc.skills.agility || 5, luck: 3, behavior: 'cunning', xp: 50, loot: {}, money: [Math.min(200, Math.round(npc.money * 0.4)), Math.min(300, Math.round(npc.money * 0.6))] }], { loc: G.player.location, returnTo: G.player.location, vsNpc: target });
  return { ok: true };
}

function actHelp() {
  log('sys', 'Что можно писать (и говорить кнопками):');
  log('sys', 'идти/пойти в деревню, на площадь, в таверну, к кузнице, в лес, на тракт… · осмотреться · осмотреть <кого/что> · поговорить с Эриком · купить хлеб · продать шкуру · есть/пить · отдыхать · спать · работать · искать травы/хворост · сделать бинт/факел/дубину · подарить цветок Уле · подождать 30 минут · ударить разбойника · помощь');
  return { ok: true };
}

/* ---------------- ОПИСАНИЕ ЛОКАЦИИ ---------------- */
export function describeArrival(locId, full = false) {
  const loc = LOCATIONS[locId];
  log('sys', (full ? 'Ты оглядываешься. ' : '') + loc.icon + ' ' + loc.name + '. ' + loc.desc);
  const list = npcsAt(locId);
  if (list.length) {
    const parts = list.map(x => x.npc.emoji + ' ' + x.npc.name + ' (' + x.action + ')');
    log('sys', 'Здесь: ' + parts.join(', ') + '.');
    for (const x of list) { const st = npcState(x.npc.id); if (!st.known) { st.known = true; log('sys', 'Ты запоминаешь новое лицо: ' + x.npc.name + ' — ' + x.npc.profession + '.'); } }
  } else {
    log('sys', 'Никого. Только ' + (isNight() ? 'ночь и шорохи.' : 'ветер и ты.'));
  }
  const exits = Object.keys(loc.exits).map(id => LOCATIONS[id].name).join(', ');
  log('sys', 'Пути: ' + exits + '.');
}

/* ---------------- АЧИВКИ (4.10) ---------------- */
export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (G.achievements.includes(a.id)) continue;
    if (a.check(G)) unlockAchievement(a);
  }
}
function unlockAchievement(a) {
  G.achievements.push(a.id);
  log('good', '🏆 Достижение: «' + a.title + '»!');
  notify('achievement:' + a.id);
}

/* ---------------- СМЕРТЬ (4.4) ---------------- */
export function die(cause) {
  if (G.world.flags.dead) return;
  G.world.flags.dead = true;
  G.world.flags.deathCause = cause;
  G.meta.deaths += 1;
  history('Погиб: ' + cause);
  log('bad', 'Ты умираешь. Причина: ' + cause + '.');
  notify('death');
}

/* Начать заново в сюжетном режиме: мир сохраняется (STORY_MODE_ON_DEATH) */
export function storyContinue(newCharData) {
  const world = JSON.parse(JSON.stringify(G.world));
  world.flags.dead = false;
  world.flags.storyChars.push({ name: G.player.name, day: G.world.day, cause: world.flags.deathCause });
  // старый персонаж становится NPC (oldCharacterBecomesNPC)
  world.flags.storyCharsLast = G.player.name;
  const opts = {
    slot: G.meta.slot, account: G.meta.account, day: G.world.day, min: G.world.min,
    startLocation: 'village-square', // newCharacterStartsAt: городская площадь
  };
  newGame({ ...newCharData, deathMode: 'story' }, opts);
  G.world = world;
  log('title', 'Глава следующая. Место того, кто был.');
  log('sys', 'Ты приходишь в себя на площади деревни. Мир помнит твоего предшественника — ты пока нет.');
  activateDayQuests();
  notify('new');
}

/* ---------------- ВВОД: единая точка ---------------- */
export function handleInput(text) {
  const t = text.trim();
  if (!t) return { ok: false };
  if (combat.isActive()) return combat.handleInput(t);
  if (dialogue.isActive()) return dialogue.handleInput(t);
  return parseAndRun(t);
}

/* ---------------- РЕАЛЬНОЕ ВРЕМЯ: гибридный тик ---------------- */
let tickTimer = null;
let autosaveCounter = 0;

export function startRealtimeLoop(onAutosave) {
  stopRealtimeLoop();
  tickTimer = setInterval(() => {
    if (!G || G.world.flags.dead || G.world.flags.paused) return;
    advanceTime(TIMESCALE, { silent: true });
    G.meta.playedMs += 1000;
    autosaveCounter += 1;
    if (autosaveCounter >= 300) { autosaveCounter = 0; onAutosave?.(); }
    notify('tick');
  }, 1000);
}
export function stopRealtimeLoop() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

/* Оффлайн-докатка (4.3): 1 реальная минута = 1 игровая, максимум 7 дней */
export function catchUpOffline() {
  if (!G?.meta?.savedAt) return 0;
  const realMin = (Date.now() - G.meta.savedAt) / 60000;
  let gameMin = Math.floor(realMin * 1);
  const maxMin = 7 * DAY;
  if (gameMin <= 5) return 0;
  gameMin = Math.min(gameMin, maxMin);
  const beforeDay = G.world.day;
  advanceTime(gameMin, { silent: true, resting: true });
  const days = G.world.day - beforeDay;
  if (days > 0) {
    log('sys', 'Пока тебя не было, прошло ' + days + ' дн. Мир жил без тебя: кто-то женился, кто-то задолжал, где-то прошёл дождь.');
    history('Вернулся после ' + days + ' дн. отсутствия.');
  }
  return days;
}
