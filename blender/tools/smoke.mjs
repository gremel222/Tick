#!/usr/bin/env node
/**
 * smoke.mjs — проверка интерфейса без браузера.
 *
 * Поднимает минимальный DOM-шим, открывает приложение из файлов (fetch для file://
 * реализован через fs) и проходит по всем экранам, сообщая об ошибках рендера.
 *
 * Запуск: node blender/tools/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');


/* ─────────────── мини-селекторы ─────────────── */
const matchSimple = (el, part) => {
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
  let m;
  let any = false;
  while ((m = re.exec(part))) {
    any = true;
    if (m[1] && el.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
    else if (m[2] && el.getAttribute('id') !== m[2]) return false;
    else if (m[3] && !el.classList.contains(m[3])) return false;
    else if (m[4]) {
      const want = m[5] ?? m[6] ?? m[7] ?? null;
      const have = el.getAttribute(m[4]);
      if (want === null ? have === null : have !== want) return false;
    }
  }
  return any;
};

const matchesChain = (el, parts) => {
  if (!matchSimple(el, parts[parts.length - 1])) return false;
  let i = parts.length - 2;
  let node = el.parentNode;
  while (i >= 0 && node) {
    if (node.nodeType === 1 && matchSimple(node, parts[i])) i--;
    node = node.parentNode;
  }
  return i < 0;
};

const parseGroups = (sel) => String(sel).split(',').map((g) => g.trim().split(/\s+/).filter(Boolean)).filter((g) => g.length);

const queryAll = (root, sel) => {
  const groups = parseGroups(sel);
  const out = [];
  const walk = (node) => {
    for (const c of node.childNodes || []) {
      if (c.nodeType !== 1) continue;
      if (groups.some((g) => matchesChain(c, g)) && !out.includes(c)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
};

/* ─────────────── DOM-шим ─────────────── */
class NodeBase {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
    this._text = '';
  }
  get children() { return this.childNodes.filter((c) => c instanceof Element); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  append(...items) { for (const it of items.flat()) this.appendChild(it); }
  appendChild(item) {
    const node = typeof item === 'string' ? new TextNode(item) : item;
    if (!node) return node;
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  insertBefore(node, ref) {
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx < 0) return this.appendChild(node);
    node.parentNode = this;
    this.childNodes.splice(idx, 0, node);
    return node;
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) this.childNodes.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...items) { this.childNodes = []; this.append(...items); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  get textContent() {
    if (this instanceof TextNode) return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) { this.childNodes = [new TextNode(String(v))]; }
  addEventListener(type, fn) { (this._listeners ||= {}); (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const l = this._listeners?.[type];
    if (l) this._listeners[type] = l.filter((x) => x !== fn);
  }
  dispatchEvent(ev) {
    ev.target ||= this;
    ev.currentTarget = this;
    for (const fn of this._listeners?.[ev.type] || []) fn(ev);
    return true;
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  focus() {} blur() {} select() {} scrollIntoView() {} setPointerCapture() {}
}

class TextNode extends NodeBase {
  constructor(text) { super(); this._text = String(text); this.nodeType = 3; }
}

class Element extends NodeBase {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.nodeType = 1;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.href = '';
    this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => this._classes.add(x)),
      remove: (...c) => c.forEach((x) => this._classes.delete(x)),
      toggle: (c, force) => {
        const on = force === undefined ? !this._classes.has(c) : !!force;
        if (on) this._classes.add(c); else this._classes.delete(c);
        return on;
      },
      contains: (c) => this._classes.has(c),
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = v;
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v);
  }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : (k === 'class' ? this.className : null); }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  set innerHTML(v) { this.childNodes = v ? [new TextNode(String(v).replace(/<[^>]+>/g, ''))] : []; }
  get innerHTML() { return this.textContent; }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  matches(sel) { return parseGroups(sel).some((g) => matchesChain(this, g)); }
  closest(sel) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(sel)) return node;
      node = node.parentNode;
    }
    return null;
  }
  focus() {}
}

const makeDoc = () => {
  const doc = new Element('html');
  doc.documentElement = doc;
  const body = new Element('body');
  const head = new Element('head');
  const themeMeta = new Element('meta');
  themeMeta.setAttribute('name', 'theme-color');
  themeMeta.setAttribute('content', '#16181d');
  head.append(themeMeta);
  doc.append(head, body);
  doc.body = body;
  doc.head = head;
  const byId = new Map();
  doc.createDocumentFragment = () => {
    const f = new Element('#fragment');
    f.nodeType = 11;
    return f;
  };
  doc.createTextNode = (t) => new TextNode(t);
  doc.createElement = (tag) => new Element(tag);
  doc.getElementById = (id) => byId.get(id) || null;
  doc._register = (id, el) => byId.set(id, el);
  doc.querySelector = (sel) => queryAll(doc, sel)[0] || null;
  doc.querySelectorAll = (sel) => queryAll(doc, sel);
  doc.matches = () => false;
  doc.closest = () => null;
  doc.readyState = 'loading';
  doc.hidden = false;
  doc.visibilityState = 'visible';
  doc.addEventListener = NodeBase.prototype.addEventListener.bind(doc);
  doc.removeEventListener = NodeBase.prototype.removeEventListener.bind(doc);
  doc.dispatchEvent = (ev) => {
    ev.target ||= doc;
    for (const fn of doc._listeners?.[ev.type] || []) fn(ev);
    for (const fn of globalThis.window._listeners?.[ev.type] || []) fn(ev);
    return true;
  };
  return doc;
};

const document = makeDoc();
const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const window = new NodeBase();
window.document = document;
window.localStorage = localStorage;
window.location = { hash: '#/home', href: 'file:///blender/index.html#/home', pathname: '/blender/index.html', protocol: 'file:' };
window.navigator = { language: 'ru-RU', languages: ['ru'], userAgent: 'node-smoke', onLine: true, serviceWorker: undefined };
window.matchMedia = (q) => ({ matches: q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} });
window.history = { replaceState() {}, pushState() {} };
window.requestIdleCallback = (fn) => setTimeout(() => fn({ timeRemaining: () => 5 }), 0);
window.cancelIdleCallback = (id) => clearTimeout(id);
window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
window.getComputedStyle = () => ({ getPropertyValue: () => '' });
window.scrollTo = () => {};
window.confirm = () => true;
window.alert = () => {};
window.prompt = () => null;
window.innerWidth = 1280;
window.innerHeight = 800;
window.devicePixelRatio = 1;
window.performance = performance;

globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = localStorage;
globalThis.location = window.location;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* node 22: navigator только для чтения */ }
globalThis.Node = NodeBase;
globalThis.Element = Element;
globalThis.TextNode = TextNode;
globalThis.HTMLElement = Element;
globalThis.requestIdleCallback = window.requestIdleCallback;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.getComputedStyle = window.getComputedStyle;

/* ─────────────── fetch для file:// ─────────────── */
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
  if (url.startsWith('file:')) {
    const file = fileURLToPath(url.split('#')[0].split('?')[0]);
    if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
    const buf = fs.readFileSync(file);
    const type = file.endsWith('.gz') ? 'application/gzip' : 'application/json';
    return new Response(new Blob([buf]).stream(), { status: 200, headers: { 'content-type': type } });
  }
  return nativeFetch(input, init);
};

/* ─────────────── прогон приложения ─────────────── */
const errors = [];
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.stack || e)));

const appRoot = new Element('div');
appRoot.id = 'app';
document.body.append(appRoot);
document._register('app', appRoot);
const toastRoot = new Element('div');
toastRoot.id = 'toast-root';
document.body.append(toastRoot);
document._register('toast-root', toastRoot);

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

await import(pathToFileURL(path.join(APP, 'src/app.js')).href);
document.readyState = 'complete';
document.dispatchEvent({ type: 'DOMContentLoaded' });
await tick(200);

const routes = [
  ['#/home', 'Главная'],
  ['#/ask', 'Ответы (интро)'],
  ['#/ask/что делает Clip Start', 'Ответ на вопрос'],
  ['#/ask?q=как открыть боковую панель', 'Ответ (?q=)'],
  ['#/ask/ctrl+b', 'Ответ: клавиша'],
  ['#/ref', 'Справочник'],
  ['#/ref/editors', 'Раздел'],
  ['#/doc/editors/3dview/sidebar', 'Страница'],
  ['#/doc/render/cameras', 'Страница 2'],
  ['#/learn', 'Курс'],
  ['#/lesson/m1/m1l1', 'Урок'],
  ['#/lesson/m3/m3l1', 'Урок 3'],
  ['#/train', 'Тренажёры'],
  ['#/train/keys', 'Клавиши'],
  ['#/train/find', 'Панели'],
  ['#/train/quiz', 'Квиз'],
  ['#/progress', 'Прогресс'],
  ['#/about', 'О проекте'],
];

let ok = 0;
for (const [hash, label] of routes) {
  try {
    window.location.hash = hash;
    window.dispatchEvent({ type: 'hashchange' });
    await tick(180);
    const text = appRoot.textContent.replace(/\s+/g, ' ').trim();
    const panels = appRoot.childNodes.length;
    const good = text.length > 60 && panels > 0;
    if (good) ok++;
    console.log(`${good ? '✓' : '✗'} ${label.padEnd(10)} ${hash.padEnd(36)} ${String(text.length).padStart(5)} симв. · узлов: ${panels} · ${text.slice(0, 150)}`);
  } catch (e) {
    console.log(`✗ ${label}: ${e.message}`);
    errors.push(`${hash}: ${e.stack || e.message}`);
  }
}

console.log(`\nЭкранов отрисовано: ${ok}/${routes.length}`);
if (errors.length) {
  console.log('\nОшибки:');
  for (const e of errors.slice(0, 3)) console.log('  • ' + String(e).split('\n').slice(0, 6).join('\n     '));
  process.exitCode = 1;
}
