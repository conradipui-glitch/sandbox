import type { GameMode, GameState, ProductAnalyticsOverview, ScenarioSummary, SessionAnalyticsSummary, TurnSubmission } from "../shared/types";

const visitorStorageKey = "living-history-anonymous-visitor";

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
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const rawCode = (body as { code?: unknown }).code;
    const code = typeof rawCode === "string" ? rawCode : undefined;
    const message = body.error || `Ошибка ${response.status}`;
    // Keep provider diagnostics available during preview smoke checks without
    // exposing implementation codes in the ordinary player experience.
    const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
    throw new Error(debug && code ? `${message} [${code}]` : message);
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
  playTurn: (id: string, submission: TurnSubmission) =>
    request<GameState>(`/api/games/${id}/turn`, {
      method: "POST",
      body: JSON.stringify({ ...submission, visitorId: anonymousVisitorId(), idempotencyKey: crypto.randomUUID() }),
    }),
};
