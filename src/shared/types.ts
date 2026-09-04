export type MetricId = "legitimacy" | "economy" | "army" | "stability" | "diplomacy";
export type GameMode = "chronicle" | "campaign" | "sandbox";

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

export interface SceneCue {
  locationId: string;
  activeCharacterIds: string[];
  propIds: string[];
  ambientId: string | null;
  atmosphere: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type ActionSource = "prepared" | "freeform";

export interface TurnSubmission {
  action: string;
  source: ActionSource;
  optionId?: string;
}

export interface SessionAnalyticsSummary {
  schemaVersion: 1;
  startedAt: string;
  lastActiveAt: string;
  activeDays: string[];
  meaningfulActions: number;
  preparedActions: number;
  freeformActions: number;
  aiTurns: number;
  simulationTurns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageResolutionMs: number;
  maxResolutionMs: number;
}

export interface ProductAnalyticsDay {
  day: string;
  uniqueVisitors: number;
  activatedVisitors: number;
  newVisitors: number;
  startedSessions: number;
  finishedSessions: number;
  meaningfulActions: number;
  preparedActions: number;
  freeformActions: number;
  aiTurns: number;
  simulationTurns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  resolutionMsTotal: number;
  resolutionCount: number;
  maxResolutionMs: number;
  d1ReturnedVisitors: number;
}

export interface ProductAnalyticsOverview {
  schemaVersion: 1;
  generatedAt: string;
  firstDataDay: string | null;
  lastDataDay: string | null;
  days: ProductAnalyticsDay[];
  totals: Omit<ProductAnalyticsDay, "day">;
  d1EligibleVisitors: number;
  d1ReturnedVisitors: number;
}

export interface TurnOutcome {
  headline: string;
  summary: string;
  /** A fresh tactical situation for the next turn; it must not repeat summary. */
  nextBriefing?: string;
  dispatch: string;
  effects: Array<{ id: MetricId; delta: number; reason: string }>;
  reactions: FactionReaction[];
  nextOptions: DecisionOption[];
  daysPassed: number;
  surprise: string | null;
  scene: SceneCue;
  source: "ai" | "simulation";
  provider?: "deepseek" | "cloudflare" | "simulation";
  usage?: ModelUsage;
}

export interface GameState {
  id: string;
  scenarioId: string;
  mode: GameMode;
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
