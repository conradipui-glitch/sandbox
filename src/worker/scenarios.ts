import type { DecisionOption, GameMode, GameState, Metric } from "../shared/types";
import { createFlorenceState } from "./florence";

const initialOptions: DecisionOption[] = [
  {
    id: "peace-now",
    title: "Начать тайные переговоры о мире",
    description: "Попытаться вывести страну из войны, не раскрывая союзникам полного замысла.",
    risk: "высокий",
    intent: "Закончить войну через закрытый дипломатический канал",
  },
  {
    id: "land-first",
    title: "Передать землю крестьянам",
    description: "Не ждать Учредительного собрания и запустить немедленную земельную реформу.",
    risk: "средний",
    intent: "Провести немедленную земельную реформу с компенсацией владельцам",
  },
  {
    id: "restore-order",
    title: "Собрать коалицию порядка",
    description: "Договориться с Советами и командованием о временном едином центре власти.",
    risk: "низкий",
    intent: "Создать коалиционный чрезвычайный совет из правительства, Советов и армии",
  },
];

export const scenarioSummaries = [
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
] as const;

const trainOptions: DecisionOption[] = [
  {
    id: "train-wounded",
    title: "Посадить раненых первыми",
    description: "Отдать первые вагоны тем, кто не может ждать на платформе, даже если уголь останется в городе.",
    risk: "средний",
    intent: "Посадить раненых и санитарную бригаду первыми, а уголь отправить следующим составом",
  },
  {
    id: "train-coal",
    title: "Отправить уголь",
    description: "Спасти котельные и мастерские: поезд уйдёт тяжёлым, а несколько десятков людей останутся на станции.",
    risk: "высокий",
    intent: "Загрузить в состав уголь для городских котельных и мастерских, людей оставить в списке ожидания",
  },
  {
    id: "train-delegation",
    title: "Взять солдатскую делегацию",
    description: "Дать солдатам добраться до штаба и услышать их требования, рискуя сорвать эвакуацию.",
    risk: "средний",
    intent: "Взять в поезд солдатскую делегацию и отправить её к штабу до закрытия линии",
  },
];

export const lastTrainOptions = trainOptions;

function createLastTrainState(id: string, now: string): GameState {
  return {
    id,
    scenarioId: "last-train-1917",
    mode: "chronicle",
    scenarioTitle: "Последний поезд из Петрограда",
    role: "Распорядитель эвакуационного эшелона",
    date: "1917-04-16",
    turn: 1,
    status: "active",
    briefing:
      "Петроград, 16 апреля 1917 года. На Николаевском вокзале остался один исправный состав. До рассвета он может вывезти раненых, доставить уголь или вернуть в штаб солдатскую делегацию — но не всё одновременно.",
    objective:
      "Отправить состав до рассвета, сохранив людей и доверие станции. В этой хронике нет правильного списка пассажиров — есть только цена порядка посадки.",
    metrics: [
      { id: "legitimacy", label: "Доверие станции", value: 48, trend: 0 },
      { id: "economy", label: "Запас угля", value: 34, trend: -2 },
      { id: "army", label: "Лояльность солдат", value: 42, trend: -1 },
      { id: "stability", label: "Порядок на перроне", value: 37, trend: -2 },
      { id: "diplomacy", label: "Связь со штабом", value: 55, trend: 0 },
    ],
    factions: [
      { name: "Железнодорожники", power: 76, mood: "Считают минуты" },
      { name: "Санитарная бригада", power: 55, mood: "Ждёт места" },
      { name: "Солдатский комитет", power: 67, mood: "Требует разговора" },
      { name: "Городские котельные", power: 61, mood: "Угля на двое суток" },
    ],
    options: trainOptions,
    timeline: [
      {
        id: "train-origin-1",
        date: "1917-04-16",
        title: "Телеграмма без подписи",
        description: "Штаб требует отправить состав до рассвета, но не сообщает, какой груз считать первоочередным.",
        kind: "origin",
      },
      {
        id: "train-origin-2",
        date: "1917-04-16",
        title: "На станции остался один состав",
        description: "Три списка пассажиров лежат на одном столе. Расписание допускает только один маршрут.",
        kind: "origin",
      },
    ],
    lastOutcome: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialState(id: string, scenarioId: string, mode: GameMode = "campaign"): GameState {
  const now = new Date().toISOString();
  if (scenarioId === "last-train-1917") return createLastTrainState(id, now);
  if (scenarioId === "florence-workshop") return createFlorenceState(id, now);
  if (scenarioId !== "russia-1917") {
    throw new Error("Этот сценарий ещё не открыт");
  }

  const metrics: Metric[] = [
    { id: "legitimacy", label: "Легитимность", value: 54, trend: 0 },
    { id: "economy", label: "Экономика", value: 31, trend: -2 },
    { id: "army", label: "Армия", value: 39, trend: -3 },
    { id: "stability", label: "Порядок", value: 28, trend: -2 },
    { id: "diplomacy", label: "Дипломатия", value: 62, trend: 1 },
  ];

  return {
    id,
    scenarioId,
    mode,
    scenarioTitle: "Россия после отречения",
    role: "Глава Временного правительства",
    date: "1917-03-03",
    turn: 1,
    status: "active",
    briefing:
      "Николай II отрёкся. В Петрограде одновременно существуют Временное правительство и Совет рабочих и солдатских депутатов. Фронт рассыпается, деревня ждёт землю, союзники требуют продолжать войну.",
    objective:
      "Удержать государство от распада и передать власть избранному Учредительному собранию — либо найти собственную форму нового порядка.",
    metrics,
    factions: [
      { name: "Петроградский Совет", power: 78, mood: "Выжидает" },
      { name: "Ставка", power: 61, mood: "Требует порядка" },
      { name: "Крестьянские общины", power: 72, mood: "Ждут землю" },
      { name: "Антанта", power: 56, mood: "Давит из-за войны" },
    ],
    options: initialOptions,
    timeline: [
      {
        id: "origin-1",
        date: "1917-03-02",
        title: "Император отрёкся",
        description: "Трёхсотлетняя монархия завершилась за одну ночь. Центр власти пуст.",
        kind: "origin",
      },
      {
        id: "origin-2",
        date: "1917-03-03",
        title: "Ваше правительство сформировано",
        description: "Страна признала новый кабинет — пока лишь авансом.",
        kind: "origin",
      },
    ],
    lastOutcome: null,
    createdAt: now,
    updatedAt: now,
  };
}
