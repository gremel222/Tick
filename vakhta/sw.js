/**
 * sw.js — офлайн-режим «Счётчика вахты» (service worker).
 *
 * Что делает:
 *   • при установке складывает файлы приложения в кэш с именем, содержащим версию;
 *   • при открытии страницы сначала пробует сеть (чтобы подхватить новую версию),
 *     а без сети отдаёт из кэша — приложение работает в самолёте и в глухой тачке;
 *   • остальные файлы (стили, скрипты, иконки) отдаёт из кэша и тихо обновляет;
 *   • при активации удаляет кэши прошлых версий.
 *
 * Важно: service worker НЕ касается данных пользователя. Вахты, поступления и
 * вложения лежат в IndexedDB (файл db.js) — обновление приложения их не затрагивает.
 *
 * Как выпустить новую версию: поменять CACHE_VERSION (и SW_VERSION в app.js).
 */

const CACHE_VERSION = 'v6';
const CACHE = `vakhta-${CACHE_VERSION}`;

// пути считаем от адреса самого sw.js — поэтому подпапка GitHub Pages учитывается сама
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './dates.js',
  './files.js',
  './backup.js',
  './lock.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
].map((path) => new URL(path, self.location).href);

const INDEX_URL = new URL('./index.html', self.location).href;

/* ── установка: складываем файлы приложения в кэш ── */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // по одному файлу: если чего-то нет, установка всё равно состоится
    await Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    // Ждём команды со страницы: если сразу вызвать skipWaiting, пользователь
    // не увидит баннер «Доступна новая версия». Первая установка активируется сама.
  })());
});

/* ── активация: убираем кэши прошлых версий ── */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('vakhta-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

/* ── команда со страницы: «Обновить» ── */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/* ── ответы на запросы ── */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // чужие запросы не трогаем

  // открытие страницы: сеть → кэш (чтобы офлайн всё равно открылось)
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match(request)) || (await cache.match(INDEX_URL)) || (await cache.match(new URL('./', self.location).href));
        if (cached) return cached;
        return new Response('Нет сети и нет сохранённой версии приложения.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // файлы приложения: сразу из кэша + тихое обновление в фоне
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const fromNetwork = fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(fromNetwork.then(() => {}).catch(() => {}));
      return cached;
    }
    const response = await fromNetwork;
    if (response) return response;
    return new Response('Офлайн: файла нет в кэше.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
