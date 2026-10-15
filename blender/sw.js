/**
 * sw.js — офлайн-режим «Академии Blender».
 *
 * Стратегии:
 *   • оболочка (index.html, src/**, manifest, иконка) — network-first с откатом в кэш;
 *   • данные (data/**) — stale-while-revalidate: офлайн отдаём из кэша,
 *     а в фоне подтягиваем свежую сборку после пересборки справочника.
 *
 * При обновлении приложения достаточно поднять CACHE_VERSION.
 */
const CACHE_VERSION = 'v1';
const CACHE = `blender-academy-${CACHE_VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isData = url.pathname.includes('/data/');

  if (isData) {
    // stale-while-revalidate: мгновенный ответ из кэша + тихое обновление
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(network);
        return hit;
      }
      const res = await network;
      if (res) return res;
      throw new Error('офлайн: данных нет в кэше');
    })());
    return;
  }

  // оболочка: сеть, при неудаче — кэш, в крайнем случае — index.html
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && !req.headers.get('range')) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const shell = await cache.match('./index.html');
      if (shell) return shell;
      throw e;
    }
  })());
});
