/* Headless UI-смоук (jsdom): полный путь игрока — лендинг → создание →
   открывающая сцена → игра → модалки → диалог → бой → смерть/загрузка.
   Запуск:  npm i jsdom --no-save && node tests/ui-smoke.mjs  (из корня репо)
   Без jsdom тест пропускается. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch (e) { console.log('jsdom не установлен — пропускаю UI-смоук. `npm i jsdom --no-save`'); process.exit(0); }

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mod = p => import(pathToFileURL(path.join(REPO, 'client/src', p)).href);

const dom = new JSDOM(`<!DOCTYPE html><html><body class="fs-medium"><div id="app"></div><div id="modal-root"></div><div id="toast-root"></div></body></html>`, {
  url: 'http://localhost:3000/', pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.history = window.history;
global.location = window.location;
global.localStorage = window.localStorage;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
window.scrollTo = () => {};
window.confirm = () => true;

const failures = [];
const check = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + name); if (!cond) failures.push(name); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const go = async p => { window.history.pushState({}, '', p); window.dispatchEvent(new window.PopStateEvent('popstate')); await wait(60); };
const submitInput = async (text) => {
  const input = document.getElementById('free-input');
  input.value = text;
  document.getElementById('input-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await wait(120);
};

await mod('main.js');
await wait(100);

console.log('=== Лендинг и публичные страницы ===');
check('hero на месте', document.body.innerHTML.includes('Ты не герой истории'));
check('куки-баннер', !!document.querySelector('.cookie-banner'));
await go('/wiki');
check('вики: 5 вкладок', document.querySelectorAll('#w-tabs .tab').length === 5);
await go('/register');
check('регистрация: форма', !!document.getElementById('r-email'));

console.log('=== Создание персонажа и открытие ===');
await go('/character/create');
check('форма создания', !!document.getElementById('c-name'));
document.getElementById('c-name').value = 'Семён';
document.getElementById('c-go').click();
await wait(60);
await wait(11000); // открывающая сцена: 4 шага по 2 сек
check('кнопка ВСТАТЬ', !!document.getElementById('op-stand'));
document.getElementById('op-stand').click();
await wait(150);
check('переход в игру', window.location.pathname === '/play');

console.log('=== Игровой экран и модалки ===');
check('топбар и нарратив', !!document.getElementById('tb-weather') && document.getElementById('narrative').children.length > 0);
check('6 кнопок меню', document.querySelectorAll('.bottom-menu button').length === 6);
await submitInput('осмотреться');
check('нарратив растёт', document.getElementById('narrative').children.length > 2);

const input = document.getElementById('free-input');
input.blur();
document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }));
await wait(80);
check('карта: 10 узлов', document.querySelectorAll('.map-node').length === 10);
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(60);

console.log('=== Свободный ввод и диалог ===');
await submitInput('идти в деревню');
const gmod = await mod('game/engine.js');
check('персонаж на площади', gmod.getG().player.location === 'village-square');
await submitInput('поговорить с Дорой');
check('диалоговый оверлей', !!document.querySelector('.dialogue'));
const dinput = document.getElementById('dlg-input');
dinput.value = 'что по ценам?';
document.getElementById('dlg-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(120);
check('тема цен в диалоге', document.getElementById('dlg-log').children.length >= 3);
dinput.value = 'до свидания';
document.getElementById('dlg-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await wait(80);
check('диалог закрыт', !document.querySelector('.dialogue'));

console.log('=== Бой ===');
const cmb = await mod('game/combat.js');
gmod.getG().player.hp.current = 100;
cmb.start(['wolf'], { loc: 'forest-edge', returnTo: 'forest-edge' });
await wait(150);
check('боевой оверлей', !!document.querySelector('.combat-overlay'));
check('сетка 64 клетки', document.querySelectorAll('.cell').length === 64);
let guard = 0;
while (cmb.isActive() && guard++ < 50) {
  const st = cmb.state();
  const p = st.units.find(u => u.isPlayer);
  if (st.turnOrder[st.turnIdx] === p) cmb.playerAction('approach');
  else break;
  const st2 = cmb.state();
  if (!st2) break;
  if (st2.turnOrder[st2.turnIdx] === st2.units.find(u => u.isPlayer)) cmb.playerAction('attack');
}
check('бой завершился, оверлей снят', !cmb.isActive() && !document.querySelector('.combat-overlay'));

console.log('=== Смерть и загрузка ===');
const { saveToSlot } = await mod('game/saves.js');
saveToSlot(null, 1, gmod.getG());
gmod.getG().player.hp.current = 0;
gmod.die('тест');
await wait(150);
check('экран смерти', !!document.querySelector('.death-overlay'));
const loadBtn = document.querySelector('#death-actions .btn');
check('кнопка загрузки', !!loadBtn);
if (loadBtn) { loadBtn.click(); await wait(150); }
check('вернулся к жизни', !document.querySelector('.death-overlay'));

console.log('');
console.log(failures.length === 0 ? '🎉 UI-СМОУК ПРОЙДЕН' : '⚠ ПРОВАЛОВ: ' + failures.length + ' → ' + failures.join('; '));
process.exit(failures.length ? 1 : 0);
