/* ============================================================
   ПАРСЕР СВОБОДНОГО ВВОДА (раздел 4.9 паспорта)
   Стадии: tokenize → classify → extract-slots → validate → execute
   Fallback: уточняющий вопрос, а не выдумка.
   ============================================================ */
import { LOCATIONS, NPCS, ITEMS } from './data.js';
import { getG, doAction, npcById, npcLocation, npcsAt, availableJobs, removeItem, qprog } from './engine.js';
import { record } from './memory.js';
import { matchItem, matchQty } from './dialogue.js';

const STOP = new Set(['в', 'на', 'к', 'с', 'со', 'и', 'о', 'об', 'по', 'за', 'из', 'от', 'до', 'у', 'не', 'это', 'что', 'как', 'где', 'мне', 'я', 'ты', 'моя', 'мой', 'ну', 'бы', 'же', 'ли', 'а', 'да', 'но', 'то', 'вот', 'тут', 'там', 'ещё', 'еще', 'пускай', 'пусть', 'его', 'её', 'ее', 'их', 'нас', 'вас']);

export function tokenize(text) {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

/* --- словари намерений (стемы — начало слова) --- */
const INTENTS = {
  ui:       ['карт', 'инвентар', 'журнал', 'квест', 'персонаж', 'меню', 'характерист'],
  buy:      ['купи', 'куплю', 'приобрет', 'беру'],
  sell:     ['прода', 'сбыть'],
  give:     ['подар', 'вруч', 'отдать', 'дарю', 'отдам'],
  talk:     ['поговор', 'заговор', 'привет', 'здравств', 'спрос', 'расспрос', 'поболта', 'обратит'],
  attack:   ['атак', 'напад', 'удар', 'убить', 'дерус', 'напасть', 'сражат', 'рубить'],
  eat:      ['съеш', 'съем', 'съест', 'поест', 'поесть', 'перекус', 'ужин', 'завтрак', 'поем', 'голоден', 'поешь'],
  drink:    ['пить', 'пью', 'выпить', 'напиться', 'глотн', 'попить', 'жажд'],
  sleep:    ['спать', 'сплю', 'поспать', 'засну', 'ночлег', 'спат'],
  rest:     ['отдых', 'передох', 'присе', 'прилеч', 'отдохн'],
  wait:     ['подожд', 'ждать', 'пережд', 'подожди', 'жду'],
  work:     ['работ', 'подработ', 'помочь', 'помог', 'поработ'],
  craft:    ['сдела', 'созда', 'изготов', 'смастер', 'скрафт', 'сшить'],
  search:   ['искать', 'поиск', 'собирать', 'нарвать', 'охотиться', 'охот'],
  examine:  ['осмотр', 'изуч', 'рассмотр', 'посмотр', 'глян', 'разгляд'],
  move:     ['идти', 'иду', 'пойти', 'пойд', 'шаг', 'направ', 'зайт', 'войд', 'выйти', 'верн', 'отправ', 'гуля', 'брод', 'идем', 'домой', 'пойдем', 'топа', 'двиг'],
  look:     ['огляд', 'вокруг', 'осмотреться', 'осмотрюсь'],
  help:     ['помощь', 'хелп', 'команд', 'что можно', 'что я могу', 'подсказ'],
};

const UI_TARGETS = { 'карта': 'map', 'карту': 'map', 'инвентарь': 'inventory', 'журнал': 'journal', 'квест': 'journal', 'квесты': 'journal', 'персонаж': 'character', 'характеристики': 'character', 'меню': 'menu' };

/* --- слоты: NPC по имени/профессии --- */
const NPC_ALIASES = [
  ['эри', 'erik'], ['торгов', 'erik'], ['лавочник', 'erik'],
  ['март', 'marta'], ['трактирщ', 'marta'],
  ['годвин', 'godwin'], ['кузнец', 'godwin'],
  ['богдан', 'bogdan'], ['старост', 'bogdan'],
  ['ли', 'lia'], ['жриц', 'lia'], ['жре', 'lia'],
  ['томас', 'tomas'], ['фермер', 'tomas'],
  ['грет', 'greta'], ['травниц', 'greta'],
  ['ханс', 'hans'], ['охотник', 'hans'],
  ['ула', 'ula'], ['служанк', 'ula'],
  ['ростислав', 'rostislav'], ['ростовщ', 'rostislav'],
  ['бен', 'ben'], ['странник', 'ben'],
  ['ирм', 'irma'], ['портних', 'irma'],
  ['каспар', 'kaspar'], ['стражник', 'kaspar'],
  ['дор', 'dora'], ['пекар', 'dora'],
  ['лука', 'luka'], ['разносч', 'luka'], ['мальч', 'luka'],
  ['мирон', 'miron'], ['мельник', 'miron'],
  ['агат', 'agata'], ['сплетниц', 'agata'], ['старух', 'agata'],
  ['федор', 'fedor'], ['дровосек', 'fedor'],
  ['юстин', 'justina'], ['дочь старост', 'justina'],
  ['северин', 'severin'], ['монах', 'severin'],
];

/* --- слоты: локации --- */
const LOC_ALIASES = [
  ['площад', 'village-square'], ['центр', 'village-square'], ['колодц', 'village-square'],
  ['таверн', 'village-tavern'], ['кабак', 'village-tavern'],
  ['кузнец', 'village-smithy'], ['кузню', 'village-smithy'], ['горн', 'village-smithy'],
  ['лавк', 'village-shop'], ['магаз', 'village-shop'],
  ['храм', 'village-temple'], ['церк', 'village-temple'],
  ['пол', 'village-fields'], ['нивы', 'village-fields'], ['пашн', 'village-fields'], ['мельниц', 'village-fields'],
  ['опушк', 'forest-edge'],
  ['чащ', 'forest-deep'], ['глубин', 'forest-deep'], ['дебр', 'forest-deep'],
  ['тракт', 'ROAD'], ['дорог', 'ROAD'],
  ['север', 'road-north'], ['юг', 'ROAD_S'],
  ['деревн', 'village-square'], ['домой', 'village-square'], ['вязов', 'village-square'],
];

function npcMatch(tokens, text, stem) {
  if (stem.includes(' ')) return text.includes(stem);
  return tokens.some(tk => tk.startsWith(stem) && !STOP.has(tk));
}
function locMatch(tokens, text, stem) {
  if (stem.includes(' ')) return text.includes(stem);
  return tokens.some(tk => tk.startsWith(stem) && !STOP.has(tk));
}

function resolveLocation(tokens, g) {
  const text = tokens.join(' ');
  let best = null;
  for (const [stem, id] of LOC_ALIASES) {
    if (locMatch(tokens, text, stem)) {
      if (id === 'ROAD') best = tokens.some(tk => tk.startsWith('юг')) || text.includes('южн') ? 'road-south' : 'road-north';
      else if (id === 'ROAD_S') best = 'road-south';
      else best = id;
    }
  }
  // «в лес» из леса = глубже
  if (best === 'forest-edge' && (g.player.location === 'forest-edge' || g.player.location === 'forest-deep')) {
    if (text.includes('глуб') || text.includes('чащ')) best = 'forest-deep';
    else if (g.player.location === 'forest-edge' && !text.includes('опушк')) best = 'forest-deep';
  }
  if (best && g.player.location === best) return { same: true, id: best };
  return { id: best };
}

function resolveNpc(tokens, g) {
  const text = tokens.join(' ');
  const candidates = [];
  for (const [stem, id] of NPC_ALIASES) if (npcMatch(tokens, text, stem)) candidates.push(id);
  if (!candidates.length) return null;
  // приоритет: кто сейчас в этой локации
  const here = new Set(npcsAt(g.player.location).map(x => x.npc.id));
  for (const id of candidates) if (here.has(id)) return id;
  return candidates[0];
}

function classify(tokens) {
  const text = tokens.join(' ');
  const order = ['ui', 'buy', 'sell', 'give', 'talk', 'attack', 'eat', 'drink', 'sleep', 'rest', 'wait', 'work', 'craft', 'search', 'examine', 'move', 'look', 'help'];
  for (const intent of order) {
    for (const kw of INTENTS[intent]) {
      if (kw.includes(' ')) { if (text.includes(kw)) return intent; }
      else if (tokens.some(tk => tk === kw || (kw.length >= 3 && tk.startsWith(kw)) || (tk.length >= 4 && kw.startsWith(tk)))) return intent;
    }
  }
  // безглагольные формы: «в таверну», «к эрику», «на площадь»
  if (tokens[0] === 'в' || tokens[0] === 'на' || tokens[0] === 'к' || tokens[0] === 'до') return 'move';
  return null;
}

export function parse(text) {
  const g = getG();
  const tokens = tokenize(text);
  const intent = classify(tokens);
  const s = { text, tokens, intent };
  s.item = matchItem(tokens.join(' '));
  s.qty = matchQty(tokens.join(' '));
  s.npc = resolveNpc(tokens, g);
  s.loc = resolveLocation(tokens, g);
  s.exKind = null;
  if (intent === 'examine') {
    if (s.item && !s.npc) s.exKind = 'item';
    else if (s.npc) s.exKind = 'npc';
  }
  return s;
}

export function parseAndRun(text) {
  const g = getG();
  if (!g) return { ok: false, msg: 'Мир ещё не создан.' };
  const s = parse(text);

  if (s.intent === 'ui') {
    const first = s.tokens.find(tk => UI_TARGETS[tk]);
    const target = first ? UI_TARGETS[first] : (s.text.includes('журнал') || s.text.includes('квест') ? 'journal' : 'character');
    return { ok: true, ui: target };
  }
  if (s.intent === 'help') return doAction({ type: 'help' });

  if (s.intent === 'move' || (s.intent === null && s.loc.id)) {
    if (!s.loc.id && !s.npc) return clarify(s, 'Ты хочешь куда-то идти? Скажи точнее: «идти в деревню», «на площадь», «в лес», «на северный тракт».');
    if (s.loc.same) return { ok: false, msg: 'Ты уже в этом месте.' };
    let target = s.loc.id;
    if (!target && s.npc) {
      // «идти к Эрику» — идём туда, где он сейчас
      const npc = npcById(s.npc);
      const loc = npcLocation(npc);
      if (loc.startsWith('home:')) return { ok: false, msg: npc.name + ' сейчас дома — не тревожь.' };
      if (loc === g.player.location) return { ok: false, msg: npc.name + ' прямо здесь. Можешь поговорить.' };
      target = loc;
    }
    if (!target) return clarify(s, 'Куда именно? Например: «в таверну», «на поля», «в глубину леса».');
    const here = LOCATIONS[g.player.location];
    if (!here.exits[target]) {
      const direct = Object.keys(here.exits).map(id => LOCATIONS[id].name.toLowerCase()).join(', ');
      return { ok: false, msg: 'Туда отсюда напрямую не пройти. Рядом: ' + direct + '.' };
    }
    return doAction({ type: 'move', target });
  }

  if (s.intent === 'look') return doAction({ type: 'look' });
  if (s.intent === 'examine') {
    if (s.exKind === 'npc' && s.npc) return doAction({ type: 'examine', target: s.npc, kind: 'npc' });
    if (s.exKind === 'item' && s.item) return doAction({ type: 'examine', target: s.item, kind: 'item' });
    return doAction({ type: 'examine', target: g.player.location, kind: 'loc' });
  }
  if (s.intent === 'talk') {
    if (!s.npc) {
      const here = npcsAt(g.player.location);
      if (here.length === 1) return doAction({ type: 'talk', npc: here[0].npc.id });
      return clarify(s, 'С кем поговорить? Здесь: ' + (here.length ? here.map(x => x.npc.name).join(', ') : 'никого нет') + '.');
    }
    return doAction({ type: 'talk', npc: s.npc });
  }
  if (s.intent === 'buy') {
    if (!s.item) return clarify(s, 'Что купить? Скажи: «купить хлеб», «купить воды 2».');
    const seller = findTrader(g, s.item);
    if (!seller) return { ok: false, msg: 'Здесь никто не торгует этим.' };
    return doAction({ type: 'buy', npc: seller, item: s.item, qty: s.qty });
  }
  if (s.intent === 'sell') {
    if (!s.item) return clarify(s, 'Что продать? Например: «продать шкуру».');
    const buyer = findTrader(g, s.item, true);
    if (!buyer) return { ok: false, msg: 'Продать здесь некому. Эрик в лавке берёт всё.' };
    return doAction({ type: 'sell', npc: buyer, item: s.item, qty: s.qty });
  }
  if (s.intent === 'eat') return doAction({ type: 'eat', item: s.item });
  if (s.intent === 'drink') return doAction({ type: 'drink', item: s.item });
  if (s.intent === 'sleep') return doAction({ type: 'sleep' });
  if (s.intent === 'rest') return doAction({ type: 'rest', min: 60 });
  if (s.intent === 'wait') {
    const m = s.text.match(/(\d{1,3})\s*(минут|минуты|час)/);
    let mins = m ? parseInt(m[1], 10) : 30;
    if (m && m[2].startsWith('час')) mins *= 60;
    return doAction({ type: 'wait', min: mins });
  }
  if (s.intent === 'work') {
    const jobs = availableJobs();
    if (!jobs.length) return { ok: false, msg: 'Здесь сейчас никому не нужны руки. Ищи на полях, в таверне, у кузни или на опушке.' };
    if (jobs.length === 1 || (s.npc && jobs.some(j => j.npcId === s.npc))) {
      const job = s.npc ? jobs.find(j => j.npcId === s.npc) : jobs[0];
      return doAction({ type: 'work', jobId: job.id });
    }
    return clarify(s, 'У кого работать? Варианты: ' + jobs.map(j => j.title.toLowerCase()).join('; ') + '.');
  }
  if (s.intent === 'craft') {
    const rec = { 'бинт': 'bandage', 'факел': 'torch', 'дубин': 'club' };
    for (const [stem, id] of Object.entries(rec)) if (s.text.includes(stem)) return doAction({ type: 'craft', recipe: id });
    return clarify(s, 'Что сделать? Пока ты умеешь: бинт (2 травы), факел (2 хвороста), дубина (3 хвороста).');
  }
  if (s.intent === 'search') {
    if (s.text.includes('трав')) return doAction({ type: 'search', what: 'herbs' });
    if (s.text.includes('хворост') || s.text.includes('ветк') || s.text.includes('дерев')) return doAction({ type: 'search', what: 'wood' });
    return clarify(s, 'Что искать? Травы (в лесу) или хворост (на опушке).');
  }
  if (s.intent === 'give') {
    // особый случай: письмо караванщику Горму
    if (s.item === 'letter' && g.player.location === 'road-north') {
      if (g.world.flags.caravanDaysLeft > 0) {
        removeItem('letter', 1);
        g.world.flags.letterDelivered = true;
        qprog('letter');
        record('important', 'передал караванщику письмо Юстины', [], { truth: 'partial' });
        return { ok: true, msg: '✉ Ты находишь караванщика Горма среди подвод. Тот читает письмо, хмыкает: «Девица просит места до столицы? Скажи ей: через месяц буду — и место найдётся». Дело сделано. Скажи Юстине.' };
      }
      return { ok: false, msg: 'Каравана сейчас нет на тракте. Он приходит из столицы — жди вестей (событие канона, день 5).' };
    }
    if (!s.npc || !s.item) return clarify(s, 'Что и кому? Например: «подарить цветок Уле».');
    return doAction({ type: 'give', npc: s.npc, item: s.item });
  }
  if (s.intent === 'attack') {
    if (!s.npc) return clarify(s, 'На кого напасть? Здесь: ' + (npcsAt(g.player.location).map(x => x.npc.name).join(', ') || 'никого нет') + '.');
    return doAction({ type: 'attack', target: s.npc });
  }

  // — не распознано: уточняющий вопрос (fallback по паспорту) —
  return clarify(s, null);
}

function clarify(s, forced) {
  if (forced) return { ok: false, msg: forced, clarify: true };
  const tips = [
    'Я не понял намерения. Попробуй проще: «осмотреться», «идти в деревню», «поговорить с Мартой», «купить хлеб».',
    'Хм. Скажи иначе — например: «искать травы», «работать», «спать», «подарить кольцо Юстине».',
    'Движок не понял. Полный список команд: «помощь».',
  ];
  return { ok: false, msg: tips[Math.floor(Math.random() * tips.length)], clarify: true };
}

function findTrader(g, itemId, buyingFromPlayer = false) {
  const here = npcsAt(g.player.location);
  for (const { npc } of here) {
    if (buyingFromPlayer) { if (npc.trader?.includes(itemId) || npc.id === 'erik') return npc.id; }
    else if (npc.trader?.includes(itemId)) return npc.id;
  }
  return null;
}
