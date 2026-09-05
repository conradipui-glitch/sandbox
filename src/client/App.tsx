import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Clock3,
  Crown,
  Gauge,
  Landmark,
  LoaderCircle,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { DecisionOption, GameMode, GameState, ProductAnalyticsOverview, ScenarioSummary, TurnSubmission } from "../shared/types";
import { campaignActForTurn } from "../shared/campaign";
import { api } from "./api";
import minister1917 from "./assets/characters/minister-1917.webp";
import officer1917 from "./assets/characters/officer-stavka-1917.webp";
import lidia1917 from "./assets/characters/lidia-vetrova-1917.webp";
import belyaev1917 from "./assets/characters/rail-belyaev-1917.webp";
import novikova1917 from "./assets/characters/worker-novikova-1917.webp";
import vorontsova1917 from "./assets/characters/industrialist-vorontsova-1917.webp";
import staffCar1917 from "./assets/vehicles/staff-car-1917.webp";
import freightTrain1917 from "./assets/vehicles/freight-train-1917.webp";
import florenceWorkshop1512 from "./assets/backgrounds/florence-workshop-1512.webp";
import florenceGuildhall1512 from "./assets/backgrounds/florence-guildhall-1512.webp";
import florencePiazza1512 from "./assets/backgrounds/florence-piazza-1512.webp";
import florenceJuliano1512 from "./assets/characters/florence-juliano-1512.webp";
import florenceGuildmaster1512 from "./assets/characters/florence-guildmaster-1512.webp";
import florenceSecretary1512 from "./assets/characters/florence-secretary-1512.webp";

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
  "florence-juliano": { src: florenceJuliano1512, alt: "Ученик Джулиано с кистью и палитрой", className: "florence-juliano", defaultSide: "left" },
  "florence-guildmaster": { src: florenceGuildmaster1512, alt: "Старшина флорентийской гильдии с книгой договоров", className: "florence-guildmaster", defaultSide: "right" },
  "florence-secretary": { src: florenceSecretary1512, alt: "Секретарь кардинала с договором и пером", className: "florence-secretary", defaultSide: "right" },
};

const florenceBackgroundAssets: Record<string, string> = {
  "florence-workshop": florenceWorkshop1512,
  "florence-guildhall": florenceGuildhall1512,
  "florence-square": florencePiazza1512,
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

const knownSceneLocations = new Set([
  "nikolaevsky-platform",
  "station-telegraph-office",
  "freight-carriage",
  "station-yard",
  "muddy-station",
  "factory-yard",
  "tauride-cabinet",
  "florence-workshop",
  "florence-guildhall",
  "florence-square",
]);

function normalizeSceneLocation(id: string, trainStory: boolean, florenceStory = false): string {
  const normalized = sceneLocationAliases[id] ?? id;
  if (knownSceneLocations.has(normalized)) return normalized;
  return trainStory ? "nikolaevsky-platform" : florenceStory ? "florence-workshop" : "tauride-cabinet";
}

function normalizeSceneCharacter(id: string): string {
  return sceneCharacterAliases[id] ?? id;
}

const introDecks: Record<string, IntroSlide[]> = {
  "florence-workshop": [
    { id: "workshop", kicker: "Флоренция · 17 апреля 1512 года", title: "Сегодня вы — хозяин мастерской", body: "Вы художник. Вместе с учениками вы расписываете большую стену для кардинала Веттори — богатого церковного заказчика. На стене уже видны фигуры людей, но небо над ними ещё не закончено. Сегодня утром кардинал неожиданно сообщил: вечером он приведёт гостей смотреть работу.", note: "Показ назначен раньше, чем вы рассчитывали", scene: "cabinet" },
    { id: "people", kicker: "Джулиано Белли · ваш ученик", title: "«Мастер, я ещё могу работать»", body: "Джулиано девятнадцать. Со вчерашнего вечера у него жар, а руки дрожат от болезни и долгой работы. Он боится потерять заработок и снова берётся за кисть. Именно он рисует небо. Если отпустить его к врачу, эту работу придётся закончить вам или другому ученику.", note: "Джулиано заболел. До утра ученики ждут зарплату", scene: "platform" },
    { id: "condition", kicker: "Бартоломео Риччи · старшина гильдии", title: "Краску оплатили. Но её не хватает", body: "Риччи представляет гильдию — объединение городских художников. Она купила для вас синий пигмент в долг. В деревянном ящике должна была быть полная партия баночек с краской, но пришла лишь часть. На крышке сломана восковая печать дома кардинала: ящик вскрывали по дороге. Риччи хочет сверить доставку и понять, за что теперь платить.", note: "След есть. Кто виноват — пока неизвестно", scene: "train" },
    { id: "contract", kicker: "Лука Орсини · секретарь кардинала", title: "Деньги сейчас — но без вашего имени", body: "Под вечер приходит Лука. Он ведёт дела кардинала и приносит деньги: часть оплаты можно получить сегодня. Есть условие: на готовой стене должно остаться только имя кардинала как покровителя искусств. Имени художника не будет. Лука ждёт, согласитесь ли вы. Деньги помогли бы заплатить ученикам и купить краску.", note: "Заказчик предлагает оплату до завершения работы", scene: "telegram" },
    { id: "signature", kicker: "В мастерской · вечер", title: "Лука ставит сумку на стол", body: "«Что мне передать кардиналу?» — спрашивает он. Джулиано замер у стены с кистью в руке. Рядом стоит недоставленный ящик с краской. Вам нужно решить, что делать с заказом и людьми до утра. Начните с разговора, предложите свои условия или сделайте то, чего от вас сейчас никто не ждёт.", note: "Вы — хозяин мастерской. Первый ответ за вами", scene: "departure" },
  ],
  "last-train-1917": [
    {
      id: "station",
      kicker: "Апрель 1917 · Петроград",
      title: "Вы отвечаете за последний поезд",
      body: "Петроград, ночь на Николаевском вокзале. Вас назначили распорядителем эвакуации: вы решаете, кого и что посадить в поезд. Исправный паровоз остался один. До рассвета свободен только один путь, после его закроют военные.",
      note: "До рассвета: 01:12",
      scene: "station",
    },
    {
      id: "telegram",
      kicker: "Телеграмма без подписи",
      title: "Три списка легли на один стол",
      body: "Врач просит вагоны для раненых: их нужно отвезти в госпиталь. Рядом рабочие охраняют уголь для котельных — без него город останется без тепла. Солдаты требуют довезти своих представителей до военного штаба. Каждая группа уверена, что ждать должны другие.",
      note: "Один состав · три очереди",
      scene: "telegram",
    },
    {
      id: "train",
      kicker: "Тимофей Беляев · диспетчер станции",
      title: "Поезд не может спасти всех",
      body: "Беляев показывает вам схему вагонов. Если взять весь уголь, места для всех раненых не останется. Если задержать отправление, можно потерять доступ к пути. Он умеет собрать состав, но выбрать пассажиров и груз должны вы.",
      note: "Места и времени на всех не хватит",
      scene: "train",
    },
    {
      id: "platform",
      kicker: "Люди на перроне",
      title: "Журналистка записывает ваш ответ",
      body: "Лидия Ветрова пришла на станцию с блокнотом. Она хочет рассказать городу, кого отправили и кого оставили. Беляев спрашивает вас о посадке, а Лидия — почему именно эти люди должны ехать первыми. Разговор слышат стоящие рядом пассажиры.",
      note: "Лидия Ветрова · журналистка",
      scene: "platform",
    },
    {
      id: "departure",
      kicker: "Точка разлома",
      title: "«С кого начинаем посадку?»",
      body: "Беляев ждёт у паровоза. Врач поднимает руку, чтобы привлечь ваше внимание; солдаты спорят у вагона с углём. Можно сразу распорядиться о посадке, поговорить с людьми или придумать, как разделить места. Времени на первый ответ остаётся всё меньше.",
      note: "Первое решение за вами",
      scene: "departure",
    },
  ],
  "russia-1917": [
    {
      id: "vacuum",
      kicker: "Март 1917 · Петроград",
      title: "Вы возглавили правительство",
      body: "Николай II отказался от престола. Вас назначили главой Временного правительства. Вам нужно наладить снабжение страны и подготовить выборы. Но рабочие и солдаты создали собственный Совет: без его поддержки ваши приказы могут не исполнить.",
      note: "Петроград · март 1917 года",
      scene: "cabinet",
    },
    {
      id: "three-fronts",
      kicker: "Три давления",
      title: "Фронт, земля и хлеб требуют одного ответа",
      body: "Россия продолжает воевать. Солдаты устали, в деревнях требуют передать помещичью землю крестьянам, в городах стоят очереди за хлебом. Британия и Франция, союзники России, хотят, чтобы вы продолжали войну. Уступка одной стороне может вызвать протест другой.",
      note: "Ресурсов меньше обещаний",
      scene: "telegram",
    },
    {
      id: "people",
      kicker: "Живой кабинет",
      title: "В приёмной уже ждут люди",
      body: "Полковник Аргунов пришёл от военного командования: ему нужны снабжение и дисциплина. Анна Новикова представляет рабочих и требует хлеба и понятных условий труда. Журналистка Лидия Ветрова собирается напечатать ваш первый ответ. Каждый рассчитывает услышать обещание именно для себя.",
      note: "Аргунов · военный. Новикова · делегатка рабочих. Ветрова · журналистка",
      scene: "platform",
    },
    {
      id: "memory",
      kicker: "Память государства",
      title: "Подписать приказ ещё недостаточно",
      body: "На столе лежит просьба отправить хлеб в Петроград. Для этого железнодорожникам нужны уголь и свободные вагоны, которые уже требует армия. Ваш министр Левицкий предлагает созвать обе стороны: прежде чем обещать людям хлеб, нужно решить, кто уступит транспорт.",
      note: "Аркадий Левицкий · министр вашего правительства",
      scene: "train",
    },
    {
      id: "first-choice",
      kicker: "Первый ход",
      title: "С чего начнётся ваша республика?",
      body: "Левицкий придвигает к вам чистый лист. За дверью спорят посланники армии и рабочих. Страна ждёт вашего первого решения: начать переговоры о мире, заняться землёй, договориться с Советом — или предложить свой план.",
      note: "Ваше правительство начинает работу",
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
  florenceThreshold: { src: "/audio/music-11-florence-threshold.mp3", title: "Пыль в солнечном луче", loop: true },
  florenceWorkshop: { src: "/audio/music-12-florence-workshop-night.mp3", title: "Ночь мастерской", loop: true },
  florenceGuildhall: { src: "/audio/music-13-florence-guildhall.mp3", title: "Книга гильдии", loop: true },
  florenceDeadline: { src: "/audio/music-14-florence-deadline.mp3", title: "Колокола до рассвета", loop: true },
  florenceReveal: { src: "/audio/music-15-florence-decision-reveal.mp3", title: "Цена подписи", loop: false },
  florenceFinale: { src: "/audio/music-16-florence-dawn-finale.mp3", title: "Свет на фреске", loop: true },
} satisfies Record<string, MusicTrack>;

function selectMusic(game: GameState | null, busy: boolean, introScenarioId?: string): MusicTrack {
  if (!game) return introScenarioId === "florence-workshop" ? musicTracks.florenceThreshold : musicTracks.menu;

  if (game.scenarioId === "florence-workshop") {
    if (busy) return musicTracks.florenceReveal;
    if (game.status !== "active") return musicTracks.florenceFinale;

    const location = game.lastOutcome?.scene.locationId;
    if (location === "florence-guildhall") return musicTracks.florenceGuildhall;
    if (location === "florence-square" || game.turn >= 4) return musicTracks.florenceDeadline;
    return musicTracks.florenceWorkshop;
  }

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
    id: "florence-workshop",
    title: "Флоренция: Мастерская под давлением",
    period: "1512 · Флоренция",
    role: "Мастер городской мастерской",
    hook: "Кардинал требует роспись до заката. Подмастерье болен, гильдия ждёт взнос, а деньги предлагают ценой вашей подписи.",
    difficulty: "Доступно",
    accent: "#ba7650",
    available: true,
  },
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
  const [selected, setSelected] = useState(scenarios.find((item) => item.id === "florence-workshop")?.id ?? scenarios.find((item) => item.id === "last-train-1917")?.id ?? scenarios.find((item) => item.available)?.id ?? scenarios[0]?.id);
  const [mode, setMode] = useState<GameMode>("chronicle");

  return (
    <main className={`landing shell ${selected === "florence-workshop" ? "landing-florence" : ""}`}>
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
          <p className="lead">Выберите историю и станьте её участником. Разговаривайте с людьми, принимайте решения и пишите свои действия — от вашего ответа зависит, что случится дальше.</p>
        </div>
      </section>

      <section className="scenario-section">
        <div className="section-heading">
          <div><span className="index">01</span><h2>Выберите точку разлома</h2></div>
          <p>Нажмите «Играть» на нужной истории. Перед первым решением вы познакомитесь с местом и персонажами.</p>
        </div>
        <div className="scenario-grid">
          {scenarios.map((item, index) => (
            <article
              key={item.id}
              className={`scenario-card ${selected === item.id ? "selected" : ""} ${!item.available ? "locked" : ""}`}
              style={{ "--accent": item.accent } as React.CSSProperties}
            >
              <span className="card-number">0{index + 1}</span>
              <div className="scenario-era">{item.period}</div>
              <h3>{item.title}</h3>
              <p>{item.hook}</p>
              <div className="scenario-meta"><span>{item.role}</span><span>{item.difficulty}</span></div>
              {["last-train-1917", "florence-workshop"].includes(item.id) && <span className="recommended">Доступна для теста</span>}
              {!item.available && <span className="coming">Скоро</span>}
              {item.available && <button type="button" className="primary scenario-play" disabled={busy} onClick={() => { setSelected(item.id); onStart(item.id, ["last-train-1917", "florence-workshop"].includes(item.id) ? 'chronicle' : mode); }}>Играть <span className="visually-hidden">— {item.title}</span><ArrowRight size={18} /></button>}
              {item.id === 'russia-1917' && <label className="scenario-mode">Длина истории<select value={mode} onChange={event => setMode(event.target.value as GameMode)}><option value="chronicle">Короткая: 8–12 ходов</option><option value="campaign">Кампания: 25–40 ходов</option><option value="sandbox">Без завершения</option></select></label>}
            </article>
          ))}
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
      </section>
    </main>
  );
}

function IntroVisual({ slide, scenarioId }: { slide: IntroSlide; scenarioId: string }) {
  const trainStory = scenarioId === "last-train-1917";
  const florenceStory = scenarioId === "florence-workshop";
  const showTrain = trainStory && ["train", "departure", "telegram"].includes(slide.scene);
  const showBelyaev = trainStory && ["station", "platform", "departure"].includes(slide.scene);
  const showLidia = (trainStory && ["telegram", "platform"].includes(slide.scene)) || (!trainStory && !florenceStory && slide.scene === "telegram");
  const showMinister = !trainStory && !florenceStory && ["cabinet", "memory", "telegram"].includes(slide.scene);
  const showOfficer = !trainStory && !florenceStory && slide.scene === "platform";
  const showWorker = !trainStory && !florenceStory && slide.scene === "platform";
  const showIndustrialist = !trainStory && !florenceStory && slide.scene === "train";
  const sceneLabels: Record<IntroSlide["scene"], string> = { station: "перрон", telegram: "телеграф", train: "состав", platform: "разговор", departure: "отправление", cabinet: "кабинет" };
  const florenceSceneLabels: Record<IntroSlide["scene"], string> = { station: "площадь", telegram: "условия", train: "пигмент", platform: "ученики", departure: "утро", cabinet: "мастерская" };
  const florencePortrait = slide.id === 'people' ? florenceJuliano1512 : slide.id === 'condition' ? florenceGuildmaster1512 : ['contract', 'signature'].includes(slide.id) ? florenceSecretary1512 : null;
  const florenceBackdrop = slide.id === 'condition' ? florenceGuildhall1512 : slide.id === 'contract' ? florencePiazza1512 : florenceWorkshop1512;
  return (
    <div className={`intro-visual intro-visual-${slide.scene} ${florenceStory ? "intro-visual-florence" : ""}`} aria-hidden="true">
      {florenceStory && <img className="florence-location-background" src={florenceBackdrop} alt="" />}
      <div className="intro-visual-grid" />
      <div className="intro-visual-orbit intro-visual-orbit-one" />
      <div className="intro-visual-orbit intro-visual-orbit-two" />
      <span className="intro-visual-index">Сцена · {(florenceStory ? florenceSceneLabels : sceneLabels)[slide.scene]}</span>
      {showTrain && <div className="intro-train"><img src={freightTrain1917} alt="" /></div>}
      {showBelyaev && <div className="intro-person intro-person-belyaev"><img src={belyaev1917} alt="" /></div>}
      {showLidia && <div className="intro-person intro-person-lidia"><img src={lidia1917} alt="" /></div>}
      {showMinister && <div className="intro-person intro-person-minister"><img src={minister1917} alt="" /></div>}
      {showOfficer && <div className="intro-person intro-person-officer"><img src={officer1917} alt="" /></div>}
      {showWorker && <div className="intro-person intro-person-worker"><img src={novikova1917} alt="" /></div>}
      {showIndustrialist && <div className="intro-person intro-person-industrialist"><img src={vorontsova1917} alt="" /></div>}
      {florenceStory && florencePortrait && <div className="intro-person intro-person-florence-juliano"><img src={florencePortrait} alt="" /></div>}
      {!trainStory && !florenceStory && slide.scene === "telegram" && <div className="intro-pressure-tags"><span>ФРОНТ</span><span>ЗЕМЛЯ</span><span>ХЛЕБ</span></div>}
      <div className="intro-visual-line" />
      <span className="intro-visual-caption">{trainStory ? "Николаевский вокзал · живая хроника" : florenceStory ? "Флоренция · ночь мастерской" : "Таврический дворец · живая история"}</span>
    </div>
  );
}

function IntroDeck({ scenarioId, mode, onCancel, onBegin, textScale, onTextScale, musicMuted, onMusicToggle, trackTitle }: { scenarioId: string; mode: GameMode; onCancel: () => void; onBegin: () => void; textScale: TextScale; onTextScale: (value: TextScale) => void; musicMuted: boolean; onMusicToggle: () => void; trackTitle: string }) {
  const slides = introSlidesFor(scenarioId);
  const florenceStory = scenarioId === "florence-workshop";
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
    const index = Array.from(track.children).reduce((closest, element, index, children) =>
      Math.abs((element as HTMLElement).offsetTop - track.scrollTop) < Math.abs((children[closest] as HTMLElement).offsetTop - track.scrollTop) ? index : closest, 0);
    setActive(Math.max(0, Math.min(slides.length - 1, index)));
  };

  return (
    <main className={`intro-deck ${florenceStory ? "intro-deck-florence" : ""}`}>
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

function MetricGauge({ value, trend, label, initial, reason }: { value: number; trend: number; label: string; initial: boolean; reason?: string }) {
  return (
    <div className="metric">
      <div className="metric-top"><span>{label}</span><strong>{value}<small> / 100</small></strong></div>
      <div className="metric-track"><i style={{ width: `${value}%` }} /></div>
      <small className={initial ? 'flat' : trend > 0 ? "up" : trend < 0 ? "down" : "flat"}>{initial ? 'Начальное состояние' : trend === 0 ? 'Без изменений' : `${trend > 0 ? '+' : ''}${trend} после вашего решения`}</small>
      {!initial && trend !== 0 && reason && <p className="metric-reason">{reason}</p>}
    </div>
  );
}

function DecisionComposer({ options, onSubmit, busy }: { options: DecisionOption[]; onSubmit: (submission: TurnSubmission) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setText("");
    setSelected(null);
  }, [options]);

  const pick = (option: DecisionOption) => {
    const intent = option.intent.trim();
    const genericIntent = /^(полное\s+действие|действие|команда|action|full\s+action)$/i.test(intent);
    setSelected(option.id);
    setText(genericIntent ? `${option.title}: ${option.description}` : intent);
  };

  return (
    <section className="decision-panel">
      <div className="panel-title"><span>Что вы сделаете?</span></div>
      <details className="play-help"><summary>Как выбрать или написать свой ход</summary><p>Кнопка подставит действие в поле ниже. Можно изменить его целиком или добавить свою идею: ведущий прочитает весь текст. Затем нажмите «Разыграть ход».</p><p>Риск — оценка возможных потерь времени, денег или доверия. Это не вероятность успеха. В описании каждого варианта указано, чем вы рискуете.</p></details>
      <div className="decision-options">
        {options.map((option) => (
          <button key={option.id} className={selected === option.id ? "picked" : ""} onClick={() => pick(option)}>
            <div><span className={`risk risk-${option.risk}`}>Риск: {option.risk}</span><ArrowRight size={15} /></div>
            <strong>{option.title}</strong><p>{option.description}</p>
            {option.voice && <small className="option-voice">{option.voice}</small>}
          </button>
        ))}
      </div>
      <div className="freeform">
        <label className="freeform-label" htmlFor="player-action">Ваше действие — можно написать что угодно своими словами</label>
        <textarea id="player-action" value={text} onChange={(event) => { setText(event.target.value); setSelected(null); }} placeholder="Что вы делаете или говорите? К кому обращаетесь?" maxLength={700} />
        <div className="composer-footer"><span>{text.length}/700 · мир ответит последствиями</span><button disabled={busy || text.trim().length < 4} onClick={() => onSubmit({ action: text, source: selected ? "prepared" : "freeform", optionId: selected ?? undefined })}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Разыграть ход</button></div>
      </div>
    </section>
  );
}

function Outcome({ state }: { state: GameState }) {
  const outcome = state.lastOutcome;
  if (!outcome) return null;
  return (
    <section className="outcome" id="turn-result" tabIndex={-1} data-provider={outcome.provider} data-tokens={outcome.usage?.totalTokens} data-scene={state.turn}>
      <div className="outcome-kicker"><Radio size={15} /> {state.status === 'active' ? 'После вашего решения' : 'Чем закончилась история'}</div>
      <h2>{outcome.headline}</h2>
      {state.scenarioId === 'florence-workshop'
        ? outcome.summary.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)
        : <p>{outcome.summary}</p>}
      {outcome.resolution && <div className={`action-resolution action-resolution-${outcome.resolution.status}`}>
        <span>{outcome.resolution.status === "executed" ? "Что удалось сделать" : outcome.resolution.status === "conditional" ? "О чём ещё нужно договориться" : "Что помешало"}</span>
        <strong>{outcome.resolution.explanation}</strong>
        {outcome.resolution.requirement && <p><b>Нужно:</b> {outcome.resolution.requirement}</p>}
        <p><b>Последствия и затраты:</b> {outcome.resolution.cost}</p>
      </div>}
      {state.scenarioId !== 'florence-workshop' && <blockquote>{outcome.dispatch}</blockquote>}
      {outcome.surprise && <div className="surprise"><ShieldAlert size={20} /><div><strong>Непредвиденное последствие</strong><p>{outcome.surprise}</p></div></div>}
      {outcome.sceneDialogue?.length ? <div className="scene-dialogue" aria-label="Разговор в сцене">
        <span>В разговоре</span>
        {outcome.sceneDialogue.map((line, index) => {
          const portrait = /джулиан/i.test(line.speaker) ? florenceJuliano1512 : /лука|орсини/i.test(line.speaker) ? florenceSecretary1512 : /риччи|бартоломео/i.test(line.speaker) ? florenceGuildmaster1512 : null;
          return <article className="dialogue-line" key={`${line.speaker}-${index}`}>{state.scenarioId === 'florence-workshop' && portrait && <img src={portrait} alt="" />}<div><strong>{line.speaker}</strong><p>«{line.line}»</p></div></article>;
        })}
      </div> : <div className="reaction-grid">
        {outcome.reactions.map((reaction) => <div key={reaction.faction}><span className={`stance stance-${reaction.stance}`}>{reaction.stance}</span><strong>{reaction.faction}</strong><p>{reaction.text}</p></div>)}
      </div>}
    </section>
  );
}

const temporalParticleSeeds = [
  { x: "8vw", y: "12vh", delay: "-1.8s", size: "3px" },
  { x: "18vw", y: "28vh", delay: "-4.2s", size: "2px" },
  { x: "33vw", y: "10vh", delay: "-.7s", size: "4px" },
  { x: "68vw", y: "14vh", delay: "-3.1s", size: "2px" },
  { x: "86vw", y: "22vh", delay: "-5.4s", size: "3px" },
  { x: "93vw", y: "46vh", delay: "-2.4s", size: "2px" },
  { x: "8vw", y: "63vh", delay: "-4.8s", size: "4px" },
  { x: "20vw", y: "78vh", delay: "-1.1s", size: "2px" },
  { x: "36vw", y: "87vh", delay: "-3.7s", size: "3px" },
  { x: "63vw", y: "86vh", delay: "-.4s", size: "2px" },
  { x: "78vw", y: "74vh", delay: "-4.5s", size: "4px" },
  { x: "91vw", y: "84vh", delay: "-2.9s", size: "2px" },
  { x: "4vw", y: "42vh", delay: "-5.1s", size: "3px" },
  { x: "48vw", y: "6vh", delay: "-1.4s", size: "2px" },
  { x: "56vw", y: "95vh", delay: "-3.3s", size: "3px" },
  { x: "74vw", y: "36vh", delay: "-.9s", size: "2px" },
] as const;

const monthNames = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function temporalDateParts(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: monthNames[date.getUTCMonth()] ?? "времени",
    year: String(date.getUTCFullYear()),
  };
}

function ChronometerMandala({ className }: { className: string }) {
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15);
  return (
    <svg className={`chronometer-mandala ${className}`} viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <g className="mandala-outer">
        <circle cx="200" cy="200" r="178" />
        <circle cx="200" cy="200" r="163" strokeDasharray="2 11" />
        {ticks.map((angle) => <line key={angle} x1="200" y1="16" x2="200" y2="31" transform={`rotate(${angle} 200 200)`} />)}
      </g>
      <g className="mandala-middle">
        <circle cx="200" cy="200" r="132" />
        <circle cx="200" cy="200" r="116" strokeDasharray="48 13 4 13" />
        <path d="M200 64v24M200 312v24M64 200h24M312 200h24" />
        <path d="M116 116l17 17M267 267l17 17M116 284l17-17M267 133l17-17" />
      </g>
      <g className="mandala-inner">
        <circle cx="200" cy="200" r="84" />
        <path d="M200 128c40 0 72 32 72 72s-32 72-72 72-72-32-72-72 32-72 72-72Z" strokeDasharray="7 10" />
        <path d="M200 151v49l36 20" />
        <circle cx="200" cy="200" r="5" />
      </g>
    </svg>
  );
}

function TemporalBackdrop({ fromDate, toDate, resolved }: { fromDate: string; toDate: string | null; resolved: boolean }) {
  const from = temporalDateParts(fromDate);
  const to = toDate ? temporalDateParts(toDate) : null;
  const yearReel = [Number(from.year) - 1, Number(from.year), Number(from.year) + 1, Number(from.year) + 2, Number(from.year) + 3];

  return (
    <div className={`temporal-backdrop ${resolved ? "is-resolved" : ""}`} aria-hidden="true">
      <div className="temporal-vortex">
        {temporalParticleSeeds.map((particle, index) => (
          <i
            className="temporal-particle"
            key={index}
            style={{ "--x": particle.x, "--y": particle.y, "--delay": particle.delay, "--size": particle.size } as CSSProperties}
          />
        ))}
      </div>
      <ChronometerMandala className="chronometer-mandala-main" />
      <ChronometerMandala className="chronometer-mandala-left" />
      <ChronometerMandala className="chronometer-mandala-right" />
      <div className="temporal-date-dial">
        <span className="temporal-date-label">временной срез</span>
        <div className="temporal-date-readout">
          <span>{from.day} {from.month}</span><b>{from.year}</b><i>→</i><b>{to?.year ?? "····"}</b>
        </div>
        <div className="temporal-slot-window">
          <div className="temporal-slot-reel">
            {[...yearReel, ...yearReel].map((year, index) => <span key={`${year}-${index}`}>{year}</span>)}
          </div>
        </div>
        <small>{to ? `${to.day} ${to.month} — новая линия готова` : "перебор вариантов будущего"}</small>
      </div>
    </div>
  );
}

const thinkingVariants = [
  { id: "clockwise", label: "Ход времени собирается в узор" },
  { id: "counterflow", label: "Хроника ищет другой путь" },
  { id: "eclipse", label: "Несколько будущих спорят между собой" },
] as const;

function WorldThinking({ date, florenceStory = false }: { date: string; florenceStory?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [variant] = useState(() => thinkingVariants[Math.floor(Math.random() * thinkingVariants.length)]);
  const startingDate = useRef(date);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (date !== startingDate.current) setResolved(true);
  }, [date]);

  const phase = florenceStory
    ? elapsed < 5
      ? "Кисть останавливается над картоном"
      : elapsed < 10
        ? "Гильдия сверяет условие и цену"
        : elapsed < 15
          ? "Мастерская считает, кто примет риск"
          : "След решения складывается в хронику"
    : elapsed < 5
      ? "Приказ покидает кабинет"
      : elapsed < 10
        ? "Фракции сверяют интересы"
        : elapsed < 15
          ? "Слухи меняют траекторию"
          : "Последствия складываются в хронику";

  return (
    <div className="world-thinking" role="status" aria-live="polite" aria-label="Мир отвечает на ваше решение">
      <TemporalBackdrop fromDate={startingDate.current} toDate={resolved ? date : null} resolved={resolved} />
      <div className={`world-thinking-card thinking-variant-${variant.id} ${resolved ? "is-resolving" : ""}`}>
        <div className="thinking-engine" aria-hidden="true">
          <span className="thinking-ring thinking-ring-outer" />
          <span className="thinking-ring thinking-ring-middle" />
          <span className="thinking-ring thinking-ring-inner" />
          <span className="thinking-clock"><i /><b /></span>
          <span className="thinking-tick thinking-tick-one" />
          <span className="thinking-tick thinking-tick-two" />
          <span className="thinking-tick thinking-tick-three" />
          <span className="thinking-spark thinking-spark-one" />
          <span className="thinking-spark thinking-spark-two" />
          <span className="thinking-spark thinking-spark-three" />
        </div>
        <span className="thinking-kicker">{variant.label}</span>
        <strong>Мир отвечает на ваше решение</strong>
        <p>{phase}</p>
        <div className="thinking-track" aria-hidden="true"><i /></div>
        <div className="thinking-meta"><span aria-live="off">Прошло {elapsed} сек.</span><span>Ведущий готовит ответ</span></div>
      </div>
    </div>
  );
}

function Game({ state, onTurn, onExit, busy, textScale, onTextScale, musicMuted, onMusicToggle, trackTitle }: { state: GameState; onTurn: (submission: TurnSubmission) => void; onExit: () => void; busy: boolean; textScale: TextScale; onTextScale: (value: TextScale) => void; musicMuted: boolean; onMusicToggle: () => void; trackTitle: string }) {
  const [showState, setShowState] = useState(() => window.innerWidth > 1100);
  useEffect(() => {
    if (!busy && state.lastOutcome) document.getElementById('turn-result')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [state.updatedAt, busy]);
  const stability = state.metrics.find((metric) => metric.id === "stability")?.value ?? 50;
  const armyReaction = state.lastOutcome?.reactions.find((reaction) => reaction.faction.includes("Став"));
  const activeCharacters = (state.lastOutcome?.scene.activeCharacterIds ?? (state.scenarioId === 'florence-workshop' ? ['florence-secretary', 'florence-juliano'] : [])).map(normalizeSceneCharacter);
  const sceneProps = state.lastOutcome?.scene.propIds ?? [];
  const trainStory = state.scenarioId === "last-train-1917";
  const florenceStory = state.scenarioId === "florence-workshop";
  const rawSceneLocation = state.lastOutcome?.scene.locationId ?? (trainStory ? "nikolaevsky-platform" : florenceStory ? "florence-workshop" : "tauride-cabinet");
  const sceneLocation = normalizeSceneLocation(rawSceneLocation, trainStory, florenceStory);
  const florenceBackground = florenceStory ? florenceBackgroundAssets[sceneLocation] ?? florenceWorkshop1512 : null;
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
    "florence-workshop": "Флоренция · мастерская",
    "florence-guildhall": "Флоренция · зал гильдии",
    "florence-square": "Флоренция · ночная площадь",
  };
  const requestedSceneCharacters = activeCharacters.filter((id) => sceneCharacterAssets[id]);
  const fallbackSceneCharacter = trainStory ? "rail-belyaev" : florenceStory ? "florence-juliano" : "minister-levitsky";
  const sceneCharacterIds = (florenceStory && state.lastOutcome ? requestedSceneCharacters : requestedSceneCharacters.length ? requestedSceneCharacters : [fallbackSceneCharacter]).slice(0, 2);
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
    "florence-juliano": "Джулиано Белли · ваш ученик",
    "florence-guildmaster": "Бартоломео Риччи · старшина гильдии",
    "florence-secretary": "Лука Орсини · секретарь заказчика",
    "florence-cardinal": "Кардинал ждёт результат, который можно предъявить городу",
  };
  const florenceLead = activeCharacters[0];
  const guestCaption = guestCaptions[florenceStory ? florenceLead ?? "" : leadCharacter ?? ""] ?? (trainStory ? "Станция ждёт вашего решения" : florenceStory ? "Мастерская ждёт вашего решения" : "Кабинет ждёт вашего решения");
  const visibleSceneProps = sceneProps.map((id) => ({ id, label: scenePropLabels[id] })).filter((item): item is { id: string; label: string } => Boolean(item.label)).slice(0, 3);
  const locationLabel = locationNames[sceneLocation] ?? (trainStory ? "Петроград · железнодорожная линия" : florenceStory ? "Флоренция · мастерская" : "Петроград · Таврический дворец");
  const briefingText = state.turn === 1
    ? state.briefing
    : state.lastOutcome?.nextBriefing ?? `Прошло ${state.lastOutcome?.daysPassed ?? 7} дней. Решение вышло из кабинета и теперь проверяется исполнением на местах.`;
  return (
    <main className={`game-shell ${florenceStory ? "game-shell-florence" : ""}`}>
      <header className="game-header">
        <button className="icon-button" onClick={onExit} title="К сценариям"><ArrowLeft size={19} /></button>
        <div className="game-identity"><Seal>ИИ</Seal><div><span>{state.scenarioTitle}</span><small>{state.role} · {modeTitle}</small></div></div>
        <div className="game-date"><Clock3 size={17} /><span>{formatDate(state.date)}</span><b>{state.status !== 'active' ? 'Финал' : `Ход ${state.turn}`}</b><MusicToggle muted={musicMuted} onToggle={onMusicToggle} trackTitle={trackTitle} /><TextScaleControl value={textScale} onChange={onTextScale} /></div>
      </header>

      <div className="game-layout">
        <aside className="state-rail">
          <details className="state-details" open={showState} onToggle={event => setShowState(event.currentTarget.open)}>
          <summary>Состояние и участники</summary>
          <div className="rail-heading"><Gauge size={17} /> {florenceStory ? "Состояние мастерской" : "Состояние страны"}</div>
          <p className="rail-explanation">Оценки от 0 до 100: чем выше, тем лучше положение. Это не деньги и не проценты успеха. После решения видны изменение и его причина.</p>
          <div className="metrics-list">{state.metrics.map((metric) => <MetricGauge key={metric.id} {...metric} initial={!state.lastOutcome} reason={state.lastOutcome?.effects.find(e => e.id === metric.id)?.reason} />)}</div>
          {florenceStory && <details className="play-help"><summary>Что означает каждый показатель</summary><p><b>Репутация:</b> насколько надёжным мастером вас считают. <b>Материалы и деньги:</b> хватит ли запасов на работу и оплату. <b>Опора гильдии:</b> готов ли Риччи поддержать вас. <b>Силы людей:</b> смогут ли ученики продолжать без переутомления. <b>Договор:</b> насколько вы близки к соглашению с заказчиком.</p></details>}
          <div className="factions">
            <div className="rail-heading"><Landmark size={17} /> Участники: с чего всё началось</div>
            {state.factions.map((faction) => <div className="faction" key={faction.name}><div><strong>{faction.name}</strong><span>{faction.mood}</span></div></div>)}
          </div>
          <div className="objective"><span>{florenceStory ? "Цель ночи" : "Цель правления"}</span><p>{state.objective}</p></div>
          </details>
        </aside>

        <div className="main-stage">
          <div className="player-role"><strong>Вы — {state.role.toLowerCase()}.</strong><p>{state.objective}</p></div>
          <section className={`scene-tableau ${stability < 30 ? "scene-unrest" : ""} ${trainStory ? "scene-train-world" : ""} ${florenceStory ? "scene-florence-world" : ""} scene-location-${sceneLocation}`} aria-label={`Живая сцена: ${locationLabel}`}>
            {florenceBackground && <img className="scene-location-background" src={florenceBackground} alt="" />}
            <div className="scene-grid" />
            <div className="scene-window"><i /><i /><i /></div>
            <div className="scene-map"><span>{florenceStory ? "FIRENZE" : "ПЕТРОГРАД"}</span><i /><i /><i /></div>
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
          {florenceStory && <Outcome state={state} />}
          {(!florenceStory || state.status === 'active') && <section className="briefing">
            <div className="briefing-index">{String(state.turn).padStart(2, "0")}</div>
            <div>
              <span className="eyebrow-small">{florenceStory ? `Сцена ${Math.min(state.turn, 6)} из 6` : 'Что происходит сейчас'}</span>
              {campaignAct && <div className="campaign-wayfinding" aria-label={`Кампания, акт ${campaignAct.number}: ${campaignAct.question}`}>
                <div className="campaign-wayfinding-meta"><span>Кампания · акт {campaignAct.number}</span><small>{campaignAct.range}</small></div>
                <strong>{campaignAct.title}</strong>
                <p>{campaignAct.question} <em>{campaignAct.focus}</em></p>
              </div>}
              <h1>{florenceStory ? state.lastOutcome?.nextTitle || 'Секретарь заказчика ждёт ответа' : state.turn === 1 ? trainStory ? 'Один поезд. Кого отправить?' : 'Вам предстоит возглавить правительство' : 'Что изменилось и кто ждёт решения'}</h1>{briefingText.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </section>}
          {!florenceStory && <Outcome state={state} />}
          {state.status === "active" ? <DecisionComposer options={state.options} onSubmit={onTurn} busy={busy} /> : <div className="end-state">
            <h2>{florenceStory ? 'После этой ночи' : state.status === 'victory' ? 'Новый порядок устоял' : 'Государство распалось'}</h2>
            <p>{florenceStory ? state.lastOutcome?.reflection : 'Эта ветка истории завершена. Можно вернуться к точке давления и попробовать другой путь.'}</p>
            {florenceStory && state.florence && <details className="florence-trace"><summary>Посмотреть решения и их цену</summary>
              {state.florence.trace.map(entry => <article key={entry.turn}><strong>Сцена {entry.turn}</strong><p>{entry.action}</p><p>{entry.cost}</p></article>)}
            </details>}
            <button onClick={onExit}><RotateCcw size={18} /> Начать заново</button></div>}
        </div>

        <aside className="chronicle">
          <div className="rail-heading"><BookOpen size={17} /> События истории</div>
          <div className="timeline">
            {[...state.timeline].reverse().map((entry) => <article key={entry.id} className={`timeline-entry ${entry.kind}`}><time>{entry.kind === 'origin' ? 'Предыстория · ' : ''}{formatDate(entry.date)}</time><strong>{entry.title}</strong><p>{entry.description}</p></article>)}
          </div>
        </aside>
      </div>
      {busy && <WorldThinking date={state.date} florenceStory={florenceStory} />}
    </main>
  );
}

function percentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

function shortAnalyticsDay(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00.000Z`));
}

function AnalyticsMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="analytics-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function AnalyticsDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem("living-history-analytics-token") ?? "");
  const [draftToken, setDraftToken] = useState(() => sessionStorage.getItem("living-history-analytics-token") ?? "");
  const [overview, setOverview] = useState<ProductAnalyticsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadOverview = async (accessToken = token) => {
    if (!accessToken.trim()) return;
    setLoading(true); setError(null);
    try {
      const result = await api.analyticsOverview(accessToken.trim());
      sessionStorage.setItem("living-history-analytics-token", accessToken.trim());
      setToken(accessToken.trim());
      setOverview(result);
    } catch (cause) {
      setOverview(null);
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить отчёт");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) void loadOverview(token); }, []);

  const latest = overview?.days.at(-1);
  const totals = overview?.totals;
  const recentDays = overview?.days.slice(-14) ?? [];
  const maxActions = Math.max(1, ...recentDays.map((day) => day.meaningfulActions));
  const averageResolution = totals && totals.resolutionCount > 0 ? Math.round(totals.resolutionMsTotal / totals.resolutionCount) : 0;

  return (
    <main className="analytics-page shell">
      <nav className="topbar">
        <a className="brand analytics-back" href="/"><Seal>ИИ</Seal><span>Переиграть историю</span></a>
        <div className="topbar-note"><ShieldCheck size={15} /> Внутренний продуктовый обзор</div>
      </nav>
      <section className="analytics-hero">
        <div><div className="eyebrow"><span>PRODUCT ANALYTICS · V1</span><i /></div><h1>Поведение до<br /><em>следующей гипотезы.</em></h1><p>Считаются только подтверждённые сервером игровые ходы. Данные накапливаются с момента включения общего агрегатора.</p></div>
        <div className="analytics-access">
          <label htmlFor="analytics-token">Токен команды</label>
          <form onSubmit={(event) => { event.preventDefault(); void loadOverview(draftToken); }}>
            <input id="analytics-token" type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="ANALYTICS_DASHBOARD_TOKEN" autoComplete="current-password" />
            <button type="submit" disabled={loading || !draftToken.trim()}>{loading ? <RefreshCw className="spin" size={17} /> : <BarChart3 size={17} />} Открыть</button>
          </form>
          <small>Токен хранится только до закрытия вкладки.</small>
        </div>
      </section>

      {error && <section className="analytics-message"><ShieldAlert size={19} /><div><strong>Отчёт пока недоступен</strong><p>{error}</p>{error.includes("ANALYTICS_DASHBOARD_TOKEN") && <p>Добавь этот секрет в Cloudflare Worker — после этого тот же экран станет доступен без нового релиза.</p>}</div></section>}

      {overview && totals && latest && <>
        <section className="analytics-meta"><span>Период: {overview.firstDataDay ? shortAnalyticsDay(overview.firstDataDay) : "—"} — {overview.lastDataDay ? shortAnalyticsDay(overview.lastDataDay) : "—"}</span><span>Обновлено: {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.generatedAt))}</span><button onClick={() => void loadOverview()} disabled={loading}>{loading ? <RefreshCw className="spin" size={14} /> : <RefreshCw size={14} />} Обновить</button></section>
        <section className="analytics-grid">
          <AnalyticsMetric label="DAU" value={latest.activatedVisitors} detail={`игроков с ходом · ${shortAnalyticsDay(latest.day)}`} />
          <AnalyticsMetric label="Действий / игрока" value={latest.activatedVisitors ? (latest.meaningfulActions / latest.activatedVisitors).toFixed(1) : "—"} detail="подтверждённые ходы за день" />
          <AnalyticsMetric label="D1" value={percentage(overview.d1ReturnedVisitors, overview.d1EligibleVisitors)} detail={`${overview.d1ReturnedVisitors} из ${overview.d1EligibleVisitors} доступных когорт`} />
          <AnalyticsMetric label="Завершение" value={percentage(totals.finishedSessions, totals.startedSessions)} detail={`${totals.finishedSessions} финалов из ${totals.startedSessions} стартов`} />
          <AnalyticsMetric label="Средний ход" value={averageResolution ? `${(averageResolution / 1000).toFixed(1)} с` : "—"} detail="полное время ответа мира" />
          <AnalyticsMetric label="Fallback" value={percentage(totals.simulationTurns, totals.meaningfulActions)} detail={`${totals.simulationTurns} из ${totals.meaningfulActions} ходов`} />
        </section>
        <section className="analytics-panels">
          <article className="analytics-panel analytics-panel-wide"><div className="analytics-panel-heading"><div><span className="index">01</span><h2>Темп осмысленных действий</h2></div><p>Последние {recentDays.length} дней</p></div><div className="analytics-chart">{recentDays.map((day) => <div className="analytics-bar" key={day.day}><i style={{ height: `${Math.max(4, (day.meaningfulActions / maxActions) * 100)}%` }} title={`${day.meaningfulActions} действий`} /><strong>{day.meaningfulActions}</strong><span>{shortAnalyticsDay(day.day)}</span></div>)}</div></article>
          <article className="analytics-panel"><div className="analytics-panel-heading"><div><span className="index">02</span><h2>Качество и цена</h2></div></div><dl className="analytics-breakdown"><div><dt>Свободные ходы</dt><dd>{percentage(totals.freeformActions, totals.meaningfulActions)}</dd></div><div><dt>Готовые варианты</dt><dd>{percentage(totals.preparedActions, totals.meaningfulActions)}</dd></div><div><dt>AI-ходы</dt><dd>{totals.aiTurns}</dd></div><div><dt>Всего токенов</dt><dd>{totals.totalTokens.toLocaleString("ru-RU")}</dd></div><div><dt>Макс. задержка</dt><dd>{totals.maxResolutionMs ? `${(totals.maxResolutionMs / 1000).toFixed(1)} с` : "—"}</dd></div></dl></article>
        </section>
        <section className="analytics-panel analytics-table-panel"><div className="analytics-panel-heading"><div><span className="index">03</span><h2>Дневная детализация</h2></div><p>DAU — только игроки, сделавшие хотя бы один ход</p></div><div className="analytics-table-wrap"><table><thead><tr><th>День</th><th>DAU</th><th>Ходы</th><th>Ходов / игрока</th><th>AI / fallback</th><th>Токены</th><th>Средний ход</th></tr></thead><tbody>{[...recentDays].reverse().map((day) => <tr key={day.day}><td>{shortAnalyticsDay(day.day)}</td><td>{day.activatedVisitors}</td><td>{day.meaningfulActions}</td><td>{day.activatedVisitors ? (day.meaningfulActions / day.activatedVisitors).toFixed(1) : "—"}</td><td>{day.aiTurns} / {day.simulationTurns}</td><td>{day.totalTokens.toLocaleString("ru-RU")}</td><td>{day.resolutionCount ? `${(day.resolutionMsTotal / day.resolutionCount / 1000).toFixed(1)} с` : "—"}</td></tr>)}</tbody></table></div></section>
      </>}
    </main>
  );
}

function GameApp() {
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
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const state = await api.createGame(id, mode);
      localStorage.setItem("living-history-session", state.id);
      setGame(state);
      setIntro(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать игру"); }
    finally { setBusy(false); }
  };

  const playTurn = async (submission: TurnSubmission) => {
    if (!game) return;
    setBusy(true); setError(null);
    try {
      const nextState = await api.playTurn(game.id, submission);
      setGame(nextState);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 360));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Мир не ответил на ход"); }
    finally { setBusy(false); }
  };

  const exit = () => { localStorage.removeItem("living-history-session"); setGame(null); setError(null); };
  const requestStart = (scenarioId: string, mode: GameMode) => {
    setIntro({ scenarioId, mode: ["last-train-1917", "florence-workshop"].includes(scenarioId) ? "chronicle" : mode });
  };
  const changeTextScale = (value: TextScale) => {
    setTextScale(value);
    localStorage.setItem("living-history-text-scale", value);
  };
  const activeTrack = useMemo(() => selectMusic(game, busy, intro?.scenarioId), [game, busy, intro?.scenarioId]);
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

export default function App() {
  return window.location.pathname === "/analytics" ? <AnalyticsDashboard /> : <GameApp />;
}
