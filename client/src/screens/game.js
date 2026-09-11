/* ============================================================
   ГЛАВНЫЙ ЭКРАН ИГРЫ (GameMain, раздел 6.3) + выбор сохранений
   ============================================================ */
import * as engine from '../game/engine.js';
import * as saves from '../game/saves.js';
import * as acc from '../api/local.js';
import { openModal, closeModal, modalOpen, toast, esc, bar, fmtMin } from '../ui.js';
import * as panels from '../components/panels.js';
import * as dlgUI from '../components/dialogue-ui.js';
import * as cmbUI from '../components/combat-ui.js';
import { navigate } from '../router.js';
import { LOCATIONS, REGIONS, ITEMS, ACHIEVEMENTS } from '../game/data.js';
import * as audio from '../game/audio.js';

let cleanup = null;
let logRendered = 0;
let pendingAchievementCheck = false;
let lastLoc = null;       // для звука шага и смены эмбиента
let combatAudio = false;  // в бою — свой эмбиент

/* синхронизация эмбиента с текущим регионом */
function syncAmbient() {
  if (combatAudio) return;
  const g = engine.getG(); if (!g) return;
  const loc = LOCATIONS[g.player.location]; if (!loc) return;
  audio.setAmbient(loc.region, g.world.weather);
}

export function render(root) {
  if (cleanup) { cleanup(); cleanup = null; }
  dlgUI.unmount();
  cmbUI.unmount();
  closeModal();

  const params = new URLSearchParams(location.search);
  const account = acc.current()?.email || null;

  if (params.get('start') && window.__pendingChar) {
    engine.newGame(window.__pendingChar, { account });
    window.__pendingChar = null;
    engine.G.world.flags.stoodUp = true;
    engine.log('sys', 'Ты поднимаешься на ноги. Колени дрожат, но держат. Первый шаг сделан.');
    engine.describeArrival(engine.G.player.location);
    saves.autoSave(account);
    history.replaceState({}, '', '/play');
    pendingAchievementCheck = true; // проверим ачивки после подписки UI (иначе тост не увидим)
  } else if (params.get('story') && window.__pendingChar) {
    engine.storyContinue(window.__pendingChar);
    window.__pendingChar = null;
    engine.describeArrival('village-square');
    saves.autoSave(account);
    history.replaceState({}, '', '/play');
  }

  if (!engine.getG()) { renderSaveSelect(root); return; }
  renderGame(root);
  if (pendingAchievementCheck) { pendingAchievementCheck = false; engine.checkAchievements(); }
}

/* ---------------- ВЫБОР СОХРАНЕНИЯ ---------------- */
function renderSaveSelect(root) {
  const account = acc.current()?.email || null;
  const all = saves.listSaves(account);
  const slots = ['auto', 1, 2, 3, 4, 5];
  root.innerHTML = `
  <div class="landing">
    <header class="site-header"><div class="container">
      <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
      <nav><a href="/" data-link>Главная</a><a href="/wiki" data-link>Вики</a>${account ? `<a href="/profile" data-link>${esc(account)}</a>` : '<a href="/login" data-link>Войти</a>'}</nav>
    </div></header>
    <div class="page container" style="max-width:760px">
      <h1>${account ? 'Твои жизни' : 'Твои жизни (гость)'}</h1>
      ${account ? '' : '<p class="muted">Играй как гость — сейвы живут в этом браузере. <a href="/register" data-link>Аккаунт</a> — для порядка и рейтинга.</p>'}
      ${slots.map(s => {
        const sv = all[s];
        return `<div class="card" style="margin-bottom:12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="font-size:1.6em">${sv ? '🌿' : '🕳️'}</div>
          <div style="flex:1;min-width:200px">
            <b>${s === 'auto' ? 'Автосейв' : 'Слот ' + s}</b>
            ${sv ? `<div class="muted" style="font-size:.9em">${esc(sv.name)} · день ${sv.day} · ур.${sv.level} · ${sv.mode === 'hardcore' ? 'хардкор' : sv.mode === 'story' ? 'сюжет' : 'обычный'} · ${fmtMin(Date.now() - sv.savedAt)}</div>` : '<div class="muted" style="font-size:.9em">пусто</div>'}
          </div>
          ${sv ? `<button class="btn btn-accent btn-sm" data-load="${s}">Продолжить</button><button class="btn btn-sm btn-danger" data-del="${s}">Удалить</button>` : ''}
        </div>`;
      }).join('')}
      <div class="row" style="margin-top:18px">
        <button class="btn btn-accent" id="new-life" style="font-size:1.05em;padding:13px 26px">✨ Новая жизнь</button>
        <button class="btn" id="import-save">📥 Импорт сейва</button>
        <input type="file" id="import-file" accept=".json,application/json" style="display:none">
      </div>
    </div>
  </div>`;

  root.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
    const data = saves.loadSlot(account, b.dataset.load);
    if (!data) return;
    engine.loadGame(data);
    engine.catchUpOffline();
    navigate('/play');
    toast('Мир догнал время без тебя. Продолжаем.');
  }));
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (confirm('Удалить сохранение?')) { saves.deleteSlot(account, b.dataset.del); render(root); }
  }));
  document.getElementById('new-life').addEventListener('click', () => navigate('/character/create'));
  document.getElementById('import-save').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const res = saves.importSave(await f.text());
    if (!res.ok) { toast(res.error); return; }
    saves.saveToSlot(account, 'auto', res.data);
    engine.loadGame(res.data);
    navigate('/play');
    toast('Сохранение импортировано.');
  });
}

/* ---------------- ИГРА ---------------- */
function renderGame(root) {
  const account = acc.current()?.email || null;
  root.innerHTML = `
  <div class="game" id="game-root">
    <div class="topbar">
      <span class="weather" id="tb-weather">☀️</span>
      <span class="dt" id="tb-dt">06:00</span>
      <span class="day" id="tb-day">День 1</span>
      <span class="day" id="tb-part">утро</span>
      <span class="spacer"></span>
      <span class="day" id="tb-mode">обычный</span>
      <button class="iconbtn" id="tb-menu" title="Меню (Esc)">☰</button>
    </div>
    <div class="status-strip" id="status-strip"></div>
    <div class="world-area">
      <div class="loc-head" id="loc-head"></div>
      <div class="narrative" id="narrative"></div>
    </div>
    <div class="action-row" id="action-row"></div>
    <form class="input-line" id="input-form">
      <span class="prefix">&gt;</span>
      <input id="free-input" autocomplete="off" placeholder="Что ты делаешь? Напиши свободно… (помощь — список команд)">
      <button class="btn btn-accent" type="submit">↵</button>
    </form>
    <nav class="bottom-menu">
      <button id="bm-map"><span class="ic">🗺️</span><span class="key">M</span><span class="lbl">Карта</span></button>
      <button id="bm-char"><span class="ic">🧍</span><span class="key">C</span><span class="lbl">Персонаж</span></button>
      <button id="bm-inv"><span class="ic">🎒</span><span class="key">I</span><span class="lbl">Инвентарь</span></button>
      <button id="bm-journal"><span class="ic">📖</span><span class="key">J</span><span class="lbl">Журнал</span></button>
      <button id="bm-quests"><span class="ic">❗</span><span class="key">Q</span><span class="lbl">Квесты</span></button>
      <button id="bm-menu"><span class="ic">☰</span><span class="key">Esc</span><span class="lbl">Меню</span></button>
    </nav>
  </div>`;

  logRendered = 0;
  updateAll(true);
  const input = document.getElementById('free-input');
  setTimeout(() => input.focus(), 100);

  /* ввод */
  document.getElementById('input-form').addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    runInput(text);
  });

  /* кнопки нижнего меню */
  const openUI = key => {
    if (dlgUI.isActive()) return;
    audio.sfx('open');
    if (key === 'map') panels.openMap();
    else if (key === 'character') panels.openCharacter();
    else if (key === 'inventory') panels.openInventory();
    else if (key === 'journal') panels.openJournal('quests');
    else if (key === 'menu') panels.openMenu();
  };
  document.getElementById('bm-map').addEventListener('click', () => openUI('map'));
  document.getElementById('bm-char').addEventListener('click', () => openUI('character'));
  document.getElementById('bm-inv').addEventListener('click', () => openUI('inventory'));
  document.getElementById('bm-journal').addEventListener('click', () => openUI('journal'));
  document.getElementById('bm-quests').addEventListener('click', () => openUI('journal'));
  document.getElementById('bm-menu').addEventListener('click', () => openUI('menu'));
  document.getElementById('tb-menu').addEventListener('click', () => openUI('menu'));

  /* хоткеи (4.7) */
  const onKey = e => {
    if (!engine.getG()) return;
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
    if (e.key === 'Enter') { if (!typing) { e.preventDefault(); input.focus(); } return; }
    if (typing) return;
    if (e.code === 'KeyM') { e.preventDefault(); openUI('map'); }
    else if (e.code === 'KeyC') { e.preventDefault(); openUI('character'); }
    else if (e.code === 'KeyI') { e.preventDefault(); openUI('inventory'); }
    else if (e.code === 'KeyJ') { e.preventDefault(); openUI('journal'); }
    else if (e.code === 'KeyQ') { e.preventDefault(); openUI('journal'); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      if (modalOpen()) closeModal();
      else if (dlgUI.isActive()) engine.handleInput('уйти');
      else openUI('menu');
    }
  };
  document.addEventListener('keydown', onKey);

  /* подписка на движок */
  const unsub = engine.subscribe(reason => {
    if (!engine.getG()) return;
    /* — звук: события — */
    if (reason === 'levelup') audio.sfx('levelup');
    else if (reason === 'quest') audio.sfx('quest');
    else if (reason === 'death') audio.sfx('death');
    else if (reason && reason.startsWith('achievement:')) audio.sfx('achievement');
    if (reason === 'combat') { combatAudio = true; audio.sfx('combat'); audio.setAmbient('combat'); }
    if (reason === 'combat:end') { combatAudio = false; syncAmbient(); }
    /* — смена локации: шаг + эмбиент региона — */
    const locNow = engine.getG().player.location;
    if (locNow !== lastLoc) {
      if (lastLoc !== null && reason !== 'new' && reason !== 'load') audio.sfx('step');
      lastLoc = locNow;
      syncAmbient();
    }
    if (reason === 'day') syncAmbient(); // погода нового дня
    if (reason === 'death') { showDeath(); return; }
    if (reason === 'tick') { updateTopbar(); updateStatus(); return; }
    if (reason && reason.startsWith('achievement:')) {
      const a = ACHIEVEMENTS.find(x => x.id === reason.split(':')[1]);
      if (a) toast('«' + a.title + '» получено', { achievement: true, title: 'Достижение' });
      updateAll();
      return;
    }
    if (reason === 'combat') cmbUI.mount();
    if (reason === 'combat:end') cmbUI.unmount();
    if (reason === 'dialogue') dlgUI.mount();
    if (reason === 'dialogue:end') dlgUI.unmount();
    if (reason === 'new' || reason === 'load') { updateAll(true); return; }
    if (reason === 'log') { appendLog(); updateStatus(); return; }
    updateAll();
  });

  /* тик реального времени + автосейв каждые 5 минут (4.6) */
  engine.startRealtimeLoop(() => {
    saves.autoSave(account);
    toast('Автосохранение…', { ms: 1200 });
  });
  const onUnload = () => saves.autoSave(account);
  window.addEventListener('beforeunload', onUnload);

  /* аудио (v0.5): init по первому жесту — политика браузеров; час для птиц */
  audio.setHourProvider(() => {
    const g = engine.getG();
    return g ? Math.floor(g.world.min / 60) : 12;
  });
  const audioInit = () => audio.init();
  window.addEventListener('pointerdown', audioInit, { once: true, capture: true });
  window.addEventListener('keydown', audioInit, { once: true, capture: true });
  syncAmbient(); // стартуем эмбиент региона (заиграет после init)

  /* жесты (4.7): свайп влево — меню, вправо — закрыть; лонг-тап по NPC — осмотр */
  const gameRoot = document.getElementById('game-root');
  let touchStart = null;
  const onTouchStart = e => {
    touchStart = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = e => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return; // короткий/вертикальный — не свайп
    if (dx < 0) openUI('menu');
    else {
      if (modalOpen()) { audio.sfx('close'); closeModal(); }
      else if (dlgUI.isActive()) engine.handleInput('уйти');
      else if (cmbUI.isActive()) engine.handleInput('бежать');
    }
  };
  gameRoot.addEventListener('touchstart', onTouchStart, { passive: true });
  gameRoot.addEventListener('touchend', onTouchEnd, { passive: true });
  let pressTimer = null;
  const pressStart = e => {
    const tag = e.target.closest?.('[data-npc]');
    if (!tag) return;
    const npcId = tag.dataset.npc;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      engine.doAction({ type: 'examine', target: npcId, kind: 'npc' });
    }, 550);
  };
  const pressCancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  gameRoot.addEventListener('touchstart', pressStart, { passive: true });
  gameRoot.addEventListener('touchend', pressCancel, { passive: true });
  gameRoot.addEventListener('touchmove', pressCancel, { passive: true });
  gameRoot.addEventListener('touchcancel', pressCancel);

  cleanup = () => {
    unsub();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onUnload);
    window.removeEventListener('pointerdown', audioInit, { capture: true });
    window.removeEventListener('keydown', audioInit, { capture: true });
    gameRoot.removeEventListener('touchstart', onTouchStart);
    gameRoot.removeEventListener('touchend', onTouchEnd);
    gameRoot.removeEventListener('touchstart', pressStart);
    gameRoot.removeEventListener('touchend', pressCancel);
    gameRoot.removeEventListener('touchmove', pressCancel);
    gameRoot.removeEventListener('touchcancel', pressCancel);
    engine.stopRealtimeLoop();
    audio.stop(); // тихо выходим с игрового экрана
  };
}

export function runInput(text) {
  const res = engine.handleInput(text);
  if (!res) return;
  if (res.ui) {
    if (res.ui === 'map') panels.openMap();
    else if (res.ui === 'inventory') panels.openInventory();
    else if (res.ui === 'journal') panels.openJournal('quests');
    else if (res.ui === 'character') panels.openCharacter();
    else if (res.ui === 'menu') panels.openMenu();
  } else if (res.msg && (res.clarify || !res.ok || res.ok)) {
    engine.log('sys', res.msg);
  }
  updateAll();
}

/* ---------------- ОБНОВЛЕНИЕ БЛОКОВ ---------------- */
function updateAll(logReset = false) {
  const g = engine.getG(); if (!g) return;
  updateTopbar();
  updateStatus();
  updateLocHead();
  updateActionRow();
  if (logReset) {
    const el = document.getElementById('narrative');
    if (el) el.innerHTML = '';
    logRendered = 0;
  }
  appendLog();
}

function updateTopbar() {
  const g = engine.getG();
  document.getElementById('tb-weather').textContent = engine.weatherIcon();
  document.getElementById('tb-weather').title = engine.weatherName();
  document.getElementById('tb-dt').textContent = engine.timeStr();
  document.getElementById('tb-day').textContent = 'День ' + g.world.day;
  document.getElementById('tb-part').textContent = engine.partOfDay() + ', ' + engine.seasonName().toLowerCase();
  document.getElementById('tb-mode').textContent = g.deathMode === 'hardcore' ? '☠ хардкор' : g.deathMode === 'story' ? '📖 сюжет' : '';
}

function updateStatus() {
  const g = engine.getG();
  const p = g.player;
  document.getElementById('status-strip').innerHTML = `
    <span class="bar-label">HP</span>${bar('hp', p.hp.current, p.hp.max)}<span class="bar-label">${Math.round(p.hp.current)}/${p.hp.max}</span>
    <span class="bar-label">⚡</span>${bar('energy', p.energy.current, p.energy.max)}<span class="bar-label">${Math.round(p.energy.current)}</span>
    <span class="bar-label">🍗</span>${bar('hunger', p.hunger, 100)}<span class="bar-label">${p.hunger >= 80 ? 'голод!' : Math.round(p.hunger)}</span>
    <span class="bar-label">💧</span>${bar('thirst', p.thirst, 100)}<span class="bar-label">${p.thirst >= 80 ? 'жажда!' : Math.round(p.thirst)}</span>
    <span class="spacer"></span>
    <span class="money">🪙 ${p.money} м.</span>
    <span class="bar-label">ур.${p.level} · ${p.xp}/${p.level * 100} XP</span>`;
}

function updateLocHead() {
  const g = engine.getG();
  const loc = LOCATIONS[g.player.location];
  const region = REGIONS[loc.region];
  const npcs = engine.npcsAt(g.player.location);
  const flags = g.world.flags;
  document.getElementById('loc-head').innerHTML = `
    <div class="loc-name"><span class="dot" style="background:${region.color}"></span>${loc.icon} ${esc(loc.name)}
      ${flags.caravanDaysLeft > 0 && g.player.location === 'road-north' ? '<span class="tag">🐎 караван здесь</span>' : ''}
      ${flags.fairToday && g.player.location === 'village-square' ? '<span class="tag">🎪 ярмарка</span>' : ''}
      ${flags.raidActive && g.player.location === 'road-south' ? '<span class="tag" style="color:#ff9c93">🗡 неспокойно</span>' : ''}
    </div>
    <div class="loc-desc">${esc(loc.desc)}</div>
    <div class="loc-meta">
      ${npcs.map(x => `<span class="tag click npc-tag" data-npc="${x.npc.id}">${x.npc.emoji} ${esc(x.npc.name)} · ${esc(x.action)}</span>`).join('')}
    </div>`;
  document.getElementById('loc-head').querySelectorAll('[data-npc]').forEach(el => {
    el.addEventListener('click', () => engine.handleInput('поговорить с ' + engine.npcById(el.dataset.npc).name));
  });
}

const SHORT = {
  'village-square': 'Деревня (площадь)', 'village-tavern': 'Таверна', 'village-smithy': 'Кузница',
  'village-shop': 'Лавка', 'village-temple': 'Храм', 'village-fields': 'Поля',
  'forest-edge': 'Опушка', 'forest-deep': 'Чаща', 'road-north': 'Северный тракт', 'road-south': 'Южная дорога',
};

function updateActionRow() {
  const g = engine.getG();
  const loc = LOCATIONS[g.player.location];
  const npcs = engine.npcsAt(g.player.location);
  const jobs = engine.availableJobs();
  const btns = [];
  for (const exit of Object.keys(loc.exits).slice(0, 6)) {
    btns.push(`<button class="btn btn-sm" data-act="move" data-target="${exit}">→ ${SHORT[exit]}</button>`);
  }
  btns.push(`<button class="btn btn-sm" data-act="look">🔍 Осмотреться</button>`);
  for (const x of npcs) btns.push(`<button class="btn btn-sm" data-act="talk" data-npc="${x.npc.id}">💬 ${esc(x.npc.name)}</button>`);
  for (const j of jobs) btns.push(`<button class="btn btn-sm" data-act="work" data-job="${j.id}">💪 ${esc(j.title.split(' ')[0])} (${j.pay[0]}–${j.pay[1]}м)</button>`);
  if (loc.water) btns.push(`<button class="btn btn-sm" data-act="drink">💧 Напиться</button>`);
  if (g.player.inventory.some(s => ITEMS[s.id].food)) btns.push(`<button class="btn btn-sm" data-act="eat">🍖 Поесть</button>`);
  if (g.player.location === 'forest-edge' || g.player.location === 'forest-deep') btns.push(`<button class="btn btn-sm" data-act="herbs">🌿 Травы</button>`);
  if (g.player.location === 'forest-edge') btns.push(`<button class="btn btn-sm" data-act="wood">🪵 Хворост</button>`);
  if (g.player.location === 'village-temple') btns.push(`<button class="btn btn-sm" data-act="pray">🕯 Помолиться</button>`);
  if (g.player.location === 'village-square' && g.world.flags.fairToday) btns.push(`<button class="btn btn-sm" data-act="fair">🎪 Ярмарка</button>`);
  if (g.player.location === 'road-south' && g.world.flags.ambushDaysLeft > 0 && !g.world.flags.ambushDone) btns.push(`<button class="btn btn-sm btn-accent" data-act="ambush">⚔ Засада у моста</button>`);
  btns.push(`<button class="btn btn-sm" data-act="rest">🪑 Отдых</button>`);
  btns.push(`<button class="btn btn-sm" data-act="sleep">😴 Спать</button>`);
  document.getElementById('action-row').innerHTML = btns.join('');
  document.getElementById('action-row').querySelectorAll('[data-act]').forEach(b => {
    b.addEventListener('click', () => {
      audio.sfx('click');
      const act = b.dataset.act;
      if (act === 'move') engine.doAction({ type: 'move', target: b.dataset.target });
      else if (act === 'look') engine.doAction({ type: 'look' });
      else if (act === 'talk') engine.handleInput('поговорить с ' + engine.npcById(b.dataset.npc).name);
      else if (act === 'work') engine.doAction({ type: 'work', jobId: b.dataset.job });
      else if (act === 'drink') engine.doAction({ type: 'drink' });
      else if (act === 'eat') engine.doAction({ type: 'eat' });
      else if (act === 'herbs') engine.doAction({ type: 'search', what: 'herbs' });
      else if (act === 'wood') engine.doAction({ type: 'search', what: 'wood' });
      else if (act === 'pray') engine.doAction({ type: 'pray' });
      else if (act === 'fair') engine.doAction({ type: 'fair' });
      else if (act === 'ambush') engine.doAction({ type: 'ambush' });
      else if (act === 'rest') engine.doAction({ type: 'rest', min: 60 });
      else if (act === 'sleep') engine.doAction({ type: 'sleep' });
      updateAll();
    });
  });
}

function appendLog(force) {
  const g = engine.getG(); if (!g) return;
  const el = document.getElementById('narrative'); if (!el) return;
  if (force) { el.innerHTML = ''; logRendered = 0; }
  const items = g.log.slice(logRendered);
  logRendered = g.log.length;
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'entry k-' + it.k.replace('_relations', 'good');
    div.innerHTML = `<span class="t">${it.d}д ${it.t}</span>${esc(it.x).replace(/^_relations: /, '')}`;
    el.appendChild(div);
  }
  el.scrollTop = el.scrollHeight;
}

/* ---------------- ЭКРАН СМЕРТИ (4.4) ---------------- */
function showDeath() {
  const g = engine.getG(); if (!g) return;
  const account = acc.current()?.email || null;
  const cause = g.world.flags.deathCause || 'неизвестность';
  const ov = document.createElement('div');
  ov.className = 'death-overlay';
  ov.innerHTML = `<div class="death-box anim-fade">
    <h1>ТЫ УМЕР</h1>
    <p class="muted">${esc(g.player.name)} · день ${g.world.day} · причина: ${esc(cause)}</p>
    <p style="font-family:var(--font-narr)">Мир не остановился. Просто в нём больше нет тебя… в этом виде.</p>
    <div class="row" style="justify-content:center;margin-top:24px" id="death-actions"></div>
  </div>`;
  document.body.appendChild(ov);
  const actions = ov.querySelector('#death-actions');
  const btn = (label, cls, cb) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', cb); actions.appendChild(b); };

  if (g.deathMode === 'normal') {
    btn('⟲ Загрузить последнее сохранение', 'btn-accent', () => {
      const slot = saves.lastSaveSlot(account);
      const data = slot && saves.loadSlot(account, slot);
      if (!data) { toast('Сохранений нет…'); return; }
      ov.remove();
      engine.loadGame(data);
      logRendered = 0;
      updateAll();
      toast('Время отмоталось. Попробуй жить дальше.');
    });
    btn('К списку сохранений', '', () => { ov.remove(); cleanup?.(); navigate('/play'); });
  } else if (g.deathMode === 'hardcore') {
    const slot = g.meta.slot;
    if (slot) saves.deleteSlot(account, slot);
    saves.deleteSlot(account, 'auto');
    ov.querySelector('.muted').innerHTML += ' · <b>ХАРДКОР: путь окончен навсегда</b>';
    btn('Начать новую жизнь', 'btn-accent', () => { ov.remove(); cleanup?.(); navigate('/character/create'); });
    btn('В главное меню', '', () => { ov.remove(); cleanup?.(); navigate('/'); });
  } else { // story
    btn('Продолжить новым персонажем', 'btn-accent', () => { ov.remove(); cleanup?.(); navigate('/character/create?story=1'); });
    btn('В главное меню', '', () => { ov.remove(); cleanup?.(); navigate('/'); });
  }
}
