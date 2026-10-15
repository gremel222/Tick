/**
 * text.js — общая морфология и токенизация для индексатора и клиента.
 * Один и тот же код используется при сборке данных (Node) и в браузере,
 * иначе запросы не находили бы то, что проиндексировано.
 */

export const isCyr = (s) => /[\u0400-\u04ff]/.test(s);

export const STOP_EN = new Set(
  'a an and are as at be been but by can for from had has have he her his i if in into is it its may no not of on or our so such than that the their them then there these they this to too up was we were what when where which while who will with you your do does did done use used using make makes made get got also only other another more most less least much many'.split(' ')
);

export const STOP_RU = new Set(
  ('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это оно ещё уже нужно надо делаю делает делают делал делать значит означать означает такое такой такая такие расскажи покажи помоги подскажи настроить настроить включить выключить отключить открыть закрыть найти сделать сделать использовать работает работают отвечает зачем почему какова каким какими этом этой этом откуда сколько называется называются зовут нужно ли можно ли умеет умеют позволяет позволяют нужен нужна нужны дать показать объяснить понять разобраться научиться изучить справочник информации информация о про том что делать делается делаются произошло происходит случае случаях помощью через после перед между также тоже либо является являются бывает бывают должен должна должны этом этого этому'.split(' ')
));

/** Упрощённый стеммер: русские окончания и английские суффиксы. */
export function stem(w) {
  const s = String(w).toLowerCase().replace(/ё/g, 'е');
  if (!isCyr(s)) {
    let x = s;
    if (x.length > 4 && /ies$/.test(x)) return x.slice(0, -3) + 'y';
    if (x.length > 4 && /(sses|shes|ches|xes|zes)$/.test(x)) return x.slice(0, -2);
    if (x.length > 5 && /(ing)$/.test(x)) x = x.slice(0, -3);
    else if (x.length > 4 && /(ed)$/.test(x)) x = x.slice(0, -2);
    else if (x.length > 4 && /(es)$/.test(x)) x = x.slice(0, -2);
    else if (x.length > 3 && /s$/.test(x) && !/(ss|us|is|as)$/.test(x)) x = x.slice(0, -1);
    return x;
  }
  let x = s;
  x = x.replace(/(иями|ями|ами|ией|иях|ях|ов|ев|ий|ый|ой|ая|яя|ое|ее|ые|ие|ых|их|ому|ему|ыми|ими|ей|ую|юю|ать|ять|еть|ить|ешь|ишь|ует|ает|яет|ится|атся|ется|ются|уют|ают|яют|ал|ял|ел|ил|ула|ала|яла|или|ели|али|яли|ыть|уть|ость|есть)$/, '');
  if (x.length > 4) x = x.replace(/(а|я|о|е|у|ю|ы|и|й|ь)$/, '');
  return x;
}

/** Токенизация: слова/числа/подчёркивания длиной ≥2, без стоп-слов, со стеммингом. */
export function tokenize(text) {
  const out = [];
  for (const m of String(text).matchAll(/[\p{L}\p{N}_]{2,}/gu)) {
    const raw = m[0].toLowerCase();
    if (raw.length < 2 || raw.length > 40) continue;
    if (isCyr(raw)) { if (STOP_RU.has(raw)) continue; }
    else if (STOP_EN.has(raw)) continue;
    const t = stem(raw);
    if (t.length >= 2) out.push(t);
  }
  return out;
}

/** Нормализация термина/фразы для поиска якорей: «Clip Start/End» → «clip start end». */
export function normTerm(text) {
  return tokenize(String(text).replace(/[_\-–—/\\|]+/g, ' ')).join(' ');
}

/** Нормализованная форма термина для индекса алиасов: «X-Ray» → «x_ray». */
export function aliasNorm(str) {
  return String(str).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
}

const MOD_ALIAS = { control: 'ctrl', ctl: 'ctrl', strg: 'ctrl', win: 'meta', windows: 'meta', super: 'meta', command: 'cmd', opt: 'alt', option: 'alt' };

/** Каноническая форма обозначения клавиши: «Ctrl-B», «ctrl + b» → «ctrl+b». */
export function keyCanonical(str) {
  const parts = String(str).toLowerCase().split(/[\s+\-–—]+/).filter(Boolean);
  if (!parts.length) return '';
  const mods = [];
  const rest = [];
  for (const raw of parts) {
    const p = MOD_ALIAS[raw] || raw;
    if (['ctrl', 'shift', 'alt', 'cmd', 'meta'].includes(p)) { if (!mods.includes(p)) mods.push(p); }
    else rest.push(p);
  }
  const order = ['ctrl', 'shift', 'alt', 'cmd', 'meta'];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const tail = rest.join('');
  if (!tail) return mods.join('+');
  return [...mods, tail].join('+');
}

/** Нормализация обозначения клавиши: «Ctrl + B» → «ctrl+b». */
export function normKey(key) {
  return keyCanonical(key);
}

/** Разбор пользовательского ввода: «ctrl b», «CTRL+B», «ctrl+b» → «ctrl+b». */
export function parseKeyInput(input) {
  const s = String(input).trim().toLowerCase();
  if (!s) return '';
  const parts = s.split(/[\s+\-/]+/).filter(Boolean);
  if (!parts.length) return '';
  const mods = [];
  const rest = [];
  for (const p of parts) {
    if (['ctrl', 'control', 'shift', 'alt', 'cmd', 'meta', 'super'].includes(p)) mods.push(p === 'control' ? 'ctrl' : p);
    else rest.push(p);
  }
  if (!rest.length && mods.length) return mods.join('+');
  if (mods.length === 1) {
    const m = { ctrl: 'ctrl', shift: 'shift', alt: 'alt', cmd: 'cmd', meta: 'cmd', super: 'cmd' }[mods[0]];
    return `${m}+${rest.join('')}`;
  }
  return parts.join('+');
}

/** Расстояние Дамерау–Левенштейна (для исправления опечаток в терминах). */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev[j - 2] + 1);
      }
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
