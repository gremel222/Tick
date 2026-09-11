/* ============================================================
   ПАНЕЛИ: Карта (M), Персонаж (C), Инвентарь (I), Журнал (J/Q), Меню (Esc)
   ============================================================ */
import * as engine from '../game/engine.js';
import * as saves from '../game/saves.js';
import * as acc from '../api/local.js';
import { openModal, closeModal, toast, esc, bar, fmtMin } from '../ui.js';
import { navigate } from '../router.js';
import { LOCATIONS, REGIONS, ITEMS, ACHIEVEMENTS, QUESTS, REL_STAGES, RECIPES, KNOWLEDGE_FX, NPCS } from '../game/data.js';
import { canonList, heardRumors, importantMemories } from '../game/memory.js';
import { download } from '../screens/public.js';

const account = () => acc.current()?.email || null;

function head(title) {
  return `<div class="modal-head"><h2>${title}</h2><button class="btn btn-sm close">✕</button></div><div class="modal-body"></div>`;
}
function bindClose(overlay) {
  overlay.querySelector('.close').addEventListener('click', closeModal);
}

/* ---------------- КАРТА (M) ---------------- */
const MAP_POS = {
  'forest-deep': [90, 280], 'forest-edge': [230, 280],
  'village-square': [410, 280],
  'village-tavern': [340, 165], 'village-smithy': [480, 165],
  'village-shop': [340, 400], 'village-temple': [480, 400],
  'village-fields': [410, 490],
  'road-north': [630, 165], 'road-south': [630, 400],
};
const ICON_STATUS = { visited: '✓', unknown: '?' };

export function openMap() {
  const g = engine.getG(); if (!g) return;
  const edges = [];
  for (const [id, loc] of Object.entries(LOCATIONS))
    for (const exit of Object.keys(loc.exits))
      if (id < exit) edges.push([MAP_POS[id], MAP_POS[exit]]);
  const nodes = Object.entries(MAP_POS).map(([id, [x, y]]) => {
    const loc = LOCATIONS[id];
    const region = REGIONS[loc.region];
    const visited = g.world.flags.visited.includes(id);
    const here = g.player.location === id;
    return `<g class="map-node ${visited ? 'visited' : ''}" data-loc="${id}">
      <circle cx="${x}" cy="${y}" r="20" fill="${visited ? region.color : '#1a2332'}" opacity="${visited ? 0.92 : 0.55}" stroke="${here ? '#a259ff' : '#2b3646'}" stroke-width="${here ? 4 : 2}"/>
      <text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15">${loc.icon}</text>
      <text x="${x}" y="${y + 38}" text-anchor="middle">${visited ? esc(loc.name) : '???'}</text>
      ${visited ? '' : `<text x="${x + 22}" y="${y - 12}" font-size="12" fill="#57657a">?</text>`}
    </g>`;
  }).join('');
  const overlay = openModal(head('Карта окрестностей'));
  overlay.querySelector('.modal-body').innerHTML = `
      <div class="map-wrap"><svg class="map-svg" viewBox="0 0 760 560">
        ${edges.map(([a, b]) => `<line class="map-edge" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`).join('')}
        ${nodes}
      </svg></div>
      <div class="legend">
        <span><span style="color:${REGIONS.village.color}">●</span> деревня</span>
        <span><span style="color:${REGIONS.forest.color}">●</span> лес</span>
        <span><span style="color:${REGIONS.road.color}">●</span> тракт</span>
        <span>✕ ты здесь</span>
        <span>? не был</span>
      </div>
      <p class="hint">Клик по соседней точке — пойти туда. Точнее: «идти в деревню», «в глубину леса».</p>`;
  bindClose(overlay);
  overlay.querySelectorAll('.map-node').forEach(n => n.addEventListener('click', () => {
    const id = n.dataset.loc;
    if (!LOCATIONS[g.player.location].exits[id]) { toast('Туда отсюда напрямую не пройти.'); return; }
    closeModal();
    engine.doAction({ type: 'move', target: id });
  }));
}

/* ---------------- ПЕРСОНАЖ (C) ---------------- */
export function openCharacter() {
  const g = engine.getG(); if (!g) return;
  const p = g.player;
  const statLine = (k, val) => `<div class="stat-line"><span class="name">${engine.statName(k)}</span>${bar('', val, 10)}<span class="val">${val}</span></div>`;
  const overlay = openModal(head('Персонаж'));
  overlay.querySelector('.modal-body').innerHTML = `
    <div class="sec-title">Основное</div>
    <p><b>${esc(p.name)}</b>, ${p.age} лет · уровень ${p.level} (${p.xp}/${p.level * 100} XP)</p>
    <p class="muted" style="font-size:.92em">Был: ${esc(p.pastProfession)} · характер: ${esc(p.personality)} · смерть: ${esc(p.deathReason)} · мир: ${p.worldType === 'known' ? 'знакомый' : p.worldType === 'partial' ? 'смутно знакомый' : 'чужой'}</p>
    <div class="sec-title">Характеристики</div>
    ${Object.entries(p.stats).map(([k, v]) => statLine(k, v)).join('')}
    <div class="sec-title">Состояние</div>
    <div class="stat-line"><span class="name">Здоровье</span>${bar('hp', p.hp.current, p.hp.max)}<span class="val">${Math.round(p.hp.current)}</span></div>
    <div class="stat-line"><span class="name">Энергия</span>${bar('energy', p.energy.current, p.energy.max)}<span class="val">${Math.round(p.energy.current)}</span></div>
    <div class="stat-line"><span class="name">Голод</span>${bar('hunger', p.hunger, 100)}<span class="val">${Math.round(p.hunger)}</span></div>
    <div class="stat-line"><span class="name">Жажда</span>${bar('thirst', p.thirst, 100)}<span class="val">${Math.round(p.thirst)}</span></div>
    <div class="sec-title">Навыки</div>
    ${Object.entries(p.skills).length ? Object.entries(p.skills).map(([id, s]) => `<div class="stat-line"><span class="name">${engine.skillName(id)}${s.xp ? ` <span class="muted mono" style="font-size:.75em">${s.xp}/${50 * (s.lvl + 1)}</span>` : ''}</span><span class="val">ур. ${s.lvl}</span></div>`).join('') : '<p class="muted">Пока пусто. Навыки растут от дела: работа, бой, торговля, травы.</p>'}
    <div class="sec-title">Знания прошлой жизни</div>
    ${p.pastKnowledge.length ? p.pastKnowledge.map(k => `<p style="margin:4px 0">✦ <b>${KNOWLEDGE_FX[k]?.label || k}</b> <span class="muted" style="font-size:.88em">— ${KNOWLEDGE_FX[k]?.fx || ''}</span></p>`).join('') : '<p class="muted">Не вспомнил ничего полезного.</p>'}
    <div class="sec-title">Бой</div>
    <p class="mono" style="font-size:.9em">Атака: ${engine.combatStats().atk} · Защита: ${engine.combatStats().def} · Оружие: ${esc(engine.combatStats().weaponName)}</p>`;
  bindClose(overlay);
}

/* ---------------- ИНВЕНТАРЬ (I) ---------------- */
export function openInventory() {
  const g = engine.getG(); if (!g) return;
  const p = g.player;
  const overlay = openModal(head('Инвентарь'));
  const body = overlay.querySelector('.modal-body');
  const itemSlot = (id, qty, extra = '') => {
    const it = ITEMS[id];
    return `<div class="inv-slot ${extra}" data-item="${id}"><span class="ic">${it.emoji}</span><span class="qty">${qty > 1 ? '×' + qty : ''}</span></div>`;
  };
  const render = (selId) => {
    const slots = p.inventory.slice(0, 20);
    const equip = p.equipment;
    const sel = selId && ITEMS[selId] ? ITEMS[selId] : null;
    const selQty = selId ? engine.countItem(selId) : 0;
    const equipped = Object.entries(equip).filter(([, v]) => v === selId).length > 0;
    body.innerHTML = `
      <p><span class="money">🪙 ${p.money} м.</span></p>
      <div class="sec-title">Сумка (${p.inventory.length} видов)</div>
      <div class="inv-grid">${slots.map(s => itemSlot(s.id, s.qty)).join('')}${Array.from({ length: Math.max(0, 10 - slots.length) }).map(() => '<div class="inv-slot empty"></div>').join('')}</div>
      <div class="sec-title">Экипировка</div>
      <div class="equip-row">
        ${[['head', 'Голова'], ['body', 'Тело'], ['legs', 'Ноги'], ['weapon', 'Оружие']].map(([slot, label]) => `
          <div class="equip-slot"><div class="inv-slot ${equip[slot] ? '' : 'empty'}" ${equip[slot] ? `data-item="${equip[slot]}"` : ''}>${equip[slot] ? `<span class="ic">${ITEMS[equip[slot]].emoji}</span>` : '<span class="ic" style="opacity:.3">·</span>'}</div>${label}</div>`).join('')}
      </div>
      <div class="weight-bar">${bar('energy', engine.carryWeight(), engine.maxWeight())}
      <span class="bar-label">Вес: ${engine.carryWeight()} / ${engine.maxWeight()}</span></div>
      ${sel ? `
        <div class="card" style="margin-top:14px">
          <b>${sel.emoji} ${esc(sel.name)}</b> ${selQty > 1 ? '×' + selQty : ''} ${equipped ? '<span class="tag">надето</span>' : ''}
          <p class="muted" style="font-size:.9em">${esc(sel.desc)}</p>
          <div class="row">
            ${sel.food ? `<button class="btn btn-sm" data-use="${selId}">🍖 Съесть</button>` : ''}
            ${sel.drink ? `<button class="btn btn-sm" data-use="${selId}">💧 Выпить</button>` : ''}
            ${sel.heal ? `<button class="btn btn-sm" data-use="${selId}">🩹 Использовать</button>` : ''}
            ${sel.slot && !equipped ? `<button class="btn btn-sm" data-equip="${selId}">Надеть</button>` : ''}
            ${equipped ? `<button class="btn btn-sm" data-unequip="${Object.keys(equip).find(k => equip[k] === selId)}">Снять</button>` : ''}
          </div>
        </div>` : ''}
      <p class="hint" style="margin-top:12px">Крафт: «сделать бинт/факел/дубину» · Рецепты: ${RECIPES.map(r => `${ITEMS[r.out].name} (${Object.entries(r.need).map(([id, n]) => ITEMS[id].name.toLowerCase() + '×' + n).join(', ')})`).join(' · ')}</p>`;
    body.querySelectorAll('[data-item]').forEach(el => el.addEventListener('click', () => render(el.dataset.item)));
    body.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.use;
      const it = ITEMS[id];
      closeModal();
      if (it.food) engine.doAction({ type: 'eat', item: id });
      else if (it.drink) engine.doAction({ type: 'drink', item: id });
      else if (it.heal) engine.doAction({ type: 'drink', item: id }); // лечение через actDrink
    }));
    body.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => { engine.equip(b.dataset.equip); render(b.dataset.equip); }));
    body.querySelectorAll('[data-unequip]').forEach(b => b.addEventListener('click', () => { engine.unequip(b.dataset.unequip); render(null); }));
  };
  render(null);
  bindClose(overlay);
}

/* ---------------- ЖУРНАЛ (J/Q) ---------------- */
export function openJournal(tab = 'quests') {
  const g = engine.getG(); if (!g) return;
  const overlay = openModal(head('Журнал'));
  const body = overlay.querySelector('.modal-body');
  const tabs = [
    ['quests', 'Квесты'], ['events', 'События'], ['people', 'Люди'],
    ['rumors', 'Слухи'], ['canon', 'Канон'], ['history', 'История'],
  ];
  const render = (id) => {
    let html = '';
    if (id === 'quests') {
      html += (g.quests.active.length ? g.quests.active.map(q => {
        const def = QUESTS[q.id];
        return `<div class="list-item"><div class="ic">❗</div><div style="flex:1">
          <div class="q-title">${esc(def.title)}</div><div class="muted" style="font-size:.9em">${esc(def.desc)}</div>
          ${Object.entries(q.goals).map(([k, go]) => `<div class="q-goal ${go.have >= go.need ? 'done' : ''}">• ${goalLabel(k)}: ${go.have}/${go.need}</div>`).join('')}
          ${q.id === 'd7-choice' && !g.world.flags.lifeChoice ? `
            <div class="row" style="margin-top:8px">
              <button class="btn btn-sm" data-choice="canon">Идти за каноном истории</button>
              <button class="btn btn-sm" data-choice="own">Жить своей жизнью</button>
            </div>` : ''}
        </div></div>`;
      }).join('') : '<p class="muted">Активных задач нет. Живи — мир подкинет.</p>');
      if (g.world.flags.lifeChoice) html += `<p class="ok-box">Большой выбор сделан: <b>${g.world.flags.lifeChoice === 'canon' ? 'идти за каноном истории' : 'жить своей жизнью'}</b>. Мир уже другое место.</p>`;
      html += '<div class="sec-title">Завершённые</div>';
      html += g.quests.completed.length ? g.quests.completed.map(qid => `<div class="list-item"><div class="ic">✅</div><div>${esc(QUESTS[qid]?.title || qid)}</div></div>`).join('') : '<p class="muted">Пока пусто.</p>';
    }
    if (id === 'events') {
      const imp = importantMemories();
      html += imp.length ? imp.slice().reverse().map(m => `<div class="list-item"><div class="ic">⭐</div><div>День ${m.day}: ${esc(m.text)}<div class="muted" style="font-size:.85em">свидетели: ${m.witnesses.length ? esc(m.witnesses.join(', ')) : 'никто'}</div></div></div>`).join('') : '<p class="muted">Важных событий пока не было.</p>';
    }
    if (id === 'people') {
      const known = NPCS.filter(n => g.world.npcs[n.id].known);
      html += known.length ? known.map(n => {
        const st = g.world.npcs[n.id];
        const loc = engine.npcLocation(n);
        const place = loc.startsWith('home:') ? 'дома' : LOCATIONS[loc]?.name;
        return `<div class="list-item"><div class="ic">${n.emoji}</div><div style="flex:1">
          <b>${esc(n.name)}</b> <span class="muted">· ${esc(n.profession)}</span>
          <div class="muted" style="font-size:.88em">Отношения: <b>${esc(engine.stageName(n.id))}</b> · сейчас: ${esc(place)}</div>
          <div class="rel-mini">
            <span class="rel-pill">доверие ${Math.round(st.rel.trust)}</span>
            <span class="rel-pill">симпатия ${Math.round(st.rel.sympathy)}</span>
            <span class="rel-pill">подозрение ${Math.round(st.rel.suspicion)}</span>
            ${st.rel.romantic > 5 ? `<span class="rel-pill">❤ ${Math.round(st.rel.romantic)}</span>` : ''}
          </div>
        </div></div>`;
      }).join('') : '<p class="muted">Ты ещё никого не встретил.</p>';
    }
    if (id === 'rumors') {
      const hr = heardRumors();
      const truthLabel = { truth: 'правда', partial: 'частично', exaggeration: 'преувеличение', lie: 'ложь', disinformation: 'деза' };
      html += hr.length ? hr.slice().reverse().map(r => `<div class="list-item"><div class="ic">🗣️</div><div>«${esc(r.text)}»<div class="muted" style="font-size:.85em">день ${r.day} · источник: ${esc(String(r.sourceNpc))} · ${truthLabel[r.truth] || ''}</div></div></div>`).join('') : '<p class="muted">Слухов на слуху нет. Поговори с Агатой или в таверне.</p>';
    }
    if (id === 'canon') {
      const statusLabel = { planned: 'по расписанию', happened: 'сбылось', changed: 'изменено тобой', skipped: 'не состоялось' };
      html += `<p class="muted" style="font-size:.9em">«История, которой не было»: отклонения канона — ${g.world.stats.canonDeviations}.</p>`;
      html += canonList().map(c => `<div class="list-item"><div class="ic">${c.status === 'changed' ? '⚡' : c.status === 'happened' ? '📜' : '🗓'}</div><div>
        <b>${esc(c.title)}</b> <span class="muted">· день ${c.plannedDay} · ${statusLabel[c.status]}</span>
        <div class="muted" style="font-size:.9em">${esc(c.desc)}</div>
        ${c.deviationReason ? `<div style="color:#7ee2a8;font-size:.9em">⚡ ${esc(c.deviationReason)}</div>` : ''}
      </div></div>`).join('');
    }
    if (id === 'history') {
      html += g.history.length ? g.history.slice(0, 60).map(h => `<div class="list-item"><div class="ic mono muted">${h.day}д</div><div>${esc(h.text)}</div></div>`).join('') : '<p class="muted">Твоя история только начинается.</p>';
    }
    body.innerHTML = `<div class="tabs">${tabs.map(([tid, t]) => `<button class="tab ${tid === id ? 'on' : ''}" data-t="${tid}">${t}</button>`).join('')}</div>` + html;
    body.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => render(b.dataset.t)));
    body.querySelectorAll('[data-choice]').forEach(b => b.addEventListener('click', () => {
      g.world.flags.lifeChoice = b.dataset.choice;
      engine.qprog('choose');
      engine.log('good', b.dataset.choice === 'canon'
        ? 'Ты выбираешь идти за каноном истории. Теперь ты помнишь расписание судьбы — и будешь успевать к событиям.'
        : 'Ты выбираешь свою жизнь. Пусть история катится сама — у тебя другие планы.');
      engine.record('important', 'сделал большой выбор: ' + (b.dataset.choice === 'canon' ? 'канон' : 'своя жизнь'), []);
      render('quests');
    }));
  };
  render(tab);
  bindClose(overlay);
}

const GOAL_LABELS = {
  drink: 'Напиться воды', look: 'Осмотреться', visit2: 'Посетить мест', talk: 'Заговорить с кем-то',
  aboutself: 'Рассказать о себе', job: 'Отработать смену', buyfood: 'Купить еды', famous: 'Узнать первое имя',
  temple: 'Побывать в храме', askwhere: 'Спросить, где ты', choose: 'Сделать выбор',
  killwolf: 'Волков добыто', herbs: 'Трав собрано', debtdone: 'Закрыть долг', letter: 'Доставить письмо',
};
function goalLabel(k) { return GOAL_LABELS[k] || k; }

/* ---------------- МЕНЮ (Esc) ---------------- */
export function openMenu() {
  const g = engine.getG(); if (!g) return;
  const overlay = openModal(head('Меню'));
  overlay.querySelector('.modal-body').innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <button class="btn" data-m="continue">▶ Продолжить</button>
      <button class="btn" data-m="save">💾 Сохранить / загрузить</button>
      <button class="btn" data-m="settings">⚙ Настройки</button>
      <button class="btn" data-m="profile">👤 Профиль</button>
      <button class="btn" data-m="bug">🐞 Сообщить о проблеме</button>
      <button class="btn" data-m="help">❓ Помощь</button>
      <button class="btn" data-m="main">🏠 Выйти в главное</button>
      <button class="btn" data-m="logout">🚪 Выйти из аккаунта</button>
    </div>
    <p class="hint" style="margin-top:14px">Автосейв — каждые 5 минут. «Попаданец — Живой мир» v0.1-прототип.</p>`;
  bindClose(overlay);
  overlay.querySelector('[data-m=continue]').addEventListener('click', closeModal);
  overlay.querySelector('[data-m=save]').addEventListener('click', openSavePanel);
  overlay.querySelector('[data-m=settings]').addEventListener('click', () => { closeModal(); navigate('/settings'); });
  overlay.querySelector('[data-m=profile]').addEventListener('click', () => { closeModal(); navigate('/profile'); });
  overlay.querySelector('[data-m=bug]').addEventListener('click', openBugReport);
  overlay.querySelector('[data-m=help]').addEventListener('click', () => { closeModal(); engine.doAction({ type: 'help' }); });
  overlay.querySelector('[data-m=main]').addEventListener('click', () => { closeModal(); navigate('/'); });
  overlay.querySelector('[data-m=logout]').addEventListener('click', () => { acc.logout(); closeModal(); navigate('/'); });
}

/* ---------------- СЕЙВЫ ---------------- */
export function openSavePanel() {
  const g = engine.getG(); if (!g) return;
  const accEmail = account();
  const overlay = openModal(head('Сохранения (snapshot, 5 слотов)'));
  const body = overlay.querySelector('.modal-body');
  const render = () => {
    const all = saves.listSaves(accEmail);
    body.innerHTML = `
      ${['auto', 1, 2, 3, 4, 5].map(s => {
        const sv = all[s];
        return `<div class="list-item"><div class="ic">${sv ? '🌿' : '🕳️'}</div>
          <div style="flex:1"><b>${s === 'auto' ? 'Автосейв' : 'Слот ' + s}</b>
          ${sv ? `<div class="muted" style="font-size:.88em">${esc(sv.name)} · день ${sv.day} · ${fmtMin(Date.now() - sv.savedAt)}</div>` : '<div class="muted" style="font-size:.88em">пусто</div>'}</div>
          <div class="row">
            <button class="btn btn-sm btn-accent" data-save="${s}">Сохранить</button>
            ${sv ? `<button class="btn btn-sm" data-load="${s}">Загрузить</button><button class="btn btn-sm btn-danger" data-del="${s}">✕</button>` : ''}
          </div></div>`;
      }).join('')}
      <div class="row" style="margin-top:14px">
        <button class="btn" id="sv-export">📤 Экспорт (JSON)</button>
        <button class="btn" id="sv-import">📥 Импорт</button>
        <input type="file" id="sv-file" accept=".json" style="display:none">
      </div>`;
    body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
      saves.saveToSlot(accEmail, b.dataset.save, g);
      toast('Сохранено: ' + (b.dataset.save === 'auto' ? 'автосейв' : 'слот ' + b.dataset.save));
      render();
    }));
    body.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
      const data = saves.loadSlot(accEmail, b.dataset.load);
      if (!data) return;
      closeModal();
      engine.loadGame(data);
      engine.catchUpOffline();
      toast('Загружено. Мир жил без тебя — и дождался.');
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      if (confirm('Удалить сохранение?')) { saves.deleteSlot(accEmail, b.dataset.del); render(); }
    }));
    document.getElementById('sv-export').addEventListener('click', () => {
      const json = saves.exportSave(g);
      download(`popadanets-${g.player.name}-day${g.world.day}.json`, json);
    });
    document.getElementById('sv-import').addEventListener('click', () => document.getElementById('sv-file').click());
    document.getElementById('sv-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const res = saves.importSave(await f.text());
      if (!res.ok) { toast(res.error); return; }
      saves.saveToSlot(accEmail, 'auto', res.data);
      engine.loadGame(res.data);
      closeModal();
      toast('Импортировано.');
    });
  };
  render();
  bindClose(overlay);
}

/* ---------------- БАГ-РЕПОРТ ---------------- */
export function openBugReport() {
  const overlay = openModal(head('Сообщить о проблеме'));
  overlay.querySelector('.modal-body').innerHTML = `
    <p class="muted" style="margin-top:0;font-size:.92em">Опиши, что случилось — репорт сохранится локально (в полной версии уйдёт в Sentry/почту автора).</p>
    <textarea class="input" id="bug-text" rows="5" placeholder="Что произошло, что делал перед этим…"></textarea>
    <button class="btn btn-accent" id="bug-send" style="margin-top:12px">Отправить</button>`;
  bindClose(overlay);
  document.getElementById('bug-send').addEventListener('click', () => {
    const t = document.getElementById('bug-text').value.trim();
    if (!t) return;
    const list = JSON.parse(localStorage.getItem('pop:bugs') || '[]');
    list.push({ at: new Date().toISOString(), text: t, day: engine.getG()?.world.day });
    localStorage.setItem('pop:bugs', JSON.stringify(list));
    closeModal();
    toast('Спасибо! Отчёт записан.');
  });
}
