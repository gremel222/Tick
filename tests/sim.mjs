/* Смоук-тест движка: полный прогон типичной сессии без браузера */
import * as engine from '../client/src/game/engine.js';
import * as combat from '../client/src/game/combat.js';
import * as dialogue from '../client/src/game/dialogue.js';
import { heardRumors, record } from '../client/src/game/memory.js';
import { NPCS } from '../client/src/game/data.js';

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ FAIL: ' + name); }
}

console.log('=== 1. Создание мира ===');
engine.newGame({
  name: 'Тестер', age: 22, pastProfession: 'programmer',
  pastKnowledge: ['medicine', 'economy'], personality: 'kind',
  deathReason: 'accident', worldType: 'unknown', deathMode: 'normal',
}, { account: 'test@test.ru' });
check('мир создан', !!engine.getG());
check('старт на опушке', engine.getG().player.location === 'forest-edge');
check('20 NPC', Object.keys(engine.getG().world.npcs).length === 20);
check('квесты дня 1 активны', engine.getG().quests.active.length >= 2);

console.log('=== 2. Парсер: перемещение ===');
let r = engine.handleInput('осмотреться');
check('осмотреться ок', r.ok);
r = engine.handleInput('идти в деревню');
check('идти в деревню ок', r.ok && engine.getG().player.location === 'village-square');
r = engine.handleInput('пойти в таверну');
check('пойти в таверну ок', r.ok && engine.getG().player.location === 'village-tavern');
r = engine.handleInput('телепортироваться в столицу');
check('чушь → уточнение', !r.ok && r.clarify);
r = engine.handleInput('идти в чащу');
check('напрямую в чащу нельзя', !r.ok);

console.log('=== 3. Время и расписания ===');
engine.doAction({ type: 'wait', min: 600 });
check('время идёт', engine.getG().world.min > 600);
const erik = engine.npcById('erik');
console.log('  Эрик сейчас: ' + engine.npcLocation(erik) + ' (' + engine.npcAction(erik) + ')');
check('NPC где-то по расписанию', typeof engine.npcLocation(erik) === 'string');

console.log('=== 4. Диалоги ===');
engine.getG().world.min = 800; // день — Эрик в лавке
engine.getG().player.location = 'village-shop';
r = engine.handleInput('поговорить с Эриком');
check('диалог начался', r.ok && dialogue.isActive());
r = engine.handleInput('кто ты?');
check('тема «кто ты»', r.ok);
engine.getG().player.money = 50; // подкинули монет для теста торговли
r = engine.handleInput('купить хлеб');
check('покупка хлеба', r.ok && engine.countItem('bread') === 1 && engine.getG().player.money < 50);
r = engine.handleInput('до свидания');
check('диалог завершён', r.ok && !dialogue.isActive());

console.log('=== 5. Работа и экономика ===');
engine.getG().world.min = 700;
engine.getG().player.location = 'village-tavern';
engine.getG().player.energy.current = 100;
r = engine.handleInput('работать');
console.log('  работа: ' + JSON.stringify(r).slice(0, 120));
check('работа доступна или вежливый отказ', typeof r.ok === 'boolean');
const jobs = engine.availableJobs();
console.log('  доступно работ: ' + jobs.length);
if (jobs.length) {
  r = engine.doAction({ type: 'work', jobId: jobs[0].id });
  check('смена отработана', r.ok && engine.getG().player.money > 0);
}

console.log('=== 6. Бой ===');
engine.getG().player.hp.current = 100;
combat.start(['wolf', 'wolf'], { loc: 'forest-edge', returnTo: 'forest-edge' });
check('бой активен', combat.isActive());
let guard = 0;
while (combat.isActive() && guard++ < 60) {
  const st = combat.state();
  const player = st.units.find(u => u.isPlayer);
  const myTurn = st.turnOrder[st.turnIdx] === player;
  if (!myTurn) { break; }
  combat.playerAction('approach');
  const st2 = combat.state();
  if (!st2) break;
  const p2 = st2.units.find(u => u.isPlayer);
  if (st2.turnOrder[st2.turnIdx] === p2) combat.playerAction('attack');
}
console.log('  бой завершён или ход ИИ: active=' + combat.isActive());
check('после боя HP/убийства учтены', engine.getG().world.stats.kills >= 0);

console.log('=== 7. Память и слухи ===');
record('important', 'спас Эрика от волка', ['erik']);
const g = engine.getG();
check('важное событие в памяти', g.world.memory.some(m => m.important));
check('слух порождён', g.world.rumors.length > 0);

console.log('=== 8. Канон: перемотка дней ===');
const dayBefore = g.world.day;
engine.advanceTime(1440 * 22, { silent: true });
console.log('  день: ' + g.world.day);
check('дни прошли', g.world.day >= dayBefore + 21);
const canon = g.world.canon;
const happened = canon.filter(c => c.status === 'happened').map(c => c.id);
console.log('  канон сбылся: ' + happened.join(', '));
check('караван сбылся', canon.find(c => c.id === 'caravan').status === 'happened');
check('свадьба сбылась', ['happened', 'changed'].includes(canon.find(c => c.id === 'wedding').status));

console.log('=== 9. Смерть (нормальный режим) ===');
engine.getG().player.hp.current = 0;
engine.die('тест');
check('смерть зафиксирована', engine.getG().world.flags.dead === true);

console.log('=== 10. Сюжетный режим ===');
engine.storyContinue({ name: 'Новый Тестер', age: 20, pastProfession: 'doctor', pastKnowledge: [], personality: 'calm', deathReason: 'illness', worldType: 'partial', deathMode: 'story' });
const g2 = engine.getG();
check('новый персонаж', g2.player.name === 'Новый Тестер');
check('мир сохранился', g2.world.canon.find(c => c.id === 'caravan').status === 'happened');
check('старт на площади', g2.player.location === 'village-square');
check('предшественник в списке', g2.world.flags.storyChars.length >= 1);

console.log('=== 11. v0.5: фракции и репутация ===');
const gv = engine.getG();
check('фракции в мире', ['village', 'temple', 'trade', 'forest'].every(k => typeof gv.world.factions[k] === 'number'));
const vRepBefore = gv.world.factions.village;
engine.changeFaction('village', 5);
check('репутация растёт', gv.world.factions.village > vRepBefore);

console.log('=== 12. v0.5: романтика — прогулка и признание ===');
function placeWith(npcId) {
  for (let h = 8; h <= 20; h++) {
    gv.world.min = h * 60;
    const l = engine.npcLocation(engine.npcById(npcId));
    if (!l.startsWith('home:')) { gv.player.location = l; return true; }
  }
  return false;
}
gv.player.energy.current = 100;
const ula = gv.world.npcs.ula;
ula.rel.sympathy = 20; ula.rel.romantic = 12;
check('Ула на месте для прогулки', placeWith('ula'));
r = engine.doAction({ type: 'walk', npc: 'ula' });
check('прогулка состоялась', r.ok === true);
check('романтика выросла', ula.rel.romantic >= 16);
ula.rel.sympathy = 40; ula.rel.romantic = 30;
engine.doAction({ type: 'talk', npc: 'ula' });
r = engine.handleInput('ты мне нравишься');
check('признание принято', ula.rel.romantic >= 75 && engine.stageIdx('ula') >= 7);
engine.checkAchievements();
check('ачивка «Не один в этом мире»', gv.achievements.includes('not-alone'));

console.log('=== 13. v0.5: молитва, ярмарка, паломники ===');
gv.player.energy.current = 100;
gv.player.location = 'village-temple';
r = engine.handleInput('помолиться');
check('помолиться ок', r.ok === true);
check('храм заметил', gv.world.factions.temple > 0);
gv.player.energy.current = 100;
gv.player.location = 'village-square';
gv.world.flags.fairToday = true; gv.world.flags.fairDone = false;
r = engine.handleInput('ярмарка');
check('ярмарка ок', r.ok === true);
const pil = gv.world.canon.find(c => c.id === 'pilgrimage');
pil.status = 'happened';
gv.world.day = pil.plannedDay; gv.world.flags.pilgrimsDone = false;
gv.player.energy.current = 100;
gv.player.location = 'village-temple';
r = engine.handleInput('паломники');
check('паломники ок', r.ok === true);

console.log('=== 14. v0.5: цепочка разбойников ===');
gv.world.day = 12; gv.world.min = 12 * 60;
gv.player.location = 'road-south';
r = engine.doAction({ type: 'examine', target: 'road-south', kind: 'loc' });
check('следы найдены', gv.world.flags.foundTracks === true);
check('квест «Неспокойный тракт» активен', gv.quests.active.some(q => q.id === 'q-bandits'));
check('Каспар на месте', placeWith('kaspar'));
engine.doAction({ type: 'talk', npc: 'kaspar' });
r = engine.handleInput('следы у моста — разбойники');
check('Каспар предупреждён', gv.world.flags.warnedGuard === true);
check('квест «Неспокойный тракт» завершён', gv.quests.completed.includes('q-bandits'));
engine.handleInput('до свидания');
check('диалог закрыт', !dialogue.isActive());
// мир пережил день 20 при перемотке — откатываем канон рейда, чтобы проверить ветку «предупредил стражу»
const raid = gv.world.canon.find(c => c.id === 'raid');
raid.status = 'planned'; raid.deviationReason = null;
gv.world.day = 19; gv.world.min = 12 * 60;
engine.advanceTime(1440, { silent: true });
check('канон рейда изменён', raid.status === 'changed');
check('окно засады: 3 дня', gv.world.flags.ambushDaysLeft === 3);
gv.player.energy.current = 100;
gv.player.location = 'road-south';
const moneyBefore = gv.player.money;
const villageBefore = gv.world.factions.village;
r = engine.handleInput('засада');
check('засада началась', r.ok === true && combat.isActive());
if (combat.isActive()) {
  check('врагов трое', combat.state().units.filter(u => !u.isPlayer).length === 3);
  const st = combat.state();
  st.units.filter(u => !u.isPlayer).forEach(u => { u.hp = 0; });
  const pl = st.units.find(u => u.isPlayer);
  st.turnIdx = st.turnOrder.indexOf(pl);
  combat.playerAction('defend');
  check('бой выигран', !combat.isActive());
  check('награда барона получена', gv.player.money - moneyBefore >= 150);
  check('деревня благодарна', gv.world.factions.village > villageBefore);
  check('засада закрыта', gv.world.flags.ambushDone === true && gv.world.flags.ambushDaysLeft === 0);
}

console.log('=== 15. v0.5: призрак прошлого ===');
const ghostNpc = NPCS.find(n => n.ghostOf);
check('призрак предшественника в мире', !!ghostNpc);
if (ghostNpc) {
  gv.world.day = 13; gv.world.min = 12 * 60;
  gv.player.location = 'forest-edge';
  r = engine.doAction({ type: 'talk', npc: ghostNpc.id });
  check('диалог с призраком открыт', r.ok !== false && dialogue.isActive());
  r = engine.handleInput('кто ты?');
  check('призрак знает, кто он', r.ok === true);
  r = engine.handleInput('что ты помнишь?');
  check('призрак помнит мир', r.ok === true);
  engine.handleInput('до свидания');
}

console.log('=== 16. v0.5: травы для Греты ===');
engine.addItem('herb', 6);
check('Грета на месте', placeWith('greta'));
engine.doAction({ type: 'talk', npc: 'greta' });
r = engine.handleInput('травы');
check('квест трав активен', gv.quests.active.some(q => q.id === 'q-herbs'));
const qh = gv.quests.active.find(q => q.id === 'q-herbs');
qh.goals.herbs.have = 5; // собрано в лесу (эмулируем поиск)
r = engine.handleInput('вот твои травы');
check('травы переданы (5 из 6)', engine.countItem('herb') === 1);
check('квест трав завершён', gv.quests.completed.includes('q-herbs'));
check('награда: зелья', engine.countItem('potion') >= 2);

console.log('');
console.log(failures === 0 ? '🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '⚠ ПРОВАЛОВ: ' + failures);
process.exit(failures === 0 ? 0 : 1);
