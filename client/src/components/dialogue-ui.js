/* Диалоговый оверлей (DialogueScreen, раздел 6.3) */
import * as engine from '../game/engine.js';
import * as dialogue from '../game/dialogue.js';
import { esc } from '../ui.js';

let el = null;
let rendered = 0;

export function isActive() { return !!el; }

export function mount() {
  if (el || !dialogue.isActive()) return;
  el = document.createElement('div');
  el.className = 'dialogue-overlay';
  el.innerHTML = `<div class="dialogue">
    <div class="dlg-head" id="dlg-head"></div>
    <div class="dlg-log" id="dlg-log"></div>
    <form class="dlg-input" id="dlg-form">
      <input class="input" id="dlg-input" autocomplete="off" placeholder="Что ты говоришь?..">
      <button class="btn btn-accent" type="submit">↵</button>
    </form>
    <div class="dlg-hints" id="dlg-hints">
      <button class="btn btn-sm" data-say="кто ты?">Кто ты?</button>
      <button class="btn btn-sm" data-say="что по ценам?">Цены</button>
      <button class="btn btn-sm" data-say="что слыхать?">Слухи</button>
      <button class="btn btn-sm" data-say="есть работа?">Работа</button>
      <button class="btn btn-sm" data-say="я не отсюда, я из другого мира">Рассказать о себе</button>
      <button class="btn btn-sm" data-say="до свидания">Уйти</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  rendered = 0;
  el.querySelector('#dlg-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = el.querySelector('#dlg-input');
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    engine.handleInput(t);
    refresh(true);
  });
  el.querySelector('#dlg-hints').addEventListener('click', e => {
    const b = e.target.closest('[data-say]'); if (!b) return;
    engine.handleInput(b.dataset.say);
    refresh(true);
  });
  refresh(true);
  setTimeout(() => el.querySelector('#dlg-input').focus(), 80);
}

export function refresh(force) {
  if (!el || !dialogue.isActive()) return;
  const npc = dialogue.currentNpc();
  const g = engine.getG();
  const st = g.world.npcs[npc.id];
  const rel = st.rel;
  el.querySelector('#dlg-head').innerHTML = `
    <div class="dlg-portrait">${npc.emoji}</div>
    <div style="flex:1">
      <div class="dlg-name">${esc(npc.name)}</div>
      <div class="dlg-prof">${esc(npc.profession)} · ${esc(npc.personality)}</div>
      <div class="rel-mini">
        <span class="rel-pill">отношения: ${esc(engine.stageName(npc.id))}</span>
        <span class="rel-pill">доверие ${Math.round(rel.trust)}</span>
        <span class="rel-pill">симпатия ${Math.round(rel.sympathy)}</span>
        ${rel.suspicion > 10 ? `<span class="rel-pill" style="color:#ff9c93">подозрение ${Math.round(rel.suspicion)}</span>` : ''}
      </div>
    </div>`;
  const log = el.querySelector('#dlg-log');
  const lines = dialogue.lines();
  const items = lines.slice(rendered);
  rendered = lines.length;
  for (const l of items) {
    const div = document.createElement('div');
    div.className = 'dlg-line' + (l.who === 'you' ? ' you' : '');
    if (l.who === 'sys') { div.style.cssText = 'font-family:var(--font-ui);font-size:.85em;color:var(--muted)'; }
    div.innerHTML = l.who === 'npc'
      ? `<div class="who">${esc(npc.name)}</div>${esc(l.text)}`
      : l.who === 'you'
        ? `<div class="who">Ты</div>«${esc(l.text)}»`
        : esc(l.text);
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

export function unmount() {
  if (el) { el.remove(); el = null; rendered = 0; }
}

/* подписка на обновления диалога — монтируется из игры */
export function watch() {
  engine.subscribe(reason => {
    if (reason === 'dialogue') { if (!el) mount(); else refresh(); }
    if (reason === 'dialogue:end') unmount();
  });
}
