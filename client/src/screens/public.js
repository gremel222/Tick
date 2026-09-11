/* Публичные страницы: вики, рейтинг, юр-страницы, профиль, настройки */
import { NPCS, FACTIONS, REGIONS, LOCATIONS, CANON_EVENTS, ITEMS, ACHIEVEMENTS, VILLAGE_NAME, DEVLOG } from '../game/data.js';
import { esc } from '../ui.js';
import { navigate } from '../router.js';
import * as acc from '../api/local.js';
import { getG } from '../game/engine.js';

const shell = (title, body) => `
  <div class="landing">
    <header class="site-header"><div class="container">
      <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
      <nav><a href="/" data-link>Главная</a><a href="/wiki" data-link>Вики</a><a href="/devlog" data-link>Девлог</a><a href="/leaderboard" data-link>Рейтинг</a><a class="btn btn-accent btn-sm" href="/play" data-link>Играть</a></nav>
    </div></header>
    <div class="page container"><h1>${title}</h1>${body}</div>
  </div>`;

/* ---------------- ВИКИ ---------------- */
export function renderWiki(root) {
  const tabs = [
    ['characters', 'Персонажи'], ['factions', 'Фракции'], ['regions', 'Регионы'],
    ['history', 'История'], ['economy', 'Экономика'],
  ];
  root.innerHTML = shell('Вики мира «Элар»', `
    <p class="muted">Авторский мир-01: ${VILLAGE_NAME} и окрестности. Данные мира живут своей жизнью — вики показывает канон.</p>
    <div class="tabs" id="w-tabs">${tabs.map(([id, t], i) => `<button class="tab ${i === 0 ? 'on' : ''}" data-t="${id}">${t}</button>`).join('')}</div>
    <div id="w-body"></div>`);
  const bodies = {
    characters: () => `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${NPCS.map(n => `
      <div class="card"><div class="row"><span style="font-size:1.8em">${n.emoji}</span><div><b>${esc(n.name)}</b><div class="muted" style="font-size:.88em">${esc(n.profession)}, ${n.age} лет · ${esc(n.personality)}</div></div></div>
      <p style="margin:10px 0 0">${esc(n.bio)}</p></div>`).join('')}</div>`,
    factions: () => `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${FACTIONS.map(f => `
      <div class="card"><div class="row"><span style="font-size:1.8em">${f.icon}</span><b>${esc(f.name)}</b></div><p style="margin:10px 0 0">${esc(f.desc)}</p></div>`).join('')}</div>`,
    regions: () => `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${Object.entries(REGIONS).map(([id, r]) => `
      <div class="card"><b><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.color};margin-right:6px"></span>${esc(r.name)}</b>
      <p class="muted" style="margin:8px 0 0;font-size:.9em">Локации: ${Object.values(LOCATIONS).filter(l => l.region === id).map(l => esc(l.name)).join(', ')}.</p></div>`).join('')}</div>`,
    history: () => `<p class="muted">Расписание канона (${VILLAGE_NAME}, первый месяц):</p>` + CANON_EVENTS.map(c => `
      <div class="list-item"><div class="ic">📅</div><div><b>${esc(c.title)}</b> — день ${c.plannedDay}, ${esc(LOCATIONS[c.location]?.name || '')}<div class="muted" style="font-size:.9em">${esc(c.desc)}</div></div></div>`).join(''),
    economy: () => `<p class="muted">Базовые цены товаров (рыночная цена зависит от спроса и предложения: цена = базовая × (1 + спрос / предложение)).</p>
      <table class="table"><tr><th>Товар</th><th>Базовая цена</th><th>Свойство</th></tr>
      ${Object.values(ITEMS).filter(i => i.price > 0).map(i => `<tr><td>${i.emoji} ${esc(i.name)}</td><td class="mono">${i.price} м.</td><td class="muted">${i.food ? 'еда' : i.drink ? 'питьё' : i.heal ? 'лечение' : i.atk ? 'оружие +' + i.atk : i.def ? 'защита +' + i.def : 'товар'}</td></tr>`).join('')}</table>`,
  };
  const body = document.getElementById('w-body');
  const set = id => body.innerHTML = bodies[id]();
  document.getElementById('w-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    Array.from(e.currentTarget.children).forEach(c => c.classList.remove('on'));
    b.classList.add('on');
    set(b.dataset.t);
  });
  set('characters');
}

/* ---------------- РЕЙТИНГ ---------------- */
export function renderLeaderboard(root) {
  const stats = acc.allLocalStats();
  const sorters = {
    time: (a, b) => b.day - a.day,
    wealth: (a, b) => b.money - a.money,
    influence: (a, b) => b.achievements - a.achievements || b.kills - a.kills,
    deviations: (a, b) => b.deviations - a.deviations,
  };
  const cols = { time: ['Игровой день', b => b.day], wealth: ['Монеты', b => b.money], influence: ['Ачивки / победы', b => b.achievements + ' / ' + b.kills], deviations: ['Отклонений канона', b => b.deviations] };
  let mode = 'time';
  root.innerHTML = shell('Рейтинг', `
    <p class="muted">Локальный рейтинг этого устройства (в полной версии — общий серверный). ${stats.length ? '' : 'Пока пусто — сыграй первым!'}</p>
    <div class="tabs" id="lb-tabs">
      <button class="tab on" data-t="time">Время</button>
      <button class="tab" data-t="wealth">Богатство</button>
      <button class="tab" data-t="influence">Влияние</button>
      <button class="tab" data-t="deviations">Отклонения</button>
    </div>
    <div id="lb-body"></div>`);
  const draw = () => {
    const rows = [...stats].sort(sorters[mode]);
    const [label, val] = [cols[mode][0], cols[mode][1]];
    document.getElementById('lb-body').innerHTML = rows.length ? `
      <table class="table"><tr><th>#</th><th>Игрок</th><th>День</th><th>Ур.</th><th>${label}</th></tr>
      ${rows.map((r, i) => `<tr class="${i === 0 ? 'rank-1' : ''}"><td class="mono">${i + 1}</td><td>${esc(r.player)}</td><td class="mono">${r.day}</td><td class="mono">${r.level}</td><td class="mono">${val(r)}</td></tr>`).join('')}
      </table>` : '<p class="muted">Нет данных.</p>';
  };
  document.getElementById('lb-tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    Array.from(e.currentTarget.children).forEach(c => c.classList.remove('on'));
    b.classList.add('on');
    mode = b.dataset.t;
    draw();
  });
  draw();
}

/* ---------------- ЮР-СТРАНИЦЫ (раздел 8) ---------------- */
const LEGAL = {
  privacy: { title: 'Политика приватности', body: `
    <p>Прототип v0.1 работает полностью в твоём браузере. Аккаунты и сохранения хранятся в localStorage твоего устройства и никуда не отправляются.</p>
    <p>Права (GDPR): удалить аккаунт — «Профиль → Удалить аккаунт» (мгновенно и полностью); экспортировать данные — «Профиль → Экспорт данных». Хранение — пока ты сам не удалишь.</p>
    <p>В полной версии (сервер): данные хранятся 90 дней после удаления, пароли — только в виде хэша argon2id.</p>` },
  tos: { title: 'Условия использования', body: `
    <p>Игра 16+: тексты о насилии, смерти, алкоголе (таверна!) и опасностях мира.</p>
    <p>Правила: не пытайся ломать движок, уважай других игроков (в мультиплеерных версиях), весь контент мира принадлежит автору. Сюжетные миры игроков — их собственность.</p>
    <p>Бесплатно до v1.0. Дальше — freemium: донаты и косметика, не влияющая на баланс.</p>` },
  cookies: { title: 'Использование cookies', body: `
    <p>Мы используем localStorage для: сессии, сохранений игры, настроек интерфейса и согласий. Никакой рекламы и трекинга в прототипе нет.</p>
    <p>В полной версии: Plausible (аналитика без cookies) и, с твоего согласия, — служебные cookies.</p>` },
  'age-check': { title: 'Возрастное ограничение 16+', body: `
    <p>Игра содержит: описания смерти и насилия (боевая система), употребление алкоголя персонажами, пугающие сцены (ночной лес).</p>
    <p>Регистрируясь, ты подтверждаешь, что тебе 16 или больше.</p>` },
  dmca: { title: 'DMCA / права на контент', body: `
    <p>Мир «Элар» и все персонажи — оригинальные, созданы автором проекта. Референсы на аниме-жанр не нарушают чужих прав.</p>
    <p>Импорт пользовательских миров (v1.0+) проверяется по лицензионной матрице: CC0/CC-BY/CC-BY-SA — можно, All-Rights-Reserved — только приватно. Жалобы на контент: sem.chernoruk@gmail.com, ответ и удаление — в течение 24 часов.</p>` },
};

export function renderLegal(kind) {
  return function (root) {
    const p = LEGAL[kind] || LEGAL.privacy;
    root.innerHTML = shell(p.title, p.body + `<p class="muted"><a href="/" data-link>← На главную</a></p>`);
  };
}

/* ---------------- ПРОФИЛЬ ---------------- */
export function renderProfile(root) {
  const account = acc.current();
  if (!account) { navigate('/login', true); return; }
  const g = getG();
  const html = shell('Профиль', `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div class="card">
        <h3 style="margin-top:0">Аккаунт</h3>
        <p>Почта: <b>${esc(account.email)}</b></p>
        <p class="muted" style="font-size:.9em">Режим прототипа: данные на этом устройстве.</p>
        <h3>Действия</h3>
        <div class="row">
          <button class="btn" id="pf-export">Экспорт данных (GDPR)</button>
          <button class="btn btn-danger" id="pf-delete">Удалить аккаунт</button>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Прогресс${g ? '' : ' (нет активной игры)'}</h3>
        ${g ? `
        <p>Персонаж: <b>${esc(g.player.name)}</b>, уровень ${g.player.level}, день ${g.world.day}</p>
        <p>Заработано: <span class="money">${g.world.stats.moneyEarned} м.</span> · Побед в бою: ${g.world.stats.kills} · Работ: ${g.world.stats.jobsDone}</p>
        <p>Отклонений канона: <b>${g.world.stats.canonDeviations}</b></p>` : '<p class="muted">Начни игру, чтобы здесь появился прогресс.</p>'}
      </div>
      <div class="card">
        <h3 style="margin-top:0">Достижения</h3>
        ${ACHIEVEMENTS.map(a => {
          const got = g?.achievements?.includes(a.id);
          return `<div class="list-item" style="${got ? '' : 'opacity:.45'}"><div class="ic">${got ? '🏆' : '🔒'}</div><div><b>${a.hidden && !got ? '???' : esc(a.title)}</b></div></div>`;
        }).join('')}
      </div>
    </div>`);
  root.innerHTML = html;
  document.getElementById('pf-export').addEventListener('click', () => {
    const data = acc.exportAccount(account.email);
    download('popadanets-account.json', data);
  });
  document.getElementById('pf-delete').addEventListener('click', () => {
    if (confirm('Удалить аккаунт и все сохранения? Необратимо.')) {
      acc.deleteAccount(account.email);
      navigate('/');
    }
  });
}

/* ---------------- НАСТРОЙКИ ---------------- */
export function renderSettings(root) {
  const account = acc.current();
  const s = acc.getSettings(account?.email);
  root.innerHTML = shell('Настройки', `
    <div class="card" style="max-width:560px">
      <h3 style="margin-top:0">Интерфейс</h3>
      <label>Размер шрифта</label>
      <div class="chip-row" id="s-font">
        <span class="chip ${(!s.font || s.font === 'medium') ? 'sel' : ''}" data-v="fs-medium">Обычный</span>
        <span class="chip ${s.font === 'small' ? 'sel' : ''}" data-v="fs-small">Мелкий</span>
        <span class="chip ${s.font === 'large' ? 'sel' : ''}" data-v="fs-large">Крупный</span>
      </div>
      <label style="margin-top:18px">Контраст</label>
      <div class="chip-row" id="s-hc">
        <span class="chip ${!s.hc ? 'sel' : ''}" data-v="off">Обычный</span>
        <span class="chip ${s.hc ? 'sel' : ''}" data-v="on">Высокий</span>
      </div>
      <h3>Горячие клавиши</h3>
      <p class="muted" style="font-size:.92em"><span class="kbd">M</span> карта · <span class="kbd">C</span> персонаж · <span class="kbd">I</span> инвентарь · <span class="kbd">J</span> журнал · <span class="kbd">Q</span> квесты · <span class="kbd">Esc</span> меню · <span class="kbd">Enter</span> подтвердить ввод</p>
    </div>`);
  document.getElementById('s-font').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#s-font .chip').forEach(c => c.classList.remove('sel'));
    chip.classList.add('sel');
    applySettings({ font: chip.dataset.v });
  });
  document.getElementById('s-hc').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    document.querySelectorAll('#s-hc .chip').forEach(c => c.classList.remove('sel'));
    chip.classList.add('sel');
    applySettings({ hc: chip.dataset.v === 'on' });
  });
}

function applySettings(patch) {
  const account = acc.current();
  const s = { ...acc.getSettings(account?.email), ...patch };
  acc.setSettings(account?.email, s);
  applyBodyClasses(s);
}
export function applyBodyClasses(s) {
  document.body.className = (s.font || 'fs-medium') + (s.hc ? ' hc' : '');
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
