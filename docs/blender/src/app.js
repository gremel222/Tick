/**
 * app.js — точка входа «Академии Blender»: инициализация, роутер, каркас интерфейса.
 */

import { h, frag, clear, icon, toast } from './lib/dom.js';
import { initStore, get, applyTheme, setSetting } from './lib/store.js';
import * as store from './lib/store.js';
import * as data from './lib/data.js';
import { Search } from './lib/search.js';
import { makeAnswerUtils } from './lib/answer.js';

import { homeScreen } from './screens/home.js';
import { askScreen } from './screens/ask.js';
import { refScreen, docScreen } from './screens/reference.js';
import { learnScreen, lessonScreen } from './screens/learn.js';
import { trainHubScreen, trainerScreen } from './screens/trainers.js';
import { progressScreen } from './screens/progress.js';
import { aboutScreen } from './screens/about.js';

const NAV = [
  { route: 'ask', label: 'Ответы', icon: 'search' },
  { route: 'ref', label: 'Справочник', icon: 'book' },
  { route: 'learn', label: 'Учиться', icon: 'cap' },
  { route: 'train', label: 'Тренажёры', icon: 'target' },
  { route: 'progress', label: 'Прогресс', icon: 'chart' },
  { route: 'about', label: 'О проекте', icon: 'home' },
];

export const ctx = {
  meta: null,
  search: null,
  searchPromise: null,
  utils: null,
};

/** Ленивая инициализация поискового движка (+ фоновая предзагрузка). */
export async function getSearch(onProgress) {
  if (ctx.search) return ctx.search;
  if (!ctx.searchPromise) {
    ctx.searchPromise = (async () => {
      const [index, terms] = await Promise.all([data.loadIndex(), data.loadTerms()]);
      ctx.search = new Search(index, terms);
      ctx.utils = makeAnswerUtils(index, terms);
      return ctx.search;
    })();
  }
  if (onProgress) {
    const off = (fn) => { data.onLoad(fn); return fn; };
    const handler = () => onProgress();
    off(handler);
  }
  return ctx.searchPromise;
}

export const onDataProgress = (fn) => data.onLoad(fn);

/* ─────────────────────────── роутер ─────────────────────────── */

export function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, query: new URLSearchParams(queryPart || ''), raw };
}

export function go(path, { replace = false } = {}) {
  const target = `#/${String(path).replace(/^#?\/?/, '')}`;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) render();
}

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

function render() {
  const { parts } = parseRoute();
  const app = document.getElementById('app');
  const main = app.querySelector('.main-slot');
  const route = parts[0] || 'home';

  app.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route || (route === 'home' && a.dataset.route === 'ask') || (route === 'doc' && a.dataset.route === 'ref') || (route === 'lesson' && a.dataset.route === 'learn'));
  });

  let node;
  try {
    if (route === 'home') node = homeScreen(parts, ctx);
    else if (route === 'ask') node = askScreen(parts, ctx);
    else if (route === 'ref') node = refScreen(parts, ctx);
    else if (route === 'doc') node = docScreen(parts, ctx);
    else if (route === 'learn') node = learnScreen(parts, ctx);
    else if (route === 'lesson') node = lessonScreen(parts, ctx);
    else if (route === 'train') node = parts[1] ? trainerScreen(parts, ctx) : trainHubScreen(parts, ctx);
    else if (route === 'progress') node = progressScreen(parts, ctx);
    else if (route === 'about') node = aboutScreen(parts, ctx);
    else node = homeScreen(parts, ctx);
  } catch (err) {
    console.error(err);
    node = h('div', { class: 'card' }, h('h2', { text: 'Ошибка' }), h('p', { class: 'muted', text: String(err.message || err) }));
  }

  clear(main).append(node);
  scrollTop();
}

/* ─────────────────────────── каркас ─────────────────────────── */

function buildShell() {
  const app = document.getElementById('app');
  app.className = '';
  clear(app);

  const nav = h('nav', { class: 'nav' }, NAV.map((n) =>
    h('a', { href: `#/${n.route}`, dataset: { route: n.route }, text: n.label })));

  const themeBtn = h('button', {
    class: 'icon-btn', title: 'Сменить тему', text: '◐',
    onclick: () => {
      const next = get().settings.theme === 'light' ? 'dark' : 'light';
      setSetting('theme', next);
      toast(next === 'light' ? 'Светлая тема' : 'Тёмная тема');
    },
  });

  const header = h('header', { class: 'topbar' },
    h('div', { class: 'wrap topbar-inner' },
      h('a', { class: 'brand', href: '#/' },
        h('span', { class: 'brand-mark' }),
        h('span', {}, 'Академия Blender', h('small', { text: 'справочник + тренажёр, офлайн' }))),
      nav,
      themeBtn));

  const main = h('main', {}, h('div', { class: 'wrap main-slot' }));
  const foot = h('footer', { class: 'foot' },
    h('div', { class: 'wrap' },
      h('p', { class: 'tiny', text: 'Материалы основаны на официальном руководстве Blender (CC BY-SA 4.0) и переводе интерфейса Blender (GPL-2.0-or-later). Blender — торговая марка Blender Foundation; сайт не аффилирован с ней.' },
      h('p', { class: 'tiny muted', text: 'Данные, поиск и прогресс работают полностью в браузере — без сервера и без отправки данных.' }))));

  app.append(header, main, foot);
}

/* ─────────────────────────── запуск ─────────────────────────── */

async function boot() {
  initStore();
  applyTheme(get().settings.theme);
  if (get().settings.fontScale !== 1) document.documentElement.style.fontSize = `${16 * get().settings.fontScale}px`;

  try {
    ctx.meta = await data.loadMeta();
  } catch (e) {
    document.getElementById('app').append(h('div', { class: 'wrap' },
      h('div', { class: 'card', style: 'margin-top:40px' },
        h('h1', { text: 'База знаний ещё не собрана' }),
        h('p', { class: 'muted', text: String(e.message || e) }),
        h('p', { class: 'small', text: 'Соберите данные командой:' }),
        h('pre', { class: 'mono', text: 'bash blender/tools/fetch-vendor.sh\nnode blender/tools/build-data.mjs' }))));
    return;
  }

  buildShell();
  window.addEventListener('hashchange', render);

  // фоновая предзагрузка индекса — чтобы первый вопрос отвечался мгновенно
  const prefetch = () => { getSearch().catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 2500 });
  else setTimeout(prefetch, 1200);

  // service worker (офлайн-режим)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  }

  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { h, frag, clear, icon, toast, store };
