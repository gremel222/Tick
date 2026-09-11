/* Роутер: history API, гварды, разделы 6.1–6.2 */
import { qs } from './ui.js';
import { href, routeOf, BASE } from './base.js';

const routes = new Map();
let currentPath = null;

export function add(path, def) { routes.set(path, def); }

export function navigate(path, replace = false) {
  const url = href(path);
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  render();
}

export function current() { return currentPath; }

export function render() {
  const path = routeOf();
  currentPath = routes.has(path) ? path : '/';
  const def = routes.get(currentPath);
  const app = qs('#app');
  if (!def) { app.innerHTML = `<div class="page container"><h1>404</h1><p><a href="${BASE}" data-link>На главную</a></p></div>`; return; }
  // гварды
  if (def.redirectIfAuth && def.guard?.()) { navigate(def.redirectIfAuth, true); return; }
  if (def.requiresAuth && !def.guard?.()) { navigate('/login', true); return; }
  app.innerHTML = '';
  def.render(app);
  fixLinks(app);
  window.scrollTo(0, 0);
}

/* Ссылки в разметке пишутся как "/play" — префиксуем базой,
   чтобы работало и в подкаталоге (GitHub Pages). */
function fixLinks(root) {
  if (BASE === '/') return;
  (root || document).querySelectorAll('a[data-link]').forEach(a => {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('/') && !h.startsWith(BASE)) a.setAttribute('href', href(h));
  });
}

export function start() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    e.preventDefault();
    navigate(routeOf(a.getAttribute('href')));
  });
  window.addEventListener('popstate', render);
  fixLinks(document);
  render();
}
