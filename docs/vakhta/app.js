/**
 * app.js — «Счётчик вахты»: экраны, навигация и вся логика интерфейса.
 *
 * Как устроено:
 *   • state  — то, что сейчас в памяти (данные, активная вкладка, открытые подэкраны);
 *   • render() — перерисовывает заголовок, содержимое и нижние вкладки;
 *   • экраны — функции, возвращающие { title, html, after? } (см. VIEWS в конце файла);
 *   • нажатия обрабатываются одним обработчиком по атрибуту data-act.
 *
 * Данные читаются из db.js и держатся в state. После любой записи вызываем
 * reload() → render(), поэтому экран всегда показывает свежие числа.
 */

import * as db from './db.js';
import * as D from './dates.js';

/* ═══════════════════════════ состояние ═══════════════════════════ */

const state = {
  tab: 'home',              // активная вкладка: home | incomes | expenses | more
  stack: [],                // подэкраны текущей вкладки: [{ name, params }]
  shifts: [],
  incomes: [],              // заполняется на следующем шаге (раздел «Поступления»)
  expenses: [],
  categories: [],
  settings: {},
  incomeFilter: { category: 'all', shift: 'all' },   // фильтры списка поступлений
  amountsVisible: false,    // показаны ли суммы на главном экране (между запусками не храним)
  amountsTimer: null,
  midnightTimer: null,
  updateReady: false,       // ждёт установки новая версия приложения
  swRegistration: null,
  reloading: false,
  booted: false,
};

/* ═══════════════════════════ мелкие помощники ═══════════════════════════ */

const $ = (selector, root = document) => root.querySelector(selector);

/** Экранирование текста перед вставкой в HTML (заметки, названия категорий — данные пользователя). */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const MONEY = new Intl.NumberFormat('ru-RU');

/** Целое число рублей с пробелами между разрядами: 12345 → «12 345». */
function money(value) {
  return MONEY.format(Math.round(Number(value) || 0));
}

/** Сумма с рублём: 12345 → «12 345 ₽». */
function rubles(value) {
  return `${money(value)} ₽`;
}

/** «5 поступлений», «1 файл» — число с правильным окончанием. */
function countText(count, forms) {
  return `${count} ${D.plural(count, forms)}`;
}

/**
 * Разбор суммы из поля ввода. Человек может написать «50 000», «50.000»,
 * «50,000» — оставляем только цифры (копейки не поддерживаем).
 * Возвращает { value } или { error } с понятным текстом.
 */
function parseAmount(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return { error: 'Введите сумму' };
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return { error: 'Сумма должна быть больше нуля' };
  if (value > 999999999) return { error: 'Слишком большая сумма' };
  return { value };
}

/** Всплывающее сообщение внизу экрана. */
function toast(message, kind = '') {
  const root = $('#toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast${kind ? ` toast--${kind}` : ''}`;
  node.textContent = message;
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 260);
  }, 2600);
}

/** Короткая иконка-галочка «скоро» — набор инлайновых SVG (без сторонних библиотек). */
const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  income: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13"/><path d="m7 12 5 5 5-5"/><path d="M5 20h14"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V7"/><path d="m7 12 5-5 5 5"/><path d="M5 4h14"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15h6"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5 12.3 19.2a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"/></svg>',
};

/* ═══════════════════════════ запуск ═══════════════════════════ */

async function boot() {
  try {
    const { settings } = await db.init();
    state.settings = settings;

    // первый запуск: просим браузер не удалять данные (на iOS решает система)
    if (!state.settings.firstRunDone) {
      const persistState = await db.requestPersistentStorage();
      await db.saveSettings({ persistState, firstRunDone: true });
    }

    await reload();
    state.booted = true;
    render();
    watchDayChange();
    initServiceWorker();
  } catch (error) {
    console.error(error);
    $('#screen').innerHTML = `<div class="card"><p class="danger">Не удалось открыть хранилище</p>
      <p class="muted small">${esc(error.message || '')}</p>
      <p class="muted small">Проверьте, что сайт открыт по https и браузер не в режиме «Приватный доступ».</p></div>`;
  }
}

/** Читает свежие данные из базы в state. */
async function reload() {
  const [shifts, categories, settings, incomes, expenses] = await Promise.all([
    db.listShifts(),
    db.listCategories(),
    db.getSettings(),
    db.listIncomes(),          // отсортированы от новых к старым
    db.getAll('expenses'),
  ]);
  state.shifts = shifts;
  state.categories = categories;
  state.settings = settings;
  state.incomes = incomes;
  state.expenses = expenses;
}

/* ═══════════════════════════ пересчёт по времени ═══════════════════════════ */

/**
 * Экран должен обновляться сам: при возврате в приложение (visibilitychange)
 * и сразу после полуночи — ведь «День N» и «Дома N дней» зависят от даты.
 */
function watchDayChange() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    reload().then(() => render()).catch(() => render());
    scheduleMidnight();
  });

  window.addEventListener('focus', () => {
    reload().then(() => render()).catch(() => {});
  });

  scheduleMidnight();
}

function scheduleMidnight() {
  clearTimeout(state.midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  const delay = Math.max(1000, nextMidnight - now);
  state.midnightTimer = setTimeout(() => {
    reload().then(() => render()).catch(() => {});
    scheduleMidnight();
  }, delay);
}

/* ═══════════════════════════ навигация ═══════════════════════════ */

function goTab(tab) {
  state.tab = tab;
  state.stack = [];
  window.scrollTo(0, 0);
  render();
}

function push(name, params = {}) {
  state.stack.push({ name, params });
  // добавляем запись в историю: системный жест «назад» на iPhone закроет подэкран
  try { history.pushState({ depth: state.stack.length }, '', location.href); } catch (e) { /* не критично */ }
  window.scrollTo(0, 0);
  render();
}

function back() {
  state.stack.pop();
  window.scrollTo(0, 0);
  render();
}

function currentRoute() {
  if (state.stack.length) return state.stack[state.stack.length - 1];
  return { name: state.tab, params: {} };
}

/* ═══════════════════════════ перерисовка ═══════════════════════════ */

function render() {
  const route = currentRoute();
  const build = VIEWS[route.name] || VIEWS.home;
  const view = build(route.params || {});

  $('#app-title').textContent = view.title || 'Счётчик вахты';
  $('#app-back').classList.toggle('hidden', state.stack.length === 0);
  $('#screen').innerHTML = updateBannerHtml() + (view.html || '');
  if (view.after) view.after($('#screen'));
  renderTabs();
}

function renderTabs() {
  const tabs = [
    { id: 'home', label: 'Главная', icon: ICON.home },
    { id: 'incomes', label: 'Поступления', icon: ICON.income },
    { id: 'expenses', label: 'Расходы', icon: ICON.expense },
    { id: 'more', label: 'Ещё', icon: ICON.more },
  ];
  $('#tabbar').innerHTML = tabs.map((tab) => `
    <button class="tab${state.tab === tab.id ? ' is-active' : ''}" data-act="tab" data-tab="${tab.id}"
      aria-current="${state.tab === tab.id ? 'page' : 'false'}">
      ${tab.icon}<span>${tab.label}</span>
    </button>`).join('');
}

/* ── баннер «Доступна новая версия» ── */
function updateBannerHtml() {
  if (!state.updateReady) return '';
  return `<div class="banner" role="status">
      <span class="grow">Доступна новая версия</span>
      <span class="banner__actions">
        <button class="btn btn--primary" data-act="apply-update">Обновить</button>
      </span>
    </div>`;
}

/* ═══════════════════════════ расчёты для экранов ═══════════════════════════ */

/** Идущая вахта, если она есть. */
function activeShift(today = D.todayKey()) {
  return state.shifts.find((shift) => D.shiftStatus(shift, today) === D.ACTIVE) || null;
}

/** Последняя завершённая вахта (у которой окончание ближе всех к сегодня). */
function lastFinishedShift(today = D.todayKey()) {
  const finished = state.shifts.filter((shift) => D.shiftStatus(shift, today) === D.DONE);
  finished.sort((a, b) => D.diffDays(a.workEnd, b.workEnd));
  return finished[0] || null;
}

/** Ближайшая предстоящая вахта (минимальный заезд в будущем). */
function nextPlannedShift(today = D.todayKey()) {
  const planned = state.shifts.filter((shift) => D.shiftStatus(shift, today) === D.PLANNED);
  return planned[planned.length - 1] || null;   // список отсортирован по заезду убыв.
}

/**
 * «Контекстная вахта» для сумм и значений по умолчанию:
 * идущая → последняя завершённая → ближайшая предстоящая.
 */
function contextShift(today = D.todayKey()) {
  return activeShift(today) || lastFinishedShift(today) || nextPlannedShift(today);
}

/** Подпись статуса вахты (статус не хранится, а считается). */
function statusChip(shift, today) {
  const status = D.shiftStatus(shift, today);
  if (status === D.ACTIVE) {
    return `<span class="chip chip--accent">идёт · День ${D.shiftDayNumber(shift, today)}</span>`;
  }
  if (status === D.PLANNED) {
    const wait = D.daysUntil(shift.arrival, today);
    return `<span class="chip">через ${D.formatDays(wait)}</span>`;
  }
  return '<span class="chip chip--muted">завершена</span>';
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

/** Поступления, привязанные к вахте (или «без вахты», если shiftId пустой). */
function incomesOfShift(shiftId) {
  return state.incomes.filter((income) => (income.shiftId ?? null) === (shiftId ?? null));
}

/* ═══════════════════════════ главный экран ═══════════════════════════ */

function homeView() {
  const today = D.todayKey();

  if (!state.shifts.length && !state.incomes.length) {
    return {
      title: 'Вахта',
      html: `
        <div class="empty">
          <div class="empty__icon">${ICON.empty}</div>
          <h2>Вахт пока нет</h2>
          <p>Добавьте вахту: заезд, начало работы и последний день. Приложение посчитает «День N», заработок и остаток.</p>
          <button class="btn btn--primary" data-act="shift-new">Задать вахту</button>
        </div>`,
    };
  }

  const active = activeShift(today);
  const parts = [];

  if (active) {
    parts.push(gaugeCard(active, today));
  } else {
    parts.push(idleCard(today));
  }

  // суммы показываем, как только есть что считать (вахты или поступления)
  if (state.shifts.length || state.incomes.length) parts.push(moneyBlock());

  return {
    title: 'Вахта',
    html: parts.join(''),
    after: (root) => animateGauge(root),
  };
}

/** Идущая вахта: круговой индикатор «День N из M». */
function gaugeCard(shift, today) {
  const total = D.shiftLength(shift);
  const dayNumber = D.shiftDayNumber(shift, today);
  const left = D.shiftDaysLeft(shift, today);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, dayNumber / total));
  const offset = circumference * (1 - progress);

  const stage = D.STAGE_TITLES[D.shiftStage(shift, today)];
  const milestone = D.shiftMilestone(shift, today);

  return `
    <section class="card gauge-card">
      <div class="gauge">
        <svg class="gauge__ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="gauge__track" cx="100" cy="100" r="${radius}"></circle>
          <circle class="gauge__bar" cx="100" cy="100" r="${radius}"
            style="--circ:${circumference.toFixed(1)}" data-offset="${offset.toFixed(1)}"></circle>
        </svg>
        <div class="gauge__center">
          <span class="gauge__label">День</span>
          <span class="gauge__number">${dayNumber}</span>
          <span class="gauge__of">из ${D.formatDays(total)}</span>
        </div>
      </div>
      <p class="gauge-left">Осталось <b>${left}</b> ${D.plural(left, ['день', 'дня', 'дней'])}</p>
      <div class="chips">
        <span class="chip chip--accent">${esc(stage)}</span>
        ${milestone ? `<span class="chip chip--warn">${esc(milestone)}</span>` : ''}
      </div>
      <p class="home-range num">${D.formatRange(shift.arrival, shift.workEnd)}</p>
    </section>`;
}

/** Плавное заполнение дуги после отрисовки. */
function animateGauge(root) {
  const bar = root.querySelector('.gauge__bar');
  if (!bar) return;
  const target = bar.dataset.offset;
  requestAnimationFrame(() => { bar.style.strokeDashoffset = target; });
}

/** Режим «Дома»: сколько дней уже дома и сколько осталось до следующей вахты. */
function idleCard(today) {
  const last = lastFinishedShift(today);
  const next = nextPlannedShift(today);

  if (last) {
    const home = D.homeDays(last, today);
    return `
      <section class="card home-idle">
        <span class="home-idle__label">Дома</span>
        <span class="home-idle__num">${home}</span>
        <span class="muted">${D.formatDays(home)}${home === 1 ? '' : ''} · после вахты</span>
        <span class="home-range num">${D.formatRange(last.arrival, last.workEnd)}</span>
      </section>
      ${next ? `<p class="home-next">До заезда на следующую вахту: <b>${D.daysUntil(next.arrival, today)}</b> ${D.plural(D.daysUntil(next.arrival, today), ['день', 'дня', 'дней'])}</p>` : ''}`;
  }

  if (next) {
    const wait = D.daysUntil(next.arrival, today);
    return `
      <section class="card home-idle">
        <span class="home-idle__label">До заезда</span>
        <span class="home-idle__num">${wait}</span>
        <span class="muted">${D.formatDays(wait)}</span>
        <span class="home-range num">${D.formatRange(next.arrival, next.workEnd)}</span>
      </section>`;
  }

  return '<p class="muted center">Вахт нет</p>';
}

/** Суммы внизу главного экрана. Показываются по нажатию и снова прячутся через 5 секунд. */
function moneyBlock() {
  const hidden = !state.amountsVisible;
  const context = contextShift();
  const shiftSum = context ? sum(incomesOfShift(context.id).map((income) => income.amount)) : 0;
  const totalSum = sum(state.incomes.map((income) => income.amount));
  const mask = '•••';

  return `
    <button class="money${hidden ? ' money--hidden' : ''}" data-act="toggle-amounts"
      aria-label="Показать или скрыть суммы">
      <span class="money__row">
        <span>Заработано за вахту</span>
        <span class="money__value num">${hidden ? mask : money(shiftSum)} ₽</span>
      </span>
      <span class="money__row">
        <span>Всего</span>
        <span class="money__value num">${hidden ? mask : money(totalSum)} ₽</span>
      </span>
      ${hidden ? '<span class="money__hint">Нажмите, чтобы показать суммы</span>' : '<span class="money__hint">Повторное нажатие скроет суммы</span>'}
    </button>`;
}

function toggleAmounts() {
  state.amountsVisible = !state.amountsVisible;
  clearTimeout(state.amountsTimer);
  if (state.amountsVisible) {
    state.amountsTimer = setTimeout(() => {
      state.amountsVisible = false;
      updateMoneyBlock();
    }, 5000);
  }
  updateMoneyBlock();
}

function updateMoneyBlock() {
  const node = document.querySelector('.money');
  if (node && state.shifts.length) node.outerHTML = moneyBlock();
}

/* ═══════════════════════════ «Вахты» ═══════════════════════════ */

function shiftsView() {
  const today = D.todayKey();
  const list = state.shifts;

  const items = list.map((shift) => {
    const total = D.shiftLength(shift);
    const workStartNote = shift.workStart && shift.workStart !== shift.arrival
      ? `<span>работа с ${D.formatDate(shift.workStart)}</span>`
      : '';
    return `
      <li class="item">
        <div class="item__main">
          <span class="num">${D.formatRange(shift.arrival, shift.workEnd)}</span>
          ${statusChip(shift, today)}
        </div>
        <div class="item__meta">
          <span class="num">${D.formatDays(total)}</span>
          ${workStartNote}
        </div>
        <div class="item__actions">
          <button class="btn" data-act="shift-edit" data-id="${shift.id}">Изменить</button>
          <button class="btn btn--danger" data-act="shift-delete" data-id="${shift.id}">Удалить</button>
        </div>
      </li>`;
  }).join('');

  return {
    title: 'Вахты',
    html: `
      ${list.length
        ? `<ul class="list">${items}</ul>`
        : '<p class="muted center">Вахт пока нет</p>'}
      <button class="btn btn--primary btn--block" data-act="shift-new">Добавить вахту</button>
      <p class="muted small center">Вахты не могут пересекаться по датам. Заезд ≤ начало работы ≤ окончание.</p>`,
  };
}

/* ── форма вахты (создание и изменение) ── */

function shiftFormView(params) {
  const editing = params.id != null ? state.shifts.find((shift) => shift.id === params.id) : null;
  const today = D.todayKey();
  const arrival = editing ? editing.arrival : today;
  const workStart = editing ? editing.workStart || editing.arrival : '';
  const workEnd = editing ? editing.workEnd : '';

  return {
    title: editing ? 'Вахта' : 'Новая вахта',
    html: `
      <form class="form" id="shift-form" data-act="shift-save" data-id="${editing ? editing.id : ''}" novalidate>
        <div class="field">
          <label class="field__label" for="f-arrival">Заезд (первый день)</label>
          <input class="input num" type="date" id="f-arrival" name="arrival" value="${esc(arrival)}" required>
          <span class="field__error hidden" data-error="arrival"></span>
        </div>

        <div class="field">
          <label class="field__label" for="f-work-start">Начало работы (необязательно)</label>
          <input class="input num" type="date" id="f-work-start" name="workStart" value="${esc(workStart)}" min="${esc(arrival)}">
          <span class="field__hint">Если пусто — считаем, что работа началась в день заезда. До этого дня этап «В дороге».</span>
          <span class="field__error hidden" data-error="workStart"></span>
        </div>

        <div class="field">
          <label class="field__label" for="f-work-end">Окончание (последний день вахты)</label>
          <input class="input num" type="date" id="f-work-end" name="workEnd" value="${esc(workEnd)}" required min="${esc(arrival)}">
          <span class="field__error hidden" data-error="workEnd"></span>
        </div>

        <div class="form__actions">
          <button class="btn btn--primary btn--block" type="submit">${editing ? 'Сохранить' : 'Добавить вахту'}</button>
          ${editing ? `<button class="btn btn--danger btn--block" type="button" data-act="shift-delete" data-id="${editing.id}">Удалить вахту</button>` : ''}
        </div>
      </form>`,
    after: (root) => {
      // подсказываем браузеру допустимые границы дат
      const arrivalInput = root.querySelector('#f-arrival');
      const startInput = root.querySelector('#f-work-start');
      const endInput = root.querySelector('#f-work-end');
      const sync = () => {
        if (startInput) startInput.min = arrivalInput.value || '';
        if (endInput) endInput.min = arrivalInput.value || '';
      };
      arrivalInput?.addEventListener('change', sync);
      sync();
    },
  };
}

/** Показывает ошибку под конкретным полем. */
function setFieldError(name, message) {
  const node = document.querySelector(`[data-error="${name}"]`);
  if (node) {
    node.textContent = message || '';
    node.classList.toggle('hidden', !message);
  }
  const input = document.querySelector(`[name="${name}"]`);
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function clearFieldErrors() {
  document.querySelectorAll('[data-error]').forEach((node) => {
    node.textContent = '';
    node.classList.add('hidden');
  });
  document.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
}

/**
 * Проверка вахты перед сохранением.
 * Возвращает { errors: {поле: текст}, value: {...} }.
 */
function validateShift({ arrival, workStart, workEnd }, editingId) {
  const errors = {};
  if (!D.isValidKey(arrival)) errors.arrival = 'Укажите дату заезда';
  if (!D.isValidKey(workEnd)) errors.workEnd = 'Укажите последний день вахты';
  if (workStart && !D.isValidKey(workStart)) errors.workStart = 'Проверьте дату начала работы';

  if (!Object.keys(errors).length) {
    if (D.diffDays(arrival, workEnd) < 0) {
      errors.workEnd = 'Окончание не может быть раньше заезда';
    } else if (workStart && D.diffDays(arrival, workStart) < 0) {
      errors.workStart = 'Начало работы не может быть раньше заезда';
    } else if (workStart && D.diffDays(workStart, workEnd) < 0) {
      errors.workStart = 'Начало работы не может быть позже окончания';
    }
  }

  if (!Object.keys(errors).length) {
    const candidate = { arrival, workStart: workStart || arrival, workEnd };
    const clash = state.shifts.find((shift) => shift.id !== editingId && D.shiftsOverlap(shift, candidate));
    if (clash) {
      const message = `Пересекается с вахтой ${D.formatRange(clash.arrival, clash.workEnd)}`;
      errors.arrival = message;
      errors.workEnd = message;
    }
  }

  return { errors, value: { arrival, workStart: workStart || arrival, workEnd } };
}

async function saveShift(form) {
  clearFieldErrors();
  // form.elements — надёжный доступ к полям формы (form.arrival работает не везде)
  const raw = {
    arrival: form.elements.arrival.value.trim(),
    workStart: form.elements.workStart.value.trim(),
    workEnd: form.elements.workEnd.value.trim(),
  };
  const editingId = form.dataset.id ? Number(form.dataset.id) : null;
  const { errors, value } = validateShift(raw, editingId);

  if (Object.keys(errors).length) {
    for (const [field, message] of Object.entries(errors)) setFieldError(field, message);
    toast('Проверьте даты', 'error');
    return;   // введённые значения остаются в форме
  }

  try {
    if (editingId) {
      const existing = state.shifts.find((shift) => shift.id === editingId);
      await db.updateShift({ ...existing, ...value });
    } else {
      await db.addShift(value);
    }
    await db.markDirty();
    await reload();
    back();                                   // возвращаемся к списку вахт
    render();
    toast(editingId ? 'Вахта сохранена' : 'Вахта добавлена', 'ok');
  } catch (error) {
    console.error(error);
    toast('Не удалось сохранить', 'error');
  }
}

/** Удаление вахты: сначала показываем, что именно пропадёт, потом удаляем. */
async function deleteShift(id) {
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;

  let stats = { incomes: 0, expenses: 0, attachments: 0 };
  try {
    stats = await db.shiftDeleteStats(id);
  } catch (error) {
    console.error(error);
  }

  const answer = await openSheet({
    title: 'Удалить вахту?',
    message: `Вахта ${D.formatRange(shift.arrival, shift.workEnd)} будет удалена безвозвратно.

Будет удалено: ${stats.incomes} ${D.plural(stats.incomes, ['поступление', 'поступления', 'поступлений'])}, ${stats.expenses} ${D.plural(stats.expenses, ['расход', 'расхода', 'расходов'])} и их вложения.`,
    confirmText: 'Удалить',
    danger: true,
  });

  if (answer !== 'ok') return;

  try {
    await db.deleteShiftCascade(id);
    await db.markDirty();
    await reload();
    // если открыта форма удалённой вахты — вернёмся назад
    if (state.stack.length && state.stack[state.stack.length - 1].name === 'shiftForm') state.stack.pop();
    render();
    toast('Вахта удалена', 'ok');
  } catch (error) {
    console.error(error);
    toast('Не удалось удалить', 'error');
  }
}

/* ═══════════════════════════ «Поступления» ═══════════════════════════ */

/** Короткая подпись вахты для списков: «01.10–30.10» или «без вахты». */
function shiftLabel(shiftId) {
  const shift = shiftId == null ? null : state.shifts.find((item) => item.id === shiftId);
  if (!shift) return 'без вахты';
  return `${D.formatDayMonth(shift.arrival)}–${D.formatDayMonth(shift.workEnd)}`;
}

/** Название категории поступления (по id или по названию из старой копии). */
function incomeCategory(income) {
  return db.incomeCategoryName(income.category);
}

/**
 * Вахта по умолчанию для нового поступления:
 * идущая → последняя завершённая → «Без вахты» (по правилу из задания).
 */
function defaultIncomeShift(today = D.todayKey()) {
  const shift = activeShift(today) || lastFinishedShift(today);
  return shift ? shift.id : null;
}

/** Поступления, прошедшие фильтры экрана (категория + вахта). */
function filteredIncomes() {
  const filter = state.incomeFilter;
  return state.incomes.filter((income) => {
    if (filter.category !== 'all' && incomeCategory(income) !== filter.category) return false;
    if (filter.shift === 'none') return income.shiftId == null;
    if (filter.shift !== 'all') return String(income.shiftId) === String(filter.shift);
    return true;
  });
}

/** Скрепка с числом вложений (показываем, только если вложения есть). */
function attachBadge(income) {
  const count = (income.attachments || []).length;
  if (!count) return '';
  return `<span class="attach">${ICON.paperclip}<span>${count}</span></span>`;
}

function incomesView() {
  const today = D.todayKey();
  const filter = state.incomeFilter;
  const list = filteredIncomes();
  const filtersActive = filter.category !== 'all' || filter.shift !== 'all';

  const items = list.map((income) => `
    <li class="item">
      <div class="item__main">
        <span class="item__amount num">${rubles(income.amount)}</span>
        <span class="item__date num">${D.formatDate(income.date)}</span>
      </div>
      <div class="item__meta">
        <span class="chip chip--accent">${esc(incomeCategory(income))}</span>
        <span class="chip chip--muted">${esc(shiftLabel(income.shiftId))}</span>
        ${attachBadge(income)}
      </div>
      ${income.note ? `<p class="item__note">${esc(income.note)}</p>` : ''}
      <div class="item__actions">
        <button class="btn" data-act="income-edit" data-id="${income.id}">Изменить</button>
        <button class="btn btn--danger" data-act="income-delete" data-id="${income.id}">Удалить</button>
      </div>
    </li>`).join('');

  const emptyList = state.incomes.length === 0
    ? `<div class="empty">
         <div class="empty__icon">${ICON.income}</div>
         <h2>Поступлений пока нет</h2>
         <p>Записывайте аванс, расчёт, премии и отпускные — приложение посчитает, сколько заработано за вахту.</p>
       </div>`
    : '<p class="muted center">По этому фильтру ничего нет</p>';

  return {
    title: 'Поступления',
    html: `
      ${state.incomes.length ? totalsCard(today) : ''}
      ${state.incomes.length || state.shifts.length ? filterCard() : ''}
      ${list.length ? `<ul class="list">${items}</ul>` : emptyList}
      <div class="add-bar">
        <button class="btn btn--primary btn--block" data-act="income-new">Добавить поступление</button>
      </div>
      ${filtersActive && !list.length ? '<button class="btn btn--block" data-act="filter-reset">Сбросить фильтры</button>' : ''}`,
  };
}

/** Итоги: за вахту (по выбранной привязке), за всё время, по категориям. */
function totalsCard(today) {
  const filter = state.incomeFilter;
  const rows = [];

  // «За вахту»: явно выбранная вахта, иначе контекстная (идущая → последняя завершённая → предстоящая)
  let shift = null;
  if (filter.shift === 'all') shift = contextShift(today);
  else if (filter.shift !== 'none') shift = state.shifts.find((item) => String(item.id) === String(filter.shift)) || null;

  if (shift) {
    rows.push([`За вахту · ${D.formatRange(shift.arrival, shift.workEnd)}`,
      sum(incomesOfShift(shift.id).map((income) => income.amount))]);
  } else if (filter.shift === 'none') {
    rows.push(['Без вахты', sum(incomesOfShift(null).map((income) => income.amount))]);
  }
  // «За всё время» включая записи «Без вахты»
  rows.push(['За всё время', sum(state.incomes.map((income) => income.amount))]);

  // по категориям — по текущему фильтру (то есть по тому, что видно в списке)
  const byCategory = db.INCOME_CATEGORIES
    .map((category) => ({
      name: category.name,
      total: sum(filteredIncomes().filter((income) => incomeCategory(income) === category.name)
        .map((income) => income.amount)),
    }))
    .filter((row) => row.total > 0);

  return `
    <section class="card">
      <h2 class="card-title">Итоги</h2>
      <dl class="kv">
        ${rows.map(([label, value]) => `
          <div class="kv__row"><dt>${esc(label)}</dt><dd class="num">${rubles(value)}</dd></div>`).join('')}
      </dl>
      <div class="divider divider--gap"></div>
      <h2 class="card-title">По категориям${filter.category !== 'all' || filter.shift !== 'all' ? ' (по фильтру)' : ''}</h2>
      ${byCategory.length
        ? `<dl class="kv">${byCategory.map((row) => `
            <div class="kv__row"><dt>${esc(row.name)}</dt><dd class="num">${rubles(row.total)}</dd></div>`).join('')}</dl>`
        : '<p class="muted small">Пока пусто</p>'}
    </section>`;
}

/** Фильтры по категории и вахте. */
function filterCard() {
  const filter = state.incomeFilter;
  const categoryOptions = [['all', 'все категории']]
    .concat(db.INCOME_CATEGORIES.map((category) => [category.name, category.name]))
    .map(([value, label]) => `<option value="${esc(value)}"${filter.category === value ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const shiftOptions = [['all', 'все вахты'], ['none', 'без вахты']]
    .concat(state.shifts.map((shift) => [String(shift.id), D.formatRange(shift.arrival, shift.workEnd)]))
    .map(([value, label]) => `<option value="${esc(value)}"${filter.shift === value ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  return `
    <section class="card">
      <div class="filters">
        <div class="field">
          <label class="field__label" for="filter-category">Категория</label>
          <select class="select" id="filter-category" data-act="filter" data-filter="category">${categoryOptions}</select>
        </div>
        <div class="field">
          <label class="field__label" for="filter-shift">Вахта</label>
          <select class="select" id="filter-shift" data-act="filter" data-filter="shift">${shiftOptions}</select>
        </div>
      </div>
      ${filter.category !== 'all' || filter.shift !== 'all'
        ? '<button class="link filters__reset" data-act="filter-reset">Сбросить фильтры</button>' : ''}
    </section>`;
}

/* ── форма поступления ── */

function incomeFormView(params) {
  const editing = params.id != null ? state.incomes.find((income) => income.id === params.id) : null;
  const today = D.todayKey();

  const amount = editing ? String(editing.amount) : '';
  const date = editing ? editing.date : today;
  const category = editing ? incomeCategory(editing) : db.INCOME_CATEGORIES[0].name;
  const shiftId = editing ? (editing.shiftId ?? null) : defaultIncomeShift(today);
  const note = editing ? editing.note || '' : '';

  const categoryOptions = db.INCOME_CATEGORIES
    .map((item) => `<option value="${esc(item.name)}"${item.name === category ? ' selected' : ''}>${esc(item.name)}</option>`)
    .join('');

  const shiftOptions = [`<option value=""${shiftId == null ? ' selected' : ''}>Без вахты</option>`]
    .concat(state.shifts.map((shift) => {
      const status = D.shiftStatus(shift, today);
      const suffix = status === D.ACTIVE ? ' · идёт' : status === D.PLANNED ? ' · предстоит' : ' · завершена';
      const label = D.formatRange(shift.arrival, shift.workEnd) + suffix;
      return `<option value="${shift.id}"${String(shiftId) === String(shift.id) ? ' selected' : ''}>${esc(label)}</option>`;
    })).join('');

  return {
    title: editing ? 'Поступление' : 'Новое поступление',
    html: `
      <form class="form" id="income-form" data-act="income-save" data-id="${editing ? editing.id : ''}" novalidate>
        <div class="field">
          <label class="field__label" for="f-amount">Сумма, ₽</label>
          <input class="input num" id="f-amount" name="amount" type="text" inputmode="numeric"
                 autocomplete="off" placeholder="50000" value="${esc(amount)}">
          <span class="field__hint" data-hint="amount">Только целые рубли, без копеек</span>
          <span class="field__error hidden" data-error="amount"></span>
        </div>

        <div class="field">
          <label class="field__label" for="f-date">Дата</label>
          <input class="input num" id="f-date" name="date" type="date" value="${esc(date)}">
          <span class="field__error hidden" data-error="date"></span>
        </div>

        <div class="field">
          <label class="field__label" for="f-category">Категория</label>
          <select class="select" id="f-category" name="category">${categoryOptions}</select>
        </div>

        <div class="field">
          <label class="field__label" for="f-shift">Вахта</label>
          <select class="select" id="f-shift" name="shiftId">${shiftOptions}</select>
          <span class="field__hint" data-hint="shift"></span>
        </div>

        <div class="field">
          <label class="field__label" for="f-note">Заметка</label>
          <textarea class="textarea" id="f-note" name="note" rows="2">${esc(note)}</textarea>
        </div>

        <div class="field">
          <span class="field__label">Расчётка</span>
          <button class="btn btn--block" type="button" disabled>Прикрепить расчётку</button>
          <span class="field__hint">Загрузка расчётных листков появится на следующем шаге.</span>
        </div>

        <div class="form__actions">
          <button class="btn btn--primary btn--block" type="submit">${editing ? 'Сохранить' : 'Добавить поступление'}</button>
          ${editing ? `<button class="btn btn--danger btn--block" type="button" data-act="income-delete" data-id="${editing.id}">Удалить поступление</button>` : ''}
        </div>
      </form>`,
    after: (root) => {
      const amountInput = root.querySelector('#f-amount');
      const amountHint = root.querySelector('[data-hint="amount"]');
      const dateInput = root.querySelector('#f-date');
      const shiftSelect = root.querySelector('#f-shift');
      const shiftHint = root.querySelector('[data-hint="shift"]');

      // живая подсказка: видно, какая сумма получится
      const updateAmountHint = () => {
        const parsed = parseAmount(amountInput.value);
        amountHint.textContent = !amountInput.value
          ? 'Только целые рубли, без копеек'
          : parsed.error ? 'Введите целое число, например 50000' : `Получится ${rubles(parsed.value)}`;
      };
      amountInput.addEventListener('input', updateAmountHint);
      updateAmountHint();

      // «дата вне периода вахты» — это подсказка, а не ошибка: расчёт могут задержать
      const updateShiftHint = () => {
        const shift = state.shifts.find((item) => String(item.id) === shiftSelect.value);
        if (!shift || !D.isValidKey(dateInput.value)) {
          shiftHint.textContent = '';
          return;
        }
        const outside = D.diffDays(shift.arrival, dateInput.value) < 0 || D.diffDays(dateInput.value, shift.workEnd) < 0;
        shiftHint.textContent = outside ? `Дата вне периода вахты (${D.formatRange(shift.arrival, shift.workEnd)})` : '';
        shiftHint.classList.toggle('warn', outside);
      };
      dateInput.addEventListener('change', updateShiftHint);
      shiftSelect.addEventListener('change', updateShiftHint);
      updateShiftHint();
    },
  };
}

async function saveIncome(form) {
  clearFieldErrors();
  const raw = {
    amount: form.elements.amount.value.trim(),
    date: form.elements.date.value.trim(),
    category: form.elements.category.value,
    shiftId: form.elements.shiftId.value,
    note: form.elements.note.value.trim(),
  };

  const parsed = parseAmount(raw.amount);
  const errors = {};
  if (parsed.error) errors.amount = parsed.error;
  if (!D.isValidKey(raw.date)) errors.date = 'Укажите дату';

  if (Object.keys(errors).length) {
    for (const [field, message] of Object.entries(errors)) setFieldError(field, message);
    toast('Проверьте поля', 'error');
    return;   // введённое остаётся в форме
  }

  const record = {
    shiftId: raw.shiftId === '' ? null : Number(raw.shiftId),
    amount: parsed.value,
    date: raw.date,
    category: raw.category,
    note: raw.note,
  };

  try {
    const editingId = form.dataset.id ? Number(form.dataset.id) : null;
    if (editingId) {
      const existing = state.incomes.find((income) => income.id === editingId);
      await db.updateIncome({ ...existing, ...record });
    } else {
      await db.addIncome(record);
    }
    await db.markDirty();
    await reload();
    back();
    render();
    toast(editingId ? 'Поступление сохранено' : 'Поступление добавлено', 'ok');
  } catch (error) {
    console.error(error);
    toast('Не удалось сохранить', 'error');
  }
}

async function deleteIncome(id) {
  const income = state.incomes.find((item) => item.id === id);
  if (!income) return;

  let stats = { attachments: 0 };
  try {
    stats = await db.incomeDeleteStats(id);
  } catch (error) {
    console.error(error);
  }

  const answer = await openSheet({
    title: 'Удалить поступление?',
    message: `${rubles(income.amount)} от ${D.formatDate(income.date)}${stats.attachments
      ? `\nВложения (${countText(stats.attachments, ['файл', 'файла', 'файлов'])}) будут удалены вместе с ним.` : ''}`,
    confirmText: 'Удалить',
    danger: true,
  });
  if (answer !== 'ok') return;

  try {
    await db.deleteIncomeCascade(id);
    await db.markDirty();
    await reload();
    if (state.stack.length && state.stack[state.stack.length - 1].name === 'incomeForm') state.stack.pop();
    render();
    toast('Поступление удалено', 'ok');
  } catch (error) {
    console.error(error);
    toast('Не удалось удалить', 'error');
  }
}

/* ═══════════════════════════ разделы следующих шагов ═══════════════════════════ */

function soonView(title, text) {
  return {
    title,
    html: `<div class="empty">
        <div class="empty__icon">${ICON.shift}</div>
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
      </div>`,
  };
}

function moreView() {
  return {
    title: 'Ещё',
    html: `
      <ul class="list">
        <li class="item"><button class="row-between" data-act="open-shifts" style="width:100%;min-height:44px">
          <span>Вахты</span><span class="muted num">${state.shifts.length}</span></button></li>
      </ul>
      <p class="muted small">Сравнение вахт, копии данных, CSV, PIN и информация о хранении появятся на следующих шагах.</p>`,
  };
}

/* ═══════════════════════════ модальные окна ═══════════════════════════ */

/**
 * Нижнее модальное окно подтверждения.
 * Возвращает 'ok' | 'cancel' | 'extra'.
 */
function openSheet({ title, message, confirmText = 'Хорошо', cancelText = 'Отмена', danger = false, extra = null }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="sheet__actions">
          ${extra ? `<button class="btn" data-sheet="extra">${esc(extra)}</button>` : ''}
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-sheet="ok">${esc(confirmText)}</button>
          <button class="btn" data-sheet="cancel">${esc(cancelText)}</button>
        </div>
      </div>`;

    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.addEventListener('click', (event) => {
      const button = event.target.closest('[data-sheet]');
      if (!button) {
        if (event.target === backdrop) finish('cancel');
        return;
      }
      finish(button.dataset.sheet);
    });

    document.body.append(backdrop);
  });
}

/* ═══════════════════════════ обработка нажатий ═══════════════════════════ */

function onClick(event) {
  const target = event.target.closest('[data-act]');
  if (!target) return;
  const act = target.dataset.act;

  if (act === 'tab') { goTab(target.dataset.tab); return; }
  if (act === 'back') { back(); return; }
  if (act === 'shift-new') { push('shiftForm', {}); return; }
  if (act === 'shift-edit') { push('shiftForm', { id: Number(target.dataset.id) }); return; }
  if (act === 'shift-delete') { deleteShift(Number(target.dataset.id)); return; }
  if (act === 'toggle-amounts') { toggleAmounts(); return; }
  if (act === 'income-new') { push('incomeForm', {}); return; }
  if (act === 'income-edit') { push('incomeForm', { id: Number(target.dataset.id) }); return; }
  if (act === 'income-delete') { deleteIncome(Number(target.dataset.id)); return; }
  if (act === 'filter-reset') {
    state.incomeFilter = { category: 'all', shift: 'all' };
    render();
    return;
  }
  if (act === 'open-shifts') { state.tab = 'more'; push('shifts', {}); return; }
  if (act === 'apply-update') { applyUpdate(); return; }
}

function onChange(event) {
  const field = event.target.closest('[data-act="filter"]');
  if (!field) return;
  state.incomeFilter[field.dataset.filter] = field.value;
  render();
}

function onSubmit(event) {
  const form = event.target;
  const act = form.dataset ? form.dataset.act : null;
  if (!act) return;
  event.preventDefault();
  if (act === 'shift-save') saveShift(form);
  if (act === 'income-save') saveIncome(form);
}

/* ═══════════════════════════ service worker и обновление ═══════════════════════════ */

const SW_VERSION = 'v2';   // при изменении файлов приложения поднимаем вместе с sw.js

async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    state.swRegistration = registration;

    const watch = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          state.updateReady = true;
          render();
        }
      });
    };

    if (registration.waiting && navigator.serviceWorker.controller) {
      state.updateReady = true;
      render();
    }
    watch(registration.installing);
    registration.addEventListener('updatefound', () => watch(registration.installing));

    // при возврате в приложение проверяем, не вышла ли новая версия
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update().catch(() => {});
    });

    // перезагружаемся только по кнопке «Обновить»: данные в IndexedDB не затрагиваются
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.reloading) location.reload();
    });
  } catch (error) {
    console.warn('Service worker не зарегистрирован:', error);
  }
}

async function applyUpdate() {
  const registration = state.swRegistration;
  const waiting = registration && registration.waiting;
  if (waiting) {
    waiting.postMessage('skip-waiting');
    setTimeout(() => { if (!state.reloading) { state.reloading = true; location.reload(); } }, 1500);
  } else {
    state.reloading = true;
    location.reload();
  }
}

/* ═══════════════════════════ экраны ═══════════════════════════ */

const VIEWS = {
  home: homeView,
  incomes: incomesView,
  incomeForm: incomeFormView,
  expenses: () => soonView('Расходы', 'Раздел «Расходы» появится после поступлений и вложений.'),
  more: moreView,
  shifts: shiftsView,
  shiftForm: shiftFormView,
};

/* ═══════════════════════════ подписки и старт ═══════════════════════════ */

document.addEventListener('click', onClick);
document.addEventListener('submit', onSubmit);
document.addEventListener('change', onChange);

// системная кнопка «назад» (жест «свайп от края») — по возможности закрываем подэкран, а не приложение
window.addEventListener('popstate', () => {
  if (state.stack.length) back();
});

if (typeof document !== 'undefined' && document.getElementById('app')) {
  boot();
}

// удобно при отладке: window.vakhta.state
window.vakhta = { state, db, dates: D, render, reload, VERSION: SW_VERSION };
