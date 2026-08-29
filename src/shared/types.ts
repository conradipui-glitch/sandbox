export type MetricId = "legitimacy" | "economy" | "army" | "stability" | "diplomacy";

export interface Metric {
  id: MetricId;
  label: string;
  value: number;
  trend: number;
}

export interface DecisionOption {
  id: string;
  title: string;
  description: string;
  risk: "низкий" | "средний" | "высокий";
  intent: string;
}

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  kind: "origin" | "decision" | "consequence" | "shock";
}

export interface FactionReaction {
  faction: string;
  stance: "поддержка" | "настороженность" | "противодействие";
  text: string;
}

export interface TurnOutcome {
  headline: string;
  summary: string;
  dispatch: string;
  effects: Array<{ id: MetricId; delta: number; reason: string }>;
  reactions: FactionReaction[];
  nextOptions: DecisionOption[];
  daysPassed: number;
  surprise: string | null;
  source: "ai" | "simulation";
}

export interface GameState {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  role: string;
  date: string;
  turn: number;
  status: "active" | "collapsed" | "victory";
  briefing: string;
  objective: string;
  metrics: Metric[];
  factions: Array<{ name: string; power: number; mood: string }>;
  options: DecisionOption[];
  timeline: TimelineEntry[];
  lastOutcome: TurnOutcome | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  period: string;
  role: string;
  hook: string;
  difficulty: "Доступно" | "Сложно" | "Безжалостно";
  accent: string;
  available: boolean;
}
