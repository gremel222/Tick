/** about.js — о проекте: источники, лицензии, как обновлять базу и как включить полный русский текст. */

import { h, frag } from '../lib/dom.js';

export function aboutScreen(parts, ctx) {
  const meta = ctx.meta;
  const wrap = h('div');

  wrap.append(
    h('h1', { text: 'О проекте' }),
    h('p', { class: 'lead' }, '«Академия Blender» — офлайн-справочник и тренажёр, который отвечает на вопросы по всему руководству Blender и ведёт вас по курсу от интерфейса до рендера. Никакого сервера, никакой аналитики, никаких ключей: вся база лежит рядом с сайтом и работает без интернета.'),

    h('h2', { text: 'Что внутри базы' }),
    h('div', { class: 'grid cols-4' },
      stat(String(meta.counts.pages), 'страниц справочника'),
      stat(String(meta.counts.manual), 'страниц руководства'),
      stat(String(meta.counts.api), 'страниц Python API'),
      stat(meta.counts.anchors.toLocaleString('ru-RU'), 'описаний опций'),
      stat(String(meta.counts.keys), 'горячих клавиш'),
      stat(meta.counts.translations.toLocaleString('ru-RU'), 'терминов EN↔RU'),
      stat(String(meta.sections.length), 'разделов'),
      stat(meta.sourceVersion, 'версия источника')),

    h('h2', { text: 'Как работает поиск-ответчик' }),
    h('div', { class: 'card' },
      h('ol', { style: 'margin:0' },
        h('li', { text: 'Запрос разбирается: определяется, спрашивают про клавишу, опцию, действие или функцию Python API.' }),
        h('li', { text: 'Русские слова переводятся в термины Blender через официальный перевод интерфейса (ru.po): «боковая панель» → sidebar, «отсечение» → clip, «рентген» → x-ray.' }),
        h('li', { text: 'BM25-поиск выдает страницы, отдельный поиск по 39 570 определениям находит описание конкретной настройки, а поиск по клавишам — сочетания.' }),
        h('li', { text: 'Ответ собирается только из текста руководства и всегда сопровождается источниками. Если совпадения нет — сайт честно об этом говорит и предлагает формулировки.' })),
      h('p', { class: 'small faint', style: 'margin-top:10px', text: 'Принцип: ни одного придуманного ответа. Всё, что вы видите, есть в официальном руководстве — ссылка прилагается.' })),

    h('h2', { text: 'Источники и лицензии' }),
    h('div', { class: 'card' },
      meta.sources.map((s) => h('div', { style: 'margin-bottom:10px' },
        h('div', { style: 'font-weight:600', text: s.title }),
        h('div', { class: 'small muted', text: `Лицензия: ${s.license}` }),
        h('a', { class: 'small', href: s.url, target: '_blank', rel: 'noopener', text: s.url + ' ↗' }))),
      h('p', { class: 'small faint', text: 'Blender является торговой маркой Blender Foundation. Этот сайт — некоммерческий учебный проект, не связанный с Blender Foundation.' })),

    h('h2', { text: 'Как обновить базу знаний' }),
    h('div', { class: 'card' },
      h('p', { class: 'small muted', text: 'База собирается скриптами из официальных источников. Нужен Node 18+ и доступ в интернет:' }),
      h('pre', { class: 'mono' }, 'bash blender/tools/fetch-vendor.sh     # скачать исходники (руководство, API, ru.po)\nnode blender/tools/build-data.mjs      # пересобрать data/ (индекс, словарь, тексты)'),
      h('p', { class: 'small muted', text: 'Сборка занимает меньше минуты и не требует зависимостей.' })),

    h('h2', { text: 'Полный русский текст руководства' }),
    h('div', { class: 'card' },
      h('p', { class: 'small muted' }, 'По умолчанию тексты страниц — на языке оригинала (английский), а названия интерфейса подставляются по-русски из официального перевода: у каждой опции видно русское имя. Чтобы получить руководство целиком на русском, запустите краулер:'),
      h('pre', { class: 'mono' }, 'node blender/tools/crawl-ru.mjs --limit 50     # проба\nnode blender/tools/crawl-ru.mjs                # весь мануал (~2000 страниц)'),
      h('p', { class: 'small muted' }, 'Краулер бережно скачивает русские страницы с docs.blender.org, сохраняет тексты в data/ru/ и после этого сайт автоматически показывает русские версии страниц. Прогресс сохраняется, можно прервать и продолжить.'),
      h('p', { class: 'small faint' }, 'Ограничение: у площадки docs.blender.org должен быть доступен ваш IP. Если сайт открыт в корпоративной сети, запускайте краулер там, где доступ есть.')),

    h('h2', { text: 'Автоматическое обновление (GitHub Actions)' }),
    h('div', { class: 'card' },
      h('p', { class: 'small muted', text: 'Чтобы база обновлялась сама, добавьте в репозиторий workflow: файл лежит в blender/tools/github-workflow.yml. Скопируйте его в .github/workflows/blender-data.yml и запустите вручную — Action соберёт данные и закоммитит их.' })),

    h('h2', { text: 'Структура проекта' }),
    h('pre', { class: 'mono' },
`blender/
  index.html            оболочка сайта
  src/app.js            роутер и каркас
  src/lib/              движок: поиск, ответы, хранилище, разметка
  src/screens/          экраны: ответы, справочник, курс, тренажёры, прогресс
  content/course.js     рукописные уроки на русском
  content/keys.js       задания тренажёра клавиш
  content/sim.js        симулятор интерфейса
  data/                 собранная база (индекс, словарь, тексты)
  tools/                сборщик данных и краулер русского руководства`),

    h('h2', { text: 'Горячие клавиши сайта' }),
    h('div', { class: 'card' },
      h('p', {}, h('kbd', { text: '/' }), ' — фокус в поиск'),
      h('p', {}, h('kbd', { text: 'Enter' }), ' — спросить'),
      h('p', {}, h('kbd', { text: 'Esc' }), ' — закрыть подсказки')),
  );

  return wrap;
}

const stat = (value, label) => h('div', { class: 'card stat' }, h('b', { text: value }), h('span', { text: label }));
