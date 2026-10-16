/**
 * backup.js — резервная копия (JSON), её проверка, восстановление и выписка CSV.
 *
 * Зачем отдельный модуль: здесь описан ФОРМАТ данных, который переживает версии
 * приложения. Если структура изменится, номер версии схемы в db.js и этот файл
 * должны поменяться вместе — поэтому правила чтения собраны в одном месте.
 *
 * Главные принципы:
 *   • копия — один файл JSON: вахты, поступления, расходы, категории,
 *     вложения (как base64), настройки, номер версии схемы;
 *   • при импорте сначала ПОЛНАЯ проверка файла, потом подтверждение,
 *     и только затем замена данных в одной транзакции;
 *   • любая ошибка — старые данные остаются нетронутыми;
 *   • файл с версией схемы новее, чем знает приложение, отклоняется.
 */

import * as db from './db.js';
import * as D from './dates.js';
import * as F from './files.js';

export const BACKUP_FORMAT = 'vakhta-backup';
export const BACKUP_APP = 'Счётчик вахты';

/* ─────────────────────────── создание копии ─────────────────────────── */

/**
 * Собирает копию всех данных. Вложения записываются в base64,
 * потому что JSON не умеет хранить двоичные данные.
 */
export async function buildBackup() {
  const [shifts, incomes, expenses, categories, attachments, settings] = await Promise.all([
    db.listShifts(),
    db.listIncomes(),
    db.listExpenses(),
    db.listCategories(),
    db.getAll('attachments'),
    db.getSettings(),
  ]);

  const attachedFiles = [];
  for (const attachment of attachments) {
    attachedFiles.push({
      id: attachment.id,
      incomeId: attachment.incomeId ?? null,
      shiftId: attachment.shiftId ?? null,
      name: attachment.name || 'файл',
      type: attachment.type || 'application/octet-stream',
      size: attachment.size || (attachment.blob ? attachment.blob.size : 0),
      compressed: attachment.compressed !== false,
      data: attachment.blob ? await F.blobToBase64(attachment.blob) : '',
    });
  }

  return {
    format: BACKUP_FORMAT,
    app: BACKUP_APP,
    schemaVersion: db.SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    counts: {
      shifts: shifts.length,
      incomes: incomes.length,
      expenses: expenses.length,
      categories: categories.length,
      attachments: attachedFiles.length,
    },
    settings: {
      // В копию попадают настройки, но НЕ PIN: иначе после «Забыл PIN» человек
      // восстановил бы копию и снова не смог войти (см. README).
      lastBackupAt: settings.lastBackupAt || null,
      dirtyAfterBackup: settings.dirtyAfterBackup === true,
    },
    shifts: shifts.map((shift) => ({
      id: shift.id,
      arrival: shift.arrival,
      workStart: shift.workStart || shift.arrival,
      workEnd: shift.workEnd,
      createdAt: shift.createdAt || null,
    })),
    incomes: incomes.map((income) => ({
      id: income.id,
      shiftId: income.shiftId ?? null,
      amount: income.amount,
      date: income.date,
      category: income.category,
      note: income.note || '',
      attachments: (income.attachments || []).slice(),
      createdAt: income.createdAt || null,
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      shiftId: expense.shiftId ?? null,
      amount: expense.amount,
      date: expense.date,
      categoryId: expense.categoryId,
      note: expense.note || '',
      createdAt: expense.createdAt || null,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      order: category.order || 0,
      fixed: category.fixed === true,
    })),
    attachments: attachedFiles,
  };
}

/** Имя файла копии: «вахта-копия-16.10.2026.json». */
export function backupFileName(today = D.todayKey()) {
  return `вахта-копия-${D.formatDate(today)}.json`;
}

/** Имя файла выписки: «вахта-выписка-16.10.2026.csv». */
export function csvFileName(today = D.todayKey()) {
  return `вахта-выписка-${D.formatDate(today)}.csv`;
}

/* ─────────────────────────── проверка копии ─────────────────────────── */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value) => Number.isInteger(value) && value > 0;
const isAmount = (value) => Number.isInteger(value) && value > 0;
const isText = (value) => typeof value === 'string';

/**
 * Полная проверка файла копии.
 * Возвращает { ok: true, data, summary, fixes } либо { ok: false, error }.
 * Ничего не пишет в базу — только читает и разбирает.
 */
export function validateBackup(raw) {
  const fail = (error) => ({ ok: false, error });

  if (!isPlainObject(raw)) return fail('Это не файл резервной копии');
  if (raw.format !== BACKUP_FORMAT) return fail('Файл создан не приложением «Счётчик вахты»');
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) return fail('В файле не указана версия схемы');
  if (raw.schemaVersion > db.SCHEMA_VERSION) {
    return fail(`Файл создан более новой версией приложения (схема ${raw.schemaVersion}, поддерживается ${db.SCHEMA_VERSION}).
Обновите приложение и повторите импорт.`);
  }

  for (const key of ['shifts', 'incomes', 'expenses', 'categories', 'attachments']) {
    if (!Array.isArray(raw[key])) return fail(`В файле нет раздела «${key}»`);
  }

  /* категории */
  const categories = [];
  const categoryIds = new Set();
  for (const item of raw.categories) {
    if (!isPlainObject(item) || !isText(item.id) || !item.id || !isText(item.name) || !item.name.trim()) {
      return fail('Повреждён список категорий расходов');
    }
    if (categoryIds.has(item.id)) return fail('В файле повторяются категории расходов');
    categoryIds.add(item.id);
    const fixed = item.id === db.OTHER_CATEGORY_ID;
    categories.push({
      id: item.id,
      name: fixed ? 'прочее' : item.name.trim(),
      order: Number.isFinite(item.order) ? item.order : categories.length + 1,
      fixed,
    });
  }

  const fixes = [];
  // «прочее» должно существовать всегда — иначе расходы останутся без категории
  if (!categoryIds.has(db.OTHER_CATEGORY_ID)) {
    categories.push({ ...db.DEFAULT_CATEGORIES.find((category) => category.id === db.OTHER_CATEGORY_ID) });
    categoryIds.add(db.OTHER_CATEGORY_ID);
    fixes.push('восстановлена категория «прочее»');
  }

  /* вахты */
  const shifts = [];
  const shiftIds = new Set();
  for (const item of raw.shifts) {
    if (!isPlainObject(item) || !isId(item.id)) return fail('Повреждён список вахт');
    if (!D.isValidKey(item.arrival) || !D.isValidKey(item.workEnd)) return fail('В копии есть вахта с некорректными датами');
    const workStart = D.isValidKey(item.workStart) ? item.workStart : item.arrival;
    if (D.diffDays(item.arrival, workStart) < 0 || D.diffDays(workStart, item.workEnd) < 0) {
      return fail('В копии есть вахта, где даты идут не по порядку');
    }
    if (shiftIds.has(item.id)) return fail('В файле повторяются вахты');
    shiftIds.add(item.id);
    shifts.push({ id: item.id, arrival: item.arrival, workStart, workEnd: item.workEnd, createdAt: item.createdAt || null });
  }

  shifts.sort((a, b) => (a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : 0));
  for (let i = 1; i < shifts.length; i += 1) {
    if (D.shiftsOverlap(shifts[i - 1], shifts[i])) {
      return fail(`В копии вахты пересекаются по датам: ${D.formatRange(shifts[i - 1].arrival, shifts[i - 1].workEnd)} и ${D.formatRange(shifts[i].arrival, shifts[i].workEnd)}`);
    }
  }

  /* поступления */
  const incomes = [];
  const incomeIds = new Set();
  for (const item of raw.incomes) {
    if (!isPlainObject(item) || !isId(item.id) || !isAmount(item.amount)) {
      return fail('Повреждён список поступлений');
    }
    if (!D.isValidKey(item.date)) return fail('В копии есть поступление с некорректной датой');
    if (incomeIds.has(item.id)) return fail('В файле повторяются поступления');
    incomeIds.add(item.id);

    let shiftId = item.shiftId ?? null;
    if (shiftId !== null && !shiftIds.has(shiftId)) {
      shiftId = null;                    // ссылка на отсутствующую вахту — запись станет «Без вахты»
      fixes.push('поступление отвязано от отсутствующей вахты');
    }

    const attachments = Array.isArray(item.attachments)
      ? item.attachments.filter((id) => isId(id))
      : [];
    const category = db.INCOME_CATEGORIES.some((known) => known.id === item.category || known.name === item.category)
      ? item.category
      : db.INCOME_CATEGORIES[db.INCOME_CATEGORIES.length - 1].id;

    incomes.push({
      id: item.id,
      shiftId,
      amount: item.amount,
      date: item.date,
      category,
      note: isText(item.note) ? item.note : '',
      attachments,
      createdAt: item.createdAt || null,
    });
  }

  /* расходы */
  const expenses = [];
  const expenseIds = new Set();
  for (const item of raw.expenses) {
    if (!isPlainObject(item) || !isId(item.id) || !isAmount(item.amount)) {
      return fail('Повреждён список расходов');
    }
    if (!D.isValidKey(item.date)) return fail('В копии есть расход с некорректной датой');
    if (expenseIds.has(item.id)) return fail('В файле повторяются расходы');
    expenseIds.add(item.id);

    let shiftId = item.shiftId ?? null;
    if (shiftId !== null && !shiftIds.has(shiftId)) {
      shiftId = null;
      fixes.push('расход отвязан от отсутствующей вахты');
    }
    let categoryId = isText(item.categoryId) ? item.categoryId : db.OTHER_CATEGORY_ID;
    if (!categoryIds.has(categoryId)) {
      categoryId = db.OTHER_CATEGORY_ID;
      fixes.push('расход перенесён в «прочее» — прежней категории нет в копии');
    }

    expenses.push({
      id: item.id,
      shiftId,
      amount: item.amount,
      date: item.date,
      categoryId,
      note: isText(item.note) ? item.note : '',
      createdAt: item.createdAt || null,
    });
  }

  /* вложения: проверяем, что base64 целый и связан с поступлением */
  const attachments = [];
  const attachmentIds = new Set();
  for (const item of raw.attachments) {
    if (!isPlainObject(item) || !isId(item.id)) return fail('Повреждён список вложений');
    if (attachmentIds.has(item.id)) return fail('В файле повторяются вложения');
    if (!isText(item.name)) return fail('У вложения нет имени файла');
    if (!isText(item.data)) return fail('У вложения нет данных');

    const incomeId = item.incomeId ?? null;
    if (incomeId !== null && !incomeIds.has(incomeId)) {
      return fail(`Вложение «${item.name}» привязано к поступлению, которого нет в копии`);
    }
    try {
      const blob = F.base64ToBlob(item.data, item.type);
      attachmentIds.add(item.id);
      attachments.push({
        id: item.id,
        incomeId,
        shiftId: item.shiftId ?? null,
        name: item.name,
        type: isText(item.type) ? item.type : 'application/octet-stream',
        size: Number.isFinite(item.size) ? item.size : blob.size,
        compressed: item.compressed !== false,
        blob,
      });
    } catch (error) {
      return fail(`Вложение «${item.name}» повреждено — файл копии неполный`);
    }
  }

  const summary = {
    createdAt: raw.createdAt || null,
    shifts: shifts.length,
    incomes: incomes.length,
    expenses: expenses.length,
    categories: categories.length,
    attachments: attachments.length,
    attachmentsBytes: attachments.reduce((total, attachment) => total + (attachment.size || 0), 0),
    schemaVersion: raw.schemaVersion,
  };

  return {
    ok: true,
    summary,
    fixes,
    data: { shifts, incomes, expenses, categories, attachments, settings: isPlainObject(raw.settings) ? raw.settings : {} },
  };
}

/** Разбор текста файла: JSON → проверка. Возвращает результат validateBackup. */
export function readBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: 'Файл повреждён или это не JSON. Выберите файл копии, созданный приложением.' };
  }
  return validateBackup(parsed);
}

/** Восстанавливает данные: замена всего в одной транзакции, PIN не трогаем. */
export async function importBackup(data) {
  const settings = await db.getSettings();
  await db.replaceAll({
    shifts: data.shifts,
    incomes: data.incomes,
    expenses: data.expenses,
    categories: data.categories,
    attachments: data.attachments,
    settings: {
      ...settings,                       // PIN и служебные флаги устройства остаются
      lastBackupAt: D.todayKey(),        // считаем, что после восстановления копия свежая
      dirtyAfterBackup: false,
      backupSnoozeUntil: null,
    },
  });
}

/* ─────────────────────────── выписка CSV ─────────────────────────── */

/** Значение для CSV: кавычки удваиваем, разделитель и переводы строк экранируем. */
function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (/[;"\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * CSV с поступлениями и расходами.
 * Формат: UTF-8 с BOM (чтобы Excel понял кириллицу), разделитель «;».
 * Суммы — целые числа без разделителей, чтобы Excel сложил их как числа.
 */
export function buildCsv({ shifts, incomes, expenses, categories }, today = D.todayKey()) {
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const nameById = new Map(categories.map((category) => [category.id, category.name]));

  const shiftText = (shiftId) => {
    const shift = shiftId == null ? null : shiftById.get(shiftId);
    return shift ? D.formatRange(shift.arrival, shift.workEnd) : 'Без вахты';
  };

  const rows = [];
  for (const income of incomes) {
    rows.push({
      date: income.date,
      type: 'Поступление',
      shift: shiftText(income.shiftId),
      category: db.incomeCategoryName(income.category),
      amount: income.amount,
      note: income.note || '',
    });
  }
  for (const expense of expenses) {
    rows.push({
      date: expense.date,
      type: 'Расход',
      shift: shiftText(expense.shiftId),
      category: nameById.get(expense.categoryId) || 'прочее',
      amount: expense.amount,
      note: expense.note || '',
    });
  }

  // по дате по возрастанию: так удобнее читать выписку за период
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type.localeCompare(b.type, 'ru')));

  const lines = ['Дата;Тип;Вахта;Категория;Сумма;Заметка'];
  for (const row of rows) {
    lines.push([
      D.formatDate(row.date),
      row.type,
      row.shift,
      row.category,
      String(row.amount),
      row.note,
    ].map(csvCell).join(';'));
  }
  lines.push('');
  lines.push(`Выписка на ${D.formatDate(today)};записей: ${rows.length};итог по поступлениям: ${rows.filter((row) => row.type === 'Поступление').reduce((total, row) => total + row.amount, 0)};итог по расходам: ${rows.filter((row) => row.type === 'Расход').reduce((total, row) => total + row.amount, 0)};;`);

  return `\uFEFF${lines.join('\r\n')}`;
}

/** Готовит CSV-файл (Blob) из текущих данных базы. */
export async function buildCsvFile() {
  const [shifts, incomes, expenses, categories] = await Promise.all([
    db.listShifts(),
    db.listIncomes(),
    db.listExpenses(),
    db.listCategories(),
  ]);
  const text = buildCsv({ shifts, incomes, expenses, categories });
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}
