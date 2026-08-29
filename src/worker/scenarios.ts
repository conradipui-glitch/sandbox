import type { DecisionOption, GameState, Metric } from "../shared/types";

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

export function createInitialState(id: string, scenarioId: string): GameState {
  if (scenarioId !== "russia-1917") {
    throw new Error("Этот сценарий ещё не открыт");
  }

  const now = new Date().toISOString();
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
