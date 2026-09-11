# ПАСПОРТ ИГРЫ «ПОПАДАНЕЦ — ЖИВОЙ МИР»

Финальная версия 4.0 — готова к разработке. Документ в код-ориентированном формате; все решения после аудита учтены. Версия v0.1 реалистична: деревня, 100 игроков, rules-based ядро + точечный ИИ.

> Реализация прототипа v0.1 по этому паспорту — в корне репозитория (см. README.md).
> Соответствие разделов паспорта и кода описано в README.

---

## 1. Титульный лист

```typescript
const PROJECT = {
  title: "Попаданец — Живой мир",
  workingTitle: true,
  type: "browser-game",
  version: "4.0",
  createdAt: "2026-09-11",
  updatedAt: "2026-09-11",

  author: {
    name: "Семён",
    mode: "solo",
    roles: ["gamedesign", "code", "art", "sound", "marketing"],
    email: "sem.chernoruk@gmail.com",
    telegram: "создаётся",
    discord: "создаётся",
    website: "лендинг (позже)",
  },

  shortDescription:
    "Браузерная RPG-песочница про попаданца в аниме-мир, " +
    "где игрок проживает свою жизнь внутри мира, который " +
    "существует и меняется независимо от него.",

  genre: "RPG",
  subgenres: ["life-sim", "sandbox", "interactive-fiction", "survival", "economy-sim"],
  platform: "web",
  status: "idea-to-prototype",
  confidentiality: "public-devlog",
} as const;
```

---

## 2. Общая информация

```typescript
const GENERAL = {
  platform: {
    primary: "web",
    priority: ["desktop", "tablet", "mobile"],
    mobileOrientation: ["portrait", "landscape"],
    mobilePrimary: "portrait",
  },

  audience: {
    ageRange: [16, 35],
    interests: ["anime", "isekai", "rpg", "life-sim", "sandbox"],
    skillLevels: ["casual", "regular", "hardcore"],
  },

  rating: "16+",
  languages: {
    primary: "ru",
    planned: ["en"],
    enRelease: "after-v1.0",
  },

  distribution: {
    model: "freemium",
    freeUntil: "v1.0",
    paidFrom: "v1.0",
    methods: ["donation", "cosmetics"],
    cosmeticsAffectBalance: false,
  },

  sessions: {
    averageMinutes: [20, 60],
    totalDuration: "unlimited",
  },

  scale: {
    "v0.1": {
      type: "village",
      players: 100,
      npcsSignificant: 20,
      npcsTotal: [50, 80],
      regions: 3,
    },
    "v0.5": {
      type: "small-town",
      players: 1000,
      npcsSignificant: [50, 100],
      regions: [3, 5],
    },
    "v1.0": {
      type: "multi-region",
      players: 10000,
      npcsSignificant: [200, 300],
      regions: [5, 7],
    },
    "v2.0": {
      type: "living-world",
      players: "unlimited",
      npcsSignificant: [1000, "Infinity"],
      regions: [10, "Infinity"],
    },
  },
} as const;
```

---

## 3. Концепция и уникальность

```typescript
const CONCEPT = {
  mainIdea:
    "Ты не герой истории. Ты человек, который оказался внутри истории. " +
    "Мир не ждёт тебя — он живёт своей жизнью.",

  features: [
    {
      id: "not-chosen-one",
      title: "Ты попаданец, а не избранный",
      details: ["нет меча", "нет денег", "нет репутации", "нет магии"],
    },
    {
      id: "past-knowledge",
      title: "Знания прошлой жизни — единственное преимущество",
      levels: {
        exact:    "точно знает",
        approx:   "помнит примерно",
        assumes:  "предполагает",
        unknown:  "не знает",
      },
    },
    {
      id: "mutable-canon",
      title: "Изменяемый канон",
      description: "Вмешательство игрока перестраивает события постепенно.",
    },
    {
      id: "independent-world",
      title: "Мир существует независимо",
      details: ["NPC живут своей жизнью", "события идут без игрока"],
    },
    {
      id: "multi-axis-relationships",
      title: "Отношения — не одна шкала",
      axes: ["trust", "respect", "sympathy", "fear", "suspicion", "attachment", "romanticInterest"],
      stages: ["stranger", "acquaintance", "pleasant", "friend", "close-friend",
               "attachment", "romantic-interest", "relationship"],
    },
    {
      id: "ignore-main-plot",
      title: "Можно игнорировать главный сюжет",
      paths: ["shop", "farm", "smithy", "mercenary", "alchemist", "merchant", "mage", "criminal"],
    },
    {
      id: "real-consequences",
      title: "Ошибки имеют последствия",
      outcomes: ["injury", "burn", "item-break", "noise", "monster-attraction", "death"],
    },
    {
      id: "free-input",
      title: "Свободный ввод вместо меню из 4 кнопок",
      details: ["игрок описывает намерение", "движок анализирует реалистичность"],
    },
    {
      id: "world-memory",
      title: "Мир помнит тебя",
      details: ["события важные — навсегда", "мелкие — 30 дней", "свидетели распространяют слухи"],
    },
    {
      id: "alt-history",
      title: "«История, которой не было»",
      journal: ["confirmed", "probable", "potential"],
    },
  ],

  references: {
    freedom: ["Dwarf Fortress", "RimWorld", "Kenshi"],
    setting: ["anime-isekai", "anime-fantasy"],
    livingWorld: ["Mount & Blade", "Crusader Kings"],
    format: ["browser-rpg", "text-sandbox"],
  },
} as const;
```

---

## 4. Геймплей

### 4.1. Типы данных игрока

```typescript
type StatKey = "strength" | "agility" | "endurance"
              | "intelligence" | "perception" | "charisma" | "luck";

type KnowledgeLevel = "exact" | "approx" | "assumes" | "unknown";

interface Player {
  id: string;
  name: string;
  age: number;
  pastProfession: string;
  pastKnowledge: Array<{ topic: string; level: KnowledgeLevel }>;
  personality: string;
  deathReason: string;
  worldType: "known" | "partial" | "unknown";

  level: number;
  stats: Record<StatKey, number>;
  skills: Record<string, number>;

  hp:     { current: number; max: number };
  energy: { current: number; max: number };
  mana:   { current: number; max: number };
  hunger: number;
  thirst: number;

  money: number;
  inventory: InventoryItem[];
  location: string;
  gameDay: number;
}
```

### 4.2. Стартовые значения

```typescript
const STARTING_PLAYER: Player = {
  id: "generated", name: "custom", age: 18,
  pastProfession: "custom", pastKnowledge: [],
  personality: "custom", deathReason: "custom",
  worldType: "unknown",
  level: 1,
  stats: {
    strength: 5, agility: 5, endurance: 5,
    intelligence: 7, perception: 6, charisma: 5, luck: 4,
  },
  skills: {},
  hp:     { current: 100, max: 100 },
  energy: { current: 100, max: 100 },
  mana:   { current: 0,   max: 0   },
  hunger: 0, thirst: 0,
  money: 0, inventory: [], location: "start_forest", gameDay: 1,
};
```

### 4.3. Время и действия

```typescript
const ACTION_DURATIONS = {
  eat: 20, talk: 30, training: 120, travel: 300, sleep: 480,
} as const;

const TIME_RATIO = {
  offlineRatio: 1,           // 1 реальная минута = 1 игровая минута
  gameDayPerRealMinutes: 15, // 1 игровой день ≈ 15 реальных минут
  maxCatchupDays: 7,         // максимум докатки оффлайна
} as const;
```

### 4.4. Режимы смерти

```typescript
type DeathMode = "normal" | "hardcore" | "story";

const DEATH_MODES = {
  normal:   { onDeath: "load-last-save" },
  hardcore: { onDeath: "character-permanent-end" },
  story:    { onDeath: "continue-as-new-character" },
} as const;

const STORY_MODE_ON_DEATH = {
  worldPersists: true,
  npcRelationshipsReset: true,
  worldMemoryPersists: true,
  canonContinues: true,
  oldCharacterBecomesNPC: true,
  inheritanceKept: false,
  newCharacterStartsAt: "city-square",
} as const;
```

### 4.5. События и слухи

```typescript
type EventType = "personal" | "npc" | "regional" | "world";
type RumorTruth = "truth" | "partial" | "exaggeration" | "lie" | "disinformation";

interface GameEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  triggerConditions: Record<string, unknown>;
  consequences: Record<string, unknown>;
  chainId?: string;
  startDay: number;
  endDay?: number;
  active: boolean;
}

interface Rumor {
  id: string;
  text: string;
  truth: RumorTruth;
  sourceNpcId: string;
  spreadRadius: 3;
}
```

### 4.6. Сохранения

```typescript
const SAVE_SYSTEM = {
  mode: "snapshot",        // снимок мира на момент сохранения
  slots: 5,
  storage: "server",
  localCache: true,
  export: "json-file",
  autosave: true,
  autosaveIntervalMinutes: 5,
} as const;
```

### 4.7. Управление

```typescript
const HOTKEYS = {
  KeyM: "open-map",
  KeyC: "open-character",
  KeyI: "open-inventory",
  KeyJ: "open-journal",
  KeyQ: "open-quests",
  Escape: "open-menu",
  Enter: "confirm-input",
} as const;

const MOBILE_GESTURES = {
  swipeLeft: "menu",
  swipeRight: "close-modal",
  pinch: "zoom-map",
  longPress: "npc-info",
  doubleTap: "interact",
} as const;
```

### 4.8. Мир — режим тика (hybrid)

```typescript
const WORLD_TICK = {
  type: "hybrid",
  scheduled: {
    interval: "60s",
    actions: [
      "advance-time",
      "process-npc-schedules",
      "update-weather",
      "check-event-triggers",
      "update-economy",
    ],
  },
  onDemand: {
    trigger: "player-login",
    mode: "day-by-day",       // до 7 дней симулируем детально
    fastForwardAfter: 7,      // после 7 — без детальной симуляции
  },
} as const;
```

### 4.9. Парсер свободного ввода

```typescript
const INTENT_PARSER = {
  stages: ["tokenize", "classify", "extract-slots", "validate", "execute"],
  fallback: "clarification-question",
  intentTypes: [
    "talk", "move", "attack", "use-item", "buy", "sell",
    "craft", "rest", "sleep", "eat", "drink", "look", "examine",
  ],
  rules: {
    maxMoveDistance: 5,
    requiresSkill: true,
    requiresItem: true,
    requiresMoney: true,
    requiresRelationship: true,
  },
} as const;
```

### 4.10. Ачивки (базовый набор v0.1)

```typescript
const ACHIEVEMENTS_V01 = [
  { id: "first-step",    title: "Первый шаг",    trigger: "stand-up",              hidden: false },
  { id: "survivor",      title: "Выживший",      trigger: "survive-7-days",        hidden: false },
  { id: "peaceful",      title: "Мирный житель", trigger: "no-combat-30-days",     hidden: false },
  { id: "living-legend", title: "Живая легенда", trigger: "10-canon-deviations",   hidden: true  },
  { id: "first-friend",  title: "Первый друг",   trigger: "relationship-friend",   hidden: false },
] as const;
```

---

## 5. Игровой мир и сюжет

### 5.1. Мир v0.1 — деревня

```typescript
const WORLD_V01 = {
  type: "village",
  name: "author-world-01",
  population: [50, 80],
  significantNpcs: 20,
  regions: {
    village: { type: "village", danger: 0,   description: "Деревня на опушке" },
    forest:  { type: "forest",  danger: 2,   description: "Лес с дикими зверями" },
    road:    { type: "road",    danger: 1,   description: "Торговый тракт" },
  },
  locations: [
    "village-square", "village-tavern", "village-smithy",
    "village-shop", "village-temple", "village-fields",
    "forest-edge", "forest-deep", "road-north", "road-south",
  ],
  canon: "author-only",
} as const;
```

### 5.2. Стартовая карта

```typescript
const START_MAP = {
  village: ["forest-edge", "road-north", "road-south", "village-fields"],
  forestEdge: ["village", "forest-deep"],
  forestDeep: ["forest-edge"],
  roadNorth: ["village"],
  roadSouth: ["village"],
} as const;
```

### 5.3. Канон и отклонения

```typescript
interface CanonEvent {
  id: string;
  worldId: string;
  title: string;
  plannedDay: number;
  participants: string[];
  location: string;
  status: "planned" | "happened" | "changed" | "skipped";
  source: "author" | "wiki-import" | "player";
}

interface CanonDeviation {
  id: string;
  canonEventId: string;
  deviationDay: number;
  reason: string;
  confirmed: number;
  probable: number;
  potential: number;
  notes: string;
}
```

### 5.4. Первая неделя (онбординг как тьюториал)

```typescript
const FIRST_WEEK = [
  { day: 1, title: "Выжить",         goals: ["find-water", "orient-yourself"] },
  { day: 2, title: "Найти людей",    goals: ["find-people", "try-explain"] },
  { day: 3, title: "Первая работа",  goals: ["get-first-job"] },
  { day: 4, title: "Еда",            goals: ["buy-food"] },
  { day: 5, title: "Первое имя",     goals: ["learn-famous-npc"] },
  { day: 6, title: "Осознание",      goals: ["realize-where-you-are"] },
  { day: 7, title: "Большой выбор",  goals: ["choose-canon-or-own-life"] },
] as const;
```

### 5.5. Открывающая сцена

```typescript
const OPENING_SCENE = {
  steps: [
    { text: "МИР ОБНАРУЖЕН",             delay: 2000 },
    { text: "Ты умер.",                   delay: 2000 },
    { text: "Но это ещё не конец.",       delay: 2000 },
    { text: "Место прибытия определено.", delay: 2000 },
  ],
  final: {
    background: "forest-field",
    text: "Ты приходишь в себя на земле. Холодная трава. Запах леса. Вдалеке виднеется дорога.",
    state: { clothes: "common", money: 0, weapon: null, food: null, worldKnowledge: "unknown" },
    button: "ВСТАТЬ",
  },
} as const;
```

### 5.6. Значимые NPC (пример профиля)

```typescript
const EXAMPLE_NPC = {
  id: "erik-trader",
  name: "Эрик",
  age: 43,
  personality: "осторожный, расчётливый",
  profession: "торговец",
  schedule: [
    { start: 480,  end: 720,  action: "setup-shop",  location: "village-shop" },
    { start: 720,  end: 1080, action: "trade",       location: "village-shop" },
    { start: 1080, end: 1200, action: "eat",         location: "village-tavern" },
    { start: 1200, end: 1320, action: "restock",     location: "village-shop" },
    { start: 1320, end: 1380, action: "close-shop",  location: "village-shop" },
    { start: 1380, end: 1440, action: "home",        location: "erik-house" },
  ],
  goals: ["расширить лавку", "накопить на переезд"],
  fears: ["потерять семью"],
  dreams: ["уехать в столицу"],
  money: 340,
  health: { current: 100, max: 100 },
  skills: { trade: 8, speech: 6 },
  secrets: ["долг местному ростовщику"],
  state: "alive",
  currentLocation: "village-shop",
} as const;
```

---

## 6. Интерфейс и UX

### 6.1. Роутинг

```typescript
const ROUTES = {
  "/":                 { component: "Landing",         public: true },
  "/devlog":           { component: "Devlog",          public: true },
  "/wiki":             { component: "WorldWiki",       public: true },
  "/leaderboard":      { component: "Leaderboard",     public: true },
  "/register":         { component: "Register",        public: true, redirectIfAuth: "/play" },
  "/login":            { component: "Login",           public: true, redirectIfAuth: "/play" },
  "/character/create": { component: "CharacterCreate", requiresAuth: true },
  "/opening":          { component: "OpeningScene",    requiresAuth: true },
  "/play":             { component: "GameMain",        requiresAuth: true, requiresCharacter: true },
  "/profile":          { component: "Profile",         requiresAuth: true },
  "/settings":         { component: "Settings",        requiresAuth: true },
  "/privacy":          { component: "Privacy",         public: true },
  "/tos":              { component: "ToS",             public: true },
  "/cookies":          { component: "Cookies",         public: true },
  "/age-check":        { component: "AgeCheck",        public: true },
  "/dmca":             { component: "DMCA",            public: true },
} as const;
```

### 6.2. Флоу переходов

```typescript
type NavAction = { from: string; to: string; trigger: string };

const NAVIGATION_FLOW: NavAction[] = [
  { from: "/",              to: "/play",             trigger: "click-play" },
  { from: "/",              to: "/register",         trigger: "play-no-auth" },
  { from: "/",              to: "/devlog",           trigger: "click-devlog" },
  { from: "/",              to: "/wiki",             trigger: "click-wiki" },
  { from: "/",              to: "/leaderboard",      trigger: "click-leaderboard" },

  { from: "/login",         to: "/register",         trigger: "click-create-account" },
  { from: "/login",         to: "/play",             trigger: "success-login" },
  { from: "/register",      to: "/character/create", trigger: "success-register" },
  { from: "/character/create", to: "/opening",       trigger: "click-begin" },
  { from: "/opening",       to: "/play",             trigger: "click-stand-up" },

  { from: "/play",          to: "modal-map",         trigger: "key-M" },
  { from: "/play",          to: "modal-character",   trigger: "key-C" },
  { from: "/play",          to: "modal-inventory",   trigger: "key-I" },
  { from: "/play",          to: "modal-journal",     trigger: "key-J" },
  { from: "/play",          to: "modal-quests",      trigger: "key-Q" },
  { from: "/play",          to: "modal-menu",        trigger: "key-Esc" },
  { from: "/play",          to: "screen-dialogue",   trigger: "click-npc" },

  { from: "modal-menu",     to: "/settings",         trigger: "click-settings" },
  { from: "modal-menu",     to: "/profile",          trigger: "click-profile" },
  { from: "modal-menu",     to: "/",                 trigger: "click-main-menu" },
  { from: "modal-menu",     to: "/login",            trigger: "click-logout" },
];
```

### 6.3. Экраны

- **Landing**: Header, Hero («Ты не герой истории»), FeatureGrid, Carousel, Roadmap, DevlogPreview, Footer.
- **Register / Login**: email, пароль, капча, согласия; OAuth Google (полная версия).
- **CharacterCreate**: «Кем ты был?» (имя, возраст, профессия, знания ≤3, характер, причина смерти) + «Куда ты хочешь попасть?» (3 карты) + режим смерти.
- **OpeningScene**: fullscreen-последовательность из 5.5.
- **GameMain**: TopBar (погода/время/профиль), WorldView, StatusBar (hp/energy/hunger/деньги), NarrativeLog, ActionRow, InputLine (free-text), BottomMenu (M/C/I/J/Q/Esc).
- **DialogueScreen**: портрет, имя, оси отношений, реплика NPC, свободный ввод, подсказки-кнопки.
- **CharacterModal / InventoryModal / JournalModal / MapModal / MenuModal**: по дереву компонентов из паспорта.

### 6.4. Визуальная тема

```typescript
const THEME = {
  base: { background: "#0d1117", text: "#e6edf3" },
  stats: { hp: "#e74c3c", energy: "#f1c40f", hunger: "#27ae60", mana: "#5dade2" },
  accent: { default: "#a259ff" },
  regions: { village: "#f39c12", forest: "#2ecc71", road: "#95a5a6" },
  fonts: {
    ui: "Inter, Manrope, sans-serif",
    narrative: "stylized serif",
    numbers: "monospace",
  },
  animations: {
    screenTransition: 300,
    weather: "continuous",
    dayNight: "smooth-filter",
    dialogueFadeIn: "fade",
    menuOpen: "fade+slide",
  },
} as const;
```

### 6.5. Адаптивность и доступность

```typescript
const UX = {
  priority: ["desktop", "tablet", "mobile"],
  mobile: {
    orientations: ["portrait", "landscape"],
    primary: "portrait",
    collapsePanels: ["journal", "full-map"],
    layout: {
      portrait:  { topBar: "compact", bottomMenu: "icon-only", narrativeHeight: "50%", inputLine: "floating" },
      landscape: { topBar: "full", bottomMenu: "full", narrativeHeight: "40%" },
    },
  },
  accessibility: {
    fontSize: ["small", "medium", "large"],
    contrast: ["normal", "high"],
    keyboardOnly: true,
    screenReader: "partial",
  },
} as const;
```

---

## 7. Технические требования

```typescript
const TECH_STACK = {
  frontend: {
    base: ["html5", "css3", "es2022-vanilla-js"],
    bundler: "vite",
    state: "custom-lightweight-store",
    routing: "history-api",
    animation: "css-transitions + web-animations",
  },
  backend: {
    runtime: "nodejs-20-lts",
    framework: "express",
    orm: "prisma",
    db: "postgresql-16",
    queue: "bullmq",
    cache: "redis",
    auth: "argon2id + jwt",
    ai: "anthropic-sdk",
  },
  infra: {
    frontendHost: "netlify",
    backendHost: "vps-2cpu-4gb",
    dbHost: "managed-postgres",
    redisHost: "managed-redis",
    cdn: "netlify-edge",
  },
  devops: {
    repo: "github",
    ci: "github-actions",
    migrations: "prisma-migrate",
    backups: "daily-pg-dump",
    monitoring: ["uptimerobot", "sentry"],
    analytics: ["plausible", "custom-events"],
  },
} as const;

const BROWSERS = {
  supported: ["chrome", "firefox", "safari", "edge", "mobile-chrome", "mobile-safari"],
  versions: "last-2-years",
} as const;

const PERFORMANCE = { pageLoadSeconds: 2, uiFps: 60, aiCache: true, aiRateLimit: true } as const;
const SECURITY = {
  serverValidation: true, https: true, captchaOnRegister: true,
  rateLimiting: true, passwordHash: "argon2id", backupDaily: true,
} as const;
const SEO = { enabled: true, metaTags: true, ogImages: true } as const;
```

---

## 8. Аккаунты и приватность

```typescript
const ACCOUNT_SYSTEM = {
  passwordHash: "argon2id",
  emailVerification: true,
  passwordReset: "email-link",
  oauth: ["google"],
  gdpr: { rightToBeDeleted: true, rightToExport: true, dataRetentionDays: 90 },
  legalPages: ["/privacy", "/tos", "/cookies", "/age-check", "/dmca"],
  consentTracking: true,
  cookieBanner: true,
} as const;

const CONSENT_TYPES = [
  { type: "privacy",  required: true },
  { type: "tos",      required: true },
  { type: "cookies",  required: true },
  { type: "age",      required: true },
] as const;
```

---

## 9. ИИ-архитектура

```typescript
const AI_ARCHITECTURE = {
  provider: "anthropic",
  model: "claude-sonnet",
  maxTokens: 800,
  temperature: 0.7,

  context: {
    mode: "summarized",
    windowDays: 7,
    include: ["npcProfile", "relationships", "worldState", "recentEvents"],
  },

  validation: { schema: "zod", onFail: "fallback-rules" },

  budget: { perPlayerDayUSD: 0.05, callsPerHourCap: 20 },

  cache: { key: "npcId+intent+contextHash", ttlSeconds: 3600 },

  useCases: [
    "roleplay-dialogue",
    "scene-description",
    "rumor-generation",
    "intent-parsing-fallback",
  ],
} as const;
```

---

## 10. Экономическая модель

```typescript
const ECONOMY = {
  formula: "basePrice * (1 + demand / max(supply, 1))",
  updateFrequency: "per-game-day",

  playerImpact: {
    bulkBuyRaisesPrices: true,
    bulkSellDropsPrices: true,
    npcReactsToShortage: true,
  },

  taxes: { city: 0.05, trade: 0.10 },

  crossRegionTrade: true,
  currencyStability: 0.95,
} as const;

interface Price {
  regionId: string;
  goodsId: string;
  basePrice: number;
  currentPrice: number;
  demand: number;
  supply: number;
  updatedDay: number;
}
```

---

## 11. Модель памяти мира

```typescript
const WORLD_MEMORY = {
  store: "postgres",
  granularity: "event",
  retention: { important: null, minor: 30 },
  importantEvents: ["saved", "killed", "betrayed", "promised"],
  minorEvents: ["talked", "bought", "passed-through"],
  witnesses: { perEvent: true, shareRadius: 3 },
  searchIndex: "gist",
} as const;
```

---

## 12. Боевая система

```typescript
const COMBAT = {
  type: "turn-based",
  grid: { width: 8, height: 8 },
  initiative: "agility-based",
  actionsPerTurn: ["move", "attack", "skill", "item", "defend", "flee"],

  damage: {
    formula: "attack - defense + roll(luck)",
    minDamage: 1,
  },

  crit: { chance: "luck-based", multiplier: 2 },

  ai: {
    type: "behavior-tree",
    profiles: ["aggressive", "defensive", "cunning", "coward"],
  },
} as const;

interface CombatUnit {
  id: string;
  hp: number;
  attack: number;
  defense: number;
  luck: number;
  position: { x: number; y: number };
  behavior: "aggressive" | "defensive" | "cunning" | "coward";
}
```

---

## 13. Контент

```typescript
const CONTENT = {
  art: {
    style: "anime-semi-realistic",
    illustrationsV01: [20, 30],
    npcPortraits: 20,
    aiGenerated: true,
    humanRefinement: true,
  },
  text: {
    v01Words: [15000, 20000],
    style: "literary-conversational",
    dialogues: { base: "author", variation: "ai" },
  },
  audio: {
    music: ["free-libraries", "ai"],
    sfx: ["steps", "ui", "weather"],
    voice: null,
    voiceEarliestVersion: "v2.0",
    ambientPerRegion: "v0.5",
    combatReactive: "v0.5",
  },
  localization: {
    primary: "ru",
    englishFrom: "v1.0",
    method: ["ai", "manual-review"],
    i18nFilesFromDay1: true,
  },
} as const;
```

---

## 14. Монетизация

```typescript
const MONETIZATION = {
  model: "freemium",
  freeUntil: "v1.0",
  paidFrom: "v1.0",
  methods: ["donation", "cosmetics"],
  cosmeticsAffectBalance: false,
  legalForm: { start: "self-employed", scale: "individual-entrepreneur" },
  incomeSpending: ["hosting", "db", "ai-api", "artist"],
} as const;
```

---

## 15. Маркетинг

```typescript
const MARKETING = {
  channels: [
    { name: "telegram",  role: "primary-devlog" },
    { name: "discord",   role: "community" },
    { name: "itch.io",   role: "publication" },
    { name: "vk",        role: "ru-audience" },
    { name: "youtube",   role: "devlogs-trailers" },
    { name: "reddit",    role: "en-communities" },
  ],
  devlog: { regular: true, primary: true },
  pressKit: { readyBy: "v0.5", items: ["logo", "screenshots", "description", "trailer"] },
  collabs: { since: "v0.5", with: ["artists", "small-streamers"] },
} as const;
```

---

## 16. План разработки

### 16.1. Общий роадмап

```typescript
const ROADMAP = [
  { version: "v0.1", months: 3,  content: "prototype",
    features: ["village-20npc", "time", "weather", "economy-3-regions",
               "death-3-modes", "dialogues-rules-ai", "ui", "saves-5", "legal-pages"] },
  { version: "v0.5", months: 9,  content: "alpha",
    features: ["factions", "romance", "combat-full", "storylines", "audio",
               "public-announce", "1000-players"] },
  { version: "v1.0", months: 20, content: "beta-to-release",
    features: ["full-economy", "reputation", "world-events", "monetization",
               "wiki-import", "user-worlds", "10000-players"] },
  { version: "v2.0", months: 36, content: "post-release",
    features: ["wars", "politics", "city-growth", "voice", "alt-history",
               "multiplayer-experimental"] },
] as const;
```

### 16.2. Спринты v0.1 (12 недель)

```typescript
const SPRINTS_V01 = [
  { week: 1,  goal: "Каркас + юр. минимум",   tasks: ["init-repo", "vite-setup", "netlify-deploy", "legal-pages", "cookie-banner", "prisma-init"] },
  { week: 2,  goal: "Аккаунты",               tasks: ["argon2id", "jwt", "register", "login", "email-verify", "password-reset", "oauth-google"] },
  { week: 3,  goal: "Персонаж + открытие",    tasks: ["character-create-ui", "character-create-api", "opening-scene", "world-state-init"] },
  { week: 4,  goal: "Основной экран",         tasks: ["game-layout", "map-render", "bottom-menu", "hotkeys", "narrative-log", "input-line"] },
  { week: 5,  goal: "WORLD ENGINE база",      tasks: ["game-time-tick", "weather-system", "20-npc-seed", "npc-schedule", "weather-render"] },
  { week: 6,  goal: "Парсер ввода",           tasks: ["tokenize", "classify", "extract-slots", "validate", "execute", "clarification"] },
  { week: 7,  goal: "Диалоги + ИИ",           tasks: ["dialogue-ui", "dialogue-api", "ai-fallback", "schema-validation", "cache", "quotas"] },
  { week: 8,  goal: "Отношения + память",     tasks: ["npc-relationships", "relationship-update", "world-memory", "witnesses-spread"] },
  { week: 9,  goal: "Экономика",              tasks: ["price-model", "buy-sell-api", "bulk-impact", "taxes"] },
  { week: 10, goal: "Бой",                    tasks: ["combat-state", "initiative", "actions", "damage-crit", "ai-behavior", "combat-ui"] },
  { week: 11, goal: "Смерть + сохранения",    tasks: ["death-modes", "snapshot-save", "slots-5", "export-import", "autosave", "achievements"] },
  { week: 12, goal: "Стабилизация + релиз",   tasks: ["unit-tests", "sentry", "uptimerobot", "cicd", "analytics", "balance-review", "release-v01"] },
] as const;
```

### 16.3. Приоритет задач

```typescript
const TASK_PRIORITY = ["world-core", "dialogues", "economy", "ui", "combat"] as const;

const TEAM = {
  code: "Семён",
  gamedesign: "Семён",
  artist: { connectedFrom: "v0.1-or-v0.5" },
  tester: { connectedFrom: "v0.5" },
  budgetPerMonthRub: [5000, 15000],
} as const;
```

### 16.4. DoD v0.1

```typescript
const V01_DEFINITION_OF_DONE = {
  functional: [
    "игрок регистрируется и входит",
    "создаёт персонажа",
    "проходит открывающую сцену",
    "играет в деревне с 20 NPC",
    "пишет свободный ввод — парсер реагирует",
    "общается с NPC (rules + AI fallback)",
    "торгует, цены реагируют",
    "дерётся (8×8, пошагово)",
    "умирает в 3 режимах",
    "сохраняется в 5 слотов, экспорт/импорт",
    "получает базовые ачивки",
    "видит журнал: квесты, события, канон",
    "погода, время, расписания работают",
    "мир помнит действия, отношения меняются",
  ],
  legal: [
    "privacy/tos/cookies/age-check/dmca доступны",
    "cookie-banner работает",
    "GDPR: удаление и экспорт аккаунта работают",
  ],
  infra: [
    "CI/CD деплоит на Netlify + VPS",
    "миграции БД применяются автоматически",
    "Sentry ловит ошибки",
    "UptimeRobot мониторит",
    "ежедневный бэкап БД",
  ],
  tests: [
    "unit-тесты: economy, memory, canon — зелёные",
    "ручной прогон первой недели игры",
  ],
  load: [
    "держит 100 одновременных игроков",
    "отклик диалога rules < 3 сек",
    "ИИ-ответ < 5 сек",
  ],
  metrics: [
    "100 регистраций за первый месяц",
    "retention 7d >= 20%",
    "средняя сессия >= 15 минут",
  ],
} as const;
```

---

## 17. Риски и ограничения

```typescript
const RISKS = [
  { id: "scope",      level: "high",   solution: "поэтапный план, ядро с расширением" },
  { id: "cutting",    level: "medium", solution: "резать контент, не core-механики" },
  { id: "legal-ip",   level: "medium", solution: "оригинальный мир, не привязка к IP" },
  { id: "visual",     level: "low",    solution: "принять скромный вид v0.1" },
  { id: "content",    level: "medium", solution: "список недопустимого контента" },
  { id: "llm-cost",   level: "high",   solution: "rules-first + кэш + квоты" },
  { id: "world-tick", level: "high",   solution: "hybrid: scheduled + on-demand" },
  { id: "load-v01",   level: "medium", solution: "100 игроков, не 1000" },
] as const;
```

---

## 18. Метрики успеха

```typescript
const METRICS = {
  goals: { v01: 100, v05: 1000, v10: 10000 },
  tracked: [
    "dau", "mau", "averageSessionMinutes",
    "retention1d", "retention7d", "retention30d",
    "reviews", "donationConversion",
  ],
  analytics: ["plausible", "custom-lightweight"],
} as const;
```

---

## 19. Приложения

### Приложение A. Структура проекта

```
popadanets/
├── client/          # html5 + css3 + vanilla-js (vite в полной версии)
├── server/          # nodejs + express + prisma (полная версия)
├── shared/
├── tests/
├── docs/
├── .github/workflows/
└── README.md
```

### Приложение B. Схема БД (Prisma) — полная версия

Модели: User, Session, Save, Character, NPC, NPCRelationship, WorldState, GameEvent, CanonEvent, CanonDeviation, WorldMemory, DialogueLog, EconomyPrice, Achievement, LegalConsent, PrivateWorld, ImportLog — см. паспорт v4.0 (полный листинг сохранён в истории документа).

### Приложение C. API v0.1 — полная версия

auth / character / world / dialogue / inventory / trade / combat / journal / saves / leaderboard / legal / account — см. паспорт v4.0.

### Приложение D. Модуль импорта миров (приватный, v1.0+)

Лицензионная матрица: CC0/CC-BY/CC-BY-SA — публикация разрешена; All-Rights-Reserved/custom — только приватно. Извлечение: имена/возраст/профессии/отношения/локации/канон — да; оригинальные тексты/иллюстрации/музыка/логотипы — нет. Изоляция: отдельная таблица, без публичного API, удаление по запросу за 24 часа.

### Приложение E. Сводка финальных решений

```typescript
const FINAL_DECISIONS = {
  worldTick: "hybrid",
  aiStrategy: "rules-first",
  accounts: { password: "argon2id", oauth: ["google"], gdpr: ["delete", "export"] },
  legalPages: ["privacy", "tos", "cookies", "age-check", "dmca"],
  scale: { v01: 100, v05: 1000, v10: 10000 },

  saves: { mode: "snapshot", slots: 5 },
  combat: { grid: [8, 8], initiative: "agility", crit: "luck", ai: "behavior-tree" },
  deathStory: { worldPersists: true, memoryPersists: true, inheritanceKept: false },

  ai: {
    provider: "anthropic", model: "claude-sonnet", maxTokens: 800,
    validate: "schema", fallback: "rules",
    budgetPerPlayerDay: 0.05, callsPerHour: 20,
  },

  economy: { formula: "base*(1+d/s)", taxes: { city: 0.05, trade: 0.10 } },
  worldMemory: { important: "permanent", minor: "30-days", spreadRadius: 3 },
  weather: { states: 7, changeEvery: 360 },
  intentParser: ["tokenize", "classify", "extract-slots", "validate", "execute"],
  worldV01: { type: "village", population: [50, 80], significantNpcs: 20 },
  offlineTime: { ratio: 1, maxCatchupDays: 7 },
  wikiImport: { enabled: false, from: "v1.0" },
  moderation: { userWorlds: false, aiFilter: true, reportButton: true },
  achievements: { enabled: true, rewards: ["cosmetic", "title"] },

  infra: {
    frontend: ["html", "css", "vanilla-js"],
    bundler: "vite",
    backend: "nodejs",
    db: "postgresql",
    orm: "prisma",
    queue: "bullmq+redis",
    monitoring: ["uptimerobot", "sentry"],
    cicd: "github-actions",
    analytics: ["plausible", "custom-events"],
  },
} as const;
```

---

## Статус документа

```typescript
const PASSPORT_STATUS = {
  version: "4.0",
  status: "final",
  ready: true,
  readyToStart: true,
} as const;
```
