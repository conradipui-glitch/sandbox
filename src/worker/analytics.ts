import type { ActionSource, ModelUsage, SessionAnalyticsSummary } from "../shared/types";

export interface SessionAnalytics extends SessionAnalyticsSummary {
  anonymousVisitorId: string | null;
  resolutionMsTotal: number;
}

export interface SuccessfulTurnMetric {
  source: ActionSource;
  provider: "deepseek" | "cloudflare" | "simulation";
  usage?: ModelUsage;
  resolutionMs: number;
  occurredAt: string;
}

const dayKey = (isoDate: string) => isoDate.slice(0, 10);

export function normalizeVisitorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export function createSessionAnalytics(visitorId: string | null, startedAt: string): SessionAnalytics {
  return {
    schemaVersion: 1,
    anonymousVisitorId: visitorId,
    startedAt,
    lastActiveAt: startedAt,
    activeDays: [dayKey(startedAt)],
    meaningfulActions: 0,
    preparedActions: 0,
    freeformActions: 0,
    aiTurns: 0,
    simulationTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    resolutionMsTotal: 0,
    averageResolutionMs: 0,
    maxResolutionMs: 0,
  };
}

export function registerSessionOpen(
  current: SessionAnalytics | undefined,
  visitorId: string | null,
  occurredAt: string,
): SessionAnalytics {
  const analytics = current ?? createSessionAnalytics(visitorId, occurredAt);
  const currentDay = dayKey(occurredAt);
  const activeDays = analytics.activeDays.includes(currentDay)
    ? analytics.activeDays
    : [...analytics.activeDays, currentDay].slice(-31);

  return {
    ...analytics,
    anonymousVisitorId: analytics.anonymousVisitorId ?? visitorId,
    lastActiveAt: occurredAt,
    activeDays,
  };
}

export function recordSuccessfulTurn(current: SessionAnalytics, metric: SuccessfulTurnMetric): SessionAnalytics {
  const meaningfulActions = current.meaningfulActions + 1;
  const resolutionMs = Math.max(0, Math.round(metric.resolutionMs));
  const resolutionMsTotal = current.resolutionMsTotal + resolutionMs;
  const usage = metric.usage;

  return {
    ...registerSessionOpen(current, current.anonymousVisitorId, metric.occurredAt),
    meaningfulActions,
    preparedActions: current.preparedActions + (metric.source === "prepared" ? 1 : 0),
    freeformActions: current.freeformActions + (metric.source === "freeform" ? 1 : 0),
    aiTurns: current.aiTurns + (metric.provider === "simulation" ? 0 : 1),
    simulationTurns: current.simulationTurns + (metric.provider === "simulation" ? 1 : 0),
    inputTokens: current.inputTokens + (usage?.inputTokens ?? 0),
    outputTokens: current.outputTokens + (usage?.outputTokens ?? 0),
    totalTokens: current.totalTokens + (usage?.totalTokens ?? 0),
    resolutionMsTotal,
    averageResolutionMs: Math.round(resolutionMsTotal / meaningfulActions),
    maxResolutionMs: Math.max(current.maxResolutionMs, resolutionMs),
  };
}

export function publicAnalytics(analytics: SessionAnalytics): SessionAnalyticsSummary {
  const { anonymousVisitorId: _anonymousVisitorId, resolutionMsTotal: _resolutionMsTotal, ...summary } = analytics;
  return summary;
}
