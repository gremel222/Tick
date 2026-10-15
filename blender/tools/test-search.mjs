#!/usr/bin/env node
/**
 * test-search.mjs — прогон поискового движка по собранной базе (без браузера).
 * Проверяет, что русские вопросы находят правильные опции и клавиши.
 *
 * Запуск: node blender/tools/test-search.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Search } from '../src/lib/search.js';
import { buildAnswer, makeAnswerUtils } from '../src/lib/answer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', f))));

const index = gz('index.json.gz');
const terms = gz('terms.json.gz');

const t0 = Date.now();
const engine = new Search(index, terms);
const utils = makeAnswerUtils(index, terms);
console.log(`Индекс: ${index.N} страниц, ${Object.keys(index.terms).length} терминов, ${index.anchors.length} опций — загружено за ${Date.now() - t0} мс\n`);

const QUERIES = [
  'что делает Clip Start',
  'как открыть боковую панель',
  'focal length',
  'focal length перевод',
  'ctrl+b',
  'N',
  'горячая клавиша рендера',
  'passepartout',
  'что такое passepartout',
  'рендер региона',
  '3d cursor',
  'курсор',
  'локальная камера',
  'пропорциональное редактирование',
  'subdivision surface',
  'meta ball',
  'bpy.ops.mesh.primitive_cube_add',
  'как добавить объект',
  'рентген',
  'wireframe',
  'как включить рентген',
  'материал principled',
  'почему артефакты буфера глубины',
  'проверка орфографии абракадабра',
];

// эталонные ожидания: подстрока, которая должна быть в заголовке/типе ответа
const EXPECT = {
  'что делает Clip Start': { kind: 'anchor', has: 'Clip Start' },
  'как открыть боковую панель': { kind: 'key', has: 'N' },
  'focal length': { kind: 'anchor', has: 'Focal Length' },
  'ctrl+b': { kind: 'key', has: 'Ctrl+B' },
  'N': { kind: 'key', has: 'N' },
  'горячая клавиша рендера': { kind: 'key', has: 'F12' },
  'passepartout': { kind: 'anchor', has: 'Passepartout' },
  'рендер региона': { kind: 'anchor', has: 'Render Region' },
  'пропорциональное редактирование': { has: 'O' },
  'subdivision surface': { has: 'Subdivision Surface' },
  'как добавить объект': { kind: 'key', has: 'Shift+A' },
  'рентген': { has: 'X-Ray' },
  'wireframe': { has: 'Wireframe' },
  'материал principled': { has: 'Material' },
};

let pass = 0;
let fails = [];
for (const q of QUERIES) {
  const res = engine.ask(q);
  const ans = buildAnswer(q, res, utils);
  const exp = EXPECT[q];
  const text = `${ans.kind} ${ans.title} ${ans.subtitle || ''}`;
  const ok = ans.kind !== 'none' && (!exp || ((!exp.kind || ans.kind === exp.kind) && text.includes(exp.has)));
  if (ok) pass++;
  else if (exp) fails.push(`«${q}» → ${ans.kind}: ${ans.title} (ожидалось ${exp.kind || 'любой'} с «${exp.has}»)`);
  console.log(`${ok ? '✓' : '·'} «${q}» → [${ans.kind}] ${ans.title}${ans.subtitle ? ' — ' + ans.subtitle : ''}`);
  if (ans.body) console.log(`    ${ans.body.replace(/\s+/g, ' ').slice(0, 150)}`);
  if (ans.keys.length) console.log(`    клавиши: ${ans.keys.map((k) => k.k).join(', ')}`);
  if (ans.sources?.length) console.log(`    источники: ${ans.sources.slice(0, 3).map((s) => s.doc.id).join(' | ')}`);
  if (res.suggestions?.length) console.log(`    подсказки: ${res.suggestions.slice(0, 5).join(', ')}`);
  console.log(`    (${res.took.toFixed(0)} мс)`);
}

console.log(`\nОтветов найдено: ${pass}/${QUERIES.length}`);
if (fails.length) {
  console.log('\nНе совпало с ожиданиями:');
  for (const f of fails) console.log('  · ' + f);
  process.exitCode = 1;
}

// проверка автодополнения
console.log('\nАвтодополнение «side»:', engine.suggest('side').map((s) => s.title).join(', '));
console.log('Автодополнение «панель»:', engine.suggest('панель').map((s) => s.title).join(', '));
