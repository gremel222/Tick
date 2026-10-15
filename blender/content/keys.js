/**
 * keys.js — задания тренажёра горячих клавиш (рукописные, на русском).
 * `doc` — страница справочника, где описан инструмент.
 * `alt` — допустимые альтернативные варианты (например, Numpad и обычные клавиши).
 */

export const KEY_TASKS = [
  { key: 'N', task: 'Открыть боковую панель', detail: 'Вкладки Item, Tool, View, Animation прямо во вьюпорте.', why: 'N — Sidebar. Там живут настройки вида, отсечения и 3D-курсора.', doc: 'editors/3dview/sidebar' },
  { key: 'T', task: 'Скрыть/показать панель инструментов', detail: 'Панель с активными инструментами слева.', why: 'T — Toolbar. Освобождает место на экране.', doc: 'editors/3dview/toolbar/index' },
  { key: 'Tab', task: 'Переключить Object Mode ↔ Edit Mode', detail: 'Основное переключение между правкой объекта и его геометрии.', why: 'Tab переключает режим; Ctrl+Tab открывает круговое меню режимов.', doc: 'editors/3dview/modes' },
  { key: 'Ctrl+Tab', task: 'Открыть круговое меню режимов', detail: 'Object, Edit, Sculpt, Vertex Paint, Weight Paint, Texture Paint, Pose.', why: 'Ctrl+Tab — быстрый доступ ко всем режимам объекта.', doc: 'editors/3dview/modes' },
  { key: 'F3', task: 'Поиск любой команды Blender по имени', detail: 'Находит операторы, включая скрытые в меню и аддонах.', why: 'F3 — Operator Search. Самый полезный навык новичка.', doc: 'interface/tools_operators' },
  { key: 'F9', task: 'Настройки только что выполненного действия', detail: 'Например, количество сегментов созданной сферы.', why: 'Adjust Last Operation — правит последний оператор, пока не сделано другое действие.', doc: 'editors/3dview/sidebar' },
  { key: 'F12', task: 'Отрендерить текущий кадр', detail: 'Запускает рендер с настройками сцены.', why: 'F12 — Render Image; Ctrl+F12 — рендер анимации; F11 — показать последний рендер.', doc: 'render/index' },
  { key: 'F11', task: 'Показать последний рендер снова', detail: 'Возвращает окно с готовым изображением.', why: 'F11 — Show Last Render. Полезно, если случайно закрыли результат.', doc: 'render/index' },
  { key: 'Numpad 0', task: 'Посмотреть через активную камеру', detail: 'Ровно тот кадр, который попадёт в рендер.', why: 'Numpad 0 — Camera View.', doc: 'editors/3dview/navigate/camera_view' },
  { key: 'Ctrl+Alt+Numpad 0', task: 'Совместить камеру с текущим видом', detail: 'Камера встанет туда, откуда вы сейчас смотрите.', why: 'Align Camera to View — самый быстрый способ выбрать ракурс.', doc: 'editors/3dview/navigate/camera_view' },
  { key: 'Numpad 5', task: 'Переключить перспективу и ортогональный вид', detail: 'Ортогональный вид без искажений — для моделирования.', why: 'Numpad 5 — Perspective ↔ Orthographic.', doc: 'editors/3dview/navigate/projections' },
  { key: 'Numpad 1', task: 'Вид спереди (Front)', detail: 'Ортогональный вид спереди.', why: 'Numpad 1/3/7 — Front/Right/Top; с Ctrl — противоположные виды.', doc: 'editors/3dview/navigate/align' },
  { key: 'Numpad 7', task: 'Вид сверху (Top)', detail: 'Ортогональный вид сверху — планировка сцены.', why: 'Numpad 7 — Top View, Ctrl+Numpad 7 — Bottom.', doc: 'editors/3dview/navigate/align' },
  { key: 'Numpad 3', task: 'Вид справа (Right)', detail: 'Ортогональный вид сбоку.', why: 'Numpad 3 — Right View, Ctrl+Numpad 3 — Left.', doc: 'editors/3dview/navigate/align' },
  { key: 'Numpad .', task: 'Показать выделенный объект целиком', detail: 'Вид наводится точно на выделение.', why: 'View Selected — «где мой объект?» одним нажатием.', doc: 'editors/3dview/navigate/navigation' },
  { key: 'Home', task: 'Показать всю сцену', detail: 'Вписать все объекты в кадр вьюпорта.', why: 'View All — вернуться к обзору, если «улетели» в пустоту.', doc: 'editors/3dview/navigate/navigation' },
  { key: 'Shift+ПКМ', task: 'Поставить 3D-курсор в точку поверхности', detail: 'Сориентирует курсор по нормали.', why: 'Новые объекты создаются в 3D-курсоре — так его ставят точно.', doc: 'editors/3dview/3d_cursor' },
  { key: 'Shift+C', task: 'Вернуть 3D-курсор в начало координат', detail: 'Сбрасывает курсор в 0,0,0.', why: 'Если новый объект «появляется где-то не там» — сбросьте курсор.', doc: 'editors/3dview/3d_cursor' },
  { key: 'Shift+S', task: 'Меню привязки курсора и выделения', detail: 'Курсор к выделенному, выделенное к курсору и т. д.', why: 'Snap-меню экономит минуты ручного выравнивания.', doc: 'editors/3dview/3d_cursor' },
  { key: 'Shift+A', task: 'Добавить объект', detail: 'Mesh, Curve, Light, Camera, Empty и другое.', why: 'Add menu. Объект создаётся в 3D-курсоре.', doc: 'scene_layout/object/index' },
  { key: 'Shift+D', task: 'Дублировать объект', detail: 'Копия становится под курсором мыши.', why: 'Duplicate. Alt+D создаёт связанную копию (общие данные).', doc: 'scene_layout/object/editing/duplicate' },
  { key: 'X', task: 'Удалить выделенное', detail: 'В Edit Mode спросит, что именно удалять.', why: 'Delete menu: объекты, вершины, рёбра, грани.', doc: 'scene_layout/object/editing/delete' },
  { key: 'G', task: 'Переместить (Grab)', detail: 'Движение мышью; число с клавиатуры — точное значение.', why: 'Grab: G → X → 1 сдвинет объект на 1 по X.', doc: 'scene_layout/object/editing/transform/introduction' },
  { key: 'R', task: 'Повернуть (Rotate)', detail: 'R → ось → угол.', why: 'R → Z → 45 повернёт на 45° вокруг Z.', doc: 'scene_layout/object/editing/transform/introduction' },
  { key: 'S', task: 'Масштабировать (Scale)', detail: 'S → ось → коэффициент.', why: 'S → 2 увеличит объект вдвое.', doc: 'scene_layout/object/editing/transform/introduction' },
  { key: 'Alt+Z', task: 'Включить/выключить рентген (X-Ray)', detail: 'Объекты становятся полупрозрачными.', why: 'X-Ray помогает выделять скрытую геометрию, но мешает в Edit Mode.', doc: 'editors/3dview/display/shading' },
  { key: 'Shift+Z', task: 'Переключить Solid ↔ Rendered', detail: 'Быстрое сравнение рабочего и финального вида.', why: 'Shift+Z — переключение между Solid и Rendered режимами.', doc: 'editors/3dview/display/shading' },
  { key: 'Z', task: 'Круговое меню режимов шейдинга', detail: 'Wireframe, Solid, Material Preview, Rendered.', why: 'Z — pie-меню шейдинга вьюпорта.', doc: 'editors/3dview/display/shading' },
  { key: 'Shift+Alt+Z', task: 'Скрыть/показать все наложения', detail: 'Убирает сетку, гизмо, статистику и прочую вспомогательную графику.', why: 'Удобно для «чистого» вида и скриншотов.', doc: 'editors/3dview/display/overlays' },
  { key: 'O', task: 'Включить пропорциональное редактирование', detail: 'Трансформация плавно влияет на соседние элементы.', why: 'Shift+O меняет профиль затухания, колесо — радиус.', doc: 'editors/3dview/controls/proportional_editing' },
  { key: 'Shift+Tab', task: 'Включить/выключить привязку (Snapping)', detail: 'Магнит в заголовке вьюпорта.', why: 'Snapping: точное совмещение вершин, граней, шага сетки.', doc: 'editors/3dview/controls/snapping' },
  { key: '.', task: 'Меню точки вращения (Pivot Point)', detail: 'Median, Individual Origins, 3D Cursor, Active Element.', why: 'Выбор pivot определяет, вокруг чего вращается и масштабируется.', doc: 'editors/3dview/controls/pivot_point/index' },
  { key: ',', task: 'Меню ориентации трансформаций', detail: 'Global, Local, Normal, View, Cursor.', why: 'Orientation Normal незаменима при моделировании вдоль грани.', doc: 'editors/3dview/controls/orientation' },
  { key: 'E', task: 'Вытянуть (Extrude) выделенное', detail: 'Основная операция создания новой геометрии.', why: 'E работает с гранями, рёбрами и вершинами.', doc: 'modeling/meshes/tools/index' },
  { key: 'I', task: 'Вдавить (Inset Faces)', detail: 'Создаёт грань внутри выделенной.', why: 'Inset — основа рамок, панелей и пазов.', doc: 'modeling/meshes/tools/index' },
  { key: 'Ctrl+B', task: 'Фаска (Bevel)', detail: 'Скашивает выделенные рёбра; колесо мыши добавляет сегменты.', why: 'Bevel — обязательный шаг перед сглаживанием.', doc: 'modeling/meshes/tools/index' },
  { key: 'Ctrl+R', task: 'Петлевой разрез (Loop Cut)', detail: 'Добавляет петли рёбер; колесо мыши регулирует количество.', why: 'Loop Cut детализирует поверхность и готовит её к деформации.', doc: 'modeling/meshes/tools/index' },
  { key: 'H', task: 'Скрыть выделенные объекты', detail: 'Временно убрать из вида, не удаляя.', why: 'Alt+H показывает всё скрытое, Shift+H скрывает всё кроме выделенного.', doc: 'editors/3dview/display/visibility' },
  { key: 'Alt+H', task: 'Показать всё скрытое', detail: 'Возвращает скрытые объекты.', why: 'Частая причина «пропажи» объекта — он скрыт клавишей H.', doc: 'editors/3dview/display/visibility' },
  { key: 'Shift+H', task: 'Скрыть всё, кроме выделенного', detail: 'Изоляция выделения.', why: 'Парная операция к Alt+H.', doc: 'editors/3dview/display/visibility' },
  { key: '/', task: 'Локальный вид (Local View)', detail: 'Показывает только выделенные объекты.', why: 'Numpad / — локальный вид ± выделенное.', doc: 'editors/3dview/navigate/local_view' },
  { key: 'Ctrl+J', task: 'Объединить объекты в один меш', detail: 'Все выделенные присоединяются к активному.', why: 'Join работает в Object Mode.', doc: 'scene_layout/object/editing/join' },
  { key: 'P', task: 'Отделить выделенное в новый объект', detail: 'Обратная операция к Join.', why: 'P — Separate в Edit Mode.', doc: 'scene_layout/object/editing/separate' },
  { key: 'Ctrl+Z', task: 'Отменить последнее действие', detail: 'Многоуровневая отмена.', why: 'Ctrl+Shift+Z — повтор (Redo).', doc: 'troubleshooting/index' },
  { key: 'Ctrl+S', task: 'Сохранить файл', detail: 'Сохранение .blend-файла.', why: 'Ctrl+Shift+S — «Сохранить как», Ctrl+Alt+S — увеличить версию.', doc: 'files/blend/save' },
  { key: 'Shift+Space', task: 'Меню инструментов под курсором', detail: 'Быстрое переключение инструмента без панели слева.', why: 'Полезно в полноэкранном режиме вьюпорта.', doc: 'editors/3dview/toolbar/index' },
  { key: 'Shift+`', task: 'Режим навигации «Ходьба» (Walk)', detail: 'W/A/S/D + мышь, как в игре.', why: 'Shift+F — режим полёта (Fly).', doc: 'editors/3dview/navigate/walk_fly' },
];

/** Клавиатура-подсказка в тренажёре. */
export const KEYPAD = [
  'A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '1', '2', '3', '5', '7', '.', '/', ',',
  'Tab', 'F1', 'F3', 'F9', 'F11', 'F12',
  'Numpad 0', 'Numpad 1', 'Numpad 3', 'Numpad 5', 'Numpad 7', 'Numpad .',
  'ПКМ', 'Space', 'Home', 'Del',
];

/** Пул заданий (можно расширять авто-заданиями из индекса справочника). */
export function keyTasks(extra = []) {
  return [...KEY_TASKS, ...extra];
}
