/* ============================================================
   ЭКОНОМИКА (раздел 10 паспорта)
   formula: basePrice * (1 + demand / max(supply, 1))
   Обновление раз в игровой день; массовые закупки двигают цены;
   налоги: городской 5% (покупка), торговый 10% (продажа).
   ============================================================ */
import { ITEMS, NPCS } from './data.js';
import { G, getG, log, addItem, removeItem, countItem, hasKnowledge, qprog,
         changeRel, npcLocation, addSkillXp } from './engine.js';

const CITY_TAX = 0.05;
const TRADE_TAX = 0.10;

export function initPrices() {
  const prices = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.quest || it.price <= 0) continue;
    prices[id] = { base: it.price, demand: 2 + Math.floor(Math.random() * 5), supply: 8 + Math.floor(Math.random() * 14) };
  }
  return prices;
}

export function ensurePrices() {
  const g = getG(); if (!g) return;
  if (!g.world.prices) g.world.prices = initPrices();
  for (const [id, p] of Object.entries(initPrices())) if (!g.world.prices[id]) g.world.prices[id] = p;
}

export function stock(goodsId) {
  const g = getG(); if (!g) return 0;
  return g.world.prices[goodsId]?.supply || 0;
}

export function basePrice(goodsId) { return g_world().world.prices[goodsId]?.base || ITEMS[goodsId]?.price || 0; }
function g_world() { return getG(); }

export function marketPrice(goodsId) {
  const p = g_world().world.prices[goodsId];
  if (!p) return ITEMS[goodsId]?.price || 1;
  return Math.max(1, Math.round(p.base * (1 + p.demand / Math.max(p.supply, 1))));
}

/* Цена покупки игроком (в лавке) */
export function buyPrice(goodsId) {
  let p = Math.round(marketPrice(goodsId) * 1.15 * (1 + CITY_TAX));
  if (hasKnowledge('economy')) p = Math.round(p * 0.9); // знания прошлой жизни
  return Math.max(1, p);
}

/* Цена продажи игроком (лавка покупает) */
export function sellPrice(goodsId) {
  let p = marketPrice(goodsId) * 0.6 * (1 - TRADE_TAX);
  if (hasKnowledge('economy')) p *= 1.1;
  if (g_world().world.flags.erikDiscount && goodsId) p *= 1.1;
  return Math.max(1, Math.round(p));
}

export function traderOf(goodsId) {
  return NPCS.filter(n => n.trader?.includes(goodsId));
}

export function shopOpen(npcId) {
  const g = getG(); if (!g) return false;
  const npc = NPCS.find(n => n.id === npcId);
  if (!npc?.trader) return false;
  // торговец должен быть на рабочем месте вместе с игроком
  return npcLocation(npc) === g.player.location;
}

/* Покупка: bulkBuyRaisesPrices (спрос/предложение двигаются) */
export function buy(npcId, goodsId, qty = 1) {
  const g = getG(); if (!g) return { ok: false, msg: 'Мир спит.' };
  const npc = NPCS.find(n => n.id === npcId);
  if (!npc?.trader?.includes(goodsId)) return { ok: false, msg: 'У ' + (npc ? npc.name : 'торговца') + ' такого товара нет.' };
  if (!shopOpen(npcId)) return { ok: false, msg: 'Лавка закрыта. Приходи, когда ' + npc.name + ' на месте.' };
  if (stock(goodsId) < qty) return { ok: false, msg: 'Столько нет на полке. Осталось: ' + stock(goodsId) + '.' };
  const cost = buyPrice(goodsId) * qty;
  if (g.player.money < cost) return { ok: false, msg: 'Не хватает монет: нужно ' + cost + ' м., есть ' + g.player.money + ' м.' };
  g.player.money -= cost;
  g.world.prices[goodsId].supply = Math.max(1, g.world.prices[goodsId].supply - qty);
  g.world.prices[goodsId].demand += 1;
  addItem(goodsId, qty);
  changeRel(npcId, { respect: 0.5, trust: 0.5 });
  addSkillXp('trade', 4);
  if (ITEMS[goodsId].food) qprog('buyfood');
  log('good', '🛒 Ты покупаешь ' + ITEMS[goodsId].name.toLowerCase() + ' ×' + qty + ' за ' + cost + ' м.' + (CITY_TAX ? ' (с городским сбором)' : ''));
  return { ok: true, cost };
}

/* Продажа: bulkSellDropsPrices */
export function sell(npcId, goodsId, qty = 1) {
  const g = getG(); if (!g) return { ok: false, msg: 'Мир спит.' };
  const npc = NPCS.find(n => n.id === npcId);
  const erikBuysAll = npcId === 'erik';
  if (!npc?.trader && !erikBuysAll) return { ok: false, msg: 'Этот человек не торгует.' };
  if (!shopOpen(npcId) && npcId !== 'erik') return { ok: false, msg: 'Торговца нет на месте.' };
  if (countItem(goodsId) < qty) return { ok: false, msg: 'У тебя нет столько: ' + ITEMS[goodsId]?.name + '.' };
  const gain = sellPrice(goodsId) * qty;
  removeItem(goodsId, qty);
  g.player.money += gain;
  g.world.stats.moneyEarned += gain;
  if (g.world.prices[goodsId]) {
    g.world.prices[goodsId].supply += qty;
    g.world.prices[goodsId].demand = Math.max(0, g.world.prices[goodsId].demand - 1);
  }
  changeRel(npcId, { respect: 0.5 });
  addSkillXp('trade', 4);
  log('good', '💰 Ты продаёшь ' + ITEMS[goodsId].name.toLowerCase() + ' ×' + qty + ' за ' + gain + ' м. (после торгового сбора)');
  return { ok: true, gain };
}

/* Ежедневное обновление: дрейф предложения и спроса */
export function dailyTick() {
  const g = getG(); if (!g) return;
  for (const p of Object.values(g.world.prices)) {
    // предложение тянется к норме
    const norm = 14;
    p.supply = Math.max(2, Math.min(30, Math.round(p.supply + (norm - p.supply) * 0.3 + (Math.random() * 4 - 2))));
    p.demand = Math.max(1, Math.min(12, p.demand + Math.round(Math.random() * 2 - 1)));
  }
  if (g.world.flags.caravanDaysLeft > 0) for (const p of Object.values(g.world.prices)) p.supply = Math.min(30, p.supply + 6);
  if (g.world.flags.fairToday) { for (const p of Object.values(g.world.prices)) p.demand = Math.min(12, p.demand + 2); g.world.flags.fairToday = false; }
}
