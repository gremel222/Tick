/* Боевой оверлей (раздел 12): сетка 8×8, юниты, действия */
import * as engine from '../game/engine.js';
import * as combat from '../game/combat.js';
import { esc } from '../ui.js';

let el = null;
let logRendered = 0;

export function isActive() { return !!el; }

export function mount() {
  if (el || !combat.isActive()) return;
  el = document.createElement('div');
  el.className = 'combat-overlay';
  document.body.appendChild(el);
  logRendered = 0;
  refresh(true);
}

export function refresh(force) {
  if (!el) return;
  const C = combat.state();
  if (!C) { unmount(); return; }
  const g = engine.getG();
  const player = C.units.find(u => u.isPlayer);
  const foes = C.units.filter(u => !u.isPlayer && !u.fled);
  const myTurn = C.turnOrder[C.turnIdx] === player;

  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const u = C.units.find(un => un.hp > 0 && un.x === x && un.y === y);
      const isP = u?.isPlayer;
      const near = myTurn && !isP && u && Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1;
      cells.push(`<div class="cell ${(x + y) % 2 ? 'floor-alt' : ''} ${isP ? 'player-cell' : ''} ${near ? 'reach' : ''}" ${near ? `data-hit="${u.id}"` : ''} title="${u ? esc(u.name) + ' HP ' + Math.round(u.hp) : ''}">
        ${u ? u.emoji : ''}${u && !u.isPlayer ? `<span class="hp-pip">${Math.round(u.hp)}</span>` : ''}
      </div>`);
    }
  }

  const healItem = engine.countItem('potion') ? 'potion' : engine.countItem('bandage') ? 'bandage' : engine.countItem('herb') ? 'herb' : null;
  const healName = { potion: 'зелье', bandage: 'бинт', herb: 'трава' };

  el.innerHTML = `<div class="combat card">
    <div class="combat-head">
      <span class="combat-title">⚔ Бой · раунд ${C.round}</span>
      <span class="turn-ind">${myTurn ? '▶ ТВОЙ ХОД' : '…противники действуют'}</span>
      <span class="spacer"></span>
      <span class="bar-label">HP ${Math.round(player.hp)}/${player.maxHp} · ⚡ ${Math.round(g.player.energy.current)}</span>
    </div>
    <div class="combat-units">
      ${C.units.filter(u => !u.isPlayer).map(u => `<div class="unit-chip ${u.hp <= 0 ? 'dead' : ''}">${u.emoji} ${esc(u.name)} <span class="mini-bar"><i style="width:${Math.max(0, u.hp / u.maxHp * 100)}%"></i></span></div>`).join('')}
    </div>
    <div class="combat-grid-wrap">
      <div class="combat-grid">${cells.join('')}</div>
      <div class="combat-side">
        <div class="combat-log" id="cb-log"></div>
        <div class="combat-actions">
          <button class="btn btn-sm btn-accent" data-cb="attack" ${myTurn ? '' : 'disabled'}>🗡 Атаковать</button>
          <button class="btn btn-sm" data-cb="approach" ${myTurn ? '' : 'disabled'}>➡ Подойти</button>
          <button class="btn btn-sm" data-cb="power" ${myTurn && g.player.energy.current >= 15 ? '' : 'disabled'}>💥 Сильный (15⚡)</button>
          <button class="btn btn-sm" data-cb="defend" ${myTurn ? '' : 'disabled'}>🛡 Защита</button>
          ${healItem ? `<button class="btn btn-sm" data-cb="item" data-item="${healItem}" ${myTurn ? '' : 'disabled'}>🧪 ${healName[healItem]} (${engine.countItem(healItem)})</button>` : ''}
          <button class="btn btn-sm btn-danger" data-cb="flee" ${myTurn ? '' : 'disabled'}>🏃 Бежать</button>
        </div>
        <div class="dpad">
          <span></span><button class="btn btn-sm" data-cb="move" data-dir="north" ${myTurn ? '' : 'disabled'}>↑</button><span></span>
          <button class="btn btn-sm" data-cb="move" data-dir="west" ${myTurn ? '' : 'disabled'}>←</button>
          <button class="btn btn-sm" data-cb="move" data-dir="south" ${myTurn ? '' : 'disabled'}>↓</button>
          <button class="btn btn-sm" data-cb="move" data-dir="east" ${myTurn ? '' : 'disabled'}>→</button>
        </div>
      </div>
    </div>
  </div>`;

  const logEl = el.querySelector('#cb-log');
  const items = C.log.slice(logRendered);
  logRendered = C.log.length;
  for (const l of items) { const d = document.createElement('div'); d.textContent = l; logEl.appendChild(d); }
  logEl.scrollTop = logEl.scrollHeight;

  el.querySelectorAll('[data-cb]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.cb;
    if (act === 'move') combat.playerAction('move', { dir: b.dataset.dir });
    else if (act === 'item') combat.playerAction('item', { item: b.dataset.item });
    else combat.playerAction(act);
    refresh(true);
  }));
  el.querySelectorAll('[data-hit]').forEach(b => b.addEventListener('click', () => {
    combat.playerAction('attack', { targetId: b.dataset.hit });
    refresh(true);
  }));
}

export function unmount() {
  if (el) { el.remove(); el = null; logRendered = 0; }
}
