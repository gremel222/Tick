/* ============================================================
   ДИАЛОГИ (разделы 4.9 / 9): rules-first ядро.
   Темы, тон по характеру NPC, стадии отношений, секреты,
   слухи, торговля внутри диалога, квестовые ветки.
   (ИИ-fallback подключается точечно в полной версии.)
   ============================================================ */
import { NPCS, ITEMS, TONES, VILLAGE_NAME, QUESTS } from './data.js';
import { getG, log, notify, history, npcById, npcState, npcLocation, npcsAt,
         relOf, changeRel, stageIdx, advanceTime, doAction, availableJobs,
         countItem, removeItem, addItem, hasKnowledge, qprog, activateQuest } from './engine.js';
import { record, addRumor, rumorsKnownBy, markHeard } from './memory.js';
import * as economy from './economy.js';

let D = null; // { npcId, lines: [{who, text}] }

export function isActive() { return !!D; }
export function currentNpc() { return D ? npcById(D.npcId) : null; }
export function lines() { return D ? D.lines : []; }

export function start(npcId) {
  const g = getG(); if (!g) return { ok: false, msg: 'Мир спит.' };
  const npc = npcById(npcId);
  if (!npc) return { ok: false, msg: 'Такого человека здесь нет.' };
  if (npcLocation(npc) !== g.player.location) return { ok: false, msg: npc.name + ' не здесь. Поищи в другое время.' };
  const st = npcState(npcId);
  if (st.state === 'dead') return { ok: false, msg: npc.name + ' уже не ответит.' };
  const hour = Math.floor(g.world.min / 60);
  if (hour < 6 || hour >= 23) return { ok: false, msg: npc.name + ' спит. Даже деревне нужен отдых.' };
  st.met = true; st.known = true;
  D = { npcId, lines: [] };
  const bank = TONES[npc.tone];
  const tier = stageIdx(npcId) >= 3 ? 'greetFriend' : stageIdx(npcId) >= 1 ? 'greetKnown' : 'greet';
  say('npc', pickLine(bank[tier]));
  // первое знакомство с важными людьми
  if (npc.famous) qprog('famous');
  qprog('talk');
  if (st.lastTalkDay !== g.world.day) { st.lastTalkDay = g.world.day; st.talkedToday = 0; }
  notify('dialogue');
  return { ok: true };
}

export function end(silent) {
  if (!D) return;
  const npc = npcById(D.npcId);
  if (!silent) say('npc', pickLine(TONES[npc.tone].farewell));
  D = null;
  notify('dialogue:end');
}

function pickLine(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function say(who, text) {
  if (!D) return;
  D.lines.push({ who, text });
  if (D.lines.length > 40) D.lines.shift();
  notify('dialogue');
}

/* ---------------- ПАРИНГ ДИАЛОГОВОГО ВВОДА ---------------- */
export function handleInput(text) {
  if (!D) return { ok: false, msg: 'Собеседника нет.' };
  const g = getG();
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const npc = npcById(D.npcId);
  const st = npcState(D.npcId);
  const r = relOf(D.npcId);
  say('you', text);

  // — уйти —
  if (/(^|\s)(уйти|пока|до свидания|прощай|прощайте|отойти|закончить)/.test(t)) { end(); return { ok: true }; }

  // — помощь —
  if (/(помощь|что можно|подсказ)/.test(t)) {
    say('sys', 'Темы: кто ты · работа · цены · слухи · деревня · дорога · лес/опасность · семья · погода · мечты · тайна. Действия: купить X · продать X · подарить X · рассказать о себе · предупредить о разбойниках · уйти.');
    return { ok: true };
  }

  // — торговля —
  if (/(купить|куплю|возьму|почем)/.test(t)) return dialogueTrade('buy', t);
  if (/(продаю|продать|сбыть)/.test(t)) return dialogueTrade('sell', t);

  // — подарок —
  if (/(подар|дарю|отдать тебе|вруч)/.test(t)) return doGift(t);

  // — рассказать о себе (попытка объясниться) —
  if (/(рассказать о себе|я не отсюда|я из другого|о себе расскажу|меня зовут|я попадан|я умер|другой мир)/.test(t)) {
    advanceTime(15);
    qprog('aboutself');
    const reaction = r.trust >= 15 || npc.tone === 'kind' || npc.tone === 'mysterious' || npc.tone === 'wise'
      ? pickLine([
          '…Странный ты. Но здесь таких немного, и я не осуждаю.',
          'Другой мир? Ха. А мой мир — этот. Будь поосторожнее с такими речами, люди любят пошептаться.',
          'Знаешь, я тебе почему-то верю. Не рассказывай это всем.',
        ])
      : pickLine([
          'Ты либо безумец, либо пьяный. Иди проспись.',
          'Слышал я сказки бродяг. Чаю? Нет? Тогда до встречи.',
        ]);
    say('npc', reaction);
    const gain = hasKnowledge('psychology') ? 2.5 : 1.5;
    changeRel(D.npcId, { sympathy: gain, trust: 0.5, suspicion: 0.5 });
    if (npc.tone === 'gossipy' || npc.id === 'agata') addRumor('незнакомец божится, что он из другого мира', 'exaggeration', 'agata');
    return { ok: true };
  }

  // — угроза / наезд —
  if (/(угроз|наехал|пригрож|отдай|или я|бойся меня|стерва|дурак|глупец|болван)/.test(t)) {
    changeRel(D.npcId, { fear: 4, suspicion: 6, sympathy: -6, trust: -4 });
    say('npc', pickLine(TONES[npc.tone].refuse));
    if (r.suspicion > 40) { say('sys', npc.name + ' не желает продолжать разговор.'); end(true); }
    return { ok: true };
  }

  // — работа —
  if (/(работ|подработ|помочь|трудоустро)/.test(t)) {
    const jobs = availableJobs().filter(j => j.npcId === D.npcId);
    if (npc.job && jobs.length) {
      say('npc', pickLine([
        'Руки нужны? Есть дело: ' + npc.job.title.toLowerCase() + '. Плачу ' + npc.job.pay[0] + '–' + npc.job.pay[1] + ' монет.',
        'Работа не ждёт. ' + npc.job.title + ' — и ' + npc.job.pay[0] + ' монет твои. По рукам?',
      ]));
      say('sys', 'Скажи «работать» — и приступишь.');
    } else if (npc.job) {
      say('npc', 'На сегодня всё, отдыхай. Приходи завтра.');
    } else {
      say('npc', pickLine(['У меня работы нет. Спроси у Томаса или в таверне.', 'Мне бы самого кто нанял…']));
    }
    return { ok: true };
  }
  if (/^работать$/.test(t.trim())) return doAction({ type: 'work', jobId: npc.job?.id });

  // — темы —
  return topicReply(t);
}

function dialogueTrade(mode, t) {
  const npc = npcById(D.npcId);
  if (!npc.trader && !(mode === 'sell' && D.npcId === 'erik')) {
    say('npc', 'Я не торгую. Это к Эрику в лавку.');
    return { ok: true };
  }
  const item = matchItem(t);
  if (!item) {
    if (mode === 'buy') {
      const goods = (npc.trader || []).map(id => ITEMS[id].name.toLowerCase()).join(', ');
      say('npc', 'У меня есть: ' + goods + '. Что берёшь?');
    } else {
      say('npc', 'Что продаёшь? Назови вещь.');
    }
    return { ok: true };
  }
  const qty = matchQty(t);
  const res = mode === 'buy' ? economy.buy(D.npcId, item, qty) : economy.sell(D.npcId, item, qty);
  if (!res.ok) say('sys', res.msg);
  else if (mode === 'buy') say('npc', pickLine(['Извольте. Ещё что-нибудь?', 'Приятно иметь дело.', 'Беру монету — отдаю вещь. Честно.']));
  else say('npc', pickLine(['Сойдёт. Деньги на стол.', 'Ну, за товар спасибо.']));
  return res;
}

function doGift(t) {
  const npc = npcById(D.npcId);
  const item = matchItem(t);
  if (!item) { say('sys', 'Что именно подарить? Назови вещь из инвентаря.'); return { ok: false }; }
  if (countItem(item) < 1) { say('sys', 'У тебя нет: ' + ITEMS[item].name + '.'); return { ok: false }; }
  const it = ITEMS[item];
  removeItem(item, 1);
  advanceTime(5);
  const val = it.gift || Math.max(1, Math.floor(it.price / 8));
  changeRel(D.npcId, { sympathy: val, trust: 1, romantic: npc.romance ? val * 0.5 : 0 });
  say('npc', pickLine(TONES[npc.tone].gift));
  if (npc.romance && relOf(D.npcId).sympathy >= 30 && val >= 3) {
    say('sys', 'Кажется, подарок попал в сердце.');
  }
  return { ok: true };
}

/* ---------------- ОБЁРТКИ ДЛЯ ДВИЖКА И КНОПОК ---------------- */
export function actGive(npcId, itemId) {
  if (!D) {
    const res = start(npcId);
    if (!res.ok) return res;
  } else if (D.npcId !== npcId) {
    return { ok: false, msg: 'Сначала закончи текущий разговор.' };
  }
  return doGift('подарить ' + (ITEMS[itemId]?.name || ''));
}

export function actBuy(npcId, itemId, qty = 1) {
  if (!D) {
    const res = start(npcId);
    if (!res.ok) return res;
  }
  return dialogueTrade('buy', 'купить ' + (ITEMS[itemId]?.name || '') + ' ' + qty);
}

export function actSell(npcId, itemId, qty = 1) {
  if (!D) {
    const res = start(npcId);
    if (!res.ok) return res;
  }
  return dialogueTrade('sell', 'продать ' + (ITEMS[itemId]?.name || '') + ' ' + qty);
}

/* ---------------- ТЕМЫ РАЗГОВОРА ---------------- */
function topicReply(t) {
  const g = getG();
  const npc = npcById(D.npcId);
  const st = npcState(D.npcId);
  const r = relOf(D.npcId);
  const bank = TONES[npc.tone];

  const has = (...words) => words.some(w => t.includes(w));

  // — кто ты / о себе —
  if (has('кто ты', 'о себе', 'расскажи о себе', 'твое дело', 'кем работаешь', 'твоя работа')) {
    advanceTime(10);
    say('npc', npc.bio);
    if (stageIdx(D.npcId) >= 1) say('npc', pickLine(['А ты сам-то кто будешь? Впрочем, расскажешь, когда захочешь.', 'Довольно обо мне. Твои-то дела как?']));
    changeRel(D.npcId, { sympathy: 0.5 });
    return { ok: true };
  }

  // — мечты / цели —
  if (has('мечт', 'цель', 'хочешь в жизни', 'о будущем')) {
    advanceTime(10);
    if (r.trust >= 12) {
      say('npc', 'Мечта? ' + npc.dreams[0] + '. Вот и всё, о чём грезю.');
      if (r.trust >= 30) say('npc', 'А цели простые: ' + npc.goals.join(', ') + '.');
    } else say('npc', pickLine(bank.refuse));
    return { ok: true };
  }

  // — страхи —
  if (has('боишься', 'страх', 'чего страшно')) {
    advanceTime(10);
    if (r.trust >= 25) say('npc', 'Боюсь? ' + npc.fears[0] + '. Только тебе говорю.');
    else say('npc', pickLine(bank.refuse));
    return { ok: true };
  }

  // — тайна —
  if (has('секрет', 'тайн', 'скрываешь')) {
    advanceTime(10);
    if (r.trust >= 45) {
      say('npc', '…Ладно. ' + npc.secrets[0].charAt(0).toUpperCase() + npc.secrets[0].slice(1) + '. Теперь ты знаешь.');
      changeRel(D.npcId, { trust: 2, attachment: 2 });
      record('important', 'узнал тайну ' + npc.name + ' (' + npc.secrets[0] + ')', [D.npcId], { truth: 'truth', source: D.npcId });
    } else if (r.trust >= 20) {
      say('npc', 'Тайны есть у всех. Вот доверия пока не хватает.');
      say('sys', 'Нужно больше доверия (сейчас: ' + Math.round(r.trust) + '/45).');
    } else say('npc', pickLine(bank.refuse));
    return { ok: true };
  }

  // — цены —
  if (has('цен', 'сколько стоит', 'почем')) {
    advanceTime(5);
    if (npc.trader) {
      const goods = npc.trader.slice(0, 5).map(id => ITEMS[id].name.toLowerCase() + ' — ' + economy.buyPrice(id) + ' м.').join(', ');
      say('npc', 'По-честному: ' + goods + '. Остальное покажу в лавке.');
    } else say('npc', 'Про цены — это к Эрику или к Ирме. Я в этом не силён.');
    return { ok: true };
  }

  // — слухи —
  if (has('слух', 'новост', 'что слыхать', 'сплетн', 'говорят')) {
    advanceTime(10);
    const known = rumorsKnownBy(D.npcId);
    if (known.length) {
      const rum = known[Math.floor(Math.random() * known.length)];
      markHeard(rum.id);
      say('npc', (npc.tone === 'gossipy' ? 'Ой, слушай! ' : 'Говорят… ') + rum.text);
      if (npc.tone === 'gossipy') changeRel(D.npcId, { sympathy: 1 });
    } else {
      say('npc', pickLine(['Тихо у нас. Слухи — это по части Агаты.', 'Пока всё как всегда. А это уже новость.']));
    }
    return { ok: true };
  }

  // — деревня —
  if (has('деревн', 'здесь', 'ваши места', 'визов')) {
    advanceTime(10);
    say('npc', pickLine([
      VILLAGE_NAME + ' — не столица, но живём. Полторы сотни душ, староста, храм и мельница.',
      'Деревня как деревня. Пашем, молимся, на ярмарку собираемся.',
    ]));
    if (npc.id === 'bogdan' || npc.id === 'lia') qprog('famous');
    return { ok: true };
  }

  // — дорога/город —
  if (has('дорог', 'город', 'столиц', 'тракт', 'далеко')) {
    advanceTime(10);
    say('npc', pickLine([
      'На север — тракт до столицы. Пять дней пути, если без приключений.',
      'Столица — это где решают чужие судьбы. А у нас тут — своя.',
    ]));
    if (npc.id === 'ben') say('npc', 'Я дошёл отсюда до моря и обратно. Дороги меняют людей, дружище.');
    return { ok: true };
  }

  // — опасность/лес/разбойники —
  if (has('лес', 'опасн', 'звер', 'волк', 'разбой', 'грабител')) {
    advanceTime(10);
    // предупреждение стражи (квест-механика: измени канон)
    if ((npc.id === 'kaspar' || npc.id === 'bogdan') && has('предупр', 'разбой', 'южн', 'мост')) {
      if (g.world.day < 20 && !g.world.flags.warnedGuard) {
        g.world.flags.warnedGuard = true;
        record('important', 'предупредил ' + npc.name + ' о готовящемся нападении разбойников', [D.npcId]);
        changeRel(D.npcId, { respect: 8, trust: 5 });
        say('npc', npc.id === 'kaspar'
          ? 'У моста, говоришь?… Спасибо. Клянусь мечом — засада будет ждать их, а не обоз.'
          : 'Хм. Человек, который предупреждает, а не ждёт… Ты полезнее, чем кажешься.');
        say('good', '⚡ Ты изменил будущее: у канона «Разбойники на тракте» теперь другой исход.');
      } else if (g.world.flags.warnedGuard) {
        say('npc', 'Уже сделано. Ты свой хлеб отработал.');
      } else {
        say('npc', 'Поздно предупреждать — что случилось, то случилось.');
      }
      return { ok: true };
    }
    if (has('волк') && (npc.id === 'bogdan' || npc.id === 'hans')) {
      if (npc.id === 'bogdan' && !g.quests.completed.includes('q-wolves') && !g.quests.active.some(q => q.id === 'q-wolves')) {
        activateQuest('q-wolves');
        say('npc', 'Волки — беда года. Двух голов с опушки — и сорок монет твои. Считай, заказ.');
      } else {
        say('npc', npc.id === 'hans' ? 'Старый волк у нас умнее половины деревни. Уважай зверя.' : 'Заказ уже висит. Волки сами себя не перебьют.');
      }
      return { ok: true };
    }
    say('npc', pickLine([
      'Лес кормит и лес убивает. Без нужды за опушку не суйся.',
      g.world.flags.forestDangerBonus ? 'С тех пор как волки осмелели, в лес ходят по двое. Или не ходят.' : 'В лесу тихо. Пока тихо.',
      'Опасно? Жизнь вообще опасная штука.',
    ]));
    return { ok: true };
  }

  // — семья —
  if (has('семь', 'женат', 'замуж', 'дет', 'домашн')) {
    advanceTime(10);
    const fam = { marta: 'Дочь Ула — глаза моей жизни и причина седых волос.', tomas: 'Жена Грета — травница. Я на ней женат, а не она за мной.', bogdan: 'Дочь Юстина. Упрямая, в мать.', greta: 'Муж Томас. Поле, я и он — вся наша компания.', justina: 'Отец держит меня в кулаке. Мама рано ушла.' }[npc.id];
    say('npc', fam || pickLine(['Семья — это когда делят последний кусок. Или молчат рядом. У меня всё как у всех.']));
    return { ok: true };
  }

  // — погода —
  if (has('погод', 'дожд', 'снег', 'жар', 'холод')) {
    advanceTime(5);
    say('npc', pickLine([
      'Погода здесь своенравная. Утром не верь, к полудню увидишь.',
      'К вечеру ясно будет. Или нет. Я не жрица.',
    ]));
    return { ok: true };
  }

  // — староста/жрица (известные люди) —
  if (has('богдан', 'старост') || has('лиях', 'жриц', 'лия ') || t.trim() === 'лия') {
    advanceTime(5);
    if (npc.id === 'bogdan') { say('npc', 'Староста — это я. Дальше по списку вопросов нет?'); qprog('famous'); }
    else if (npc.id === 'lia') { say('npc', 'Жрица — это я. Пламя приветствует тебя.'); qprog('famous'); }
    else say('npc', npc.id === 'justina' ? 'Отец? Богдан. Властный, но любит меня. По-своему.' : (has('богдан', 'старост') ? 'Староста Богдан — человек тяжёлый, но справедливый.' : 'Жрица Лия? Она свет. Поговори с ней, если тяжело.'));
    return { ok: true };
  }

  // — «где я» — осознание (день 6) —
  if (has('где я', 'это где', 'какой мир', 'как называется этот мир', 'куда я попал')) {
    advanceTime(15);
    if (npc.id === 'lia' || npc.id === 'severin') {
      say('npc', npc.id === 'lia'
        ? 'Мир зовётся Элар. Северные баронства, Пламя Рассвета, тракт до столицы Вельм. Ты не первый, кто спрашивает так — будто очнулся в чужом доме.'
        : 'Элар, друг. Северные баронства, наша глушь. Ты не первый путник, заблудившийся между мирами. Книги такое помнят.');
      qprog('askwhere');
      qprog('temple');
      say('sys', 'Имена складываются в картину. Мир обретает имя: Элар. Ты больше не совершенно слеп.');
    } else {
      say('npc', 'Как это — где? ' + VILLAGE_NAME + ', баронство Вельм… Ты точно здоров?');
    }
    return { ok: true };
  }

  // — долг Эрика (квест) —
  if (has('долг', 'ростислав должен', 'должен ростиславу') && (npc.id === 'erik' || npc.id === 'rostislav')) {
    advanceTime(10);
    if (npc.id === 'erik') {
      if (!g.quests.active.some(q => q.id === 'q-debt') && !g.quests.completed.includes('q-debt')) {
        if (r.trust >= 10) {
          activateQuest('q-debt');
          say('npc', '…Откуда ты… Ладно. Я должен Ростиславу сто двадцать монет. Проценты глотают меня заживо. Поговори с ним? Может, без меня он будет сговорчивее.');
        } else say('npc', pickLine(bank.refuse));
      } else say('npc', 'Ты уже знаешь больше, чем мне хотелось бы. Спасибо, что не разнёс по деревне.');
    } else { // Ростислав
      const q = g.quests.active.find(q => q.id === 'q-debt');
      if (q) {
        if (g.player.money >= 120 && has('заплат', 'верн', 'отдам долг')) {
          g.player.money -= 120;
          qprog('debtdone');
          say('npc', 'О-о, монета! За Эрика? Записано. Долг закрыт, расписка — в печку. С тобой приятно иметь дело.');
          say('good', 'Долг Эрика закрыт (−120 м.).');
        } else if (has('прощ', 'спис', 'убрать процент')) {
          if (hasKnowledge('psychology') || (g.player.skills.speech?.lvl || 0) >= 2) {
            qprog('debtdone');
            changeRel('rostislav', { respect: 5 });
            say('npc', 'Хм… Убеди…ть? Ты говоришь как писарь из казначейства. Ладно! Проценты списываю, тело долга — по вкусу доброты. Но только потому, что понравился.');
            say('good', 'Ты уговорил Ростислава списать проценты. Красноречие — тоже оружие.');
          } else {
            say('npc', 'Простить? Ха. Ты, милочек, не в храме. Проценты капают.');
            say('sys', 'Нужны знания «Психология» или навык Красноречия 2+.');
          }
        } else {
          say('npc', 'Эриковы сто двадцать? Пусть принесёт. Или пусть его друг принесёт. Проценты, само собой, сверху.');
        }
      } else say('npc', 'Долги? У меня их все имеют, а я — ни одного. Приятно быть собой.');
    }
    return { ok: true };
  }

  // — письмо Юстины —
  if (has('письм') && npc.id === 'justina') {
    if (!g.quests.active.some(q => q.id === 'q-letter') && !g.quests.completed.includes('q-letter')) {
      if (r.sympathy >= 10) {
        activateQuest('q-letter');
        addItem('letter', 1);
        say('npc', 'Ты… не из болтливых, я вижу. Возьми письмо. Караванщику Горму, на северный тракт, когда придёт обоз. Никому ни слова, особенно отцу.');
        say('sys', '✉ Ты получил «Письмо Юстины». Дождись каравана на северном тракте.');
      } else say('npc', 'Письмо? Какое письмо? Не знаю никаких писем.');
    } else if (g.world.flags.letterDelivered && !g.world.flags.justinaEscape) {
      say('npc', 'Ты… отдал? Что он сказал?');
      say('you', '(ты пересказываешь ответ Горма: караван вернётся через месяц и возьмёт пассажира)');
      g.world.flags.justinaEscape = true;
      changeRel('justina', { sympathy: 10, trust: 10, romantic: 10 });
      say('npc', 'Месяц. Значит, месяц. Я буду готова. Спасибо тебе… больше, чем спасибо.');
      say('good', '⚡ Ты изменил будущее: свадьба уже не будет такой, как планировал староста.');
    } else if (countItem('letter') > 0) {
      say('npc', 'Караван будет на тракте. Отдай в руки Горму. И… спасибо.');
    } else say('npc', 'Ты уже сделал для меня больше, чем следовало.');
    return { ok: true };
  }

  // — травы для Греты —
  if (has('трав') && npc.id === 'greta' && has('принес', 'собрать', 'нужн', 'заказ')) {
    if (!g.quests.active.some(q => q.id === 'q-herbs') && !g.quests.completed.includes('q-herbs')) {
      activateQuest('q-herbs');
      say('npc', 'Нужны! Пять пучков лечебной травы с опушки — и я в долгу перед тобой. И зельями.');
    } else say('npc', 'Жду травы. Лес щедрый, если знать, где смотреть.');
    return { ok: true };
  }

  // — обычная болтовня —
  advanceTime(5);
  const small = [
    'Ну, бывает и такое.',
    'Хм. Подумать есть над чем.',
    'Это ты к слову или к делу?',
    'Жизнь — она вообще занятная штука.',
  ];
  say('npc', pickLine(bank.greet.concat(small)));
  if (st.talkedToday === undefined) st.talkedToday = 0;
  st.talkedToday += 1;
  if (st.talkedToday <= 3) changeRel(D.npcId, { sympathy: 0.3, trust: 0.2 });
  return { ok: true };
}

/* ---------------- СЛОТЫ: предметы и числа ---------------- */
export function matchItem(t) {
  const map = [
    ['хлеб', 'bread'], ['вод', 'water'], ['сыр', 'cheese'], ['яблок', 'apple'],
    ['мяс', 'meat'], ['жарк', 'meat'], ['дичь', 'meat'], ['медов', 'mead'], ['хмель', 'mead'],
    ['трав', 'herb'], ['зель', 'potion'], ['лекарств', 'potion'], ['бинт', 'bandage'],
    ['нож', 'knife'], ['дубин', 'club'], ['палк', 'club'], ['топор', 'axe'], ['меч', 'sword'],
    ['лопат', 'shovel'], ['факел', 'torch'], ['рубах', 'shirt'], ['рубашк', 'shirt'],
    ['плащ', 'cloak'], ['шапк', 'cap'], ['сапог', 'boots'], ['шкур', 'pelt'], ['мех', 'pelt'],
    ['хворост', 'wood'], ['зерн', 'grain'], ['мук', 'flour'], ['цвет', 'flower'], ['кольц', 'ring'],
    ['письм', 'letter'],
  ];
  for (const [stem, id] of map) if (t.includes(stem)) return id;
  return null;
}

export function matchQty(t) {
  const nums = { 'один': 1, 'одну': 1, 'два': 2, 'две': 2, 'пара': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10 };
  for (const [w, n] of Object.entries(nums)) if (new RegExp('\\b' + w + '\\b').test(t)) return n;
  const m = t.match(/\b(\d{1,3})\b/);
  if (m) return Math.min(50, parseInt(m[1], 10));
  return 1;
}
