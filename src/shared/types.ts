export type MetricId = "legitimacy" | "economy" | "army" | "stability" | "diplomacy";
export type GameMode = "chronicle" | "campaign" | "sandbox";

/** The author's listing of a published mission, as the public catalog carries it. */
export interface PublishedMissionListing {
  readonly title: string;
  readonly summary: string;
  readonly period: string;
  readonly place: string;
  readonly playerRole: string;
  readonly estimatedMinutes: number;
  readonly supportedModes: readonly string[];
}

/**
 * One published mission from the engine's public catalog. `publicMissionId` is
 * the canonical reference the game contract uses; the Studio's player link names
 * the same publication by `releaseId`, and authors know it by `slug`.
 */
export interface PublishedMissionCard {
  readonly publicMissionId: string;
  readonly slug: string;
  readonly releaseId: string;
  readonly contentHash: string;
  readonly channel: "production";
  readonly listing: PublishedMissionListing;
}

export interface PublishedRuntimeResourceView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly unit: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly delta: number;
}

export interface PublishedRuntimeParticipantView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly locationId: string | null;
  readonly locationTitle: string | null;
}

export interface PublishedMissionHistoryView {
  readonly id: string;
  readonly turn: number;
  readonly choiceId: string;
  readonly choiceLabel: string;
  readonly fromTitle: string;
  readonly toTitle: string;
  readonly deltas: readonly { readonly resourceId: string; readonly delta: number }[];
  readonly terminal: boolean;
}

export interface PublishedMissionRuntimeView {
  readonly resources: readonly PublishedRuntimeResourceView[];
  readonly participants: readonly PublishedRuntimeParticipantView[];
  readonly history: readonly PublishedMissionHistoryView[];
  readonly lastResolution: PublishedMissionHistoryView | null;
}

/**
 * Discriminator for the game contract: a published authored mission renders
 * through the shared mission renderer, a legacy scenario keeps its own art.
 */
export interface PublishedMissionPresentation {
  readonly kind: "published-mission";
  readonly publicMissionId: string;
  readonly frame: import("./mission-presentation/view-model").PreviewFrameView;
  /**
   * The authored intro screens of the pinned revision, in author order. They are
   * shown before the mission's first turn; paging them is local to the player and
   * does not spend a turn.
   */
  readonly intros?: readonly import("./mission-presentation/view-model").PreviewFrameView[];
  /** Authoritative runtime projection from the pinned release and session. */
  readonly runtime?: PublishedMissionRuntimeView;
  readonly reaction: "applied" | "start";
}

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
  /** A character line that frames a prepared move in authored scenarios. */
  voice?: string;
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

export interface DialogueLine {
  speaker: string;
  line: string;
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

export interface ActionResolution {
  status: "executed" | "conditional" | "blocked";
  explanation: string;
  requirement?: string;
  cost: string;
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
  florence?: FlorenceMemory;
  advanceScene?: boolean;
  reflection?: string;
  nextTitle?: string;
  headline: string;
  summary: string;
  /** A fresh tactical situation for the next turn; it must not repeat summary. */
  nextBriefing?: string;
  dispatch: string;
  effects: Array<{ id: MetricId; delta: number; reason: string }>;
  reactions: FactionReaction[];
  /** Authored character exchange for scenarios that need a dramatic reply, not just a status card. */
  sceneDialogue?: DialogueLine[];
  nextOptions: DecisionOption[];
  daysPassed: number;
  surprise: string | null;
  scene: SceneCue;
  source: "ai" | "simulation";
  provider?: "deepseek" | "cloudflare" | "simulation";
  model?: string;
  usage?: ModelUsage;
  resolution?: ActionResolution;
}

export interface GameState {
  florence?: FlorenceMemory;
  /**
   * Present for a published mission. It tells the client to render the shared
   * authored mission frame instead of the legacy scenario art, and carries the
   * frame built from the pinned, immutable mission revision.
   */
  presentation?: PublishedMissionPresentation;
  /**
   * `pinned` means the live engine session could not be re-read (upstream
   * 5xx/timeout, or the mission was withdrawn from publication) and the game
   * continues on the authored revision pinned at session creation. The client
   * must say so instead of presenting pinned content as freshly synchronised.
   */
  contentSource?: "live" | "pinned";
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

export interface FlorenceMemory {
  version: 2;
  facts: Record<string, boolean>;
  /** Confirmed narrative events, including novel player actions, kept across turns. */
  events?: string[];
  trace: Array<{ turn: number; action: string; moves: string[]; status: ActionResolution['status']; cost: string }>;
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
