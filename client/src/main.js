/* ============================================================
   «Попаданец — Живой мир» — входная точка (роуты из 6.1)
   ============================================================ */
import * as router from './router.js';
import * as landing from './screens/landing.js';
import * as auth from './screens/auth.js';
import * as create from './screens/create.js';
import * as opening from './screens/opening.js';
import * as pub from './screens/public.js';
import * as game from './screens/game.js';
import * as acc from './api/local.js';

const authed = () => !!acc.current();

router.add('/', { render: landing.render });
router.add('/devlog', { render: landing.renderDevlog });
router.add('/wiki', { render: pub.renderWiki });
router.add('/leaderboard', { render: pub.renderLeaderboard });
router.add('/register', { render: auth.renderRegister, redirectIfAuth: '/play', guard: authed });
router.add('/login', { render: auth.renderLogin, redirectIfAuth: '/play', guard: authed });
router.add('/character/create', { render: (root) => createRender(root), guard: () => true });
router.add('/opening', { render: opening.render });
router.add('/play', { render: game.render });
router.add('/profile', { render: pub.renderProfile });
router.add('/settings', { render: pub.renderSettings });
router.add('/privacy', { render: pub.renderLegal('privacy') });
router.add('/tos', { render: pub.renderLegal('tos') });
router.add('/cookies', { render: pub.renderLegal('cookies') });
router.add('/age-check', { render: pub.renderLegal('age-check') });
router.add('/dmca', { render: pub.renderLegal('dmca') });

function createRender(root) {
  const params = new URLSearchParams(location.search);
  create.render(root, { story: params.get('story') === '1' });
}

/* куки-баннер (раздел 8) */
function cookieBanner() {
  if (localStorage.getItem('pop:cookies-ok')) return;
  const el = document.createElement('div');
  el.className = 'cookie-banner';
  el.innerHTML = `
    <span style="flex:1;min-width:220px">🍪 Мы храним только сессию, сейвы и настройки — в твоём браузере. Без рекламы и слежки. <a href="/cookies" data-link>Подробнее</a></span>
    <button class="btn btn-accent btn-sm" id="ck-ok">Хорошо</button>`;
  document.body.appendChild(el);
  document.getElementById('ck-ok').addEventListener('click', () => {
    localStorage.setItem('pop:cookies-ok', '1');
    el.remove();
  });
}

/* глобальный перехват ошибок — чтобы игрок мог скриншотнуть */
window.addEventListener('error', e => {
  console.error(e.error || e.message);
});

/* применяем сохранённые настройки интерфейса */
pub.applyBodyClasses(acc.getSettings(acc.current()?.email));

router.start();
cookieBanner();
