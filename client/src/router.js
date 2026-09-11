/* Роутер: history API, гварды, разделы 6.1–6.2 */
import { qs } from './ui.js';

const routes = new Map();
let currentPath = null;

export function add(path, def) { routes.set(path, def); }

export function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  render();
}

export function current() { return currentPath; }

export function render() {
  const path = location.pathname || '/';
  currentPath = routes.has(path) ? path : '/';
  const def = routes.get(currentPath);
  const app = qs('#app');
  if (!def) { app.innerHTML = '<div class="page container"><h1>404</h1><p><a href="/" data-link>На главную</a></p></div>'; return; }
  // гварды
  if (def.redirectIfAuth && def.guard?.()) { navigate(def.redirectIfAuth, true); return; }
  if (def.requiresAuth && !def.guard?.()) { navigate('/login', true); return; }
  app.innerHTML = '';
  def.render(app);
  window.scrollTo(0, 0);
}

export function start() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  window.addEventListener('popstate', render);
  render();
}
