import type { ActionResolution, ActionSource, GameMode, ModelUsage, ProductAnalyticsDay, ProductAnalyticsOverview } from "../shared/types";

const schemaVersion = 1 as const;
const retentionDays = 35;

export interface ProductAnalyticsEvent {
  type: "session_started" | "session_opened" | "meaningful_action_completed";
  occurredAt: string;
  visitorId: string | null;
  sessionId: string;
  scenarioId: string;
  mode: GameMode;
  source?: ActionSource;
  provider?: "deepseek" | "cloudflare" | "simulation";
  usage?: ModelUsage;
  resolutionMs?: number;
  resolutionStatus?: ActionResolution["status"];
  statusAfterTurn?: "active" | "collapsed" | "victory";
}

interface AnalyticsState {
  schemaVersion: 1;
  days: Record<string, ProductAnalyticsDay>;
  updatedAt: string | null;
}

interface VisitorAnalyticsState {
  firstSeenDay: string;
  lastActiveDay: string;
  lastActionDay: string | null;
  returnedOnD1: boolean;
}

interface AnalyticsEnv {}

const dayFrom = (isoDate: string) => isoDate.slice(0, 10);

function nextDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

function emptyDay(day: string): ProductAnalyticsDay {
  return {
    day,
    uniqueVisitors: 0,
    activatedVisitors: 0,
    newVisitors: 0,
    startedSessions: 0,
    finishedSessions: 0,
    meaningfulActions: 0,
    preparedActions: 0,
    freeformActions: 0,
    aiTurns: 0,
    simulationTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    resolutionMsTotal: 0,
    resolutionCount: 0,
    maxResolutionMs: 0,
    d1ReturnedVisitors: 0,
  };
}

function emptyState(): AnalyticsState {
  return { schemaVersion, days: {}, updatedAt: null };
}

function safeInteger(value: unknown): number {
  const number = typeof value === "number" ? value : 0;
  return Number.isFinite(number) ? Math.max(0, Math.min(10_000_000, Math.round(number))) : 0;
}

function isVisitorId(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function pruneDays(days: Record<string, ProductAnalyticsDay>, currentDay: string): Record<string, ProductAnalyticsDay> {
  const cutoff = new Date(`${currentDay}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays + 1);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(days).filter(([day]) => day >= cutoffDay));
}

export function recordProductEvent(
  current: AnalyticsState | undefined,
  event: ProductAnalyticsEvent,
  currentVisitor: VisitorAnalyticsState | undefined,
): { state: AnalyticsState; visitor: VisitorAnalyticsState | undefined } {
  const day = dayFrom(event.occurredAt);
  const state = current ?? emptyState();
  const days = pruneDays({ ...state.days }, day);
  const daily = { ...(days[day] ?? emptyDay(day)) };
  days[day] = daily;

  let visitor = currentVisitor;
  if (isVisitorId(event.visitorId)) {
    if (!visitor) {
      visitor = { firstSeenDay: day, lastActiveDay: day, lastActionDay: null, returnedOnD1: false };
      daily.newVisitors += 1;
      daily.uniqueVisitors += 1;
    } else if (visitor.lastActiveDay !== day) {
      daily.uniqueVisitors += 1;
      if (!visitor.returnedOnD1 && day === nextDay(visitor.firstSeenDay)) {
        visitor = { ...visitor, returnedOnD1: true };
        const cohort = { ...(days[visitor.firstSeenDay] ?? emptyDay(visitor.firstSeenDay)) };
        cohort.d1ReturnedVisitors += 1;
        days[visitor.firstSeenDay] = cohort;
      }
      visitor = { ...visitor, lastActiveDay: day };
    }
  }

  if (event.type === "session_started") daily.startedSessions += 1;
  if (event.type === "meaningful_action_completed") {
    daily.meaningfulActions += 1;
    daily.preparedActions += event.source === "prepared" ? 1 : 0;
    daily.freeformActions += event.source === "freeform" ? 1 : 0;
    daily.aiTurns += event.provider && event.provider !== "simulation" ? 1 : 0;
    daily.simulationTurns += event.provider === "simulation" ? 1 : 0;
    daily.inputTokens += safeInteger(event.usage?.inputTokens);
    daily.outputTokens += safeInteger(event.usage?.outputTokens);
    daily.totalTokens += safeInteger(event.usage?.totalTokens);
    const resolutionMs = safeInteger(event.resolutionMs);
    daily.resolutionMsTotal += resolutionMs;
    daily.resolutionCount += 1;
    daily.maxResolutionMs = Math.max(daily.maxResolutionMs, resolutionMs);
    if (event.statusAfterTurn && event.statusAfterTurn !== "active") daily.finishedSessions += 1;
    if (visitor && visitor.lastActionDay !== day) {
      daily.activatedVisitors += 1;
      visitor = { ...visitor, lastActionDay: day };
    }
  }

  return {
    state: { schemaVersion, days, updatedAt: event.occurredAt },
    visitor,
  };
}

function sumDays(days: ProductAnalyticsDay[]): Omit<ProductAnalyticsDay, "day"> {
  const totals = emptyDay("total");
  for (const day of days) {
    totals.uniqueVisitors += day.uniqueVisitors;
    totals.activatedVisitors += day.activatedVisitors;
    totals.newVisitors += day.newVisitors;
    totals.startedSessions += day.startedSessions;
    totals.finishedSessions += day.finishedSessions;
    totals.meaningfulActions += day.meaningfulActions;
    totals.preparedActions += day.preparedActions;
    totals.freeformActions += day.freeformActions;
    totals.aiTurns += day.aiTurns;
    totals.simulationTurns += day.simulationTurns;
    totals.inputTokens += day.inputTokens;
    totals.outputTokens += day.outputTokens;
    totals.totalTokens += day.totalTokens;
    totals.resolutionMsTotal += day.resolutionMsTotal;
    totals.resolutionCount += day.resolutionCount;
    totals.maxResolutionMs = Math.max(totals.maxResolutionMs, day.maxResolutionMs);
    totals.d1ReturnedVisitors += day.d1ReturnedVisitors;
  }
  const { day: _day, ...summary } = totals;
  return summary;
}

export function overviewFromState(current: AnalyticsState | undefined, generatedAt: string): ProductAnalyticsOverview {
  const days = Object.values(current?.days ?? {}).sort((left, right) => left.day.localeCompare(right.day));
  const totals = sumDays(days);
  const lastDataDay = days.at(-1)?.day ?? null;
  const currentDay = dayFrom(generatedAt);
  const d1EligibleVisitors = days
    .filter((day) => day.day < currentDay)
    .reduce((total, day) => total + day.newVisitors, 0);
  return {
    schemaVersion,
    generatedAt,
    firstDataDay: days[0]?.day ?? null,
    lastDataDay,
    days,
    totals,
    d1EligibleVisitors,
    d1ReturnedVisitors: totals.d1ReturnedVisitors,
  };
}

export class ProductAnalytics implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: AnalyticsEnv,
  ) {}

  private async record(event: ProductAnalyticsEvent): Promise<void> {
    const key = isVisitorId(event.visitorId) ? `visitor:${event.visitorId}` : null;
    const [state, visitor] = await Promise.all([
      this.ctx.storage.get<AnalyticsState>("overview"),
      key ? this.ctx.storage.get<VisitorAnalyticsState>(key) : Promise.resolve(undefined),
    ]);
    const next = recordProductEvent(state, event, visitor);
    await this.ctx.storage.put("overview", next.state);
    if (key && next.visitor) await this.ctx.storage.put(key, next.visitor);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/record") {
      const event = (await request.json()) as ProductAnalyticsEvent;
      await this.record(event);
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && url.pathname === "/overview") {
      const state = await this.ctx.storage.get<AnalyticsState>("overview");
      return Response.json(overviewFromState(state, new Date().toISOString()), { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Маршрут аналитики не найден" }, { status: 404 });
  }
}
