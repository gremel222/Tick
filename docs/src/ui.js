/* UI-хелперы: DOM, модалки, тосты, ачивки */

export function qs(sel, root) { return (root || document).querySelector(sel); }
export function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---- модалки ---- */
let activeModal = null;

export function openModal(html, opts = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  overlay.addEventListener('mousedown', e => { if (e.target === overlay && !opts.sticky) closeModal(); });
  root.innerHTML = '';
  root.appendChild(overlay);
  activeModal = { overlay, onClose: opts.onClose };
  if (!opts.noEsc) {
    activeModal._key = e => { if (e.key === 'Escape' && !opts.sticky) closeModal(); };
    document.addEventListener('keydown', activeModal._key);
  }
  const body = overlay.querySelector('.modal-body');
  if (body && opts.focusInput) { const inp = body.querySelector('input, textarea'); if (inp) inp.focus(); }
  return overlay;
}

export function closeModal() {
  if (!activeModal) return;
  if (activeModal._key) document.removeEventListener('keydown', activeModal._key);
  activeModal.onClose?.();
  document.getElementById('modal-root').innerHTML = '';
  activeModal = null;
}

export function modalOpen() { return !!activeModal; }

/* ---- тосты ---- */
export function toast(msg, opts = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (opts.achievement ? ' ach-toast' : '');
  el.innerHTML = (opts.achievement ? '<div class="ach-t">🏆 ' + esc(opts.title || 'Достижение') + '</div>' : '') + esc(msg);
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; setTimeout(() => el.remove(), 450); }, opts.ms || 3400);
}

/* ---- разметка ---- */
export function bar(cls, val, max) {
  const pct = Math.max(0, Math.min(100, (val / Math.max(1, max)) * 100));
  return `<div class="bar ${cls}"><i style="width:${pct}%"></i></div>`;
}

export function fmtMin(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return min + ' мин. назад';
  const h = Math.round(min / 60);
  if (h < 24) return h + ' ч. назад';
  return Math.round(h / 24) + ' дн. назад';
}
