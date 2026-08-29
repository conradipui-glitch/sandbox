import type { DecisionOption, GameState, MetricId, TurnOutcome } from "../shared/types";
import { gameModes, worldContextForTurn } from "./world";

const metricIds: MetricId[] = ["legitimacy", "economy", "army", "stability", "diplomacy"];

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function pick<T>(items: T[], seed: number, offset = 0): T {
  return items[(seed + offset * 7919) % items.length];
}

function keywordBias(action: string): Partial<Record<MetricId, number>> {
  const value = action.toLowerCase();
  const result: Partial<Record<MetricId, number>> = {};
  if (/мир|переговор|дипломат|союзник/.test(value)) {
    result.diplomacy = 4;
    result.army = -3;
  }
  if (/земл|крестья|реформ/.test(value)) {
    result.legitimacy = 6;
    result.economy = -2;
  }
  if (/арм|поряд|сил|разгон|арест/.test(value)) {
    result.stability = 5;
    result.legitimacy = -4;
  }
  if (/совет|коалиц|договор/.test(value)) {
    result.legitimacy = 4;
    result.stability = 2;
  }
  if (/налог|банк|промышлен|эконом/.test(value)) {
    result.economy = 5;
    result.legitimacy = -2;
  }
  return result;
}

export function simulateTurn(state: GameState, action: string): TurnOutcome {
  const seed = hash(`${state.id}:${state.turn}:${action}`);
  const world = worldContextForTurn(state, action);
  const bias = keywordBias(action);
  const effects = metricIds.map((id, index) => {
    const noise = ((seed >> (index * 3)) % 7) - 3;
    const delta = Math.max(-8, Math.min(8, noise + (bias[id] ?? 0)));
    return {
      id,
      delta,
      reason: delta > 2 ? "Решение нашло неожиданную поддержку" : delta < -2 ? "Цена решения оказалась выше ожидаемой" : "Эффект пока ограничен",
    };
  });

  const positive = effects.filter((effect) => effect.delta > 0).length;
  const headline = pick(
    [
      "Страна проснулась уже в другой реальности",
      "Ваш указ расколол вчерашних союзников",
      "Петроград замер в ожидании ответа",
      "Решение из столицы дошло до фронта",
      "Новый союз возник там, где его не ждали",
    ],
    seed,
  );

  const surprises = [
    "Железнодорожники объявили, что поддержат реформу только после гарантий снабжения городов.",
    "Группа младших офицеров предложила правительству прямой канал связи с солдатскими комитетами.",
    "Из губерний пришли телеграммы: местные советы уже трактуют ваш указ каждый по-своему.",
    "Союзники потребовали письменных гарантий и намекнули на остановку поставок.",
  ];

  const nextOptions: DecisionOption[] = [
    {
      id: `public-${state.turn}`,
      title: "Обратиться к стране напрямую",
      description: "Опубликовать честное объяснение цены решения и потребовать временного мандата доверия.",
      risk: "средний",
      intent: "Обратиться к стране с прямой речью и запросить временный мандат доверия",
    },
    {
      id: `deal-${state.turn}`,
      title: "Закрепить новый союз",
      description: "Превратить ситуативную поддержку одной из сил в формальное соглашение.",
      risk: "низкий",
      intent: "Закрепить поддержку ключевой фракции формальным политическим соглашением",
    },
    {
      id: `double-${state.turn}`,
      title: "Удвоить ставку",
      description: "Не отступать под критикой и расширить решение на всю страну.",
      risk: "высокий",
      intent: `Расширить и ускорить предыдущее решение: ${action}`,
    },
  ];

  return {
    headline,
    summary: `${action}. Решение немедленно меняет баланс сил: ${positive} из 5 ключевых контуров государства отвечают ростом, остальные требуют платы или времени. История не остановилась, пока кабинет обсуждал детали.`,
    dispatch: pick(
      [
        "«Сегодня власть впервые сказала, чего хочет. Но пока никто не знает, сможет ли она это исполнить». — вечерний выпуск",
        "«В столице празднуют победу, в губерниях считают вагоны с хлебом». — телеграмма корреспондента",
        "«Приказ прочитан во всех ротах. Ответ солдат будет известен к утру». — сообщение из Ставки",
      ],
      seed,
      2,
    ),
    effects,
    reactions: [
      { faction: "Петроградский Совет", stance: positive >= 3 ? "поддержка" : "настороженность", text: "Готов обсуждать исполнение, но требует контроля снизу." },
      { faction: "Ставка", stance: effects.find((e) => e.id === "army")!.delta < 0 ? "противодействие" : "настороженность", text: "Оценивает решение прежде всего через состояние фронта." },
      { faction: "Провинция", stance: effects.find((e) => e.id === "legitimacy")!.delta > 0 ? "поддержка" : "настороженность", text: "Ждёт не деклараций, а первых исполнимых распоряжений." },
    ],
    nextOptions,
    daysPassed: 7 + (seed % 15),
    surprise: seed % 4 === 0 ? null : pick(surprises, seed, 4),
    scene: {
      locationId: /поезд|вагон|снабж/i.test(action) ? "muddy-station" : /рабоч|забаст|завод/i.test(action) ? "factory-yard" : "tauride-cabinet",
      activeCharacterIds: world.cast.flatMap((character) => character ? [character.id] : []).slice(0, 2),
      propIds: world.entityPool.slice(0, 2).map((entity) => entity.id),
      ambientId: seed % 3 === 0 ? world.microEncounters[seed % world.microEncounters.length]?.id ?? null : null,
      atmosphere: effects.some((effect) => effect.delta < -5) ? "холодный тревожный свет, дальний гул толпы" : "приглушённый кабинетный свет, слышен телеграф",
    },
    source: "simulation",
  };
}

export function applyOutcome(state: GameState, action: string, outcome: TurnOutcome): GameState {
  const date = new Date(`${state.date}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + outcome.daysPassed);
  const nextDate = date.toISOString().slice(0, 10);
  const metrics = state.metrics.map((metric) => {
    const effect = outcome.effects.find((item) => item.id === metric.id);
    const delta = effect?.delta ?? 0;
    return { ...metric, value: Math.max(0, Math.min(100, metric.value + delta)), trend: delta };
  });
  const weakest = Math.min(...metrics.map((metric) => metric.value));
  const turnLimit = gameModes[state.mode].turnLimit;
  const status = state.mode === "sandbox"
    ? "active"
    : weakest <= 2
      ? "collapsed"
      : turnLimit !== null && state.turn >= turnLimit
        ? "victory"
        : "active";

  return {
    ...state,
    date: nextDate,
    turn: state.turn + 1,
    status,
    briefing: outcome.summary,
    metrics,
    options: outcome.nextOptions,
    timeline: [
      ...state.timeline,
      {
        id: `decision-${state.turn}`,
        date: state.date,
        title: `Ваш ход: ${action.slice(0, 72)}`,
        description: outcome.headline,
        kind: "decision",
      },
      ...(outcome.surprise
        ? [{ id: `shock-${state.turn}`, date: nextDate, title: "Непредвиденное последствие", description: outcome.surprise, kind: "shock" as const }]
        : []),
    ],
    lastOutcome: outcome,
    updatedAt: new Date().toISOString(),
  };
}
