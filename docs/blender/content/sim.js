/**
 * sim.js — данные симулятора интерфейса для тренажёра «Найди опцию».
 * Панели повторяют реальные места настроек Blender; у каждого пункта —
 * русское название, страница справочника и формулировка задания.
 */

export const SIM_PANELS = [
  {
    id: 'sidebar',
    title: 'Боковая панель (N)',
    tabs: [
      {
        id: 'item', title: 'Item',
        items: [
          { term: 'Transform → Location', ru: 'Трансформация → Положение', doc: 'editors/3dview/sidebar', task: 'Узнать и изменить точные координаты выделенного объекта', hint: 'Координаты объекта во вьюпорте — это вкладка Item.' },
          { term: 'Transform → Rotation', ru: 'Трансформация → Поворот', doc: 'editors/3dview/sidebar', task: 'Задать точный угол поворота объекта в градусах', hint: 'Поворот — рядом с положением и масштабом.' },
          { term: 'Transform → Scale', ru: 'Трансформация → Масштаб', doc: 'editors/3dview/sidebar', task: 'Задать точный масштаб объекта по осям', hint: 'Масштаб хранится вместе с остальными трансформациями.' },
          { term: 'Camera / Light settings', ru: 'Настройки камеры или света (в зависимости от объекта)', doc: 'editors/3dview/sidebar', task: 'Посмотреть специфичные параметры выделенной камеры', hint: 'Набор панелей в Item зависит от типа объекта.' },
        ],
      },
      {
        id: 'tool', title: 'Tool',
        items: [
          { term: 'Active Tool', ru: 'Активный инструмент', doc: 'editors/3dview/sidebar', task: 'Настроить поведение текущего инструмента перед его использованием', hint: 'Настройки инструмента «до и во время» работы — вкладка Tool.' },
          { term: 'Workspace', ru: 'Рабочее пространство', doc: 'editors/3dview/sidebar', task: 'Найти настройки, принадлежащие текущему рабочему пространству', hint: 'Это настройки workspace, а не сцены.' },
        ],
      },
      {
        id: 'view', title: 'View',
        items: [
          { term: 'Focal Length', ru: 'Фокусное расстояние', doc: 'editors/3dview/sidebar', task: 'Сделать вид вьюпорта более широкоугольным, не меняя камеру сцены', hint: 'Фокусное расстояние вьюпорта живёт во вкладке View.' },
          { term: 'Clip Start / End', ru: 'Отсечение — начало / конец', doc: 'editors/3dview/sidebar', task: 'Сделать так, чтобы очень маленький объект не исчезал при приближении', hint: 'Уменьшите Start у отсечения.' },
          { term: 'Local Camera', ru: 'Локальная камера', doc: 'editors/3dview/sidebar', task: 'Дать этому вьюпорту собственную активную камеру, отличную от камеры сцены', hint: 'Настройка конкретного вьюпорта — вкладка View.' },
          { term: 'Passepartout', ru: 'Паспарту (затемнение вокруг кадра)', doc: 'editors/3dview/sidebar', task: 'Затемнить всё вне рамки кадра, чтобы точнее оценить композицию', hint: 'Это настройка отображения кадра во вкладке View.' },
          { term: 'Render Region (Sidebar)', ru: 'Область рендера (боковая панель)', doc: 'editors/3dview/sidebar', task: 'Ограничить область просчёта, чтобы ускорить рендер во вьюпорте', hint: 'Ctrl+B задаёт область, флажок — во вкладке View.' },
          { term: 'Lock to Object', ru: 'Закрепить за объектом', doc: 'editors/3dview/sidebar', task: 'Вращать вид вокруг конкретного объекта', hint: 'Блок View Lock → Lock to Object.' },
          { term: 'Lock → To 3D Cursor', ru: 'Закрепить за 3D-курсором', doc: 'editors/3dview/sidebar', task: 'Сделать точкой интереса вида 3D-курсор', hint: 'Становится активным, когда Lock to Object выключен.' },
          { term: 'Lock → Camera to View', ru: 'Закрепить камеру за видом', doc: 'editors/3dview/sidebar', task: 'Приклеить камеру к вьюпорту, чтобы она следовала за навигацией', hint: 'Рамка кадра обводится красным пунктиром.' },
          { term: 'Lock → Rotation', ru: 'Заблокировать вращение вида', doc: 'editors/3dview/sidebar', task: 'Запретить случайный поворот вьюпорта при моделировании по чертежу', hint: 'Блокировка ориентации вида — View Lock → Rotation.' },
          { term: '3D Cursor → Location / Rotation', ru: '3D-курсор — положение и поворот', doc: 'editors/3dview/3d_cursor', task: 'Ввести точные координаты 3D-курсора с клавиатуры', hint: 'Блок 3D Cursor во вкладке View.' },
          { term: '3D Cursor → Rotation Mode', ru: 'Режим поворота курсора (Euler / Axis Angle / Quaternion)', doc: 'editors/3dview/sidebar', task: 'Сменить способ расчёта поворота курсора на кватернионы', hint: 'Rotation Mode — рядом с координатами поворота.' },
          { term: 'Collections → Local Collections', ru: 'Коллекции — локальные коллекции', doc: 'editors/3dview/sidebar', task: 'Задать видимость коллекции только для этого вьюпорта', hint: 'Панель Collections во вкладке View.' },
          { term: 'Collections → Hide in Viewport', ru: 'Коллекции — скрыть во вьюпорте', doc: 'editors/3dview/sidebar', task: 'Скрыть целую коллекцию объектов одним переключателем', hint: 'Иконка глаза рядом с названием коллекции.' },
          { term: 'Annotations', ru: 'Аннотации', doc: 'interface/annotate_tool', task: 'Сделать пометку поверх сцены, которая не попадёт в рендер', hint: 'Аннотации — вспомогательный слой рисования.' },
        ],
      },
      {
        id: 'animation', title: 'Animation',
        items: [
          { term: 'Global Transform', ru: 'Глобальная трансформация', doc: 'editors/3dview/animation/copy_global_transform', task: 'Скопировать глобальную трансформацию объекта для анимации', hint: 'Вкладка Animation добавляется к боковой панели для работы с анимацией.' },
        ],
      },
    ],
  },
  {
    id: 'header',
    title: 'Заголовок 3D-вьюпорта',
    items: [
      { term: 'Mode (Object Mode / Edit Mode)', ru: 'Режим объекта', doc: 'editors/3dview/modes', task: 'Переключиться из Object Mode в Sculpt Mode', hint: 'Селектор режима — в левой части заголовка.' },
      { term: 'Transform Orientation', ru: 'Ориентация трансформаций', doc: 'editors/3dview/controls/orientation', task: 'Сделать так, чтобы перемещение шло вдоль нормали грани', hint: 'Нужна ориентация Normal.' },
      { term: 'Pivot Point', ru: 'Точка вращения', doc: 'editors/3dview/controls/pivot_point/index', task: 'Вращать объект вокруг 3D-курсора', hint: 'Переключатель точки вращения в заголовке.' },
      { term: 'Snapping (магнит)', ru: 'Привязка', doc: 'editors/3dview/controls/snapping', task: 'Включить точное совмещение объектов по вершинам', hint: 'Иконка магнита плюс выбор базы привязки.' },
      { term: 'Proportional Editing', ru: 'Пропорциональное редактирование', doc: 'editors/3dview/controls/proportional_editing', task: 'Включить плавное влияние трансформации на соседние элементы', hint: 'Иконка с окружностью рядом с магнитом.' },
      { term: 'Overlays', ru: 'Наложения', doc: 'editors/3dview/display/overlays', task: 'Включить отображение статистики сцены', hint: 'Меню из двух пересекающихся кругов в заголовке.' },
      { term: 'Shading', ru: 'Шейдинг вьюпорта', doc: 'editors/3dview/display/shading', task: 'Включить Cavity, чтобы лучше видеть форму', hint: 'Меню шейдинга — справа в заголовке.' },
      { term: 'X-Ray (Alt+Z)', ru: 'Рентген', doc: 'editors/3dview/display/shading', task: 'Сделать объекты полупрозрачными, чтобы выделять скрытую геометрию', hint: 'Alt+Z или кнопка рентгена в заголовке.' },
      { term: 'Gizmos', ru: 'Гизмо', doc: 'editors/3dview/display/gizmo', task: 'Отключить интерактивные ручки перемещения в вьюпорте', hint: 'Меню Gizmos в заголовке.' },
      { term: 'Collection selector', ru: 'Выбор активной коллекции', doc: 'scene_layout/collections/index', task: 'Переключить активную коллекцию, в которую попадают новые объекты', hint: 'Список коллекций рядом с селектором режима.' },
    ],
  },
  {
    id: 'render',
    title: 'Properties → Render',
    items: [
      { term: 'Render Engine (Eevee / Cycles)', ru: 'Движок рендера', doc: 'render/index', task: 'Переключиться с Eevee на Cycles', hint: 'Render Properties — первая вкладка с иконкой камеры.' },
      { term: 'Sampling → Max Samples', ru: 'Выборка — максимум образцов', doc: 'render/cycles/render_settings/sampling', task: 'Уменьшить число образцов, чтобы рендер шёл быстрее', hint: 'Настройки выборки зависят от движка.' },
      { term: 'Denoise', ru: 'Подавление шума', doc: 'render/cycles/render_settings/sampling', task: 'Убрать шум на изображении, не увеличивая число образцов', hint: 'Галка Denoising в настройках выборки.' },
      { term: 'Film → Transparent', ru: 'Плёнка — прозрачный фон', doc: 'render/cycles/render_settings/film', task: 'Сделать фон рендера прозрачным для наложения в редакторе', hint: 'Раздел Film в настройках рендера.' },
      { term: 'Color Management → View Transform', ru: 'Управление цветом — трансформация вида', doc: 'render/color_management', task: 'Изменить способ преобразования цвета (например, на AgX/Filmic)', hint: 'Color Management — ниже настроек рендера.' },
    ],
  },
  {
    id: 'output',
    title: 'Properties → Output',
    items: [
      { term: 'Format → Resolution', ru: 'Формат — разрешение', doc: 'render/output/properties/format', task: 'Задать разрешение 1920×1080 для финального рендера', hint: 'Output Properties — вкладка с иконкой принтера.' },
      { term: 'Output → File Format', ru: 'Формат файла', doc: 'render/output/properties/format', task: 'Сохранять рендер в PNG вместо JPEG', hint: 'Формат вывода — рядом с разрешением.' },
      { term: 'Output → Render Region', ru: 'Область рендера (финальный рендер)', doc: 'render/output/properties/format', task: 'Ограничить область и финального рендера, а не только вьюпорта', hint: 'Эта галка влияет и на вьюпорт, и на финальную картинку.' },
    ],
  },
  {
    id: 'object',
    title: 'Properties → Object',
    items: [
      { term: 'Visibility → Show in Renders', ru: 'Видимость — показывать в рендере', doc: 'scene_layout/object/properties/visibility', task: 'Оставить объект видимым во вьюпорте, но исключить из рендера', hint: 'Панель Visibility в свойствах объекта.' },
      { term: 'Relations → Parent', ru: 'Связи — родитель', doc: 'scene_layout/object/properties/relations', task: 'Привязать объект к другому объекту как к родителю', hint: 'Панель Relations.' },
      { term: 'Viewport Display → Display As', ru: 'Отображение — показывать как', doc: 'scene_layout/object/properties/display', task: 'Показать объект как каркас (Wire), не меняя геометрию', hint: 'Viewport Display → Display As.' },
    ],
  },
  {
    id: 'toolbar',
    title: 'Панель инструментов (T)',
    items: [
      { term: 'Select Box', ru: 'Выделение рамкой', doc: 'editors/3dview/toolbar/index', task: 'Выделять объекты прямоугольной рамкой', hint: 'Панель инструментов слева (T).' },
      { term: 'Cursor (3D Cursor tool)', ru: 'Инструмент 3D-курсора', doc: 'editors/3dview/3d_cursor', task: 'Размещать 3D-курсор кликами по поверхности', hint: 'Инструмент курсора в панели инструментов.' },
      { term: 'Measure', ru: 'Измерение', doc: 'editors/3dview/toolbar/index', task: 'Измерить расстояние между двумя точками прямо во вьюпорте', hint: 'Инструмент Measure.' },
      { term: 'Annotate', ru: 'Аннотация', doc: 'interface/annotate_tool', task: 'Нарисовать пометку поверх сцены', hint: 'Инструмент Annotate.' },
      { term: 'Add Cube', ru: 'Добавить куб', doc: 'modeling/meshes/primitives', task: 'Интерактивно добавить куб, растягивая его мышью', hint: 'Инструменты создания примитивов в панели инструментов.' },
    ],
  },
];
