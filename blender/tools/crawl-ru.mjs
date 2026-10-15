#!/usr/bin/env node
/**
 * crawl-ru.mjs — скачивает русские страницы руководства Blender
 * (docs.blender.org/manual/ru/latest) и складывает их в blender/data/ru/<раздел>.json.gz
 * в том же формате, что и английские шарды приложения.
 *
 * Зачем: поиск и ответы работают на английском исходнике + официальном словаре
 * интерфейса (ru.po), поэтому сайт полезен сразу. После этого краулера страницы
 * справочника начинают читаться по-русски — приложение подхватит шарды автоматически
 * (в meta.json появится "hasRu": true).
 *
 * Запуск (нужен доступ в интернет к docs.blender.org):
 *   node blender/tools/crawl-ru.mjs                     # всё руководство (~2100 страниц)
 *   node blender/tools/crawl-ru.mjs --section editors    # один раздел
 *   node blender/tools/crawl-ru.mjs --limit 50 --dry     # пробный прогон без записи
 *   node blender/tools/crawl-ru.mjs --selftest           # проверка парсера на встроенном примере
 *
 * Флаги: --force (перекачать), --delay 120 (мс между запросами), --concurrency 4, --quiet.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const RU = path.join(DATA, 'ru');
const BASE = 'https://docs.blender.org/manual/ru/latest/';
const UA = 'blender-academy-crawler/1.0 (offline study app; +https://github.com/gremel222/Tick)';

/* ─────────────────────────── аргументы ─────────────────────────── */

const args = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const opts = {
  section: flag('section'),
  limit: Number(flag('limit', 0)) || 0,
  force: !!flag('force', false),
  dry: !!flag('dry', false),
  quiet: !!flag('quiet', false),
  delay: Number(flag('delay', 120)),
  concurrency: Math.max(1, Math.min(8, Number(flag('concurrency', 4)))),
  selftest: !!flag('selftest', false),
};

/* ─────────────────────────── HTML → блоки ─────────────────────────── */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…', times: '×', deg: '°', rarr: '→', larr: '←', uarr: '↑', darr: '↓', minus: '−', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', prime: '′', Prime: '″', plusmn: '±', infin: '∞', pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', sigma: 'σ', Omega: 'Ω', micro: 'µ', le: '≤', ge: '≥', ne: '≠', asymp: '≈', bull_: '•' };

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+)_?;/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}

const stripTags = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

/** Инлайновая разметка приложения: [[k]]…[[/k]], [[code]], [[ui]], [текст](цель). */
export function inline(html, ctx) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<a\b[^>]*class="[^"]*headerlink[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '');   // ¶ у заголовков
  // ссылки
  s = s.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    const label = stripTags(text) || href;
    const target = linkTarget(href, ctx);
    return target ? `[${label}](${target})` : label;
  });
  s = s.replace(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/gi, (m, t) => `[[k]]${stripTags(t)}[[/k]]`);
  s = s.replace(/<(code|tt|samp)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, t) => `[[code]]${stripTags(t)}[[/code]]`);
  s = s.replace(/<span[^>]*class="[^"]*(menuselection|guilabel|literal)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, (m, cls, t) => (cls === 'literal' ? `[[code]]${stripTags(t)}[[/code]]` : `[[ui]]${stripTags(t)}[[/ui]]`));
  s = s.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, (m, t) => `**${stripTags(t)}**`);
  s = s.replace(/<(b|em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, t) => (tag === 'b' ? `**${stripTags(t)}**` : `_${stripTags(t)}_`));
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = stripTags(s);
  return s.replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

/** Ссылка внутри руководства → doc:<id>#anchor для внутренних, иначе абсолютный URL. */
export function linkTarget(href, ctx = {}) {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('javascript:')) return '';
  if (/^https?:\/\//i.test(h)) {
    const m = h.match(/docs\.blender\.org\/manual\/(?:ru|en)\/latest\/(.+?)\.html(#.*)?$/);
    if (!m) return h;
    return docRef(m[1], m[2] || '');
  }
  const [pathPart, hash] = h.split('#');
  if (/^[a-z]+:/i.test(pathPart)) return h;
  // относительный путь: ../../editors/3dview/sidebar.html
  const baseDir = ctx.dir ? ctx.dir.split('/') : [];
  const segs = pathPart.replace(/\.html?$/, '').split('/');
  const out = [...baseDir];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return docRef(out.join('/'), hash ? '#' + hash : '');
}

const docRef = (id, hash) => (id ? `doc:${id.replace(/\/index$/, '').replace(/^\/+/, '')}${hash}` : '');

/** Ищет парный закрывающий тег с учётом вложенности. */
function readBalanced(html, openEnd, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) depth--;
    else depth++;
    if (depth === 0) return { inner: html.slice(openEnd, m.index), end: re.lastIndex };
  }
  return { inner: html.slice(openEnd), end: html.length };
}

const BLOCK_START = /<(h[1-6]|p|ul|ol|dl|table|pre|figure|div)\b[^>]*>/gi;

/** HTML страницы руководства → массив блоков в формате приложения. */
export function htmlToBlocks(html, ctx = {}) {
  const blocks = [];
  const definitions = [];
  let src = html.replace(/<!--[\s\S]*?-->/g, '');
  const article = src.match(/<article\b[^>]*>/i);
  if (article) {
    const { inner } = readBalanced(src, article.index + article[0].length, 'article');
    src = inner;
  } else {
    const main = src.match(/<main\b[^>]*>/i) || src.match(/<div[^>]*role="main"[^>]*>/i);
    if (main) src = src.slice(main.index + main[0].length);
  }

  const pushList = (inner, ordered) => {
    const items = [];
    const re = /<li\b[^>]*>/gi;
    let m;
    const starts = [];
    while ((m = re.exec(inner))) starts.push(m.index + m[0].length);
    for (const start of starts) items.push(inline(readBalanced(inner, start, 'li').inner, ctx));
    if (items.length) blocks.push(['l', ordered ? 1 : 0, items.filter(Boolean)]);
  };

  const pushTable = (inner) => {
    const rows = [];
    const rowRe = /<tr\b[^>]*>/gi;
    let m;
    while ((m = rowRe.exec(inner))) {
      const { inner: row } = readBalanced(inner, m.index + m[0].length, 'tr');
      const cells = [];
      const cellRe = /<(th|td)\b[^>]*>/gi;
      let c;
      while ((c = cellRe.exec(row))) cells.push(inline(readBalanced(row, c.index + c[0].length, c[1]).inner, ctx));
      if (cells.length) rows.push({ cells, header: /<th\b/i.test(row) });
    }
    if (!rows.length) return;
    const heads = rows[0].header ? rows.shift().cells : rows[0].cells.map(() => '');
    blocks.push(['b', heads, rows.map((r) => r.cells)]);
  };

  const pushDl = (inner) => {
    const re = /<(dt|dd)\b([^>]*)>/gi;
    let m;
    let current = null;
    while ((m = re.exec(inner))) {
      const tag = m[1];
      const { inner: body } = readBalanced(inner, m.index + m[0].length, tag);
      if (tag === 'dt') {
        const idMatch = m[2].match(/id="([^"]+)"/i);
        current = { term: inline(body, ctx).replace(/[*_]/g, ''), anchor: idMatch ? idMatch[1] : '' };
      } else if (tag === 'dd' && current) {
        const text = inline(body, ctx);
        if (current.term) {
          blocks.push(['d', current.term, text, blocks.length]);
          definitions.push({ term: stripTags(current.term), desc: text, anchor: current.anchor });
        }
        current = null;
      }
    }
  };

  const pushAdmonition = (tagText, inner) => {
    const kind = (tagText.match(/admonition\s+([a-z-]+)/i) || [])[1] || 'note';
    const titleMatch = inner.match(/<p[^>]*class="[^"]*admonition-title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const title = titleMatch ? inline(titleMatch[1], ctx) : '';
    const body = inline(inner.replace(/<p[^>]*class="[^"]*admonition-title[^"]*"[^>]*>[\s\S]*?<\/p>/i, ''), ctx);
    if (body || title) blocks.push(['n', kind, title && !body.toLowerCase().startsWith(title.toLowerCase()) ? `${title}: ${body}` : body || title]);
  };

  BLOCK_START.lastIndex = 0;
  let m;
  while ((m = BLOCK_START.exec(src))) {
    const tag = m[1].toLowerCase();
    const openEnd = m.index + m[0].length;
    if (tag === 'div') {
      if (!/class="[^"]*admonition/i.test(m[0])) continue;
      const { inner, end } = readBalanced(src, openEnd, 'div');
      pushAdmonition(m[0], inner);
      BLOCK_START.lastIndex = end;
      continue;
    }
    const { inner, end } = readBalanced(src, openEnd, tag);
    BLOCK_START.lastIndex = end;
    if (tag[0] === 'h') {
      const level = Number(tag[1]);
      const text = inline(inner, ctx);
      if (text) blocks.push(['h', level, text]);
    } else if (tag === 'p') {
      const text = inline(inner, ctx);
      if (text) blocks.push(['p', text]);
    } else if (tag === 'ul' || tag === 'ol') {
      pushList(inner, tag === 'ol');
    } else if (tag === 'dl') {
      pushDl(inner);
    } else if (tag === 'table') {
      pushTable(inner);
    } else if (tag === 'pre') {
      const text = decodeEntities(inner.replace(/<[^>]*>/g, '')).trim();
      if (text) blocks.push(['c', text]);
    } else if (tag === 'figure') {
      const img = inner.match(/<img\b[^>]*alt="([^"]*)"[^>]*>/i) || inner.match(/<img\b[^>]*src="([^"]*)"[^>]*>/i);
      const cap = inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
      if (img) blocks.push(['i', (img[1] || '').trim()]);
      if (cap) {
        const text = inline(cap[1], ctx);
        if (text) blocks.push(['cap', text]);
      }
    }
  }

  return { blocks, definitions };
}

/** Первый абзац — резюме страницы. */
const summarize = (blocks) => (blocks.find((b) => b[0] === 'p' && b[1] && b[1].length > 40)?.[1] || blocks.find((b) => b[0] === 'p')?.[1] || '').slice(0, 400);

/** Русский заголовок страницы. */
function russianTitle(html, fallback) {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = inline(h1[1]).replace(/\s*¶\s*$/, '').trim();
    if (t) return t;
  }
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return stripTags(title[1]).replace(/\s*[—-]\s*Blender.*$/i, '').trim() || fallback;
  return fallback;
}

/* ─────────────────────────── сеть ─────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(id, attempt = 0) {
  const url = BASE + id + '.html';
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
    if (res.status === 404) return { missing: true, url };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return { html: await res.text(), url };
  } catch (e) {
    if (attempt >= 2) throw new Error(`${url}: ${e.message}`);
    await sleep(500 * (attempt + 1));
    return fetchPage(id, attempt + 1);
  }
}

/* ─────────────────────────── основной цикл ─────────────────────────── */

const gz = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 });
const log = (...a) => { if (!opts.quiet) console.log(...a); };

function loadIndexIds() {
  const file = path.join(DATA, 'index.json.gz');
  if (!fs.existsSync(file)) throw new Error('Нет blender/data/index.json.gz — сначала запустите node blender/tools/build-data.mjs');
  const index = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const docs = (index.docs || []).filter((d) => (d.k || d.kind) === 'doc' || (!d.k && !d.kind));
  const bySection = new Map();
  for (const d of docs) {
    if (!bySection.has(d.s)) bySection.set(d.s, []);
    bySection.get(d.s).push({ id: d.id, t: d.t });
  }
  return bySection;
}

function loadShard(section) {
  const file = path.join(RU, `${section}.json.gz`);
  if (!fs.existsSync(file)) return new Map();
  try {
    const list = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
    return new Map(list.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

async function crawlSection(section, pages) {
  const done = opts.force ? new Map() : loadShard(section);
  const queue = pages.filter((p) => !done.has(p.id));
  const limited = opts.limit ? queue.slice(0, opts.limit) : queue;
  if (!limited.length) {
    log(`  ${section}: уже собрано (${done.size})`);
    return { section, added: 0, missing: 0, total: done.size };
  }
  let added = 0;
  let missing = 0;
  const missingIds = [];
  let cursor = 0;
  const save = () => {
    if (opts.dry) return;
    fs.mkdirSync(RU, { recursive: true });
    fs.writeFileSync(path.join(RU, `${section}.json.gz`), gz([...done.values()].sort((a, b) => a.id.localeCompare(b.id))));
  };
  const worker = async () => {
    while (cursor < limited.length) {
      const page = limited[cursor++];
      const idx = pages.findIndex((p) => p.id === page.id);
      try {
        const res = await fetchPage(page.id);
        if (res.missing) {
          missing++;
          missingIds.push(page.id);
        } else {
          const dir = page.id.split('/').slice(0, -1).join('/');
          const ctx = { dir };
          const { blocks } = htmlToBlocks(res.html, ctx);
          const title = russianTitle(res.html, page.t);
          if (blocks.length) {
            done.set(page.id, {
              i: idx, id: page.id, t: title, s: section, k: 'doc', b: blocks,
              sum: summarize(blocks), l: [],
            });
            added++;
          } else {
            missing++;
            missingIds.push(page.id);
          }
        }
      } catch (e) {
        console.warn(`  ! ${page.id}: ${e.message}`);
      }
      if (added % 25 === 0 && added) { save(); log(`  ${section}: ${added}/${limited.length}`); }
      if (opts.delay) await sleep(opts.delay);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  save();
  return { section, added, missing, missingIds, total: done.size };
}

async function updateMeta(results) {
  if (opts.dry) return;
  const file = path.join(DATA, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ruPages = results.reduce((s, r) => s + r.total, 0);
  meta.hasRu = ruPages > 0;
  meta.ruPages = ruPages;
  meta.ruUpdated = new Date().toISOString();
  meta.ruSections = results.filter((r) => r.total).map((r) => r.section);
  fs.writeFileSync(file, JSON.stringify(meta, null, 2) + '\n');
  log(`\nmeta.json: hasRu=${meta.hasRu}, русских страниц ${ruPages}`);
}

async function main() {
  if (opts.selftest) return selftest();
  const bySection = loadIndexIds();
  const sections = opts.section ? [opts.section] : [...bySection.keys()].sort();
  log(`Краулер русского руководства: разделов ${sections.length}, страниц ${sections.reduce((s, x) => s + (bySection.get(x)?.length || 0), 0)}`);
  const results = [];
  for (const section of sections) {
    const pages = bySection.get(section);
    if (!pages) {
      console.warn(`  раздел «${section}» не найден в индексе`);
      continue;
    }
    log(`\n▶ ${section} (${pages.length} страниц)`);
    const res = await crawlSection(section, pages);
    log(`  готово: +${res.added}, всего ${res.total}${res.missing ? `, не переведено ${res.missing}` : ''}`);
    results.push(res);
  }
  await updateMeta(results);
  const total = results.reduce((s, r) => s + r.added, 0);
  log(`\nИтог: скачано ${total} страниц. Приложение подхватит их при следующей загрузке.`);
}

/* ─────────────────────────── самопроверка парсера ─────────────────────────── */

export const SELFTEST_HTML = `<!DOCTYPE html><html lang="ru"><head><title>Боковая панель — Blender Manual</title></head><body>
<nav>меню</nav>
<article role="main">
  <h1>Боковая панель<a class="headerlink" href="#sidebar" title="Link to this heading">¶</a></h1>
  <p>Боковая панель открывается клавишей <kbd class="kbd docutils literal notranslate"><span class="pre">N</span></kbd> и содержит настройки, относящиеся к текущему редактору.</p>
  <div class="admonition note"><p class="admonition-title">Примечание</p><p>Вкладки зависят от контекста: <span class="menuselection">Item ‣ Tool</span>.</p></div>
  <h2>Вкладка View<a class="headerlink" href="#view" title="Link to this heading">¶</a></h2>
  <dl class="simple">
    <dt id="bpy-ops-view3d-view-all"><em>Focal Length</em></dt><dd><p>Фокусное расстояние камеры в этом вьюпорте.</p></dd>
    <dt>Clip Start/End</dt><dd><p>Отсечение — начало и конец диапазона видимости. Большой диапазон снижает точность <a href="../../render/cameras.html#depth-buffer">буфера глубины</a>.</p></dd>
  </dl>
  <ul>
    <li>Первый пункт списка.</li>
    <li>Второй пункт со ссылкой на <a href="../3dview/sidebar.html#bpy-ops-view3d-view-all">опцию</a>.</li>
  </ul>
  <table><thead><tr><th>Клавиша</th><th>Действие</th></tr></thead><tbody><tr><td><kbd>Ctrl</kbd>-<kbd>B</kbd></td><td>Область рендера</td></tr></tbody></table>
  <figure><img src="sidebar.png" alt="Боковая панель во вьюпорте"/><figcaption><p>Боковая панель в 3D-вьюпорте.</p></figcaption></figure>
</article>
<footer>подвал</footer></body></html>`;

function selftest() {
  const { blocks, definitions } = htmlToBlocks(SELFTEST_HTML, { dir: 'editors/3dview' });
  const title = russianTitle(SELFTEST_HTML, 'Sidebar');
  console.log('Заголовок страницы:', title);
  console.log('Блоков:', blocks.length, '| определений:', definitions.length);
  for (const b of blocks) console.log('  ', JSON.stringify(b).slice(0, 150));
  const ok = blocks.some((b) => b[0] === 'h') && blocks.some((b) => b[0] === 'd') && blocks.some((b) => b[0] === 'l')
    && blocks.some((b) => b[0] === 'n') && blocks.some((b) => b[0] === 'b') && blocks.some((b) => b[0] === 'i')
    && blocks.some((b) => Array.isArray(b) && b[0] === 'p' && b[1].includes('[[k]]N[[/k]]'))
    && blocks.some((b) => b[0] === 'd' && b[2].includes('(doc:render/cameras#depth-buffer)'))
    && title === 'Боковая панель';
  console.log(ok ? '\n✓ самопроверка парсера пройдена' : '\n✗ парсер вернул неожиданный результат');
  process.exitCode = ok ? 0 : 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error('Ошибка краулера:', e.message);
    console.error('Проверьте доступ к docs.blender.org: node blender/tools/crawl-ru.mjs --section editors --limit 3 --dry');
    process.exitCode = 1;
  });
}
