import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Compass,
  Crown,
  Gauge,
  Landmark,
  LoaderCircle,
  Radio,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { DecisionOption, GameMode, GameState, ScenarioSummary } from "../shared/types";
import { campaignActForTurn } from "../shared/campaign";
import { api } from "./api";
import minister1917 from "./assets/characters/minister-1917.webp";
import modeSparksOverlay from "./assets/effects/mode-sparks-overlay.png";
import officer1917 from "./assets/characters/officer-stavka-1917.webp";
import lidia1917 from "./assets/characters/lidia-vetrova-1917.webp";
import belyaev1917 from "./assets/characters/rail-belyaev-1917.webp";
import novikova1917 from "./assets/characters/worker-novikova-1917.webp";
import vorontsova1917 from "./assets/characters/industrialist-vorontsova-1917.webp";
import staffCar1917 from "./assets/vehicles/staff-car-1917.webp";
import freightTrain1917 from "./assets/vehicles/freight-train-1917.webp";

type TextScale = "standard" | "large" | "xlarge";

type MusicTrack = {
  src: string;
  title: string;
  loop: boolean;
};

type IntroSlide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
  scene: "station" | "telegram" | "train" | "platform" | "departure" | "cabinet";
};

type SceneCharacterAsset = {
  src: string;
  alt: string;
  className: string;
  defaultSide: "left" | "right";
};

const sceneCharacterAssets: Record<string, SceneCharacterAsset> = {
  "minister-levitsky": { src: minister1917, alt: "Министр Аркадий Левицкий с красным портфелем", className: "minister", defaultSide: "right" },
  "colonel-argunov": { src: officer1917, alt: "Офицер Ставки с оперативной картой", className: "officer", defaultSide: "left" },
  "lidia-vetrova": { src: lidia1917, alt: "Журналистка и автокурьер Лидия Ветрова с телеграммами", className: "lidia", defaultSide: "left" },
  "rail-belyaev": { src: belyaev1917, alt: "Диспетчер Тимофей Беляев с маршрутными бирками", className: "belyaev", defaultSide: "left" },
  "worker-novikova": { src: novikova1917, alt: "Делегатка Анна Новикова с фабричным журналом", className: "worker", defaultSide: "left" },
  "industrialist-vorontsova": { src: vorontsova1917, alt: "Переговорщица Софья Воронцова с техническими чертежами", className: "industrialist", defaultSide: "right" },
};

const scenePropLabels: Record<string, string> = {
  "sealed-decree": "указ с печатью",
  "coded-telegram": "шифрованная телеграмма",
  "bread-cards": "хлебные карточки",
  "printing-press": "печатный станок",
  "field-telephone": "полевой телефон",
  samovar: "самовар",
  "staff-renault": "штабной автомобиль",
  "armored-car": "броневик",
  ambulance: "санитарная машина",
  "freight-train": "товарный эшелон",
  "yard-horse": "дворовая лошадь",
  "stray-dog": "бродячая собака",
  "station-crows": "вороны у станции",
};

const sceneLocationAliases: Record<string, string> = {
  "tauride-garden": "tauride-cabinet",
  "tauride-palace": "tauride-cabinet",
  "tauride-square": "muddy-station",
  "palace-square": "muddy-station",
  "city-square": "muddy-station",
  "telegraph-office": "station-telegraph-office",
  "railway-yard": "station-yard",
  "station-platform": "nikolaevsky-platform",
  "train-carriage": "freight-carriage",
  factory: "factory-yard",
};

const sceneCharacterAliases: Record<string, string> = {
  minister: "minister-levitsky",
  "minister-1917": "minister-levitsky",
  levitsky: "minister-levitsky",
  officer: "colonel-argunov",
  "officer-stavka": "colonel-argunov",
  argunov: "colonel-argunov",
  lidia: "lidia-vetrova",
  vetrova: "lidia-vetrova",
  belyaev: "rail-belyaev",
  dispatcher: "rail-belyaev",
  novikova: "worker-novikova",
  worker: "worker-novikova",
  vorontsova: "industrialist-vorontsova",
  industrialist: "industrialist-vorontsova",
};

function normalizeSceneLocation(id: string, trainStory: boolean): string {
  const normalized = sceneLocationAliases[id] ?? id;
  if (normalized === id && !sceneLocationAliases[id]) {
    return trainStory ? "nikolaevsky-platform" : "tauride-cabinet";
  }
  return normalized;
}

function normalizeSceneCharacter(id: string): string {
  return sceneCharacterAliases[id] ?? id;
}

const introDecks: Record<string, IntroSlide[]> = {
  "last-train-1917": [
    {
      id: "station",
      kicker: "Апрель 1917 · Петроград",
      title: "Город просыпается раньше поездов",
      body: "После отречения столица живёт по новым правилам, но железная дорога всё ещё считает старые минуты. На Николаевском вокзале осталось одно исправное окно для отправления.",
      note: "До рассвета: 01:12",
      scene: "station",
    },
    {
      id: "telegram",
      kicker: "Телеграмма без подписи",
      title: "Три списка легли на один стол",
      body: "Раненые ждут санитарный вагон. Городские котельные ждут уголь. Солдатская делегация требует добраться до штаба и быть услышанной.",
      note: "Один состав · три очереди",
      scene: "telegram",
    },
    {
      id: "train",
      kicker: "Материальное ограничение",
      title: "Поезд не может спасти всех",
      body: "Тоннаж, топливо и стрелка не знают компромиссов. Любое место, отданное одной очереди, становится задержкой для другой.",
      note: "Цена решения видна сразу",
      scene: "train",
    },
    {
      id: "platform",
      kicker: "Люди на перроне",
      title: "Порядок посадки станет вашей репутацией",
      body: "Диспетчер Тимофей Беляев отвечает за расписание. Лидия Ветрова отвечает за правду, которую увидит город. Оба запомнят не только приказ, но и способ разговора.",
      note: "Слова меняют очередь",
      scene: "platform",
    },
    {
      id: "departure",
      kicker: "Точка разлома",
      title: "Кому вы дадите этот путь?",
      body: "С этого момента мир будет отвечать задержками, встречными требованиями и памятью свидетелей. Здесь нет правильного списка — есть только тот, за который вы готовы отвечать.",
      note: "Начало хроники · 8–12 ходов",
      scene: "departure",
    },
  ],
  "russia-1917": [
    {
      id: "vacuum",
      kicker: "Март 1917 · Петроград",
      title: "Власть освободила место",
      body: "Император отрёкся. Временное правительство и Совет существуют одновременно, а улица проверяет каждое слово быстрее, чем кабинет успевает его напечатать.",
      note: "Точка расхождения",
      scene: "cabinet",
    },
    {
      id: "three-fronts",
      kicker: "Три давления",
      title: "Фронт, земля и хлеб требуют одного ответа",
      body: "Союзники ждут продолжения войны. Деревня ждёт передела. Город ждёт, что очередной приказ не останется бумагой.",
      note: "Ресурсов меньше обещаний",
      scene: "telegram",
    },
    {
      id: "people",
      kicker: "Живой кабинет",
      title: "У каждого решения будет голос",
      body: "Офицер принесёт карту, рабочая делегатка — список смен, журналистка — неудобный второй вопрос. Они знают только часть мира и могут отказаться вам верить.",
      note: "До двух активных персонажей",
      scene: "platform",
    },
    {
      id: "memory",
      kicker: "Память государства",
      title: "Последствия возвращаются",
      body: "Подписанный указ меняет не только показатели. Он создаёт обещания, долги, союзы и публичную версию того, что произошло.",
      note: "Старый выбор не исчезает",
      scene: "train",
    },
    {
      id: "first-choice",
      kicker: "Первый ход",
      title: "С чего начнётся ваша республика?",
      body: "Вы можете отдать свободный приказ или выбрать направление. ИИ не обязан сделать ваш план успешным — он обязан сделать ответ мира правдоподобным.",
      note: "Кампания · 25–40 ходов",
      scene: "cabinet",
    },
  ],
};

function introSlidesFor(scenarioId: string): IntroSlide[] {
  return introDecks[scenarioId] ?? introDecks["russia-1917"];
}

const musicTracks = {
  menu: { src: "/audio/music-00-main-menu.mp3", title: "Нераскрытая книга", loop: true },
  chronicle: { src: "/audio/music-01-chronicle-reflection.mp3", title: "Полуночная книга", loop: true },
  deadline: { src: "/audio/music-02-chronicle-deadline.mp3", title: "Телеграф без ответа", loop: true },
  cabinet: { src: "/audio/music-03-campaign-cabinet.mp3", title: "Вес указа", loop: true },
  street: { src: "/audio/music-04-campaign-street.mp3", title: "Телеграфная контора", loop: true },
  sandbox: { src: "/audio/music-05-sandbox-open-horizon.mp3", title: "Чернила на карте", loop: true },
  supply: { src: "/audio/music-06-crisis-supply.mp3", title: "Застрявший груз", loop: true },
  front: { src: "/audio/music-07-crisis-front.mp3", title: "Пограничный телеграф", loop: true },
  intrigue: { src: "/audio/music-08-intrigue-surveillance.mp3", title: "Стол землемера", loop: true },
  reveal: { src: "/audio/music-09-decision-reveal.mp3", title: "Закрывая книгу", loop: false },
  finale: { src: "/audio/music-10-fragile-victory.mp3", title: "Последняя телеграмма", loop: true },
} satisfies Record<string, MusicTrack>;

function selectMusic(game: GameState | null, busy: boolean): MusicTrack {
  if (!game) return musicTracks.menu;
  if (busy) return musicTracks.reveal;
  if (game.status !== "active") return musicTracks.finale;

  const economy = game.metrics.find((metric) => metric.id === "economy")?.value ?? 50;
  const army = game.metrics.find((metric) => metric.id === "army")?.value ?? 50;
  const stability = game.metrics.find((metric) => metric.id === "stability")?.value ?? 50;
  const hasIntrigue = Boolean(game.lastOutcome?.surprise) || game.lastOutcome?.scene.propIds.includes("coded-telegram");

  if (economy < 24) return musicTracks.supply;
  if (army < 24) return musicTracks.front;
  if (stability < 30 && hasIntrigue) return musicTracks.intrigue;
  if (game.mode === "chronicle") return game.turn % 3 === 0 ? musicTracks.deadline : musicTracks.chronicle;
  if (game.mode === "sandbox") return musicTracks.sandbox;
  return game.turn % 3 === 0 ? musicTracks.street : musicTracks.cabinet;
}

const modeOptions: Array<{ id: GameMode; title: string; duration: string; description: string }> = [
  { id: "chronicle", title: "Хроника", duration: "8–12 ходов", description: "Один кризис и плотный эпилог" },
  { id: "campaign", title: "Кампания", duration: "25–40 ходов", description: "Четыре акта и возвращающиеся последствия" },
  { id: "sandbox", title: "Песочница", duration: "Без лимита", description: "Свободная цель и продолжающийся мир" },
];

const fallbackScenarios: ScenarioSummary[] = [
  {
    id: "last-train-1917",
    title: "Последний поезд из Петрограда",
    period: "Апрель 1917",
    role: "Распорядитель эвакуационного эшелона",
    hook: "До рассвета уйдёт только один состав. Раненые, уголь и солдатская делегация требуют один и тот же путь.",
    difficulty: "Доступно",
    accent: "#c94c36",
    available: true,
  },
  {
    id: "russia-1917",
    title: "Россия после отречения",
    period: "Март 1917",
    role: "Глава Временного правительства",
    hook: "Империи больше нет. Война продолжается. У вас нет ни конституции, ни надёжной армии — только несколько недель доверия.",
    difficulty: "Безжалостно",
    accent: "#c94c36",
    available: true,
  },
  {
    id: "ussr-1985",
    title: "Союз на изломе",
    period: "Март 1985",
    role: "Генеральный секретарь",
    hook: "Экономика теряет темп, элиты не хотят перемен, а общество ещё не знает, что старый договор почти исчерпан.",
    difficulty: "Сложно",
    accent: "#b3975a",
    available: false,
  },
  {
    id: "rome-49bc",
    title: "Республика без Цезаря",
    period: "Январь 49 до н. э.",
    role: "Первый консул Рима",
    hook: "Легион перешёл Рубикон. Сенат расколот. Сохранить республику можно — но не теми решениями, которые уже вошли в историю.",
    difficulty: "Безжалостно",
    accent: "#8a6a43",
    available: false,
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

function Seal({ children }: { children: React.ReactNode }) {
  return <span className="seal">{children}</span>;
}

function TextScaleControl({ value, onChange }: { value: TextScale; onChange: (value: TextScale) => void }) {
  const options: Array<{ value: TextScale; label: string; title: string }> = [
    { value: "standard", label: "A", title: "Обычный крупный текст" },
    { value: "large", label: "A+", title: "Увеличенный текст" },
    { value: "xlarge", label: "A++", title: "Максимальный текст" },
  ];

  return (
    <div className="text-scale-control" role="group" aria-label="Размер текста">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MusicToggle({ muted, onToggle, trackTitle }: { muted: boolean; onToggle: () => void; trackTitle: string }) {
  const action = muted ? "Включить музыку" : "Выключить музыку";
  return (
    <button
      type="button"
      className={`music-toggle ${muted ? "muted" : ""}`}
      aria-label={`${action}. Сейчас: ${trackTitle}`}
      aria-pressed={muted}
      title={action}
      onClick={onToggle}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      <span className="visually-hidden">{action}</span>
    </button>
  );
}

function Landing({ scenarios, onStart, busy, textScale, onTextScale, musicMuted, onMusicToggle, trackTitle }: { scenarios: ScenarioSummary[]; onStart: (id: string, mode: GameMode) => void; busy: boolean; textScale: TextScale; onTextScale: (value: TextScale) => void; musicMuted: boolean; onMusicToggle: () => void; trackTitle: string }) {
  const [selected, setSelected] = useState(scenarios.find((item) => item.id === "last-train-1917")?.id ?? scenarios.find((item) => item.available)?.id ?? scenarios[0]?.id);
  const [mode, setMode] = useState<GameMode>("chronicle");
  const scenario = scenarios.find((item) => item.id === selected) ?? scenarios[0];
  const moveModeSparks = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 18;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 12;
    event.currentTarget.style.setProperty("--spark-x", `${x}px`);
    event.currentTarget.style.setProperty("--spark-y", `${y}px`);
    event.currentTarget.style.setProperty("--spark-x-reverse", `${x * -0.55}px`);
    event.currentTarget.style.setProperty("--spark-y-reverse", `${y * -0.55}px`);
  };
  const resetModeSparks = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--spark-x", "0px");
    event.currentTarget.style.setProperty("--spark-y", "0px");
    event.currentTarget.style.setProperty("--spark-x-reverse", "0px");
    event.currentTarget.style.setProperty("--spark-y-reverse", "0px");
  };

  return (
    <main className="landing shell">
      <nav className="topbar">
        <div className="brand"><Seal>ИИ</Seal><span>Переиграть историю</span></div>
        <div className="topbar-tools">
          <div className="topbar-note"><Radio size={15} /> Живой движок последствий</div>
          <MusicToggle muted={musicMuted} onToggle={onMusicToggle} trackTitle={trackTitle} />
          <TextScaleControl value={textScale} onChange={onTextScale} />
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>ALTERNATIVE HISTORY ENGINE</span><i /></div>
          <h1>История уже случилась.<br /><em>Но не здесь.</em></h1>
          <p className="lead">Вы управляете государством. Мир не ждёт выбора из меню: он отвечает на любое ваше решение — интересами людей, дефицитом ресурсов и непредвиденными союзами.</p>
          <div className="promise-row">
            <span><Sparkles size={17} /> Ни одного прописанного финала</span>
            <span><Compass size={17} /> Любое решение — допустимый ход</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="year year-a">1917</div>
          <div className="year year-b">1985</div>
          <div className="year year-c">?</div>
          <svg className="map-lines" viewBox="0 0 500 420">
            <path d="M45 205 C132 121, 187 122, 240 168 S339 243, 450 158" />
            <path d="M80 295 C159 247, 235 286, 281 245 S370 174, 439 271" />
            <path d="M142 76 C184 158, 147 229, 224 340" />
          </svg>
          <div className="artifact-card"><span>Точка расхождения</span><strong>Вы принимаете<br />первое решение</strong><i /></div>
        </div>
      </section>

      <section className="scenario-section">
        <div className="section-heading">
          <div><span className="index">01</span><h2>Выберите точку разлома</h2></div>
          <p>Первая короткая история доступна уже сейчас. Остальные покажут, как одна механика меняется вместе с миром.</p>
        </div>
        <div className="scenario-grid">
          {scenarios.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`scenario-card ${selected === item.id ? "selected" : ""} ${!item.available ? "locked" : ""}`}
              onClick={() => { setSelected(item.id); if (item.id === "last-train-1917") setMode("chronicle"); }}
              style={{ "--accent": item.accent } as React.CSSProperties}
            >
              <span className="card-number">0{index + 1}</span>
              <div className="scenario-era">{item.period}</div>
              <h3>{item.title}</h3>
              <p>{item.hook}</p>
              <div className="scenario-meta"><span>{item.role}</span><span>{item.difficulty}</span></div>
              {item.id === "last-train-1917" && <span className="recommended">Первая хроника</span>}
              {!item.available && <span className="coming">Скоро</span>}
              {selected === item.id && <span className="selection-mark"><ChevronRight size={18} /></span>}
            </button>
          ))}
        </div>
        <div className="mode-picker-stage" onPointerMove={moveModeSparks} onPointerLeave={resetModeSparks}>
          <div className="mode-sparks" aria-hidden="true">
            <img className="mode-sparks-a" src={modeSparksOverlay} alt="" />
            <img className="mode-sparks-b" src={modeSparksOverlay} alt="" />
          </div>
          <div className="mode-picker" aria-label="Режим игры">
            {modeOptions.map((item) => (
              <button type="button" key={item.id} className={mode === item.id ? "selected" : ""} onClick={() => setMode(item.id)}>
                <span>{item.duration}</span><strong>{item.title}</strong><small>{item.description}</small>
              </button>
            ))}
          </div>
        </div>
        <section className="world-portal" aria-labelledby="world-portal-title">
          <div className="world-portal-heading">
            <span className="index">02</span>
            <div><span className="portal-kicker">ЛАБОРАТОРИЯ МИРОВ</span><h2 id="world-portal-title">Одна механика — разные вселенные</h2></div>
          </div>
          <article className="world-portal-card" tabIndex={0} aria-label="Скоро: Дверь в Вальденгард">
            <div className="portal-card-front"><span className="portal-status">СКОРО · ДРУГОЙ МИР</span><strong>Дверь в Вальденгард</strong><p>Попаданец, эльфийская архивистка и орк-курьер спорят о том, какой договор переживёт ночь.</p><span className="portal-hint">Наведи, чтобы заглянуть <ArrowRight size={16} /></span></div>
            <div className="portal-card-reveal"><span>Сюжетная хроника · диалоги · новая палитра</span><b>Здесь слова меняют отношения, маршруты и память свидетелей.</b></div>
          </article>
        </section>
        <div className="launch-row">
          <div className="launch-brief"><ShieldAlert size={20} /><span><strong>Правило мира:</strong> ИИ не обязан делать ваш план успешным. Он обязан сделать ответ мира правдоподобным.</span></div>
          <button className="primary" disabled={!scenario?.available || busy} onClick={() => scenario && onStart(scenario.id, mode)}>
            {busy ? <LoaderCircle className="spin" size={20} /> : <Crown size={20} />}
            Начать правление
            <ArrowRight size={20} />
          </button>
        </div>
      </section>
    </main>
  );
}

function IntroVisual({ slide, scenarioId }: { slide: IntroSlide; scenarioId: string }) {
  const trainStory = scenarioId === "last-train-1917";
  const showTrain = trainStory && ["train", "departure", "telegram"].includes(slide.scene);
  const showBelyaev = trainStory && ["station", "platform", "departure"].includes(slide.scene);
  const showLidia = (trainStory && ["telegram", "platform"].includes(slide.scene)) || (!trainStory && slide.scene === "telegram");
  const showMinister = !trainStory && ["cabinet", "memory", "telegram"].includes(slide.scene);
  const showOfficer = !trainStory && slide.scene === "platform";
  const showWorker = !trainStory && slide.scene === "platform";
  const showIndustrialist = !trainStory && slide.scene === "train";
  const sceneLabels: Record<IntroSlide["scene"], string> = { station: "перрон", telegram: "телеграф", train: "состав", platform: "разговор", departure: "отправление", cabinet: "кабинет" };
  return (
    <div className={`intro-visual intro-visual-${slide.scene}`} aria-hidden="true">
      <div className="intro-visual-grid" />
      <div className="intro-visual-orbit intro-visual-orbit-one" />
      <div className="intro-visual-orbit intro-visual-orbit-two" />
      <span className="intro-visual-index">Сцена · {sceneLabels[slide.scene]}</span>
      {showTrain && <div className="intro-train"><img src={freightTrain1917} alt="" /></div>}
      {showBelyaev && <div className="intro-person intro-person-belyaev"><img src={belyaev1917} alt="" /></div>}
      {showLidia && <div className="intro-person intro-person-lidia"><img src={lidia1917} alt="" /></div>}
      {showMinister && <div className="intro-person intro-person-minister"><img src={minister1917} alt="" /></div>}
      {showOfficer && <div className="intro-person intro-person-officer"><img src={officer1917} alt="" /></div>}
      {showWorker && <div className="intro-person intro-person-worker"><img src={novikova1917} alt="" /></div>}
      {showIndustrialist && <div className="intro-person intro-person-industrialist"><img src={vorontsova1917} alt="" /></div>}
      {!trainStory && slide.scene === "telegram" && <div className="intro-pressure-tags"><span>ФРОНТ</span><span>ЗЕМЛЯ</span><span>ХЛЕБ</span></div>}
      <div className="intro-visual-line" />
      <span className="intro-visual-caption">{trainStory ? "Николаевский вокзал · живая хроника" : "Таврический дворец · живая история"}</span>
    </div>
  );
}

function IntroDeck({ scenarioId, mode, onCancel, onBegin, textScale, onTextScale, musicMuted, onMusicToggle, trackTitle }: { scenarioId: string; mode: GameMode; onCancel: () => void; onBegin: () => void; textScale: TextScale; onTextScale: (value: TextScale) => void; musicMuted: boolean; onMusicToggle: () => void; trackTitle: string }) {
  const slides = introSlidesFor(scenarioId);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const modeTitle = modeOptions.find((item) => item.id === mode)?.title ?? "Хроника";

  const scrollToSlide = (index: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    const track = trackRef.current;
    const slide = track?.children[next] as HTMLElement | undefined;
    if (track && slide) track.scrollTo({ top: slide.offsetTop, behavior: "smooth" });
    setActive(next);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); scrollToSlide(active + 1); }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); scrollToSlide(active - 1); }
      if (event.key === "Enter" && active === slides.length - 1) onBegin();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, slides.length, onBegin, onCancel]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientHeight) return;
    const index = Math.round(track.scrollTop / track.clientHeight);
    setActive(Math.max(0, Math.min(slides.length - 1, index)));
  };

  return (
    <main className="intro-deck">
      <header className="intro-header">
        <button type="button" className="intro-back" onClick={onCancel}><ArrowLeft size={18} /> К выбору истории</button>
        <div className="intro-identity"><Seal>ИИ</Seal><div><span>Вводная хроника</span><small>{modeTitle} · {active + 1} из {slides.length}</small></div></div>
        <div className="intro-tools"><MusicToggle muted={musicMuted} onToggle={onMusicToggle} trackTitle={trackTitle} /><TextScaleControl value={textScale} onChange={onTextScale} /></div>
      </header>
      <div className="intro-progress" aria-label={`Слайд ${active + 1} из ${slides.length}`}>
        <i style={{ width: `${((active + 1) / slides.length) * 100}%` }} />
      </div>
      <div className="intro-track" ref={trackRef} onScroll={onScroll} tabIndex={0} aria-label="Вводные слайды истории">
        {slides.map((slide, index) => (
          <article className={`intro-slide ${index === active ? "active" : ""}`} key={slide.id}>
            <div className="intro-slide-inner">
              <div className="intro-slide-copy">
                <span className="intro-slide-count">0{index + 1} / {slides.length}</span>
                <span className="intro-slide-kicker">{slide.kicker}</span>
                <h1>{slide.title}</h1>
                <p>{slide.body}</p>
                <div className="intro-slide-note"><span />{slide.note}</div>
              </div>
              <IntroVisual slide={slide} scenarioId={scenarioId} />
            </div>
          </article>
        ))}
      </div>
      <footer className="intro-footer">
        <button type="button" className="intro-skip" onClick={onBegin}>Пропустить вступление</button>
        <div className="intro-controls">
          <button type="button" className="intro-arrow" aria-label="Предыдущий слайд" disabled={active === 0} onClick={() => scrollToSlide(active - 1)}><ArrowLeft size={18} /></button>
          {active < slides.length - 1 ? (
            <button type="button" className="intro-next" onClick={() => scrollToSlide(active + 1)}>Дальше <ArrowRight size={18} /></button>
          ) : (
            <button type="button" className="intro-next intro-begin" onClick={onBegin}>Начать историю <Crown size={18} /></button>
          )}
          <button type="button" className="intro-arrow" aria-label="Следующий слайд" disabled={active === slides.length - 1} onClick={() => scrollToSlide(active + 1)}><ArrowRight size={18} /></button>
        </div>
      </footer>
    </main>
  );
}

function MetricGauge({ value, trend, label }: { value: number; trend: number; label: string }) {
  return (
    <div className="metric">
      <div className="metric-top"><span>{label}</span><strong>{value}</strong></div>
      <div className="metric-track"><i style={{ width: `${value}%` }} /></div>
      <small className={trend > 0 ? "up" : trend < 0 ? "down" : "flat"}>{trend > 0 ? `+${trend}` : trend === 0 ? "—" : trend} за ход</small>
    </div>
  );
}

function DecisionComposer({ options, onSubmit, busy }: { options: DecisionOption[]; onSubmit: (value: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setText("");
    setSelected(null);
  }, [options]);

  const pick = (option: DecisionOption) => {
    setSelected(option.id);
    setText(option.intent);
  };

  return (
    <section className="decision-panel">
      <div className="panel-title"><span>Ваш следующий ход</span><small>Решение не ограничено вариантами</small></div>
      <div className="decision-options">
        {options.map((option) => (
          <button key={option.id} className={selected === option.id ? "picked" : ""} onClick={() => pick(option)}>
            <div><span className={`risk risk-${option.risk}`}>{option.risk}</span><ArrowRight size={15} /></div>
            <strong>{option.title}</strong><p>{option.description}</p>
          </button>
        ))}
      </div>
      <div className="freeform">
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Или отдайте собственный приказ: что именно вы делаете, с кем договариваетесь, чем готовы рискнуть…" maxLength={700} />
        <div className="composer-footer"><span>{text.length}/700 · мир ответит последствиями</span><button disabled={busy || text.trim().length < 4} onClick={() => onSubmit(text)}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Разыграть ход</button></div>
      </div>
    </section>
  );
}

function Outcome({ state }: { state: GameState }) {
  const outcome = state.lastOutcome;
  if (!outcome) return null;
  return (
    <section className="outcome">
      <div className="outcome-kicker"><Radio size={15} /> Последствия предыдущего решения <span>{outcome.provider === "deepseek" ? "DeepSeek" : outcome.provider === "cloudflare" ? "Cloudflare AI" : outcome.source === "ai" ? "ИИ" : "симулятор"}</span></div>
      <h2>{outcome.headline}</h2>
      <p>{outcome.summary}</p>
      <blockquote>{outcome.dispatch}</blockquote>
      {outcome.surprise && <div className="surprise"><ShieldAlert size={20} /><div><strong>Непредвиденное последствие</strong><p>{outcome.surprise}</p></div></div>}
      <div className="reaction-grid">
        {outcome.reactions.map((reaction) => <div key={reaction.faction}><span className={`stance stance-${reaction.stance}`}>{reaction.stance}</span><strong>{reaction.faction}</strong><p>{reaction.text}</p></div>)}
      </div>
    </section>
  );
}

function Game({ state, onTurn, onExit, busy, textScale, onTextScale, musicMuted, onMusicToggle, trackTitle }: { state: GameState; onTurn: (action: string) => void; onExit: () => void; busy: boolean; textScale: TextScale; onTextScale: (value: TextScale) => void; musicMuted: boolean; onMusicToggle: () => void; trackTitle: string }) {
  const stability = state.metrics.find((metric) => metric.id === "stability")?.value ?? 50;
  const armyReaction = state.lastOutcome?.reactions.find((reaction) => reaction.faction.includes("Став"));
  const activeCharacters = (state.lastOutcome?.scene.activeCharacterIds ?? []).map(normalizeSceneCharacter);
  const sceneProps = state.lastOutcome?.scene.propIds ?? [];
  const trainStory = state.scenarioId === "last-train-1917";
  const rawSceneLocation = state.lastOutcome?.scene.locationId ?? (trainStory ? "nikolaevsky-platform" : "tauride-cabinet");
  const sceneLocation = normalizeSceneLocation(rawSceneLocation, trainStory);
  const showCar = sceneProps.includes("staff-renault");
  const showTrain = sceneProps.includes("freight-train");
  const modeTitle = modeOptions.find((mode) => mode.id === state.mode)?.title ?? "Кампания";
  const campaignAct = state.mode === "campaign" ? campaignActForTurn(state.turn) : null;
  const locationNames: Record<string, string> = {
    "nikolaevsky-platform": "Петроград · Николаевский перрон",
    "station-telegraph-office": "Петроград · телеграфная комната",
    "freight-carriage": "Путь на север · товарный вагон",
    "station-yard": "Петроград · стрелка у станции",
    "muddy-station": "Петроград · вокзальный перрон",
    "factory-yard": "Петроград · фабричный двор",
    "tauride-cabinet": "Петроград · Таврический дворец",
  };
  const requestedSceneCharacters = activeCharacters.filter((id) => sceneCharacterAssets[id]);
  const fallbackSceneCharacter = trainStory ? "rail-belyaev" : "minister-levitsky";
  const sceneCharacterIds = (requestedSceneCharacters.length ? requestedSceneCharacters : [fallbackSceneCharacter]).slice(0, 2);
  const sceneCharacters = sceneCharacterIds.map((id, index) => {
    const asset = sceneCharacterAssets[id];
    const side = sceneCharacterIds.length === 1 ? asset.defaultSide : index === 0 ? "left" : "right";
    return { id, asset, side };
  });
  const leadCharacter = sceneCharacters[0]?.id;
  const guestCaptions: Record<string, string> = {
    "minister-levitsky": "Кабинет ждёт вашего решения",
    "colonel-argunov": "Ставка требует ответа кабинета",
    "lidia-vetrova": trainStory ? "Лидия держит копию спорной телеграммы" : "Лидия привезла перехваченную телеграмму",
    "rail-belyaev": "Беляев считает минуты до стрелки",
    "worker-novikova": "Анна принесла список фабричных смен",
    "industrialist-vorontsova": "Софья ждёт встречного условия",
  };
  const guestCaption = guestCaptions[leadCharacter ?? ""] ?? (trainStory ? "Станция ждёт вашего решения" : "Кабинет ждёт вашего решения");
  const visibleSceneProps = sceneProps.map((id) => ({ id, label: scenePropLabels[id] })).filter((item): item is { id: string; label: string } => Boolean(item.label)).slice(0, 3);
  const locationLabel = locationNames[sceneLocation] ?? (trainStory ? "Петроград · железнодорожная линия" : "Петроград · Таврический дворец");
  const briefingText = state.turn === 1
    ? state.briefing
    : state.lastOutcome?.nextBriefing ?? `Прошло ${state.lastOutcome?.daysPassed ?? 7} дней. Решение вышло из кабинета и теперь проверяется исполнением на местах.`;
  return (
    <main className="game-shell">
      <header className="game-header">
        <button className="icon-button" onClick={onExit} title="К сценариям"><ArrowLeft size={19} /></button>
        <div className="game-identity"><Seal>ИИ</Seal><div><span>{state.scenarioTitle}</span><small>{state.role} · {modeTitle}</small></div></div>
        <div className="game-date"><Clock3 size={17} /><span>{formatDate(state.date)}</span><b>Ход {state.turn}</b><MusicToggle muted={musicMuted} onToggle={onMusicToggle} trackTitle={trackTitle} /><TextScaleControl value={textScale} onChange={onTextScale} /></div>
      </header>

      <div className="game-layout">
        <aside className="state-rail">
          <div className="rail-heading"><Gauge size={17} /> Состояние страны</div>
          <div className="metrics-list">{state.metrics.map((metric) => <MetricGauge key={metric.id} {...metric} />)}</div>
          <div className="factions">
            <div className="rail-heading"><Landmark size={17} /> Центры силы</div>
            {state.factions.map((faction) => <div className="faction" key={faction.name}><div><strong>{faction.name}</strong><span>{faction.mood}</span></div><b>{faction.power}</b></div>)}
          </div>
          <div className="objective"><span>Цель правления</span><p>{state.objective}</p></div>
        </aside>

        <div className="main-stage">
          <section className={`scene-tableau ${stability < 30 ? "scene-unrest" : ""} ${trainStory ? "scene-train-world" : ""} scene-location-${sceneLocation}`} aria-label={`Живая сцена: ${locationLabel}`}>
            <div className="scene-grid" />
            <div className="scene-window"><i /><i /><i /></div>
            <div className="scene-map"><span>ПЕТРОГРАД</span><i /><i /><i /></div>
            <div className="scene-desk"><span /><span /></div>
            {showCar && <div className="scene-vehicle"><img src={staffCar1917} alt="Штабной автомобиль у входа" /></div>}
            {showTrain && <div className="scene-train"><img src={freightTrain1917} alt="Товарный паровоз у станции" /></div>}
            {sceneCharacters.map(({ id, asset, side }) => (
              <div key={id} className={`scene-character scene-character-${asset.className} scene-slot-${side} ${id === "colonel-argunov" ? `stance-${armyReaction?.stance ?? "настороженность"}` : ""}`} data-character-id={id}>
                <img src={asset.src} alt={asset.alt} />
              </div>
            ))}
            {visibleSceneProps.length > 0 && <div className="scene-props" aria-label="Предметы сцены">{visibleSceneProps.map((prop) => <span key={prop.id}>{prop.label}</span>)}</div>}
            <div className={`scene-caption ${sceneCharacters.length > 1 ? "scene-caption-dialogue" : ""}`}>
              <span>{locationLabel}</span>
              <strong>{guestCaption}</strong>
            </div>
            <div className="scene-live" title={state.lastOutcome?.scene.atmosphere ?? undefined}><i /> Живая сцена</div>
          </section>
          <section className="briefing">
            <div className="briefing-index">{String(state.turn).padStart(2, "0")}</div>
            <div>
              <span className="eyebrow-small">Оперативная обстановка</span>
              {campaignAct && <div className="campaign-wayfinding" aria-label={`Кампания, акт ${campaignAct.number}: ${campaignAct.question}`}>
                <div className="campaign-wayfinding-meta"><span>Кампания · акт {campaignAct.number}</span><small>{campaignAct.range}</small></div>
                <strong>{campaignAct.title}</strong>
                <p>{campaignAct.question} <em>{campaignAct.focus}</em></p>
              </div>}
              <h1>{state.turn === 1 ? "Власть существует только до первого неверного решения" : "Решение вышло из кабинета"}</h1><p>{briefingText}</p>
            </div>
          </section>
          <Outcome state={state} />
          {state.status === "active" ? <DecisionComposer options={state.options} onSubmit={onTurn} busy={busy} /> : <div className="end-state"><h2>{state.status === "victory" ? "Новый порядок устоял" : "Государство распалось"}</h2><p>Эта ветка истории завершена. Можно вернуться к точке разлома и попробовать другую стратегию.</p><button onClick={onExit}><RotateCcw size={18} /> Начать заново</button></div>}
        </div>

        <aside className="chronicle">
          <div className="rail-heading"><BookOpen size={17} /> Ваша хроника</div>
          <div className="timeline">
            {[...state.timeline].reverse().map((entry) => <article key={entry.id} className={`timeline-entry ${entry.kind}`}><time>{formatDate(entry.date)}</time><strong>{entry.title}</strong><p>{entry.description}</p></article>)}
          </div>
        </aside>
      </div>
      {busy && <div className="world-thinking"><div><LoaderCircle className="spin" /><strong>Мир отвечает на ваше решение</strong><span>Фракции пересчитывают интересы. История ищет новую траекторию.</span></div></div>}
    </main>
  );
}

export default function App() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>(fallbackScenarios);
  const [game, setGame] = useState<GameState | null>(null);
  const [intro, setIntro] = useState<{ scenarioId: string; mode: GameMode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [musicMuted, setMusicMuted] = useState(() => localStorage.getItem("living-history-music-muted") === "true");
  const [textScale, setTextScale] = useState<TextScale>(() => {
    const saved = localStorage.getItem("living-history-text-scale");
    return saved === "large" || saved === "xlarge" ? saved : "standard";
  });

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => undefined);
    const saved = localStorage.getItem("living-history-session");
    if (saved) api.getGame(saved).then(setGame).catch(() => localStorage.removeItem("living-history-session"));
  }, []);

  const start = async (id: string, mode: GameMode) => {
    setIntro(null);
    setBusy(true); setError(null);
    try {
      const state = await api.createGame(id, mode);
      localStorage.setItem("living-history-session", state.id);
      setGame(state);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать игру"); }
    finally { setBusy(false); }
  };

  const playTurn = async (action: string) => {
    if (!game) return;
    setBusy(true); setError(null);
    try { setGame(await api.playTurn(game.id, action)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Мир не ответил на ход"); }
    finally { setBusy(false); }
  };

  const exit = () => { localStorage.removeItem("living-history-session"); setGame(null); setError(null); };
  const requestStart = (scenarioId: string, mode: GameMode) => {
    setIntro({ scenarioId, mode: scenarioId === "last-train-1917" ? "chronicle" : mode });
  };
  const changeTextScale = (value: TextScale) => {
    setTextScale(value);
    localStorage.setItem("living-history-text-scale", value);
  };
  const activeTrack = useMemo(() => selectMusic(game, busy), [game, busy]);
  const toggleMusic = () => {
    const nextMuted = !musicMuted;
    setMusicMuted(nextMuted);
    localStorage.setItem("living-history-music-muted", String(nextMuted));
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = nextMuted;
    if (nextMuted) audio.pause();
    else void audio.play().catch(() => undefined);
  };
  const unlockMusic = () => {
    const audio = audioRef.current;
    if (!musicMuted && audio?.paused) void audio.play().catch(() => undefined);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.22;
    audio.muted = musicMuted;
    audio.loop = activeTrack.loop;
    audio.currentTime = 0;
    if (!musicMuted) void audio.play().catch(() => undefined);
  }, [activeTrack.src, activeTrack.loop, musicMuted]);

  const content = useMemo(() => game
    ? <Game state={game} onTurn={playTurn} onExit={exit} busy={busy} textScale={textScale} onTextScale={changeTextScale} musicMuted={musicMuted} onMusicToggle={toggleMusic} trackTitle={activeTrack.title} />
    : intro
      ? <IntroDeck scenarioId={intro.scenarioId} mode={intro.mode} onCancel={() => setIntro(null)} onBegin={() => void start(intro.scenarioId, intro.mode)} textScale={textScale} onTextScale={changeTextScale} musicMuted={musicMuted} onMusicToggle={toggleMusic} trackTitle={activeTrack.title} />
      : <Landing scenarios={scenarios} onStart={requestStart} busy={busy} textScale={textScale} onTextScale={changeTextScale} musicMuted={musicMuted} onMusicToggle={toggleMusic} trackTitle={activeTrack.title} />,
  [game, intro, scenarios, busy, textScale, musicMuted, activeTrack]);

  return <div className={`app-root text-scale-${textScale}`} onPointerDown={unlockMusic}><audio ref={audioRef} src={activeTrack.src} preload="auto" aria-hidden="true" />{content}{error && <div className="error-toast"><ShieldAlert size={18} /><span>{error}</span><button onClick={() => setError(null)}>×</button></div>}</div>;
}
