import type { GameMode, GameState, ScenarioSummary } from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Ошибка ${response.status}`);
  return body;
}

export const api = {
  scenarios: () => request<ScenarioSummary[]>("/api/scenarios"),
  createGame: (scenarioId: string, mode: GameMode) =>
    request<GameState>("/api/games", { method: "POST", body: JSON.stringify({ scenarioId, mode }) }),
  getGame: (id: string) => request<GameState>(`/api/games/${id}`),
  playTurn: (id: string, action: string) =>
    request<GameState>(`/api/games/${id}/turn`, {
      method: "POST",
      body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID() }),
    }),
};
