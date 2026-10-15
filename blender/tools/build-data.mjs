#!/usr/bin/env node
/**
 * build-data.mjs — собирает офлайн-базу «Академии Blender» из вендорных исходников.
 *
 * Вход (blender/vendor/, в Git не хранится — см. tools/fetch-vendor.sh):
 *   manual/**\/*.md   — справочное руководство Blender (Markdown-зеркало, EN)
 *   api/**\/*.md      — Python API Reference (bpy.ops, bpy.types, …)
 *   ru.po             — официальный русский перевод интерфейса Blender (locale/po/ru.po)
 *
 * Выход (blender/data/, коммитится):
 *   meta.json         — манифест: версии, счётчики, атрибуция, список шардов
 *   index.json.gz     — поисковый индекс (BM25 + якоря-определения + горячие клавиши + саммари)
 *   terms.json.gz     — русско-английский словарь терминов интерфейса (EN↔RU)
 *   docs/<раздел>.gz  — тексты страниц по разделам (ленивая загрузка)
 *
 * Запуск:  node blender/tools/build-data.mjs [--limit N] [--no-api]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseMarkdown } from './lib/md.mjs';
import { tokenize, stem, normTerm, normKey, isCyr } from '../src/lib/text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor');
const OUT = path.join(ROOT, 'data');

const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 0; })();
const WITH_API = !args.includes('--no-api');

const DATA_VERSION = 1;
const SOURCE_VERSION = '5.0';      // версия вендорного зеркала
const TARGET_VERSION = '5.2';      // актуальная версия руководства (ссылки ведут на неё)
const DOCS_BASE = 'https://docs.blender.org/manual';

/** Русские названия разделов — из официального перевода руководства. */
export const SECTION_RU = {
  getting_started: 'Начало работы',
  interface: 'Интерфейс пользователя',
  editors: 'Редакторы',
  scene_layout: 'Сцены и объекты',
  modeling: 'Моделирование',
  sculpt_paint: 'Скульптинг и рисование',
  grease_pencil: 'Grease Pencil',
  animation: 'Анимация и риггинг',
  physics: 'Физика',
  render: 'Рендеринг',
  compositing: 'Композитинг',
  movie_clip: 'Отслеживание движения',
  video_editing: 'Редактирование видео',
  files: 'Файлы и система данных',
  addons: 'Аддоны',
  advanced: 'Дополнительно',
  troubleshooting: 'Устранение неполадок',
  glossary: 'Словарь',
  contribute: 'Участие в разработке',
  api: 'Python API',
};

const skipPage = (id) => /^(_|contribute|AGENTS|CLAUDE|GEMINI)/i.test(id) || /(^|\/)(AGENTS|CLAUDE|GEMINI|README)$/i.test(id);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '.git' && e.name !== '_images') walk(p, out); }
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/* ───────────────────── ru.po → словарь терминов ───────────────────── */

function parsePo(text) {
  const pairs = new Map();
  for (const b of text.split(/\n\n/)) {
    if (!/msgid\s+"/.test(b)) continue;
    const grab = (field) => {
      const m = b.match(new RegExp(`^${field}\\s+((?:"(?:[^"\\\\]|\\\\.)*"\\s*)+)`, 'm'));
      if (!m) return null;
      return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .map((x) => x[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
        .join('');
    };
    const id = grab('msgid');
    const str = grab('msgstr');
    if (!id || !str) continue;
    if (id.length < 2 || id.length > 60 || str.length > 72) continue;
    if (/[{}<>]|%[sdf]|\bn\b/.test(id)) continue;
    if (!/[A-Za-z]/.test(id) || !isCyr(str)) continue;
    if (/^[A-Z0-9]$/.test(id)) continue;                     // одиночные буквы-клавиши
    if (/^[\d\s.,:;!?()\-–—/+*]+$/.test(str)) continue;
    if (/^(https?:|www\.)/i.test(id)) continue;
    if (!pairs.has(id)) pairs.set(id, str);
  }
  return pairs;
}

/** Нормализованная форма термина для индекса алиасов: «X-Ray» → «x_ray». */
export function aliasNorm(str) {
  return String(str).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
}

/** Ищет в тексте термины официального словаря (n-граммы до 3 слов). */
function findDictTerms(text, dictLower, out, limit = 24) {
  // слова сохраняют внутренние дефисы: «X-Ray» остаётся «x-ray»
  const words = String(text).toLowerCase().split(/[^\p{L}\p{N}\-]+/u).map((w) => w.replace(/^-+|-+$/g, '')).filter(Boolean);
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      const variants = [
        gram.join(' '),
        gram.join('-'),
        gram.join('').replace(/-/g, ''),
      ];
      for (const key of variants) {
        const hit = dictLower.get(key) || dictLower.get(key.replace(/-/g, ' '));
        if (hit) { out.set(hit.en, hit); break; }
      }
      if (out.size >= limit) return out;
    }
  }
  return out;
}

/* ─────────────────────────── основной проход ─────────────────────────── */

function main() {
  const t0 = Date.now();
  console.log('→ читаю вендорные исходники…');

  const docs = [];
  const roots = [
    { dir: path.join(VENDOR, 'manual'), kind: 'doc' },
    ...(WITH_API ? [{ dir: path.join(VENDOR, 'api'), kind: 'api' }] : []),
  ];
  for (const { dir, kind } of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const id = path.relative(dir, file).replace(/\\/g, '/').replace(/\.md$/, '');
      if (skipPage(id)) continue;
      const section = kind === 'api' ? 'api' : id.split('/')[0];
      if (kind === 'doc' && !SECTION_RU[section]) continue;
      let md = fs.readFileSync(file, 'utf8');
      if (md.length > 400_000) md = md.slice(0, 400_000);
      const parsed = parseMarkdown(md, id);
      docs.push({
        id, kind, section,
        title: parsed.title || id.split('/').pop().replace(/_/g, ' '),
        blocks: parsed.blocks,
        headings: parsed.blocks.filter((b) => b[0] === 'h').map((b) => b[2]),
        definitions: parsed.definitions,
        keys: parsed.keys,
        links: parsed.links,
      });
      if (LIMIT && docs.length >= LIMIT) break;
    }
    if (LIMIT && docs.length >= LIMIT) break;
  }
  console.log(`  страниц: ${docs.length}`);

  // ── словарь EN↔RU ──
  const poPath = path.join(VENDOR, 'ru.po');
  const en2ru = new Map();
  if (fs.existsSync(poPath)) {
    const pairs = parsePo(fs.readFileSync(poPath, 'utf8'));
    for (const [en, ru] of pairs) en2ru.set(en, ru);
    console.log(`  терминов EN→RU: ${en2ru.size}`);
  } else {
    console.warn('  ! ru.po не найден — русские названия интерфейса будут недоступны');
  }
  // RU→EN для перевода запросов: только короткие осмысленные пары,
  // иначе один русский токен разворачивается в сотни терминов и портит ранжирование.
  const ru2enPairs = [];   // заполняется после построения алиасов
  const isCleanPair = (en, ru) => {
    const enWords = en.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const ruWords = ru.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!enWords.length || !ruWords.length) return false;
    if (enWords.length > 3 || ruWords.length > 3) return false;
    if (en.length > 34 || ru.length > 34) return false;
    return true;
  };
  for (const [en, ru] of en2ru) if (isCleanPair(en, ru)) ru2enPairs.push([en, ru]);

  // ── индекс ──
  const postings = new Map();
  const docMeta = [];
  const anchors = [];
  const keyIndex = [];
  const anchorSeen = new Set();

  docs.forEach((doc, di) => {
    const bodyParts = [];
    let bodyLen = 0;
    const pushText = (t) => { bodyParts.push(t); bodyLen += t.length; };
    for (const b of doc.blocks) {
      if (b[1] && typeof b[1] === 'string') pushText(b[1]);
      if (b[2] && typeof b[2] === 'string') pushText(b[2]);
      if (b[0] === 'l') pushText(b[2].join(' '));
      if (b[0] === 'b') for (const row of b[2]) pushText(row.join(' '));
    }
    const bodyText = bodyParts.join(' ').replace(/\[\[[^\]]*\]\]/g, ' ').replace(/\s+/g, ' ');

    const tfs = new Map();
    const add = (t, w) => tfs.set(t, (tfs.get(t) || 0) + w);
    for (const t of tokenize(doc.title)) add(t, 6);
    for (const t of tokenize(doc.headings.join(' '))) add(t, 3);
    for (const t of tokenize(doc.id.replace(/[/_.\-]/g, ' '))) add(t, 2);
    for (const t of tokenize(bodyText.slice(0, 60_000))) add(t, 1);

    const titleRu = en2ru.get(doc.title) || en2ru.get(doc.title.replace(/\s*\(.*\)$/, '')) || '';
    docMeta.push({
      i: di, id: doc.id, t: doc.title.slice(0, 120), tr: titleRu,
      s: doc.section, k: doc.kind, len: Math.max(8, Math.round(bodyLen / 6)),
      sum: bodyText.slice(0, 190),
    });

    for (const [term, tf] of tfs) {
      if (!postings.has(term)) postings.set(term, []);
      postings.get(term).push([di, tf]);
    }

    // якоря-определения: «Опция → что делает»
    for (const d of doc.definitions) {
      const termRaw = d.term.replace(/\[\[[^\]]*\]\]/g, '').replace(/[[\]]/g, '').trim();
      if (!termRaw || termRaw.length > 64) continue;
      const norm = normTerm(termRaw);
      if (!norm || norm.length < 2) continue;
      const key = norm + '|' + di;
      if (anchorSeen.has(key)) continue;
      anchorSeen.add(key);
      anchors.push({
        n: norm, i: di, t: termRaw,
        ru: en2ru.get(termRaw) || en2ru.get(termRaw.replace(/\s*(Start|End|\/End)$/, '')) || '',
        x: d.text.replace(/\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 420),
        b: d.block,
      });
    }

    // горячие клавиши
    const seenKeys = new Set();
    for (const k of doc.keys) {
      const nk = normKey(k.key);
      if (!nk || nk.length > 18 || seenKeys.has(nk + k.label)) continue;
      seenKeys.add(nk + k.label);
      keyIndex.push({ k: nk, i: di, l: k.label.replace(/\[\[[^\]]*\]\]/g, '').slice(0, 110) });
    }
  });

  // ── индекс алиасов терминов (из официального словаря) ──
  // Позволяет находить страницу по точному названию функции или опции,
  // в том числе введённому по-русски: «рентген» → X-Ray, «фокусное расстояние» → Focal Length.
  const dictLower = new Map();
  for (const [en, ru] of en2ru) dictLower.set(en.toLowerCase(), { en, ru });
  const aliases = {};
  const aliasRu = {};
  docs.forEach((doc, di) => {
    const found = new Map();      // alias → вес важности источника
    const collect = (text, weight, limit) => {
      const tmp = new Map();
      findDictTerms(text, dictLower, tmp, limit);
      for (const [en, hit] of tmp) if (!found.has(en) || found.get(en).weight < weight) found.set(en, { ...hit, weight });
    };
    collect(doc.title, 10, 12);
    for (const h of doc.headings.slice(0, 60)) collect(h, 8, 12);
    for (const d of doc.definitions.slice(0, 80)) collect(d.term, 6, 12);
    for (const [en, hit] of found) {
      const a = aliasNorm(en);
      if (!a || a.length < 2) continue;
      if (!aliases[a]) aliases[a] = [];
      if (aliases[a].length < 60) aliases[a].push([di, hit.weight, (doc.id.split('/').length)]);
      aliasRu[a] = hit.ru;
    }
  });

  // RU→EN: сначала термины, которые реально встречаются как названия/опции в руководстве
  const ru2en = new Map();
  const pairRank = ([en]) => {
    const list = aliases[aliasNorm(en)];
    if (!list || !list.length) return { prio: 1, weight: 0, words: en.split(' ').length, len: en.length };
    const weight = Math.max(...list.map((e) => e[1]));
    return { prio: 0, weight, words: en.split(' ').length, len: en.length };
  };
  const rankCache = new Map();
  const orderedPairs = [...ru2enPairs]
    .map((pair) => (rankCache.has(pair[0]) ? pair : (rankCache.set(pair[0], pairRank(pair)), pair)))
    .sort((x, y) => {
      const a2 = rankCache.get(x[0]);
      const b2 = rankCache.get(y[0]);
      if (a2.prio !== b2.prio) return a2.prio - b2.prio;
      if (b2.weight !== a2.weight) return b2.weight - a2.weight;   // термины реальных страниц важнее
      if (b2.words !== a2.words) return b2.words - a2.words;       // «render region» точнее, чем «region»
      return a2.len - b2.len;
    });
  for (const [en, ru] of orderedPairs) {
    const k = normTerm(ru);
    if (!k) continue;
    if (!ru2en.has(k)) ru2en.set(k, []);
    const list = ru2en.get(k);
    if (list.length < 6 && !list.includes(en)) list.push(en);
  }

  const index = {
    v: DATA_VERSION,
    N: docs.length,
    avgdl: docMeta.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length),
    docs: docMeta,
    terms: {},
    df: {},
    anchors,
    keys: keyIndex,
    aliases,
    aliasRu,
  };
  for (const [term, list] of postings) {
    index.terms[term] = list;
    index.df[term] = list.length;
  }

  // ── метаданные ──
  const meta = {
    dataVersion: DATA_VERSION,
    built: new Date().toISOString(),
    sourceVersion: SOURCE_VERSION,
    targetVersion: TARGET_VERSION,
    counts: {
      pages: docs.length,
      manual: docs.filter((d) => d.kind === 'doc').length,
      api: docs.filter((d) => d.kind === 'api').length,
      terms: Object.keys(index.terms).length,
      anchors: anchors.length,
      keys: keyIndex.length,
      aliases: Object.keys(aliases).length,
      translations: en2ru.size,
    },
    sections: Object.entries(SECTION_RU)
      .map(([id, ru]) => ({ id, ru, pages: docs.filter((d) => d.section === id).length }))
      .filter((s) => s.pages > 0),
    sources: [
      { id: 'manual', title: 'Blender Reference Manual', license: 'CC BY-SA 4.0', url: 'https://docs.blender.org/manual/en/latest/' },
      { id: 'api', title: 'Blender Python API Reference', license: 'GPL-2.0-or-later', url: 'https://docs.blender.org/api/current/' },
      { id: 'ui', title: 'Blender UI translation (locale/po/ru.po)', license: 'GPL-2.0-or-later', url: 'https://projects.blender.org/blender/blender/src/branch/main/locale/po/ru.po' },
    ],
    urls: { ru: `${DOCS_BASE}/ru/latest/`, en: `${DOCS_BASE}/en/latest/` },
    shards: [],
  };

  // ── запись ──
  fs.mkdirSync(OUT, { recursive: true });
  const gz = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });

  const bySection = new Map();
  docs.forEach((d, i) => {
    if (!bySection.has(d.section)) bySection.set(d.section, []);
    bySection.get(d.section).push({
      i, id: d.id, t: d.title, s: d.section, k: d.kind, b: d.blocks,
      l: d.links.filter((x) => x && !x.startsWith('..')),
    });
  });
  fs.rmSync(path.join(OUT, 'docs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true });
  for (const [section, list] of bySection) {
    const buf = gz(list);
    fs.writeFileSync(path.join(OUT, 'docs', `${section}.json.gz`), buf);
    meta.shards.push({ id: section, file: `docs/${section}.json.gz`, pages: list.length, bytes: buf.length });
  }

  // важные страницы (заголовки) — в начало списка алиаса
  for (const a of Object.keys(aliases)) aliases[a].sort((x, y) => y[1] - x[1] || x[2] - y[2]).map((e) => e.slice(0, 2));

  const idxBuf = gz(index);
  fs.writeFileSync(path.join(OUT, 'index.json.gz'), idxBuf);
  const termsOut = { en2ru: Object.fromEntries(en2ru), ru2en: Object.fromEntries(ru2en) };
  const termsBuf = gz(termsOut);
  fs.writeFileSync(path.join(OUT, 'terms.json.gz'), termsBuf);
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  const rep = (o) => Buffer.byteLength(JSON.stringify(o)) / 1024 / 1024;
  console.log(`  index.json.gz    ${(idxBuf.length / 1024).toFixed(0)} KB gz / ${rep(index).toFixed(1)} MB raw`);
  console.log(`  terms.json.gz    ${(termsBuf.length / 1024).toFixed(0)} KB gz / ${rep(termsOut).toFixed(1)} MB raw`);
  console.log(`  docs/*.json.gz   ${(meta.shards.reduce((s, x) => s + x.bytes, 0) / 1024).toFixed(0)} KB gz — ${meta.shards.length} разделов`);
  console.log(`  якорей: ${anchors.length}, горячих клавиш: ${keyIndex.length}`);
  console.log(`✓ готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
}

main();
