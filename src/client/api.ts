import type { GameMode, GameState, ProductAnalyticsOverview, ScenarioSummary, SessionAnalyticsSummary, TurnSubmission } from "../shared/types";

const visitorStorageKey = "living-history-anonymous-visitor";

/**
 * A failed API call with the HTTP status kept, so the client can distinguish a
 * genuinely missing session (404 — safe to forget) from an upstream failure
 * (5xx/timeout — the session is still valid and the request must be retried).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code) this.code = code;
  }
}

export function anonymousVisitorId(): string {
  const saved = localStorage.getItem(visitorStorageKey);
  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(visitorStorageKey, id);
  return id;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) {
    const rawCode = (body as { code?: unknown }).code;
    const code = typeof rawCode === "string" ? rawCode : undefined;
    const message = body.error || `Ошибка ${response.status}`;
    // Keep provider diagnostics available during preview smoke checks without
    // exposing implementation codes in the ordinary player experience.
    const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
    throw new ApiError(debug && code ? `${message} [${code}]` : message, response.status, code);
  }
  return body;
}

export const api = {
  scenarios: () => request<ScenarioSummary[]>("/api/scenarios"),
  createGame: (scenarioId: string, mode: GameMode) =>
    request<GameState>("/api/games", { method: "POST", body: JSON.stringify({ scenarioId, mode, visitorId: anonymousVisitorId() }) }),
  getGame: (id: string) => request<GameState>(`/api/games/${id}`, { headers: { "x-lh-visitor-id": anonymousVisitorId() } }),
  getGameMetrics: (id: string) => request<SessionAnalyticsSummary>(`/api/games/${id}/metrics`),
  analyticsOverview: (token: string) => request<ProductAnalyticsOverview>("/api/analytics/overview", { headers: { "x-lh-analytics-token": token } }),
  /**
   * `idempotencyKey` can be passed to replay the exact same turn after a
   * transport failure instead of silently creating a second one.
   */
  playTurn: (id: string, submission: TurnSubmission, idempotencyKey?: string) =>
    request<GameState>(`/api/games/${id}/turn`, {
      method: "POST",
      body: JSON.stringify({ ...submission, visitorId: anonymousVisitorId(), idempotencyKey: idempotencyKey ?? crypto.randomUUID() }),
    }),
};
