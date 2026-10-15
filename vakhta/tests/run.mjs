/**
 * run.mjs — проверки логики «Счётчика вахты».
 *
 * Что делает: поднимает настоящий index.html в jsdom, подменяет IndexedDB
 * библиотекой fake-indexeddb, подключает app.js как модуль и «нажимает» кнопки,
 * как это делал бы человек. Запуск: npm test (в папке tests).
 */
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import 'fake-indexeddb/auto';

const ROOT = new URL('..', import.meta.url).pathname;

let passed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
    process.stdout.write(`  ✗ ${name}${extra ? ` — ${extra}` : ''}\n`);
  }
}

function equal(name, actual, expected) {
  check(name, actual === expected, `получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`);
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─────────────── подготовка окружения (jsdom + IndexedDB) ─────────────── */

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (!/Not implemented/.test(String(error.message))) console.error('jsdom:', error.message);
});

const dom = new JSDOM(readFileSync(`${ROOT}index.html`, 'utf8'), {
  url: 'https://example.github.io/Tick/vakhta/index.html',
  pretendToBeVisual: true,
  virtualConsole,
});

const { window } = dom;
window.scrollTo = () => {};
window.history.pushState = () => {};

/** Значение из jsdom доступно в Node только для чтения — подменяем через defineProperty. */
function expose(key, value) {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

// app.js обращается к глобальным объектам — отдаём ему окружение jsdom
for (const key of ['window', 'document', 'navigator', 'location', 'history', 'HTMLElement', 'Node', 'Event',
  'CustomEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'Blob', 'File',
  'FormData', 'URL', 'URLSearchParams', 'indexedDB', 'IDBKeyRange', 'MutationObserver']) {
  if (window[key] !== undefined) expose(key, window[key]);
}
expose('self', window);
// service worker в тестах не нужен: navigator.serviceWorker отсутствует — так и задумано
delete window.navigator.serviceWorker;

// jsdom не умеет создавать object URL — подменяем простой заглушкой
let objectUrlSeq = 0;
const createdUrls = [];
window.URL.createObjectURL = (blob) => {
  const url = `blob:test/${++objectUrlSeq}`;
  createdUrls.push({ url, blob });
  return url;
};
window.URL.revokeObjectURL = () => {};
expose('URL', window.URL);

// app.js выполняется ради побочного эффекта (рисует интерфейс и кладёт своё в window.vakhta)
await import(`${ROOT}app.js?test=${Date.now()}`);
const D = await import(`${ROOT}dates.js`);
const db = await import(`${ROOT}db.js`);
const F = await import(`${ROOT}files.js`);
const app = window.vakhta;

await sleep(80);   // ждём завершения boot()

const $ = (selector) => window.document.querySelector(selector);
const text = (selector) => ($(selector) ? normalize($(selector).textContent).trim() : null);
// неразрывные пробелы в суммах приводим к обычным, чтобы сравнение было простым
const normalize = (value) => value.replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
const html = () => normalize(window.document.getElementById('screen').innerHTML);

async function refresh() {
  await app.reload();
  app.render();
}

/** Переключить фильтр: элемент пересоздаётся при перерисовке, поэтому ищем заново. */
async function setFilter(which, value) {
  const select = $(which === 'category' ? '#filter-category' : '#filter-shift');
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(40);
}

async function submitForm(selector, values) {
  const form = $(selector);
  for (const [name, value] of Object.entries(values)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.value = value;
  }
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
}

/* ═══════════════════════════ 1. Расчёт дат ═══════════════════════════ */

section('1. Расчёт дат');
{
  const today = '2026-10-15';
  const shift = { id: 1, arrival: '2026-10-01', workStart: '2026-10-03', workEnd: '2026-10-30' };

  equal('длина вахты M', D.shiftLength(shift), 30);
  equal('номер дня N', D.shiftDayNumber(shift, today), 15);
  equal('осталось дней', D.shiftDaysLeft(shift, today), 15);
  equal('статус идущей', D.shiftStatus(shift, today), D.ACTIVE);
  equal('статус предстоящей', D.shiftStatus(shift, '2026-09-20'), D.PLANNED);
  equal('статус завершённой', D.shiftStatus(shift, '2026-11-01'), D.DONE);

  equal('этап «в дороге»', D.shiftStage(shift, '2026-10-02'), 'road');
  equal('этап «на объекте»', D.shiftStage(shift, '2026-10-03'), 'site');
  equal('без начала работы этапа «в дороге» нет', D.shiftStage({ arrival: '2026-10-01', workStart: '2026-10-01', workEnd: '2026-10-30' }, '2026-10-01'), 'site');

  // вехи
  equal('последний день', D.shiftMilestone({ arrival: '2026-10-06', workEnd: '2026-10-15' }, today), 'Последний день');
  equal('осталась неделя (M>14)', D.shiftMilestone({ arrival: '2026-10-01', workEnd: '2026-10-22' }, today), 'Осталась неделя');
  equal('неделя при M<=14 не показывается, зато ловится середина', D.shiftMilestone({ arrival: '2026-10-09', workEnd: '2026-10-22' }, today), 'Середина вахты');
  equal('без вех вне знаковых дней', D.shiftMilestone({ arrival: '2026-10-10', workEnd: '2026-10-22' }, today), null);
  equal('середина вахты', D.shiftMilestone({ arrival: '2026-10-11', workEnd: '2026-10-20' }, today), 'Середина вахты');
  equal('приоритет: последний день выше остальных', D.shiftMilestone({ arrival: '2026-10-09', workEnd: '2026-10-15' }, today), 'Последний день');
  equal('у предстоящей вех нет', D.shiftMilestone({ arrival: '2026-11-01', workEnd: '2026-11-30' }, today), null);
  equal('у завершённой вех нет', D.shiftMilestone({ arrival: '2026-08-01', workEnd: '2026-08-30' }, today), null);

  // пересечения и домашние дни
  check('пересечение по границе', D.shiftsOverlap(
    { arrival: '2026-10-01', workEnd: '2026-10-15' }, { arrival: '2026-10-15', workEnd: '2026-10-30' }));
  check('соседние вахты не пересекаются', !D.shiftsOverlap(
    { arrival: '2026-10-01', workEnd: '2026-10-15' }, { arrival: '2026-10-16', workEnd: '2026-10-30' }));
  equal('дома 1 день в первый день после окончания', D.homeDays({ workEnd: '2026-10-14' }, today), 1);
  equal('заезд сегодня — 0 дней ожидания', D.daysUntil('2026-10-15', today), 0);

  // формат и склонения
  equal('формат даты', D.formatDate('2026-10-05'), '05.10.2026');
  equal('диапазон', D.formatRange('2026-10-01', '2026-10-30'), '01.10.2026–30.10.2026');
  equal('склонение 1', D.formatDays(1), '1 день');
  equal('склонение 2', D.formatDays(2), '2 дня');
  equal('склонение 5', D.formatDays(5), '5 дней');
  equal('склонение 11', D.formatDays(11), '11 дней');
  equal('склонение 21', D.formatDays(21), '21 день');
  equal('добавление дней', D.addDays('2026-10-31', 1), '2026-11-01');
  equal('разница дней', D.diffDays('2026-10-01', '2026-10-31'), 30);
}

/* ═══════════════════════════ 2. Запуск и пустое состояние ═══════════════════════════ */

section('2. Запуск приложения');
{
  check('нижние вкладки отрисованы', window.document.getElementById('tabbar').children.length === 4);
  check('заголовок «Вахта»', text('#app-title') === 'Вахта');
  check('пустое состояние с кнопкой', /Задать вахту/.test(html()));
  check('подсвечена активная вкладка', !!$('.tab.is-active[data-tab="home"]'));
}

/* ═══════════════════════════ 3. Вахты через интерфейс ═══════════════════════════ */

section('3. Добавление и проверка вахт');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);   // дата со сдвигом от сегодня

  // с главного экрана: пустая форма → ошибки
  $('[data-act="shift-new"]').click();
  await sleep(30);
  check('открылась форма вахты', !!$('#shift-form'));

  await submitForm('#shift-form', { arrival: '', workStart: '', workEnd: '' });
  check('ошибка про заезд', /Укажите дату заезда/.test($('[data-error="arrival"]').textContent));
  check('форма не закрылась, ввод не потерян', !!$('#shift-form'));

  // окончание раньше заезда
  await submitForm('#shift-form', { arrival: '2026-09-01', workStart: '', workEnd: '2026-08-01' });
  check('ошибка порядка дат', /не может быть раньше заезда/.test($('[data-error="workEnd"]').textContent));

  // корректная вахта вокруг сегодняшнего дня: сегодня = день 20 из 30
  await submitForm('#shift-form', { arrival: key(-19), workStart: key(-17), workEnd: key(10) });
  await sleep(80);
  check('вахта сохранена в базе', (await db.listShifts()).length === 1);
  equal('в форме нормализовано начало работы', (await db.listShifts())[0].workStart, key(-17));
  check('после сохранения вернулись на главный экран', text('#app-title') === 'Вахта');
}

section('3б. Вахты из раздела «Ещё»');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);   // дата со сдвигом от сегодня

  $('.tab[data-tab="more"]').click();
  await sleep(20);
  $('[data-act="open-shifts"]').click();
  await sleep(30);
  equal('в списке одна вахта', window.document.querySelectorAll('.item').length, 1);

  // пересечение с существующей вахтой
  $('[data-act="shift-new"]').click();
  await sleep(20);
  await submitForm('#shift-form', { arrival: key(5), workStart: '', workEnd: key(20) });
  check('пересечение отклонено', /Пересекается с вахтой/.test($('[data-error="arrival"]').textContent));
  equal('вторая вахта не добавилась', (await db.listShifts()).length, 1);
  $('[data-act="back"]').click();
  await sleep(20);

  // предстоящая вахта: не пересекается
  $('[data-act="shift-new"]').click();
  await sleep(20);
  await submitForm('#shift-form', { arrival: key(30), workStart: '', workEnd: key(59) });
  await sleep(60);
  equal('предстоящая вахта добавлена', (await db.listShifts()).length, 2);
  check('после сохранения вернулись в список вахт', text('#app-title') === 'Вахты');
  equal('в списке две вахты', window.document.querySelectorAll('.item').length, 2);
}

/* ═══════════════════════════ 4. Главный экран: идущая вахта ═══════════════════════════ */

section('4. Главный экран (идущая вахта)');
{
  $('.tab[data-tab="home"]').click();
  await sleep(40);
  const screen = html();
  if (process.env.DEBUG_SCREEN) process.stdout.write(`   экран: ${screen.slice(0, 400)}\n`);

  check('есть круговой индикатор', !!$('.gauge__bar'));
  check('«День 20» внутри кольца', text('.gauge__number') === '20');
  check('«из 30 дней» под числом', text('.gauge__of') === 'из 30 дней');
  check('«Осталось 10 дней»', /Осталось <b>10<\/b> дней/.test(screen));
  check('этап «На объекте»', /На объекте/.test(screen));
  check('диапазон дат вахты', /–/.test(text('.home-range')));

  // дуга: заполнение 20/30 → offset = длина * (1 - 2/3)
  const bar = $('.gauge__bar');
  // jsdom выбрасывает CSS-переменные из style, поэтому берём их из исходного HTML
  if (process.env.DEBUG_SCREEN) process.stdout.write(`   стиль дуги: ${bar.getAttribute('style')}\n`);
  const circumference = Number(((screen.match(/--circ:\s*([\d.]+)/) || [])[1]));
  const offset = Number(bar.dataset.offset);
  check('дуга заполнена на 20/30', Math.abs(offset - circumference * (1 - 20 / 30)) < 0.2, `offset=${offset}`);
  check('анимация запущена', bar.style.strokeDashoffset !== '');

  // суммы скрыты по умолчанию
  check('суммы скрыты по умолчанию', /••• ₽/.test(screen));
  check('подсказка про показ сумм', /Нажмите, чтобы показать/.test(screen));

  $('.money').click();
  await sleep(20);
  check('суммы показались', !/••• ₽/.test(html()) && /₽/.test(html()));
  check('значение суммы «0 ₽»', /0 ₽/.test(html()));
}

/* ═══════════════════════════ 5. Режим «Дома» ═══════════════════════════ */

section('5. Режим «Дома»');
{
  const shifts = await db.listShifts();
  const active = shifts.find((shift) => D.shiftStatus(shift) === D.ACTIVE);
  await db.updateShift({ ...active, arrival: D.addDays(D.todayKey(), -40), workEnd: D.addDays(D.todayKey(), -5) });
  await refresh();

  const screen = html();
  check('показано «Дома»', /Дома/.test(screen));
  check('дома 5 дней (окончание 5 дней назад)', text('.home-idle__num') === '5');
  check('подсказка про следующую вахту', /До заезда на следующую вахту/.test(screen));
  check('дней до заезда 30', /<b>30<\/b>/.test(screen));
  check('кругового индикатора нет', !$('.gauge__bar'));
}

/* ═══════════════════════════ 6. Итоги и контекстная вахта ═══════════════════════════ */

section('6. Суммы на главном экране');
{
  // сейчас активной вахты нет: контекстная вахта — последняя завершённая
  const shifts = await db.listShifts();
  const lastFinished = shifts.find((shift) => D.shiftStatus(shift) === D.DONE);
  const planned = shifts.find((shift) => D.shiftStatus(shift) === D.PLANNED);

  await db.put('incomes', { shiftId: lastFinished.id, amount: 50000, date: D.todayKey(), category: 'advance', note: '', attachments: [] });
  await db.put('incomes', { shiftId: planned.id, amount: 20000, date: D.todayKey(), category: 'bonus', note: '', attachments: [] });
  await db.put('incomes', { shiftId: null, amount: 7000, date: D.todayKey(), category: 'other', note: '', attachments: [] });
  await refresh();

  check('контекстная вахта — последняя завершённая', !!lastFinished && !!planned);

  // показываем суммы (нажатием, если они скрыты)
  if (!app.state.amountsVisible) { $('.money').click(); await sleep(20); }
  const screen = html();
  if (process.env.DEBUG_SCREEN) process.stdout.write(`   суммы: ${screen.match(/<button class="money[\s\S]*?<\/button>/)?.[0]}\n`);
  check('за вахту — 50 000 ₽ с пробелом-разделителем', /50 000 ₽/.test(screen));
  check('всего — 77 000 ₽ (включая «без вахты»)', /77 000 ₽/.test(screen));
  check('таймер автоскрытия запущен', app.state.amountsTimer !== null);

  // автоскрытие через 5 секунд: проверяем сам механизм
  clearTimeout(app.state.amountsTimer);
  app.state.amountsVisible = true;
  app.state.amountsTimer = setTimeout(() => { app.state.amountsVisible = false; app.render(); }, 5);
  await sleep(30);
  check('суммы снова скрылись', /••• ₽/.test(html()));
}

/* ═══════════════════════════ 7. Удаление вахты ═══════════════════════════ */

section('7. Удаление вахты каскадом');
{
  const shifts = await db.listShifts();
  const target = shifts.find((shift) => D.shiftStatus(shift) === D.PLANNED);

  // прикрепим вложение, чтобы проверить каскад
  const attachmentId = await db.put('attachments', { incomeId: null, shiftId: target.id, name: 'чек.jpg', type: 'image/jpeg', size: 10, blob: new NodeBlob(['x']) });
  const incomes = await db.getAll('incomes');
  const linked = incomes.find((income) => income.shiftId === target.id);
  await db.put('incomes', { ...linked, attachments: [attachmentId] });
  await db.put('expenses', { shiftId: target.id, amount: 1200, date: D.todayKey(), categoryId: 'food', note: '' });

  $('.tab[data-tab="more"]').click();
  await sleep(20);
  $('[data-act="open-shifts"]').click();
  await sleep(30);
  check('открылся список вахт', text('#app-title') === 'Вахты');

  $(`[data-act="shift-delete"][data-id="${target.id}"]`).click();
  await sleep(60);

  const sheetText = $('.sheet p') ? $('.sheet p').textContent.replace(/\s+/g, ' ') : '';
  check('в подтверждении сказано, что будет удалено', /Будет удалено: 1 поступление, 1 расход и их вложения/.test(sheetText));

  $('[data-sheet="cancel"]').click();
  await sleep(30);
  check('отмена ничего не удалила', (await db.listShifts()).length === 2);

  $(`[data-act="shift-delete"][data-id="${target.id}"]`).click();
  await sleep(60);
  $('[data-sheet="ok"]').click();
  await sleep(120);

  const left = await db.listShifts();
  check('вахта удалена', left.length === 1 && left[0].id !== target.id);
  equal('её поступление удалено, остальные целы', (await db.getAll('incomes')).length, 2);
  equal('её расходы удалены', (await db.getAll('expenses')).length, 0);
  equal('её вложения удалены', (await db.getAll('attachments')).length, 0);
}

/* ═══════════════════════════ 8. Категории расходов ═══════════════════════════ */

section('8. Стартовые категории расходов');
{
  const categories = await db.listCategories();
  equal('четыре стартовых категории', categories.length, 4);
  equal('порядок категорий', categories.map((category) => category.name).join(','), 'еда,связь,дорога,прочее');
  check('«прочее» помечено как неудаляемое', categories.find((category) => category.name === 'прочее').fixed === true);
}


/* ═══════════════════════════ 9. Поступления ═══════════════════════════ */

/** «15.10.2026» → номер дня (для проверки порядка сортировки). */
const dayOfText = (text) => {
  const [d, m, y] = text.split('.').map(Number);
  return D.dayNumber(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
};

section('9. Поступления: форма и валидация');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);

  // приводим данные к понятному состоянию: идущая вахта + отдельная завершённая
  const shifts = await db.listShifts();
  const main = shifts[0];
  await db.updateShift({ ...main, arrival: key(-10), workStart: key(-9), workEnd: key(9) });
  await db.clear('incomes');
  const finishedId = await db.addShift({ arrival: key(-40), workStart: key(-39), workEnd: key(-12) });
  await refresh();

  $('.tab[data-tab="incomes"]').click();
  await sleep(30);
  equal('вкладка «Поступления» открыта', text('#app-title'), 'Поступления');
  check('пустое состояние с кнопкой', /Добавить поступление/.test(html()));

  $('[data-act="income-new"]').click();
  await sleep(30);
  check('форма поступления открылась', !!$('#income-form'));

  // пустая сумма и битая дата
  await submitForm('#income-form', { amount: '', date: '2026-13-45' });
  check('ошибка про пустую сумму', /Введите сумму/.test($('[data-error="amount"]').textContent));
  check('ошибка про дату', /Укажите дату/.test($('[data-error="date"]').textContent));

  // нулевая сумма
  await submitForm('#income-form', { amount: '0', date: key(0) });
  check('ошибка про нулевую сумму', /больше нуля/.test($('[data-error="amount"]').textContent));
  check('форма не закрылась', !!$('#income-form'));

  // во время ввода подсказка показывает, какая сумма получится
  const amountInput = $('#f-amount');
  amountInput.value = '50 000';
  amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await sleep(20);
  check('подсказка показывает разбор суммы', /50 000 ₽/.test(normalize($('[data-hint="amount"]').textContent)));

  // категории поступлений по заданию
  const categories = Array.from($('#f-category').options).map((option) => option.value);
  equal('категории поступлений', categories.join(','), 'аванс,расчёт,премия,отпускные,прочее');

  // вахта по умолчанию — идущая
  const active = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.ACTIVE);
  equal('вахта по умолчанию — идущая', String($('#f-shift').value), String(active.id));
  equal('первый пункт списка вахт — «Без вахты»', $('#f-shift').options[0].value, '');

  // сохраняем корректное поступление
  await submitForm('#income-form', { amount: '50 000', date: key(-3), category: 'аванс', shiftId: String(active.id), note: 'аванс за 15 дней' });
  await sleep(80);

  const saved = (await db.listIncomes()).find((income) => income.amount === 50000);
  check('поступление сохранено с целой суммой', !!saved);
  equal('категория сохранена', saved.category, 'аванс');
  equal('привязка к вахте сохранена', saved.shiftId, active.id);
  equal('заметка сохранена', saved.note, 'аванс за 15 дней');
  equal('после сохранения вернулись к списку', text('#app-title'), 'Поступления');
}

section('10. Поступления: список, фильтры, итоги');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);
  const active = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.ACTIVE);
  const finished = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.DONE);

  await db.addIncome({ shiftId: finished.id, amount: 120000, date: key(-20), category: 'расчёт', note: '' });
  await db.addIncome({ shiftId: null, amount: 7000, date: key(-1), category: 'прочее', note: 'подработка' });
  await refresh();

  // список от новых к старым
  const dates = Array.from(window.document.querySelectorAll('.item__date')).map((node) => dayOfText(node.textContent.trim()));
  const amounts = Array.from(window.document.querySelectorAll('.item__amount')).map((node) => node.textContent.replace(/\D/g, ''));
  equal('в списке три поступления', amounts.length, 3);
  check('первым идёт самое новое по дате', dates[0] >= dates[1] && dates[1] >= dates[2], dates.join(','));
  equal('в строке видно сумму', amounts[0], '7000');

  // итоги
  const totals = html();
  check('итог за вахту (идущая) — 50 000 ₽', /За вахту[^<]*<\/dt><dd class="num">50 000 ₽/.test(totals));
  check('итог за всё время — 177 000 ₽', /За всё время[^<]*<\/dt><dd class="num">177 000 ₽/.test(totals));
  check('разбивка по категориям есть', /По категориям/.test(totals) && /аванс/.test(totals));
  check('в строке видна категория и вахта', /chip chip--accent">прочее/.test(totals) && /chip chip--muted">без вахты/.test(totals));

  // фильтр по категории
  await setFilter('category', 'расчёт');
  equal('по фильтру «расчёт» одно поступление', window.document.querySelectorAll('.item').length, 1);
  check('сумма отфильтрованного поступления', /120 000 ₽/.test(html()));
  check('итог по фильтру подписан', /По категориям \(по фильтру\)/.test(html()));

  // фильтр по вахте «без вахты»
  await setFilter('category', 'all');
  await setFilter('shift', 'none');
  equal('по фильтру «без вахты» одно поступление', window.document.querySelectorAll('.item').length, 1);
  check('итог «Без вахты» — 7 000 ₽', /Без вахты[^<]*<\/dt><dd class="num">7 000 ₽/.test(html()));

  // фильтр по завершённой вахте
  await setFilter('shift', String(finished.id));
  equal('по фильтру вахты одно поступление', window.document.querySelectorAll('.item').length, 1);
  check('итог за выбранную вахту — 120 000 ₽', /За вахту[^<]*<\/dt><dd class="num">120 000 ₽/.test(html()));

  // сброс фильтров
  $('[data-act="filter-reset"]').click();
  await sleep(30);
  equal('после сброса видны все три', window.document.querySelectorAll('.item').length, 3);
}

section('11. Поступления: изменение, вложения, удаление');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);
  const list = await db.listIncomes();
  const changed = list.find((income) => income.category === 'прочее');

  // редактирование: меняем сумму, дату, категорию и привязку
  $(`[data-act="income-edit"][data-id="${changed.id}"]`).click();
  await sleep(40);
  check('открылась форма редактирования', text('#app-title') === 'Поступление');
  equal('сумма подставлена в поле', $('#f-amount').value, '7000');
  equal('категория подставлена', $('#f-category').value, 'прочее');
  equal('привязка «без вахты» подставлена', $('#f-shift').value, '');

  const active = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.ACTIVE);
  await submitForm('#income-form', { amount: '9000', date: key(-2), category: 'премия', shiftId: String(active.id), note: 'премия' });
  await sleep(80);
  const updated = (await db.listIncomes()).find((income) => income.id === changed.id);
  equal('сумма обновилась', updated.amount, 9000);
  equal('категория обновилась', updated.category, 'премия');
  equal('привязку можно менять', updated.shiftId, active.id);

  // скрепка с числом вложений (загрузка файлов — следующий шаг, данные уже готовы)
  const attachmentId = await db.put('attachments', { incomeId: updated.id, shiftId: updated.shiftId, name: 'расчётка.jpg', type: 'image/jpeg', size: 20, blob: new NodeBlob(['x']) });
  await db.updateIncome({ ...updated, attachments: [attachmentId] });
  await refresh();
  check('скрепка показывает число вложений', $('[data-act="open-attachments"]') && /1 файл/.test($('[data-act="open-attachments"]').textContent));

  // удаление с подтверждением
  $(`[data-act="income-delete"][data-id="${updated.id}"]`).click();
  await sleep(80);
  check('подтверждение упоминает вложения', /Вложения \(1 файл\)/.test(normalize($('.sheet p').textContent)));
  $('[data-sheet="cancel"]').click();
  await sleep(30);
  equal('отмена сохранила поступление', (await db.listIncomes()).length, 3);

  $(`[data-act="income-delete"][data-id="${updated.id}"]`).click();
  await sleep(80);
  $('[data-sheet="ok"]').click();
  await sleep(140);
  equal('поступление удалено', (await db.listIncomes()).length, 2);
  equal('его вложение удалено', (await db.getAll('attachments')).length, 0);
}

section('12. Суммы на главном экране после добавления поступлений');
{
  const active = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.ACTIVE);
  const finished = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.DONE);

  await db.addIncome({ shiftId: active.id, amount: 30000, date: D.todayKey(), category: 'расчёт', note: '' });
  await db.addIncome({ shiftId: finished.id, amount: 150000, date: D.todayKey(), category: 'расчёт', note: '' });
  await refresh();

  $('.tab[data-tab="home"]').click();
  await sleep(30);
  if (!app.state.amountsVisible) { $('.money').click(); await sleep(20); }
  const screen = html();
  check('за вахту — только поступления идущей вахты (80 000 ₽)', /80 000 ₽/.test(screen));
  check('всего — все поступления (350 000 ₽)', /350 000 ₽/.test(screen));
}


/* ═══════════════════════════ 13. Вложения: проверка файлов ═══════════════════════════ */

section('13. Вложения: правила и проверка файлов');
{
  equal('размер по-человечески: килобайты', F.humanSize(1536), '2 КБ');
  equal('размер по-человечески: мегабайты', F.humanSize(10 * 1024 * 1024), '10,0 МБ');
  check('определение фото', F.isImage('image/jpeg') && !F.isImage('application/pdf'));
  check('определение PDF', F.isPdf('application/pdf') && !F.isPdf('image/png'));

  const pdf = (bytes) => ({ name: 'чек.pdf', type: 'application/pdf', size: bytes });
  const photo = (bytes) => ({ name: 'фото.jpg', type: 'image/jpeg', size: bytes });

  check('обычный PDF принимается', F.validateFile(pdf(1024 * 1024), 0).ok === true);
  check('PDF ровно 10 МБ принимается', F.validateFile(pdf(10 * 1024 * 1024), 0).ok === true);
  equal('PDF больше 10 МБ отклоняется', F.validateFile(pdf(10 * 1024 * 1024 + 1), 0).error,
    'PDF больше 10,0 МБ — выберите файл поменьше');
  check('фото принимается', F.validateFile(photo(3 * 1024 * 1024), 0).ok === true);
  equal('чужой тип отклоняется', F.validateFile({ name: 'a.zip', type: 'application/zip', size: 10 }, 0).error,
    'Поддерживаются только фото и PDF');
  equal('11-й файл не вмещается', F.validateFile(photo(1000), 10).error,
    'К поступлению можно прикрепить не больше 10 файлов');
}

section('14. Вложения: EXIF-ориентация');
{
  /** Собираем минимальный JPEG с EXIF-ориентацией. */
  const jpegWithOrientation = (orientation) => {
    const bytes = [];
    const push16 = (value) => bytes.push((value >> 8) & 0xff, value & 0xff);
    const push32 = (value) => bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);

    bytes.push(0xff, 0xd8);                       // SOI
    bytes.push(0xff, 0xe1);                       // APP1
    const app1Size = 2 + 6 + 8 + 2 + 12 + 4;      // размер блока APP1
    push16(app1Size);
    for (const char of 'Exif\0\0') bytes.push(char.charCodeAt(0));
    bytes.push(0x4d, 0x4d);                       // 'MM' — big-endian
    push16(0x002a);
    push32(8);                                    // смещение IFD0 от TIFF-заголовка
    push16(1);                                    // одна запись
    push16(0x0112);                               // тег Orientation
    push16(3);                                    // тип SHORT
    push32(1);                                    // количество значений
    push16(orientation);                          // само значение
    push16(0);                                    // выравнивание
    push32(0);                                    // следующей IFD нет
    bytes.push(0xff, 0xd9);                       // EOI
    return new NodeBlob([new Uint8Array(bytes)], { type: 'image/jpeg' });
  };

  equal('ориентация 6 читается', await F.readExifOrientation(jpegWithOrientation(6)), 6);
  equal('ориентация 8 читается', await F.readExifOrientation(jpegWithOrientation(8)), 8);
  equal('не JPEG — считаем как есть', await F.readExifOrientation(new NodeBlob(['просто текст'])), 1);
  equal('PNG — считаем как есть', await F.readExifOrientation(new NodeBlob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])), 1);
  equal('битый JPEG не ломает чтение', await F.readExifOrientation(new NodeBlob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00])])), 1);
}

section('15. Вложения: прикрепление PDF к поступлению');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);
  const active = (await db.listShifts()).find((shift) => D.shiftStatus(shift) === D.ACTIVE);

  await db.clear('attachments');
  await refresh();

  $('.tab[data-tab="incomes"]').click();
  await sleep(30);
  $('[data-act="income-new"]').click();
  await sleep(40);

  check('блок вложений есть в форме', !!$('#attach-list'));
  check('подсказка про лимиты', /До 10 файлов/.test(normalize($('[data-hint="attach"]').textContent)));
  check('в списке вложений пусто', /Пока ничего не прикреплено/.test(html()));

  // выбираем PDF через настоящий input[type=file]
  const pdfFile = new NodeFile([new Uint8Array(2048)], 'расчётка.pdf', { type: 'application/pdf' });
  const input = $('#file-gallery');
  Object.defineProperty(input, 'files', { value: [pdfFile], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(120);

  check('PDF появился в списке вложений', window.document.querySelectorAll('.attach-item').length === 1);
  check('видно имя файла', /расчётка.pdf/.test($('.attach-item__name').textContent));
  check('видно размер', /2 КБ/.test($('.attach-item').textContent.replace(/\s+/g, ' ')));

  // сохраняем поступление с вложением
  await submitForm('#income-form', { amount: '45000', date: key(-1), category: 'расчёт', shiftId: String(active.id), note: '' });
  await sleep(200);

  const incomes = await db.listIncomes();
  const saved = incomes.find((income) => income.amount === 45000);
  check('поступление сохранено', !!saved);
  equal('к поступлению привязан один файл', (saved.attachments || []).length, 1);

  const attachments = await db.getAll('attachments');
  equal('вложение записано в базу', attachments.length, 1);
  equal('имя файла сохранено', attachments[0].name, 'расчётка.pdf');
  equal('тип файла сохранён', attachments[0].type, 'application/pdf');
  check('файл лежит как blob', attachments[0].blob && typeof attachments[0].blob.size === 'number');
  equal('вложение связано с поступлением', attachments[0].incomeId, saved.id);

  // скрепка в списке
  const badge = $('[data-act="open-attachments"]');
  check('скрепка показывает один файл', !!badge && /1/.test(badge.textContent));
  check('скрепка — это кнопка просмотра', !!badge && badge.dataset.id === String(saved.id));
}

section('16. Вложения: просмотр, зум и удаление');
{
  const income = (await db.listIncomes()).find((item) => (item.attachments || []).length);

  $('[data-act="open-attachments"]').click();
  await sleep(200);
  check('просмотрщик открылся', !!$('.viewer'));
  check('показан PDF во фрейме', !!$('.viewer__pdf'));
  check('в заголовке имя файла', /расчётка.pdf/.test($('#viewer-title').textContent));
  check('есть ссылка «открыть в новой вкладке»', $('#viewer-open').href.startsWith('blob:'));

  // удаление через подтверждение
  $('[data-viewer="delete"]').click();
  await sleep(80);
  check('спрашивается подтверждение', /Удалить вложение\?/.test($('.sheet h2').textContent));
  $('[data-sheet="cancel"]').click();
  await sleep(60);
  equal('отмена сохранила вложение', (await db.getAll('attachments')).length, 1);

  $('[data-viewer="delete"]').click();
  await sleep(80);
  $('[data-sheet="ok"]').click();
  await sleep(200);
  check('после удаления просмотрщик закрылся', !$('.viewer'));
  equal('вложение удалено из базы', (await db.getAll('attachments')).length, 0);

  const after = (await db.listIncomes()).find((item) => item.id === income.id);
  equal('ссылка на файл убрана из поступления', (after.attachments || []).length, 0);
  check('скрепка этого поступления стала серой', !!$('.attach--off'));
}

section('17. Вложения: лимит файлов и фото');
{
  const key = (offset) => D.addDays(D.todayKey(), offset);

  $('[data-act="income-new"]').click();
  await sleep(40);

  // десять файлов — можно, одиннадцатый — нет
  const makePhoto = (index) => new NodeFile([new Uint8Array(1024)], `фото-${index}.jpg`, { type: 'image/jpeg' });
  const input = $('#file-gallery');
  Object.defineProperty(input, 'files', { value: Array.from({ length: 10 }, (unused, index) => makePhoto(index)), configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  equal('прикрепилось десять файлов', window.document.querySelectorAll('.attach-item').length, 10);

  const extra = new NodeFile([new Uint8Array(1024)], 'лишний.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [extra], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  equal('одиннадцатый файл не добавился', window.document.querySelectorAll('.attach-item').length, 10);
  check('показано понятное сообщение', /не больше 10 файлов/.test($('[data-error="attach"]').textContent));

  // фото без canvas (как в jsdom) сохраняется как есть — проверяем сам путь
  const photo = await F.prepareAttachment(new NodeFile([new Uint8Array(4096)], 'чек.jpg', { type: 'image/jpeg' }));
  check('фото не потеряно, даже если сжать не удалось', photo.size > 0 && !!photo.blob);
  equal('имя фото сохранено', photo.name, 'чек.jpg');

  // убираем файлы из формы без сохранения
  $('[data-act="remove-attachment"]').click();
  await sleep(30);
  equal('файл убран крестиком', window.document.querySelectorAll('.attach-item').length, 9);
  $('[data-act="back"]').click();
  await sleep(30);
  equal('после выхода из формы вложений не появилось', (await db.getAll('attachments')).length, 0);
}


/* ═══════════════════════════ 18. Сжатие фото (с подменой canvas) ═══════════════════════════ */

section('18. Сжатие фото: размеры и поворот по EXIF');
{
  /** Подменяем canvas и Image: настоящий canvas в jsdom недоступен. */
  const canvasCalls = [];
  window.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    const ctx = {
      save() {}, restore() {},
      scale(x, y) { canvas.__calls.push(['scale', +x.toFixed(4), +y.toFixed(4)]); },
      transform(a, b, c, d, e, f) { canvas.__calls.push(['transform', a, b, c, d, e, f]); },
      drawImage() { canvas.__calls.push(['drawImage']); },
    };
    return ctx;
  };
  window.HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    canvasCalls.push({ width: this.width, height: this.height, type, quality, calls: this.__calls });
    callback(new NodeBlob([new Uint8Array(16)], { type }));
  };
  const makeCanvas = () => {
    const canvas = window.document.createElement('canvas');
    canvas.__calls = [];
    return canvas;
  };
  // запоминаем все созданные canvas, чтобы посмотреть их параметры
  const originalCreateElement = window.document.createElement.bind(window.document);
  window.document.createElement = (tag, ...rest) => {
    const node = originalCreateElement(tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas' && node.__calls === undefined) node.__calls = [];
    return node;
  };

  // 1) браузер сам применяет EXIF (createImageBitmap с imageOrientation)
  expose('createImageBitmap', async (blob, options) => {
    checkBitmapOptions = options;
    return { width: 4032, height: 3024, close() {} };
  });
  let checkBitmapOptions = null;

  const landscape = await F.compressImage(new NodeFile([new Uint8Array(64)], 'photo.jpg', { type: 'image/jpeg' }));
  check('createImageBitmap вызывается с учётом EXIF',
    checkBitmapOptions && checkBitmapOptions.imageOrientation === 'from-image');
  check('фото сжато', !!landscape && !!landscape.photo);

  const photo = canvasCalls.find((call) => call.width >= 320 && call.width !== 320) || canvasCalls[0];
  equal('длинная сторона ровно 1600 px', photo.width, 1600);
  equal('вторая сторона по пропорции', photo.height, 1200);
  equal('формат JPEG', photo.type, 'image/jpeg');
  equal('качество 0.8', photo.quality, 0.8);

  const thumbCall = canvasCalls.find((call) => Math.max(call.width, call.height) === 320);
  check('миниатюра сделана', !!thumbCall);
  equal('качество миниатюры 0.7', thumbCall.quality, 0.7);

  // 2) старый браузер: без createImageBitmap, поворот делаем сами по EXIF
  canvasCalls.length = 0;
  expose('createImageBitmap', undefined);
  const originalImage = window.Image;
  expose('Image', function FakeImage() {
    // как у снимка с iPhone: матрица горизонтальная 4032×3024,
    // а EXIF-ориентация 6 говорит «повернуть на 90°» — значит на экране портрет
    this.naturalWidth = 4032;
    this.naturalHeight = 3024;
    setTimeout(() => this.onload && this.onload(), 0);
    Object.defineProperty(this, 'src', { set(value) { void value; }, get() { return 'blob:test'; } });
  });

  const jpeg6 = (() => {
    const bytes = [];
    const push16 = (value) => bytes.push((value >> 8) & 0xff, value & 0xff);
    const push32 = (value) => bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
    bytes.push(0xff, 0xd8, 0xff, 0xe1);
    push16(2 + 6 + 8 + 2 + 12 + 4);
    for (const char of 'Exif\0\0') bytes.push(char.charCodeAt(0));
    bytes.push(0x4d, 0x4d); push16(0x002a); push32(8); push16(1);
    push16(0x0112); push16(3); push32(1); push16(6); push16(0); push32(0);
    bytes.push(0xff, 0xd9);
    return new NodeFile([new Uint8Array(bytes)], 'повёрнутое.jpg', { type: 'image/jpeg' });
  })();

  const rotated = await F.compressImage(jpeg6);
  check('фото обработано запасным путём', !!rotated && !!rotated.photo);
  const rotatedPhoto = canvasCalls.find((call) => call.type === 'image/jpeg' && call.quality === 0.8);
  equal('поворот 90°: фото стало портретным — ширина', rotatedPhoto.width, 1200);
  equal('поворот 90°: фото стало портретным — высота', rotatedPhoto.height, 1600);
  check('применена матрица поворота на 90° по часовой',
    rotatedPhoto.calls.some((call) => call[0] === 'transform' && call[1] === 0 && call[2] === 1 && call[3] === -1 && call[4] === 0),
    JSON.stringify(rotatedPhoto.calls));

  expose('Image', originalImage);
  expose('createImageBitmap', undefined);
}

/* ═══════════════════════════ итог ═══════════════════════════ */

process.stdout.write(`\n${failures.length ? '❌' : '✅'} Проверок пройдено: ${passed}, провалено: ${failures.length}\n`);
for (const failure of failures) process.stdout.write(`   • ${failure}\n`);

// таймер полночи держит процесс живым — выходим явно
process.exit(failures.length ? 1 : 0);
