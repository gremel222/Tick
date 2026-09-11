/* Регистрация и вход (раздел 6.3, Register/Login) */
import { esc, toast } from '../ui.js';
import { navigate } from '../router.js';
import * as acc from '../api/local.js';

function head(title) {
  return `
  <div class="landing">
    <header class="site-header"><div class="container">
      <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
      <nav><a href="/" data-link>Главная</a><a href="/wiki" data-link>Вики</a></nav>
    </div></header>
    <div class="auth-page"><div class="auth-box card anim-slide">
      <h1>${title}</h1>`;
}
const foot = `</div></div></div>`;

export function renderRegister(root) {
  const a = rndCaptcha();
  root.innerHTML = head('Создать аккаунт') + `
    <p class="muted" style="margin-top:0">Бесплатно до v1.0. Играть можно и без аккаунта — но сейвы привяжутся к устройству.</p>
    <div id="reg-err"></div>
    <div class="field"><label>Почта</label><input class="input" id="r-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
    <div class="field"><label>Пароль (6+ символов)</label><input class="input" id="r-pass" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Проверка: сколько будет ${a.q}?</label><input class="input" id="r-cap" inputmode="numeric" placeholder="Ответ цифрами"></div>
    <label class="checkline"><input type="checkbox" id="r-age"> <span>Мне 16 лет или больше <a href="/age-check" data-link>подробнее</a></span></label>
    <label class="checkline"><input type="checkbox" id="r-consent"> <span>Согласен с <a href="/tos" data-link>условиями</a> и <a href="/privacy" data-link>политикой приватности</a>, принимаю <a href="/cookies" data-link>куки</a></span></label>
    <button class="btn btn-accent" id="r-go" style="width:100%;margin-top:14px">Создать аккаунт</button>
    <p class="center muted" style="margin-top:16px">Уже есть аккаунт? <a href="/login" data-link>Войти</a></p>
    <div class="oauth-row"><button class="btn" style="flex:1" disabled title="Появится в онлайн-версии">🔒 Войти через Google</button></div>
  ` + foot;
  document.getElementById('r-go').addEventListener('click', async () => {
    const err = document.getElementById('reg-err');
    err.innerHTML = '';
    if (parseInt(document.getElementById('r-cap').value, 10) !== a.ans) { err.innerHTML = '<div class="err-box">Капча не сошлась. Считай ещё раз.</div>'; return; }
    if (!document.getElementById('r-age').checked) { err.innerHTML = '<div class="err-box">Игра 16+. Подтверди возраст.</div>'; return; }
    const res = await acc.register({
      email: document.getElementById('r-email').value,
      password: document.getElementById('r-pass').value,
      consent: document.getElementById('r-consent').checked,
    });
    if (!res.ok) { err.innerHTML = '<div class="err-box">' + esc(res.error) + '</div>'; return; }
    toast('Аккаунт создан. Добро пожаловать!');
    navigate('/character/create');
  });
}

export function renderLogin(root) {
  root.innerHTML = head('Вход') + `
    <div id="l-err"></div>
    <div class="field"><label>Почта</label><input class="input" id="l-email" type="email" autocomplete="email"></div>
    <div class="field"><label>Пароль</label><input class="input" id="l-pass" type="password" autocomplete="current-password"></div>
    <button class="btn btn-accent" id="l-go" style="width:100%;margin-top:14px">Войти</button>
    <div class="oauth-row"><button class="btn" style="flex:1" disabled title="Появится в онлайн-версии">🔒 Войти через Google</button></div>
    <p class="center muted" style="margin-top:16px">Нет аккаунта? <a href="/register" data-link>Создать</a> · <a href="#" id="l-reset">Забыли пароль?</a></p>
  ` + foot;
  document.getElementById('l-reset').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('l-err').innerHTML = '<div class="ok-box">В локальной версии восстановление недоступно — сейвы можно перенести через «Экспорт» в меню игры.</div>';
  });
  document.getElementById('l-go').addEventListener('click', async () => {
    const res = await acc.login(document.getElementById('l-email').value, document.getElementById('l-pass').value);
    if (!res.ok) { document.getElementById('l-err').innerHTML = '<div class="err-box">' + esc(res.error) + '</div>'; return; }
    navigate('/play');
  });
}

function rndCaptcha() {
  const a = 2 + Math.floor(Math.random() * 8), b = 1 + Math.floor(Math.random() * 8);
  return { q: a + ' + ' + b, ans: a + b };
}
