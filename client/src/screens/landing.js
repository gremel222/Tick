/* Лендинг (раздел 6.3, Landing) */
import { DEVLOG } from '../game/data.js';
import { esc } from '../ui.js';
import { navigate } from '../router.js';

export function render(root) {
  root.innerHTML = `
  <div class="landing">
    <header class="site-header">
      <div class="container">
        <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
        <nav>
          <a href="/devlog" data-link>Девлог</a>
          <a href="/wiki" data-link>Вики</a>
          <a href="/leaderboard" data-link>Рейтинг</a>
          <a class="btn btn-accent btn-sm" href="/play" data-link>Играть</a>
        </nav>
      </div>
    </header>

    <section class="hero">
      <div class="container">
        <h1>Ты не герой истории.</h1>
        <p class="sub">Ты человек, который оказался внутри истории. Мир не ждёт тебя — он живёт своей жизнью.</p>
        <div class="row">
          <button class="btn btn-accent" id="hero-play" style="font-size:1.1em;padding:14px 30px;">Играть бесплатно</button>
          <a class="btn" href="/devlog" data-link>Смотреть девлог →</a>
        </div>
      </div>
    </section>

    <section class="section container">
      <h2>Что это за мир</h2>
      <div class="feature-grid">
        <div class="feature"><div class="ic">🚫👑</div><h3>Ты не избранный</h3><p>Нет меча, нет денег, нет репутации, нет магии. Только знания прошлой жизни — и то, если вспомнишь.</p></div>
        <div class="feature"><div class="ic">🌍</div><h3>Мир живёт сам</h3><p>Двадцать жителей деревни ходят по своим делам по расписанию. Торговец открывает лавку в восемь. Жрица молится на рассвете. Без тебя.</p></div>
        <div class="feature"><div class="ic">⌨️</div><h3>Свобода действий</h3><p>Никаких меню из четырёх кнопок. Пиши, что хочешь сделать — движок разберёт намерение. Или спросит уточнение.</p></div>
        <div class="feature"><div class="ic">🧠</div><h3>Мир помнит тебя</h3><p>Важное — навсегда, мелкое — тридцать дней. Свидетели разносят слухи. Канон истории ломается от твоих решений.</p></div>
      </div>
    </section>

    <section class="section container">
      <h2>Дорожная карта</h2>
      <div class="roadmap-grid">
        <div class="card roadmap-card"><div class="ver">v0.1</div><p>Деревня, 20 NPC, время, погода, экономика, 3 режима смерти, диалоги rules+ИИ, сохранения.</p></div>
        <div class="card roadmap-card"><div class="ver">v0.5</div><p>Фракции, романтика, полный бой, сюжетные линии, звук, публичный анонс.</p></div>
        <div class="card roadmap-card"><div class="ver">v1.0</div><p>Полная экономика, репутация, события мира, монетизация, импорт миров.</p></div>
        <div class="card roadmap-card"><div class="ver">v2.0</div><p>Войны, политика, рост городов, озвучение, альтернативная история.</p></div>
      </div>
    </section>

    <section class="section container">
      <h2>Девлог</h2>
      ${DEVLOG.slice(0, 3).map(d => `
        <div class="devlog-item">
          <div class="date">${esc(d.date)}</div>
          <div><b>${esc(d.title)}</b></div>
          <p class="muted">${esc(d.text)}</p>
        </div>`).join('')}
      <p><a href="/devlog" data-link>Все записи →</a></p>
    </section>

    <footer class="site-footer">
      <div class="container">
        <span>© 2026 «Попаданец — Живой мир». Семён, соло-разработка.</span>
        <span><a href="/privacy" data-link>Приватность</a></span>
        <span><a href="/tos" data-link>Условия</a></span>
        <span><a href="/cookies" data-link>Куки</a></span>
        <span><a href="/age-check" data-link>16+</a></span>
        <span><a href="/dmca" data-link>DMCA</a></span>
      </div>
    </footer>
  </div>`;
  document.getElementById('hero-play').addEventListener('click', () => navigate('/play'));
}

export function renderDevlog(root) {
  root.innerHTML = `
  <div class="landing">
    <header class="site-header"><div class="container">
      <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
      <nav><a href="/" data-link>Главная</a><a href="/wiki" data-link>Вики</a><a class="btn btn-accent btn-sm" href="/play" data-link>Играть</a></nav>
    </div></header>
    <div class="page container">
      <h1>Девлог</h1>
      ${DEVLOG.map(d => `
        <div class="card" style="margin-bottom:16px">
          <div class="muted mono" style="font-size:.85em">${esc(d.date)}</div>
          <h3 style="margin:8px 0">${esc(d.title)}</h3>
          <p>${esc(d.text)}</p>
        </div>`).join('')}
    </div>
  </div>`;
}
