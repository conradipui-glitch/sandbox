import type { GameState, Metric } from '../shared/types';
import { florenceBriefing, florenceOptions, initialFlorenceMemory } from './florence-engine';

export function createFlorenceState(id: string, now: string): GameState {
  const memory = initialFlorenceMemory();
  const metrics: Metric[] = [
    { id: "legitimacy", label: "Репутация мастерской", value: 51, trend: 0 },
    { id: "economy", label: "Материалы и деньги", value: 44, trend: -1 },
    { id: "army", label: "Опора гильдии", value: 42, trend: 0 },
    { id: "stability", label: "Силы людей", value: 36, trend: -2 },
    { id: "diplomacy", label: "Договор с заказчиком", value: 53, trend: 0 },
  ];
  return {
    id,
    scenarioId: "florence-workshop",
    mode: "chronicle",
    scenarioTitle: "Флоренция: Мастерская под давлением",
    role: "мастер городской мастерской",
    date: "1512-04-17",
    turn: 1,
    status: "active",
    briefing: florenceBriefing(1, memory),
    florence: memory,
    objective: "Решить судьбу заказа к утру: кому достанется работа, кто получит оплату и чьё имя останется на стене.",
    metrics,
    factions: [
      { name: "Ученики мастерской", power: 52, mood: "Смотрят, кого вы защитите" },
      { name: "Гильдия живописцев", power: 73, mood: "Ждёт взнос и порядок" },
      { name: "Дом кардинала", power: 81, mood: "Требует увидеть результат" },
      { name: "Городские заказчики", power: 46, mood: "Передают слухи" },
    ],
    options: florenceOptions(1, memory),
    timeline: [
      { id: "florence-origin-1", date: "1512-04-17", title: "Заказ до заката", description: "Кардинал требует показать роспись сегодня, хотя работа и люди к этому не готовы.", kind: "origin" },
      { id: "florence-origin-2", date: "1512-04-17", title: "Пигмент и силы на исходе", description: "Джулиано болен, а запас дорогой краски не позволяет честно обещать готовую фреску.", kind: "origin" },
    ],
    lastOutcome: null,
    createdAt: now,
    updatedAt: now,
  };
}
