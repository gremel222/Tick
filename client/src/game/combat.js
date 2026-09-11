/* ============================================================
   БОЕВАЯ СИСТЕМА (раздел 12 паспорта)
   Пошаговая, сетка 8×8, инициатива по ловкости,
   урон = атака − защита + бросок(удача), крит ×2 по удаче,
   ИИ: профили поведения (aggressive/defensive/cunning/coward).
   ============================================================ */
import { ENEMIES, ITEMS } from './data.js';
import { getG, log, notify, die, addXp, addItem, countItem, removeItem,
         combatStats, hasKnowledge, qprog, history, addSkillXp, changeFaction } from './engine.js';
import { record } from './memory.js';
import * as audio from './audio.js';

let C = null;

export function isActive() { return !!C; }
export function state() { return C; }

const DIRS = {
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
};

export function start(foes, ctx = {}) {
  const g = getG(); if (!g) return;
  const cs = combatStats();
  const units = [{
    id: 'player', name: g.player.name, emoji: '🧍', isPlayer: true,
    hp: g.player.hp.current, maxHp: g.player.hp.max,
    atk: cs.atk, def: cs.def, agi: g.player.stats.agility, luck: g.player.stats.luck,
    x: 4, y: 6, defending: false,
  }];
  foes.forEach((f, i) => {
    if (typeof f === 'string') {
      const e = ENEMIES[f] || ENEMIES.wolf;
      units.push({
        id: 'e' + i, key: f, name: e.name, emoji: e.emoji, hp: e.hp, maxHp: e.hp,
        atk: e.atk, def: e.def, agi: e.agi, luck: e.luck, behavior: e.behavior,
        xp: e.xp, loot: e.loot || {}, money: e.money || [0, 0],
        x: Math.min(7, 1 + i * 2), y: 1, defending: false,
      });
    } else {
      units.push({
        id: 'e' + i, key: f.key, name: f.name, emoji: f.emoji, hp: f.hp, maxHp: f.hp,
        atk: Math.round(f.atk), def: Math.round(f.def), agi: f.agi, luck: f.luck || 3,
        behavior: f.behavior || 'aggressive', xp: f.xp || 25, loot: f.loot || {}, money: f.money || [0, 0],
        x: Math.min(7, 1 + i * 2), y: 1, defending: false,
      });
    }
  });
  C = { units, ctx, round: 1, log: [], turnOrder: [], turnIdx: 0, finished: false };
  clog('⚔ Бой: ' + units.filter(u => !u.isPlayer).map(u => u.name).join(', ') + '!');
  newRound();
  notify('combat');
}

function clog(text) {
  if (!C) return;
  C.log.push(text); if (C.log.length > 60) C.log.shift();
  log('sys', text);
}

function newRound() {
  for (const u of C.units) { u.initiative = u.agi + Math.floor(Math.random() * 6); u.defending = false; }
  C.turnOrder = C.units.filter(u => u.hp > 0).sort((a, b) => b.initiative - a.initiative);
  C.turnIdx = 0;
  processUntilPlayer();
}

/* Прогоняем ходы ИИ, пока не дойдёт до игрока */
function processUntilPlayer() {
  while (C && !C.finished) {
    if (C.turnIdx >= C.turnOrder.length) { C.round += 1; newRound(); return; }
    const u = C.turnOrder[C.turnIdx];
    if (!u || u.hp <= 0) { C.turnIdx += 1; continue; }
    if (u.isPlayer) { notify('combat'); return; }
    enemyTurn(u);
    if (!C) return; // бой мог закончиться внутри хода
    C.turnIdx += 1;
    if (checkEnd()) return;
  }
}

export function playerAction(action, payload = {}) {
  if (!C || C.finished) return { ok: false, msg: 'Бой окончен.' };
  const g = getG();
  const p = C.units.find(u => u.isPlayer);
  if (C.turnOrder[C.turnIdx] !== p) return { ok: false, msg: 'Не твой ход.' };

  let acted = true;
  switch (action) {
    case 'attack': {
      let target = nearestEnemy(p);
      if (payload.targetId) target = C.units.find(u => u.id === payload.targetId && u.hp > 0) || target;
      if (!target) { clog('Биться не с кем.'); acted = false; break; }
      if (dist(p, target) > 1) { clog('Слишком далеко — сначала подойди.'); acted = false; break; }
      strike(p, target);
      g.player.energy.current = Math.max(0, g.player.energy.current - 2);
      break;
    }
    case 'power': { // сильный удар: −15 энергии, ×1.6
      if (g.player.energy.current < 15) { clog('Не хватает сил на сильный удар.'); acted = false; break; }
      const target = nearestEnemy(p);
      if (!target || dist(p, target) > 1) { clog('Никого рядом.'); acted = false; break; }
      g.player.energy.current -= 15;
      strike(p, target, 1.6, 'СИЛЬНЫЙ УДАР');
      break;
    }
    case 'move': {
      const d = DIRS[payload.dir];
      if (!d) { acted = false; break; }
      const nx = p.x + d[0], ny = p.y + d[1];
      if (nx < 0 || nx > 7 || ny < 0 || ny > 7) { clog('Дальше — край поля.'); acted = false; break; }
      if (C.units.some(u => u.hp > 0 && u.x === nx && u.y === ny)) { clog('Место занято.'); acted = false; break; }
      p.x = nx; p.y = ny;
      clog('Ты смещаешься: ' + ({ north: 'вверх', south: 'вниз', west: 'влево', east: 'вправо' })[payload.dir] + '.');
      break;
    }
    case 'approach': {
      const target = nearestEnemy(p);
      if (!target) { acted = false; break; }
      const steps = g.player.stats.agility >= 8 ? 2 : 1;
      for (let s = 0; s < steps && dist(p, target) > 1; s++) stepToward(p, target);
      clog('Ты сближаешься с ' + target.name.toLowerCase() + '.');
      break;
    }
    case 'defend': {
      p.defending = true;
      clog('Ты заходишь в защиту.');
      break;
    }
    case 'item': {
      const id = payload.item;
      if (!id || countItem(id) < 1) { clog('Нет такого предмета.'); acted = false; break; }
      const it = ITEMS[id];
      if (it.heal) {
        removeItem(id, 1);
        const bonus = hasKnowledge('medicine') ? 1.5 : 1;
        const before = g.player.hp.current;
        g.player.hp.current = Math.min(g.player.hp.max, g.player.hp.current + it.heal * bonus);
        p.hp = g.player.hp.current;
        clog('Ты используешь ' + it.name.toLowerCase() + ': +' + Math.round(g.player.hp.current - before) + ' здоровья.');
      } else { clog('В бою это бесполезно.'); acted = false; }
      break;
    }
    case 'flee': {
      const foes = C.units.filter(u => !u.isPlayer && u.hp > 0);
      const avgAgi = foes.reduce((a, u) => a + u.agi, 0) / Math.max(1, foes.length);
      const pSuccess = Math.min(90, Math.max(10, 40 + g.player.stats.agility * 3 - avgAgi * 2));
      if (Math.random() * 100 < pSuccess) {
        clog('Ты вырываешься из боя!');
        endCombat('fled');
        return { ok: true };
      }
      clog('Уйти не вышло — противник настигает!');
      break;
    }
    default: acted = false;
  }
  if (!acted) return { ok: false, msg: 'Так не получится.' };
  if (checkEnd()) return { ok: true };
  if (!C) return { ok: true }; // бой закончился ударом игрока
  C.turnIdx += 1;
  processUntilPlayer();
  checkEnd();
  return { ok: true };
}

function strike(attacker, target, mult = 1, label = '') {
  const roll = Math.floor(Math.random() * 7) - 3; // −3..3
  const luckRoll = Math.floor(Math.random() * (1 + Math.floor(attacker.luck / 3)));
  let dmg = Math.max(1, Math.round((attacker.atk - (target.defending ? target.def * 2 : target.def) + roll + luckRoll) * mult));
  const critChance = 5 + attacker.luck * 1.5;
  const crit = Math.random() * 100 < critChance;
  if (crit) dmg *= 2;
  target.hp = Math.max(0, target.hp - dmg);
  audio.sfx(crit ? 'crit' : 'hit');
  if (attacker.isPlayer) {
    clog((label ? '⚡ ' + label + '! ' : '') + 'Ты' + (crit ? ' КРИТИЧЕСКИ' : '') + ' бьёшь — ' + target.name + ' получает ' + dmg + ' урона.' + (target.hp <= 0 ? ' ' + target.name + ' повержен!' : ''));
  } else {
    clog(attacker.name + (crit ? ' критически' : '') + ' бьёт — ты получаешь ' + dmg + ' урона.' + (target.hp <= 0 ? ' Ты падаешь…' : ''));
  }
  if (target.isPlayer) {
    const g = getG();
    g.player.hp.current = target.hp;
    notify('player');
    if (target.hp <= 0) endCombat('dead');
  } else if (target.hp <= 0) {
    onEnemyDown(target);
  }
}

function onEnemyDown(u) {
  const g = getG();
  if (u.key === 'wolf' || u.key === 'oldwolf') {
    qprog('killwolf');
    changeFaction('forest', 2); // охотник бережёт лесные троп
  }
  if (typeof u.key === 'string' && u.key.startsWith('npc:')) {
    const npcId = u.key.slice(4);
    if (g.world.npcs[npcId]) g.world.npcs[npcId].state = 'dead';
    record('important', 'убил ' + u.name, []);
    for (const id of Object.keys(g.world.npcs)) {
      if (id === npcId) continue;
      g.world.npcs[id].rel.suspicion = Math.min(100, g.world.npcs[id].rel.suspicion + 20);
      g.world.npcs[id].rel.fear = Math.min(100, g.world.npcs[id].rel.fear + 10);
    }
    log('bad', 'Ты убил жителя деревни. Люди узнают. Ты это знаешь.');
  }
}

function enemyTurn(u) {
  const p = C.units.find(x => x.isPlayer);
  if (!p || p.hp <= 0) return;
  const d = dist(u, p);
  const hpFrac = u.hp / u.maxHp;
  switch (u.behavior) { // профили поведения (раздел 12)
    case 'aggressive':
      if (d > 1) stepToward(u, p);
      if (dist(u, p) <= 1) strike(u, p);
      else clog(u.name + ' прёт вперёд, рыча.');
      break;
    case 'defensive':
      if (hpFrac < 0.4 && d > 1) { u.defending = true; clog(u.name + ' уходит в глухую защиту.'); }
      else if (d > 1) { stepToward(u, p); if (dist(u, p) <= 1) strike(u, p); }
      else strike(u, p);
      break;
    case 'cunning':
      if (hpFrac < 0.35) { u.defending = true; clog(u.name + ' выставляет оружие и прикрывается.'); }
      else if (d > 1) { stepToward(u, p); if (dist(u, p) <= 1) strike(u, p); }
      else strike(u, p);
      break;
    case 'coward':
      if (hpFrac < 0.35) {
        if (Math.random() * 100 < 50 + u.agi * 2) { clog(u.name + ' паникует и убегает с поля!'); u.hp = 0; u.fled = true; }
        else clog(u.name + ' дрожит, но держится.');
      } else if (d > 1) { stepToward(u, p); }
      else strike(u, p);
      break;
  }
}

function nearestEnemy(p) {
  const foes = C.units.filter(u => !u.isPlayer && u.hp > 0);
  if (!foes.length) return null;
  return foes.sort((a, b) => dist(p, a) - dist(p, b))[0];
}
function dist(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function stepToward(u, target) {
  const dx = Math.sign(target.x - u.x), dy = Math.sign(target.y - u.y);
  const tryMoves = [[dx, dy], [dx, 0], [0, dy]];
  for (const [mx, my] of tryMoves) {
    const nx = u.x + mx, ny = u.y + my;
    if (nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
    if (C.units.some(o => o.hp > 0 && o !== u && o.x === nx && o.y === ny)) continue;
    u.x = nx; u.y = ny; return;
  }
}

function checkEnd() {
  if (!C || C.finished) return true;
  const foes = C.units.filter(u => !u.isPlayer && u.hp > 0);
  if (foes.length === 0) { endCombat('win'); return true; }
  return false;
}

function endCombat(result) {
  const g = getG();
  if (!C) return;
  const ctx = C.ctx;
  if (result === 'win') {
    const foes = C.units.filter(u => !u.isPlayer && !u.fled && u.hp <= 0);
    let xp = 0, money = 0;
    const lootGot = {};
    for (const f of foes) {
      xp += f.xp || 20;
      const [mn, mx] = f.money || [0, 0];
      money += mn + Math.floor(Math.random() * (mx - mn + 1));
      for (const [id, p] of Object.entries(f.loot || {})) if (Math.random() < p) lootGot[id] = (lootGot[id] || 0) + 1;
    }
    if (money > 0) { g.player.money += money; g.world.stats.moneyEarned += money; }
    for (const [id, n] of Object.entries(lootGot)) addItem(id, n);
    g.world.stats.kills += foes.length;
    g.world.stats.daysNoCombat = 0;
    addXp(xp);
    addSkillXp('melee', 15);
    const lootStr = Object.keys(lootGot).length ? ', трофеи: ' + Object.entries(lootGot).map(([id, n]) => ITEMS[id].name + ' ×' + n).join(', ') : '';
    clog('🏆 Победа! +' + xp + ' опыта' + (money ? ', +' + money + ' м.' : '') + lootStr + '.');
    audio.sfx('victory');
    record('important', 'победил в бою: ' + foes.map(f => f.name.toLowerCase()).join(', '), []);
    history('Победа в бою: ' + foes.map(f => f.name).join(', '));
    // — награда за засаду у моста (сюжетная линия разбойников) —
    if (ctx.ambush && !g.world.flags.ambushDone) {
      g.world.flags.ambushDone = true;
      g.world.flags.ambushDaysLeft = 0;
      g.player.money += 150;
      g.world.stats.moneyEarned += 150;
      changeFaction('village', 10);
      log('good', '⚔ Разбойники взяты! Каспар жмёт руку: «Обоз цел, люди целы». Барон прислал 150 монет награды. Деревня смотрит на тебя иначе.');
      record('important', 'участвовал в засаде у моста — разбойничья шайка схвачена', ['kaspar']);
      history('Засада у моста: шайка схвачена');
    }
  } else if (result === 'fled') {
    g.world.stats.daysNoCombat = 0;
    record('minor', 'убежал из боя', []);
    if (ctx.returnTo) g.player.location = ctx.returnTo;
  } else if (result === 'dead') {
    die('смерть в бою');
  }
  C.finished = true;
  C = null;
  notify('combat:end');
}

/* ---------------- СВОБОДНЫЙ ВВОД В БОЮ ---------------- */
export function handleInput(text) {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  if (!C) return { ok: false, msg: 'Боя нет.' };
  if (/(помощь|help|что делать)/.test(t)) {
    clog('В бою: атаковать · подойти · сильный удар · двигаться на север/юг/запад/восток · защищаться · зелье/бинт · бежать');
    return { ok: true };
  }
  if (/(бежать|убежать|отступить|свалить)/.test(t)) return playerAction('flee');
  if (/(сильн|мощн)/.test(t)) return playerAction('power');
  if (/(защищ|блок|парир)/.test(t)) return playerAction('defend');
  if (/(зелье|бинт|лекар|подлеч)/.test(t)) {
    const id = countItem('potion') ? 'potion' : countItem('bandage') ? 'bandage' : countItem('herb') ? 'herb' : null;
    if (!id) { clog('Нечем лечиться.'); return { ok: false }; }
    return playerAction('item', { item: id });
  }
  if (/(подойти|приблиз|сблиз)/.test(t)) return playerAction('approach');
  const dirs = { 'север': 'north', 'вверх': 'north', 'юг': 'south', 'вниз': 'south', 'запад': 'west', 'влево': 'west', 'восток': 'east', 'вправо': 'east' };
  for (const w of Object.keys(dirs)) if (t.includes(w)) return playerAction('move', { dir: dirs[w] });
  if (/(атак|бей|бить|удар|напад|убить|руб|дер)/.test(t)) return playerAction('attack');
  clog('В бою выбор невелик: атаковать, подойти, двигаться на север/юг/запад/восток, защищаться, лечиться, бежать.');
  return { ok: false };
}
