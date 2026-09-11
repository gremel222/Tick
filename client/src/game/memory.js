/* ============================================================
   МОДЕЛЬ ПАМЯТИ МИРА (раздел 11 паспорта)
   События: важные — навсегда, мелкие — 30 дней.
   Свидетели запоминают, слухи расползаются (радиус 3).
   Канон: события идут по расписанию, отклонения учитываются.
   ============================================================ */
import { G, log, notify, history, npcState, qprog, getG } from './engine.js';

export function record(type, text, witnessIds, opts = {}) {
  const g = getG(); if (!g) return null;
  const ev = {
    id: Math.random().toString(36).slice(2, 9),
    type, text, day: g.world.day,
    witnesses: witnessIds || [],
    expiresDay: type === 'minor' ? g.world.day + 30 : null,
    important: type === 'important',
  };
  g.world.memory.push(ev);
  if (g.world.memory.length > 300) g.world.memory.splice(0, 50);
  if (type === 'important') {
    addRumor(text, opts.truth || 'truth', opts.source || null);
  }
  return ev;
}

export function addRumor(text, truth, sourceNpc) {
  const g = getG(); if (!g) return;
  const variants = {
    truth: text,
    partial: 'Говорят, ' + text.toLowerCase(),
    exaggeration: 'Слыхали?! ' + text.charAt(0).toUpperCase() + text.slice(1) + '! Да ещё как!',
    lie: 'Шепчутся, будто ' + text.toLowerCase() + ' — хотя кто их поймёт.',
    disinformation: 'Твердят, что ' + text.toLowerCase() + '. Только вот наоборот всё было.',
  };
  g.world.rumors.push({
    id: Math.random().toString(36).slice(2, 9),
    text: variants[truth] || text, truth, sourceNpc: sourceNpc || 'молва',
    day: g.world.day, heard: false,
  });
  if (g.world.rumors.length > 80) g.world.rumors.splice(0, 20);
}

export function expire() {
  const g = getG(); if (!g) return;
  const before = g.world.memory.length;
  g.world.memory = g.world.memory.filter(e => !e.expiresDay || e.day + 30 >= g.world.day);
  if (before - g.world.memory.length > 10) log('sys', 'Старые мелочи стираются из памяти мира. Важное — остаётся.');
}

/* Ночью NPC делятся известным: слухи получают распространение */
export function spreadOvernight() {
  const g = getG(); if (!g) return;
  const sharers = ['agata', 'luka', 'marta', 'ula', 'ben', 'dora', 'severin', 'irma'];
  for (const r of g.world.rumors) {
    if (r.day >= g.world.day - 1 && chance01(0.4)) {
      const s = sharers[Math.floor(Math.random() * sharers.length)];
      r.sourceNpc = r.sourceNpc || s;
    }
  }
}
function chance01(p) { return Math.random() < p; }

/* Слухи, доступные для рассказа конкретным NPC */
export function rumorsKnownBy(npcId) {
  const g = getG(); if (!g) return [];
  const gossips = ['agata', 'luka', 'marta', 'ula', 'ben', 'dora'];
  const direct = g.world.rumors.filter(r => r.sourceNpc === npcId && r.day >= g.world.day - 7);
  if (gossips.includes(npcId)) return direct.concat(g.world.rumors.filter(r => r.day >= g.world.day - 5)).slice(0, 6);
  return direct.slice(0, 3);
}

export function markHeard(rumorId) {
  const g = getG(); if (!g) return;
  const r = g.world.rumors.find(x => x.id === rumorId);
  if (r) r.heard = true;
}

export function heardRumors() {
  const g = getG(); if (!g) return [];
  return g.world.rumors.filter(r => r.heard);
}

export function importantMemories() {
  const g = getG(); if (!g) return [];
  return g.world.memory.filter(e => e.important);
}

/* ---------------- КАНОН (5.3) ---------------- */
export function canonList() {
  const g = getG(); if (!g) return [];
  return g.world.canon;
}

export function canonById(id) {
  const g = getG(); if (!g) return null;
  return g.world.canon.find(c => c.id === id) || null;
}

/* Отметить отклонение от канона */
export function deviation(canonId, reason) {
  const g = getG(); if (!g) return;
  const c = canonById(canonId); if (!c) return;
  c.status = 'changed';
  c.deviationReason = reason;
  g.world.stats.canonDeviations += 1;
  log('good', '⚡ История пошла другой дорогой: «' + c.title + '» — ' + reason);
  history('Отклонение канона: ' + c.title + ' — ' + reason);
  addRumor('в «' + c.title + '» всё вышло не по-старому: ' + reason, 'exaggeration');
  notify('canon');
}

/* Ежедневная проверка канонических событий */
export function canonTick() {
  const g = getG(); if (!g) return;
  for (const c of g.world.canon) {
    if (c.plannedDay !== g.world.day || c.status !== 'planned') continue;
    switch (c.id) {
      case 'wolves-bold': {
        if (g.world.stats.kills >= 2) { deviation(c.id, 'стаю перебили до срока — незнакомец оказался быстрее охотника'); continue; }
        g.world.flags.forestDangerBonus = 1;
        c.status = 'happened';
        log('bad', '🐺 Канон: волки осмелели. Лес стал опаснее.');
        addRumor('волки спустились с холмов и задрали овцу у Томаса', 'truth', 'hans');
        break;
      }
      case 'caravan': {
        g.world.flags.caravanDaysLeft = 2;
        g.world.flags.caravanWasHere = true;
        c.status = 'happened';
        log('good', '🐎 Канон: караван из столицы встал на тракте. Два дня лавка полна, у людей новости.');
        break;
      }
      case 'fair': {
        g.world.flags.fairToday = true;
        c.status = 'happened';
        log('good', '🎪 Канон: ярмарка! На площади пироги, смех и торг до темноты.');
        break;
      }
      case 'wedding': {
        const r = g.world.npcs.justina.rel;
        if (g.world.flags.justinaEscape || r.romantic >= 40) {
          deviation(c.id, g.world.flags.justinaEscape
            ? 'Юстина не пришла на венчание — в ту ночь она ушла с караваном на север'
            : 'Юстина отказала мельникову сыну — впервые в жизни пошла против отца');
        } else {
          c.status = 'happened';
          log('sys', '💍 Канон: свадьба Юстины и сына мельника. Деревня гуляет, староста сияет.');
          addRumor('свадебный пир удался: гуляли до утра, мельник плясал с гусями', 'exaggeration', 'agata');
        }
        break;
      }
      case 'raid': {
        if (g.world.flags.warnedGuard) {
          deviation(c.id, 'стражника предупредили заранее — у моста ждала засада, разбойников переловили');
          g.world.flags.raidActive = false;
          g.world.flags.ambushDaysLeft = 3; // окно, когда игрок может присоединиться к засаде
          log('bad', '⚔ Каспар передал: засада у южного моста назначена. Три дня. Скажи «засада» на южной дороге, если готов.');
        } else {
          c.status = 'happened';
          g.world.flags.raidActive = true;
          log('bad', '🗡 Канон: разбойники разграбили обоз на южном тракте. Деревня узнаёт последней.');
          addRumor('у южного моста лихие люди резали обоз — двоих поранили', 'truth', 'ben');
        }
        break;
      }
      case 'pilgrimage': {
        c.status = 'happened';
        log('sys', '🕯 Канон: паломники пришли к Пламени Рассвета. Лия светится.');
        break;
      }
    }
  }
  notify('canon');
}
