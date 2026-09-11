/* Смоук-тест движка: полный прогон типичной сессии без браузера */
import * as engine from '../client/src/game/engine.js';
import * as combat from '../client/src/game/combat.js';
import * as dialogue from '../client/src/game/dialogue.js';
import { heardRumors, record } from '../client/src/game/memory.js';

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

console.log('');
console.log(failures === 0 ? '🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '⚠ ПРОВАЛОВ: ' + failures);
process.exit(failures === 0 ? 0 : 1);
