/**
 * files.js — работа с вложениями: проверка файлов, сжатие фото, миниатюры.
 *
 * Отдельный модуль, потому что это самая «браузерная» часть приложения:
 * здесь живут canvas, EXIF и createImageBitmap. Экраны (app.js) только
 * вызывают prepareAttachment() и получают готовый объект для сохранения.
 *
 * Правила из задания:
 *   • до 10 файлов на поступление;
 *   • PDF — до 10 МБ;
 *   • фото сжимаем: длинная сторона ~1600 px, JPEG качеством ~0.8,
 *     с учётом поворота из EXIF (иначе фото с телефона ляжет на бок).
 */

export const MAX_FILES = 10;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;      // 10 МБ
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;    // страховка от «зависшей» обработки
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;
export const THUMB_SIDE = 320;
export const THUMB_QUALITY = 0.7;

/* ─────────────────────────── типы и размеры ─────────────────────────── */

export function isImage(type) {
  return /^image\//.test(String(type || ''));
}

export function isPdf(type) {
  return String(type || '') === 'application/pdf';
}

/** Размер по-человечески: 1536000 → «1,5 МБ». */
export function humanSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
}

/**
 * Проверка файла перед добавлением.
 * count — сколько вложений уже прикреплено к этому поступлению.
 * Возвращает { ok: true, kind: 'image' | 'pdf' } либо { error: 'текст' }.
 */
export function validateFile(file, count = 0) {
  if (!file) return { error: 'Файл не выбран' };
  if (count >= MAX_FILES) {
    return { error: `К поступлению можно прикрепить не больше ${MAX_FILES} файлов` };
  }
  if (isPdf(file.type)) {
    if (file.size > MAX_PDF_BYTES) {
      return { error: `PDF больше ${humanSize(MAX_PDF_BYTES)} — выберите файл поменьше` };
    }
    return { ok: true, kind: 'pdf' };
  }
  if (isImage(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: `Фото больше ${humanSize(MAX_IMAGE_BYTES)} — выберите поменьше` };
    }
    return { ok: true, kind: 'image' };
  }
  return { error: 'Поддерживаются только фото и PDF' };
}

/* ─────────────────────────── EXIF-ориентация ─────────────────────────── */

/**
 * Читает EXIF-ориентацию JPEG: 1 — как есть, 6 — повернуть на 90° и т. д.
 * Нужна только для запасного пути: некоторые браузеры сами учитывают EXIF,
 * но если нет — фото с телефона окажется повёрнутым.
 */
export async function readExifOrientation(blob) {
  try {
    const buffer = await blob.slice(0, 128 * 1024).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4) return 1;
    if (view.getUint16(0) !== 0xffd8) return 1;                 // не JPEG

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) { offset += 1; continue; }   // пропускаем мусор
      if (marker === 0xffd8 || (marker >= 0xffd0 && marker <= 0xffd7)) { offset += 2; continue; }
      const size = view.getUint16(offset + 2);
      if (size < 2) break;

      if (marker === 0xffe1) {                                   // APP1 — здесь EXIF
        const tiff = offset + 4 + 6;                             // пропускаем 'Exif\0\0'
        if (tiff + 8 > view.byteLength) break;
        const little = view.getUint16(tiff) === 0x4949;          // 'II' — little-endian
        const read16 = (position) => view.getUint16(position, little);
        const read32 = (position) => view.getUint32(position, little);
        if (read16(tiff + 2) !== 0x002a) break;                  // не TIFF-заголовок
        let entry = tiff + read32(tiff + 4);
        if (entry + 2 > view.byteLength) break;
        const count = read16(entry);
        entry += 2;
        for (let i = 0; i < count; i += 1) {
          const position = entry + i * 12;
          if (position + 12 > view.byteLength) break;
          if (read16(position) === 0x0112) {                     // Orientation
            const value = read16(position + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        break;
      }
      offset += 2 + size;
    }
  } catch (error) {
    // битый файл — просто считаем, что поворот не нужен
  }
  return 1;
}

/* ─────────────────────────── сжатие ─────────────────────────── */

/** Достаёт картинку: сначала через createImageBitmap, иначе через <img> + EXIF. */
async function loadSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' — браузер сам применит EXIF-поворот
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, orientation: 1, width: bitmap.width, height: bitmap.height };
    } catch (error) {
      // старый браузер или формат вроде HEIC — идём запасным путём
    }
  }
  const orientation = await readExifOrientation(blob);
  const image = await loadImageElement(blob);
  return {
    source: image,
    orientation,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

/** Загрузка через <img>: запасной путь, если createImageBitmap недоступен. */
function loadImageElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    }, 15000);
    image.onload = () => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    image.src = url;
  });
}

/**
 * Поворот и отражение по EXIF-ориентации.
 * sw, sh — размеры исходника до поворота.
 */
function applyOrientation(ctx, orientation, sw, sh) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, sw, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, sw, sh); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, sh); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, sh, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, sh, sw); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, sw); break;
    default: break;   // 1 — ничего не делаем
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch (error) {
      resolve(null);
    }
  });
}

/** Рисует картинку в canvas нужного размера и отдаёт Blob (или null, если не вышло). */
async function renderToBlob(source, orientation, srcW, srcH, maxSide, quality) {
  const rotated = orientation >= 5;                 // 5–8 меняют ширину и высоту местами
  const viewW = rotated ? srcH : srcW;
  const viewH = rotated ? srcW : srcH;
  const scale = Math.min(1, maxSide / Math.max(viewW, viewH));
  const outW = Math.max(1, Math.round(viewW * scale));
  const outH = Math.max(1, Math.round(viewH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;                            // например, в jsdom — сохраним оригинал

  ctx.save();
  ctx.scale(outW / viewW, outH / viewH);
  applyOrientation(ctx, orientation, srcW, srcH);
  ctx.drawImage(source, 0, 0, srcW, srcH);
  ctx.restore();

  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (!blob) return null;
  return { blob, width: outW, height: outH };
}

/**
 * Сжатие фото: длинная сторона ~1600 px, JPEG ~0.8.
 * Возвращает { photo, thumb, width, height } или null, если сжать не получилось.
 */
export async function compressImage(file) {
  // Сначала проверяем, есть ли вообще canvas. Если нет (например, в тестах) —
  // не мучаем файл и сохраняем оригинал.
  const probe = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const probeCtx = probe && probe.getContext ? probe.getContext('2d') : null;
  if (!probeCtx) return null;

  const { source, orientation, width, height } = await loadSource(file);
  if (!width || !height) return null;

  const photo = await renderToBlob(source, orientation, width, height, PHOTO_MAX_SIDE, PHOTO_QUALITY);
  if (!photo) return null;
  const thumb = await renderToBlob(source, orientation, width, height, THUMB_SIDE, THUMB_QUALITY);
  if (source.close) source.close();                 // освобождаем память у ImageBitmap

  return { photo: photo.blob, thumb: thumb ? thumb.blob : null, width: photo.width, height: photo.height };
}

/* ─────────────────────────── подготовка вложения ─────────────────────────── */

/** Имя файла для сжатого фото: «IMG_1234.HEIC» → «IMG_1234.jpg». */
function jpegName(name) {
  const base = String(name || 'фото').replace(/\.[^.]+$/, '');
  return `${base}.jpg`;
}

/**
 * Готовит выбранный файл к сохранению.
 * Возвращает { name, type, size, blob, thumb, width, height, compressed }.
 * Если сжать не удалось (например, HEIC), сохраняем файл как есть —
 * лучше тяжёлый файл, чем потерянная расчётка.
 */
export async function prepareAttachment(file) {
  if (isPdf(file.type)) {
    return {
      name: file.name || 'документ.pdf',
      type: 'application/pdf',
      size: file.size,
      blob: file,
      thumb: null,
      width: null,
      height: null,
      compressed: false,
    };
  }

  if (isImage(file.type)) {
    try {
      const result = await compressImage(file);
      if (result) {
        return {
          name: jpegName(file.name),
          type: 'image/jpeg',
          size: result.photo.size,
          blob: result.photo,
          thumb: result.thumb,
          width: result.width,
          height: result.height,
          compressed: true,
        };
      }
    } catch (error) {
      console.warn('Сжать фото не удалось, сохраняю как есть:', error);
    }
  }

  return {
    name: file.name || 'файл',
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    thumb: null,
    width: null,
    height: null,
    compressed: false,
  };
}

/** Понятное объяснение ошибки хранилища. */
export function storageErrorMessage(error) {
  const name = error && error.name;
  if (name === 'QuotaExceededError') {
    return 'В хранилище больше нет места. Удалите лишние вложения или сохраните копию и освободите место.';
  }
  return 'Не удалось сохранить';
}
