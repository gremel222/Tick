/**
 * run.mjs — проверки логики «Счётчика вахты».
 *
 * Что делает: поднимает настоящий index.html в jsdom, подменяет IndexedDB
 * библиотекой fake-indexeddb, подключает app.js как модуль и «нажимает» кнопки,
 * как это делал бы человек. Запуск: npm test (в папке tests).
 */
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Blob as NodeBlob } from 'node:buffer';
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

// app.js выполняется ради побочного эффекта (рисует интерфейс и кладёт своё в window.vakhta)
await import(`${ROOT}app.js?test=${Date.now()}`);
const D = await import(`${ROOT}dates.js`);
const db = await import(`${ROOT}db.js`);
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

/* ═══════════════════════════ итог ═══════════════════════════ */

process.stdout.write(`\n${failures.length ? '❌' : '✅'} Проверок пройдено: ${passed}, провалено: ${failures.length}\n`);
for (const failure of failures) process.stdout.write(`   • ${failure}\n`);

// таймер полночи держит процесс живым — выходим явно
process.exit(failures.length ? 1 : 0);
