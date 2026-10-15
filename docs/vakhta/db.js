/**
 * db.js — всё хранилище приложения (IndexedDB).
 *
 * Почему IndexedDB, а не localStorage:
 *   • вложения — это файлы (Blob), в localStorage их негде хранить;
 *   • база живёт отдельно от кэша и не пухнет как строки localStorage;
 *   • операции идут в транзакциях: либо всё сохранилось, либо ничего.
 *
 * Схема данных (объекты-хранилища):
 *   shifts      — вахты:            { id, arrival, workStart, workEnd, createdAt }
 *   incomes     — поступления:      { id, shiftId, amount, date, category, note, attachments }
 *   expenses    — расходы:          { id, shiftId, amount, date, categoryId, note }
 *   categories  — категории расходов:{ id, name, order, fixed }
 *   attachments — вложения:         { id, incomeId, shiftId, name, type, size, blob }
 *   meta        — настройки и служебные записи: { key, value }
 *
 * id вахт/поступлений/расходов/вложений — автонумерация IndexedDB (autoIncrement).
 * id «прочее» и стартовых категорий — строковые и зафиксированы в коде.
 */

/** Версия схемы данных. Номер попадает в резервную копию — менять при изменении структуры. */
export const SCHEMA_VERSION = 1;

const DB_NAME = 'vakhta';

/** Категории поступлений — фиксированный список (id → название). */
export const INCOME_CATEGORIES = [
  { id: 'advance', name: 'аванс' },
  { id: 'settlement', name: 'расчёт' },
  { id: 'bonus', name: 'премия' },
  { id: 'vacation', name: 'отпускные' },
  { id: 'other', name: 'прочее' },
];

/** Название категории поступления по id (или по самому названию, если пришло из копии). */
export function incomeCategoryName(id) {
  const found = INCOME_CATEGORIES.find((c) => c.id === id || c.name === id);
  return found ? found.name : String(id || 'прочее');
}

/** Стартовые категории расходов. «Прочее» удалить и переименовать нельзя. */
export const OTHER_CATEGORY_ID = 'other';
export const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'еда', order: 1, fixed: false },
  { id: 'comm', name: 'связь', order: 2, fixed: false },
  { id: 'road', name: 'дорога', order: 3, fixed: false },
  { id: OTHER_CATEGORY_ID, name: 'прочее', order: 999, fixed: true },
];

/** Настройки по умолчанию. Хранятся в meta под ключом 'settings'. */
export const DEFAULT_SETTINGS = {
  pinHash: null,          // SHA-256(PIN + соль), null — вход по PIN выключен
  pinSalt: null,          // случайная соль (hex)
  pinFailed: 0,           // счётчик неверных попыток (для паузы)
  pinLockUntil: 0,        // до какого времени заблокирован ввод (timestamp)
  lastBackupAt: null,     // когда последний раз сохраняли копию (ключ даты)
  dirtyAfterBackup: false,// были ли изменения после последней копии
  persistState: null,     // результат navigator.storage.persist(): 'granted' | 'denied' | 'unsupported'
  firstRunDone: false,    // показывали ли подсказку про установку на экран «Домой»
};

const STORES = {
  shifts: { key: 'id', indexes: [['arrival', 'arrival']] },
  incomes: { key: 'id', indexes: [['shiftId', 'shiftId'], ['date', 'date']] },
  expenses: { key: 'id', indexes: [['shiftId', 'shiftId'], ['date', 'date']] },
  categories: { key: 'id', indexes: [] },
  attachments: { key: 'id', indexes: [['incomeId', 'incomeId'], ['shiftId', 'shiftId']] },
  meta: { key: 'key', indexes: [] },
};

let dbPromise = null;

/* ─────────────────────────── открытие и миграция ─────────────────────────── */

/** Открывает базу (один раз за запуск) и доводит её до актуальной версии схемы. */
export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Браузер не поддерживает IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    // во время миграции доступна только транзакция самой версии — передаём её внутрь
    request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion, request.transaction);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть базу'));
    request.onblocked = () => reject(new Error('База открыта в другой вкладке — закройте её и попробуйте снова'));
  });
  return dbPromise;
}

/**
 * Миграция схемы. Вызывается только внутри onupgradeneeded.
 * Старые данные при этом не удаляются: добавляем только то, чего не хватает.
 */
function migrate(db, oldVersion, transaction) {
  if (oldVersion < 1) {
    db.createObjectStore('shifts', { keyPath: STORES.shifts.key, autoIncrement: true })
      .createIndex('arrival', 'arrival');
    const incomes = db.createObjectStore('incomes', { keyPath: 'id', autoIncrement: true });
    incomes.createIndex('shiftId', 'shiftId');
    incomes.createIndex('date', 'date');
    const expenses = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
    expenses.createIndex('shiftId', 'shiftId');
    expenses.createIndex('date', 'date');
    db.createObjectStore('categories', { keyPath: 'id' });
    const attachments = db.createObjectStore('attachments', { keyPath: 'id', autoIncrement: true });
    attachments.createIndex('incomeId', 'incomeId');
    attachments.createIndex('shiftId', 'shiftId');
    db.createObjectStore('meta', { keyPath: 'key' });

    // стартовые категории расходов
    const cats = transaction.objectStore('categories');
    for (const cat of DEFAULT_CATEGORIES) cats.put({ ...cat });
  }
  // Следующие версии добавляем так:
  // if (oldVersion < 2) { db.createObjectStore(...); }
}

/* ─────────────────────────── служебные помощники ─────────────────────────── */

/** Обещание для одного запроса к базе. */
function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ошибка обращения к базе'));
  });
}

/**
 * Выполняет fn(...stores) внутри одной транзакции и ждёт её фактической записи
 * на диск. Так мы точно знаем, что данные сохранены (важно для сообщения
 * «Не удалось сохранить» и для импорта копии).
 */
async function run(names, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let result;
    let transaction;
    try {
      transaction = db.transaction(names, mode);
    } catch (e) {
      reject(e);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось выполнить операцию'));
    transaction.onabort = () => reject(transaction.error || new Error('Операция отменена'));
    try {
      const returned = fn(...names.map((name) => transaction.objectStore(name)), transaction);
      if (returned && typeof returned.addEventListener === 'function') {
        // функция вернула запрос к базе (например put) — вернём его результат,
        // то есть ключ записи, а не сам объект запроса
        returned.addEventListener('success', () => { result = returned.result; });
      } else {
        result = returned;
      }
    } catch (e) {
      try { transaction.abort(); } catch (_) { /* уже закрыта */ }
      reject(e);
    }
  });
}

/** Все записи хранилища. */
export async function getAll(name) {
  const db = await open();
  const store = db.transaction(name, 'readonly').objectStore(name);
  return requestPromise(store.getAll());
}

/** Одна запись по ключу. */
export async function get(name, key) {
  const db = await open();
  const store = db.transaction(name, 'readonly').objectStore(name);
  return requestPromise(store.get(key));
}

/** Записи по значению индекса. */
export async function getAllBy(name, indexName, value) {
  const db = await open();
  const store = db.transaction(name, 'readonly').objectStore(name);
  return requestPromise(store.index(indexName).getAll(value));
}

/** Добавить или обновить запись. Возвращает ключ записи. */
export function put(name, value) {
  return run([name], 'readwrite', (store) => store.put(value));
}

/** Удалить запись по ключу. */
export function remove(name, key) {
  return run([name], 'readwrite', (store) => store.delete(key));
}

/** Удалить всё в хранилище. */
export function clear(name) {
  return run([name], 'readwrite', (store) => store.clear());
}

/* ─────────────────────────── настройки ─────────────────────────── */

/** Настройки приложения (с дополнением значений по умолчанию). */
export async function getSettings() {
  const record = await get('meta', 'settings');
  const settings = { ...DEFAULT_SETTINGS, ...(record && record.value ? record.value : {}) };
  return settings;
}

/** Частичное обновление настроек. */
export function saveSettings(patch) {
  return run(['meta'], 'readwrite', (meta) => {
    const req = meta.get('settings');
    req.onsuccess = () => {
      const current = { ...DEFAULT_SETTINGS, ...(req.result && req.result.value ? req.result.value : {}) };
      meta.put({ key: 'settings', value: { ...current, ...patch } });
    };
  });
}

/** Отметить, что после последней копии были изменения. */
export async function markDirty() {
  await saveSettings({ dirtyAfterBackup: true });
}

/* ─────────────────────────── категории расходов ─────────────────────────── */

/** Категории расходов, отсортированные для показа. */
export async function listCategories() {
  const list = await getAll('categories');
  return list.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'ru'));
}

/** Добавить категорию. */
export async function addCategory(name) {
  const list = await listCategories();
  const maxOrder = list.reduce((max, c) => (c.fixed ? max : Math.max(max, c.order || 0)), 0);
  return put('categories', { name: String(name).trim(), order: maxOrder + 1, fixed: false });
}

/** Переименовать категорию («прочее» переименовать нельзя). */
export async function renameCategory(id, name) {
  return run(['categories'], 'readwrite', (categories) => {
    const req = categories.get(id);
    req.onsuccess = () => {
      const cat = req.result;
      if (!cat || cat.fixed) return;
      categories.put({ ...cat, name: String(name).trim() });
    };
  });
}

/**
 * Удалить категорию: её расходы переходят в «прочее».
 * Возвращает объект { moved } — сколько расходов перенесено (заполняется к концу транзакции).
 */
export function deleteCategory(id) {
  return run(['categories', 'expenses'], 'readwrite', (categories, expenses) => {
    const info = { moved: 0 };
    const all = expenses.getAll();
    all.onsuccess = () => {
      for (const expense of all.result || []) {
        if (expense.categoryId === id) {
          expenses.put({ ...expense, categoryId: OTHER_CATEGORY_ID });
          info.moved += 1;
        }
      }
      categories.delete(id);
    };
    return info;
  });
}

/* ─────────────────────────── вахты ─────────────────────────── */

/** Все вахты, отсортированные по заезду (сначала свежие). */
export async function listShifts() {
  const list = await getAll('shifts');
  return list.sort((a, b) => (a.arrival < b.arrival ? 1 : a.arrival > b.arrival ? -1 : 0));
}

/** Создать вахту. */
export function addShift({ arrival, workStart, workEnd }) {
  return put('shifts', {
    arrival,
    workStart: workStart || arrival,
    workEnd,
    createdAt: new Date().toISOString(),
  });
}

/** Изменить вахту. */
export function updateShift(shift) {
  return put('shifts', { ...shift, workStart: shift.workStart || shift.arrival });
}

/** Что именно пропадёт вместе с вахтой — для текста подтверждения. */
export async function shiftDeleteStats(shiftId) {
  const [incomes, expenses, attachments] = await Promise.all([
    getAllBy('incomes', 'shiftId', shiftId),
    getAllBy('expenses', 'shiftId', shiftId),
    getAllBy('attachments', 'shiftId', shiftId),
  ]);
  return { incomes: incomes.length, expenses: expenses.length, attachments: attachments.length };
}

/** Удалить вахту вместе с её поступлениями, расходами и вложениями. */
export function deleteShiftCascade(shiftId) {
  return run(['shifts', 'incomes', 'expenses', 'attachments'], 'readwrite', (shifts, incomes, expenses, attachments) => {
    const incomeReq = incomes.index('shiftId').getAll(shiftId);
    incomeReq.onsuccess = () => {
      const list = incomeReq.result || [];
      for (const income of list) {
        for (const attachmentId of income.attachments || []) attachments.delete(attachmentId);
        incomes.delete(income.id);
      }
      const attachmentReq = attachments.index('shiftId').getAll(shiftId);
      attachmentReq.onsuccess = () => {
        for (const attachment of attachmentReq.result || []) attachments.delete(attachment.id);
      };
    };
    const expenseReq = expenses.index('shiftId').getAll(shiftId);
    expenseReq.onsuccess = () => {
      for (const expense of expenseReq.result || []) expenses.delete(expense.id);
    };
    shifts.delete(shiftId);
  });
}

/* ─────────────────────────── поступления ─────────────────────────── */

/**
 * Все поступления: сначала новые. Сортируем по дате, а при равных датах —
 * по порядку добавления (кто позже добавлен, тот выше).
 */
export async function listIncomes() {
  const list = await getAll('incomes');
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

/**
 * Создать поступление.
 * shiftId: id вахты или null — «Без вахты». amount — целые рубли.
 */
export function addIncome({ shiftId = null, amount, date, category, note = '' }) {
  return put('incomes', { shiftId, amount, date, category, note, attachments: [] });
}

/** Изменить поступление (вложения не трогаем — они живут отдельными записями). */
export function updateIncome(income) {
  return put('incomes', income);
}

/** Сколько вложений пропадёт вместе с поступлением — для текста подтверждения. */
export async function incomeDeleteStats(id) {
  const income = await get('incomes', id);
  return { attachments: income && income.attachments ? income.attachments.length : 0 };
}

/** Удалить поступление вместе с его вложениями. */
export function deleteIncomeCascade(id) {
  return run(['incomes', 'attachments'], 'readwrite', (incomes, attachments) => {
    const request = incomes.get(id);
    request.onsuccess = () => {
      const income = request.result;
      if (income) {
        for (const attachmentId of income.attachments || []) attachments.delete(attachmentId);
      }
      incomes.delete(id);
    };
  });
}

/* ─────────────────────────── запуск хранилища ─────────────────────────── */

/**
 * Готовит базу к работе: открывает, проверяет стартовые данные.
 * Возвращает настройки и список категорий.
 */
export async function init() {
  await open();

  // «прочее» должно существовать всегда — на случай импорта старой копии
  await run(['categories'], 'readwrite', (categories) => {
    const req = categories.get(OTHER_CATEGORY_ID);
    req.onsuccess = () => {
      if (!req.result) {
        const defaults = DEFAULT_CATEGORIES.find((c) => c.id === OTHER_CATEGORY_ID);
        categories.put({ ...defaults });
      }
    };
  });

  const [settings, categories] = await Promise.all([getSettings(), listCategories()]);
  return { settings, categories };
}

/**
 * Просим браузер не удалять данные при нехватке места.
 * Возвращает 'granted' | 'denied' | 'unsupported'.
 */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return 'granted';
    const granted = await navigator.storage.persist();
    return granted ? 'granted' : 'denied';
  } catch (e) {
    return 'unsupported';
  }
}

/** Сколько места занимают данные (для раздела «Ещё»). */
export async function storageEstimate() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch (e) {
    return null;
  }
}
