/* Базовый путь приложения.
   Работает и на локальном сервере (/), и на GitHub Pages (/<repo>/):
   вычисляется из URL этого модуля — client/src/base.js → корень клиента. */
function computeBase() {
  try {
    const u = new URL('../', import.meta.url);
    // в тестах (jsdom) модули грузятся по file://, а location — http: базы нет
    if (typeof location !== 'undefined' && u.origin !== location.origin) return '/';
    return u.pathname.replace(/\/+$/, '') + '/';
  } catch { return '/'; }
}

export const BASE = computeBase();

/** Абсолютный URL статики: asset('assets/hero.jpg') */
export function asset(p) { return BASE + String(p).replace(/^\/+/, ''); }

/** Роут ('/play') → URL для history/href */
export function href(routePath) { return BASE + String(routePath).replace(/^\/+/, ''); }

/** location.pathname → роут ('/play') */
export function routeOf(pathname = location.pathname) {
  let p = pathname || '/';
  if (BASE !== '/' && p.startsWith(BASE.slice(0, -1))) p = p.slice(BASE.length - 1);
  if (!p.startsWith('/')) p = '/' + p;
  return p.length > 1 ? p.replace(/\/+$/, '') : '/';
}
