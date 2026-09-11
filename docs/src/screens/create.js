/* Создание персонажа (раздел 6.3, CharacterCreate) */
import { CREATE_OPTIONS, DEATH_REASON_TEXTS, KNOWLEDGE_FX } from '../game/data.js';
import { esc } from '../ui.js';
import { navigate } from '../router.js';
import * as acc from '../api/local.js';

const state = {
  name: '', age: 18,
  pastProfession: 'student', pastKnowledge: [], personality: 'kind',
  deathReason: 'accident', worldType: 'unknown', deathMode: 'normal',
};

export function render(root, opts = {}) {
  const isStory = !!opts.story;
  root.innerHTML = `
  <div class="landing">
    <header class="site-header"><div class="container">
      <a class="logo" href="/" data-link>ПОПАДА<span class="accent">НЕЦ</span></a>
      <nav>${isStory ? '<span class="muted">Сюжетный режим: мир продолжает жить</span>' : '<a href="/" data-link>Главная</a>'}</nav>
    </div></header>
    <div class="page container" style="max-width:840px">
      <h1>${isStory ? 'Новый персонаж в живом мире' : 'Кем ты был?'}</h1>
      ${isStory ? '<p class="muted">Прежний герой погиб — мир остался: память, слухи, канон. Ты начинаешь заново, на площади деревни.</p>' : ''}

      <div class="card" style="margin-bottom:18px">
        <div class="field"><label>Имя</label><input class="input" id="c-name" maxlength="24" placeholder="Как тебя звали в прошлой жизни" value="${esc(state.name)}"></div>
        <div class="field"><label>Возраст</label>
          <div class="chip-row" id="c-age">${CREATE_OPTIONS.ages.map(a => `<span class="chip ${a === state.age ? 'sel' : ''}" data-age="${a}">${a}</span>`).join('')}</div>
        </div>
        <div class="field"><label>Кем работал?</label>
          <div class="chip-row" id="c-prof">${CREATE_OPTIONS.professions.map(p => `<span class="chip ${p.id === state.pastProfession ? 'sel' : ''}" data-prof="${p.id}">${p.label}</span>`).join('')}</div>
        </div>
        <div class="field"><label>Что ты умел? (до 3)</label>
          <div class="chip-row" id="c-know">${CREATE_OPTIONS.knowledge.map(k => `<span class="chip ${state.pastKnowledge.includes(k.id) ? 'sel' : ''}" data-know="${k.id}" title="${esc(KNOWLEDGE_FX[k.id].fx)}">${k.label}</span>`).join('')}</div>
          <p class="hint" id="c-know-hint"></p>
        </div>
        <div class="field"><label>Характер</label>
          <div class="chip-row" id="c-pers">${CREATE_OPTIONS.personalities.map(p => `<span class="chip ${p.id === state.personality ? 'sel' : ''}" data-pers="${p.id}">${p.label}</span>`).join('')}</div>
        </div>
        <div class="field"><label>Как ты умер?</label>
          <div class="chip-row" id="c-death">${CREATE_OPTIONS.deathReasons.map(d => `<span class="chip ${d.id === state.deathReason ? 'sel' : ''}" data-dr="${d.id}" title="${esc(DEATH_REASON_TEXTS[d.id])}">${d.label}</span>`).join('')}</div>
          <p class="hint" id="c-death-hint">${esc(DEATH_REASON_TEXTS[state.deathReason])}</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 style="margin-top:0">Куда ты хочешь попасть?</h3>
        <div class="pick-cards" id="c-world">
          ${CREATE_OPTIONS.worldTypes.map(w => `
          <div class="pick-card ${state.worldType === w.value ? 'sel' : ''}" data-world="${w.value}">
            <div class="t">${w.title}</div><div class="d">${w.desc}</div>
          </div>`).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <h3 style="margin-top:0">Правила смерти</h3>
        <div class="pick-cards" id="c-mode">
          <div class="pick-card ${state.deathMode === 'normal' ? 'sel' : ''}" data-mode="normal"><div class="t">Обычный</div><div class="d">Смерть = загрузка последнего сохранения.</div></div>
          <div class="pick-card ${state.deathMode === 'hardcore' ? 'sel' : ''}" data-mode="hardcore"><div class="t">Хардкор</div><div class="d">Смерть = конец. Навсегда. Без возврата.</div></div>
          <div class="pick-card ${state.deathMode === 'story' ? 'sel' : ''}" data-mode="story"><div class="t">Сюжетный</div><div class="d">Мир живёт дальше, ты — новый персонаж. Мир помнит прошлого.</div></div>
        </div>
      </div>

      <div id="c-err"></div>
      <button class="btn btn-accent" id="c-go" style="font-size:1.1em;padding:14px 34px">${isStory ? 'Продолжить историю' : 'Начать путь'}</button>
    </div>
  </div>`;

  const bindChips = (id, attr, cb) => {
    document.getElementById(id).addEventListener('click', e => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      qsa('#' + id + ' .chip').forEach(c => c.classList.remove('sel'));
      chip.classList.add('sel');
      cb(chip.dataset[attr]);
    });
  };
  const qsa = sel => Array.from(document.querySelectorAll(sel));

  document.getElementById('c-name').addEventListener('input', e => state.name = e.target.value);
  bindChips('c-age', 'age', v => state.age = parseInt(v, 10));
  bindChips('c-prof', 'prof', v => state.pastProfession = v);
  bindChips('c-pers', 'pers', v => state.personality = v);
  bindChips('c-death', 'dr', v => { state.deathReason = v; document.getElementById('c-death-hint').textContent = DEATH_REASON_TEXTS[v]; });
  document.getElementById('c-know').addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    const id = chip.dataset.know;
    if (state.pastKnowledge.includes(id)) {
      state.pastKnowledge = state.pastKnowledge.filter(k => k !== id);
      chip.classList.remove('sel');
    } else if (state.pastKnowledge.length < 3) {
      state.pastKnowledge.push(id);
      chip.classList.add('sel');
    } else {
      document.getElementById('c-know-hint').textContent = 'Больше трёх не вспомнить.';
      return;
    }
    document.getElementById('c-know-hint').textContent = state.pastKnowledge.map(k => KNOWLEDGE_FX[k].label + ': ' + KNOWLEDGE_FX[k].fx).join(' · ');
  });
  document.getElementById('c-world').addEventListener('click', e => {
    const card = e.target.closest('.pick-card'); if (!card) return;
    qsa('#c-world .pick-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    state.worldType = card.dataset.world;
  });
  document.getElementById('c-mode').addEventListener('click', e => {
    const card = e.target.closest('.pick-card'); if (!card) return;
    qsa('#c-mode .pick-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    state.deathMode = card.dataset.mode;
  });

  document.getElementById('c-go').addEventListener('click', () => {
    const err = document.getElementById('c-err');
    err.innerHTML = '';
    state.name = document.getElementById('c-name').value.trim();
    if (state.name.length < 2) { err.innerHTML = '<div class="err-box">Введи имя (2+ символа).</div>'; return; }
    // старт
    const accnt = acc.current()?.email || null;
    window.__pendingChar = { ...state };
    window.__pendingCharStory = isStory;
    navigate(isStory ? '/play?story=1' : '/opening');
  });
}
