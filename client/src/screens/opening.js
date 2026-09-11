/* Открывающая сцена (раздел 5.5) */
import { OPENING_STEPS, OPENING_FINAL } from '../game/data.js';
import { navigate } from '../router.js';
import { toast } from '../ui.js';

export function render(root) {
  const charData = window.__pendingChar;
  if (!charData) { navigate('/character/create', true); return; }

  root.innerHTML = `<div class="opening"><div class="inner" id="op-inner"><div class="step" id="op-step"></div></div></div>`;
  const stepEl = document.getElementById('op-step');
  const inner = document.getElementById('op-inner');
  let i = 0;

  function next() {
    if (i < OPENING_STEPS.length) {
      stepEl.style.opacity = '0';
      setTimeout(() => {
        stepEl.textContent = OPENING_STEPS[i].text;
        stepEl.style.transition = 'opacity .5s';
        stepEl.style.opacity = '1';
        i++;
        setTimeout(next, OPENING_STEPS[i - 1].delay - 400);
      }, 420);
    } else {
      inner.innerHTML = `
        <div class="step" style="font-size:clamp(20px,3vw,30px);opacity:1">ГЛАВНАЯ СТРАНИЦА ИСТОРИИ</div>
        <p class="final-text anim-fade">${OPENING_FINAL.text}</p>
        <button class="btn btn-accent btn-stand" id="op-stand">${OPENING_FINAL.button}</button>`;
      document.getElementById('op-stand').addEventListener('click', () => {
        navigate('/play?start=1');
      });
    }
  }
  setTimeout(next, 600);
}
