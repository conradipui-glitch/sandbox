import type { GameState, Metric } from '../shared/types';
import { initialFlorenceMemory } from './florence-engine';
import { florenceOpening, florenceOpeningOptions } from './florence-ai';

export function createFlorenceState(id: string, now: string): GameState {
  const memory = initialFlorenceMemory();
  const metrics: Metric[] = [
    { id: "legitimacy", label: "Репутация мастерской", value: 51, trend: 0 },
    { id: "economy", label: "Материалы и деньги", value: 44, trend: 0 },
    { id: "army", label: "Опора гильдии", value: 42, trend: 0 },
    { id: "stability", label: "Силы людей", value: 36, trend: 0 },
    { id: "diplomacy", label: "Договор с заказчиком", value: 53, trend: 0 },
  ];
  return {
    id,
    scenarioId: "florence-workshop",
    mode: "chronicle",
    scenarioTitle: "Флоренция: Мастерская под давлением",
    role: "Художник и хозяин мастерской",
    date: "1512-04-17",
    turn: 1,
    status: "active",
    briefing: florenceOpening,
    florence: memory,
    objective: "К утру договориться с заказчиком о судьбе незаконченной росписи. Вам решать, чем поступиться ради оплаты, здоровья учеников и права назвать себя автором.",
    metrics,
    factions: [
      { name: "Джулиано и другие ученики", power: 52, mood: "Работают у вас; ждут зарплату утром" },
      { name: "Риччи, старшина гильдии", power: 73, mood: "Оплатил краску в долг вашей мастерской" },
      { name: "Лука, секретарь кардинала", power: 81, mood: "Принёс предложение об оплате и хочет ответ" },
    ],
    options: florenceOpeningOptions.map(o => ({ ...o })),
    timeline: [
      { id: "florence-origin-1", date: "1512-04-17", title: "До вашего первого решения", description: "Кардинал перенёс показ на сегодняшний вечер. Ученик заболел. Оплаченная краска пришла не полностью. Лука принёс предложение о предоплате.", kind: "origin" },
    ],
    lastOutcome: null,
    createdAt: now,
    updatedAt: now,
  };
}
