import { describe, expect, it } from "vitest";
import { applyPublishedMissionTurn, createPublishedMissionSession, publishedMissionGameState } from "./public-mission-bff";

const doc = {
  contentRevision: 2,
  contentHash: "a".repeat(64),
  story: {
    entrySceneId: "start",
    scenes: [{ id: "start", title: "Старт", text: "Ночь.", choices: [{ id: "finish", label: "Закончить", targetSceneId: null, endingId: "done" }] }],
    endings: [{ id: "done", title: "Готово", text: "Рассвет." }]
  }
};
const listing = { title: "Груз", period: "1917 · Станция", role: "Кладовщик", hook: "Найти груз." };

it("creates a public binding without exposing engine project coordinates", async () => {
  const result = await createPublishedMissionSession({
    engineBaseUrl: "https://engine.example/",
    publicMissionId: "mission:p:q",
    publicSessionId: "browser-session",
    mode: "chronicle",
    listing,
    newSessionId: () => "engine-session",
    fetchImpl: async (url, init) => {
      expect(url).toBe("https://engine.example/public/v1/missions/mission%3Ap%3Aq/sessions");
      expect(init?.headers).toMatchObject({ "idempotency-key": "public-bff-browser-session" });
      return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0 }, credential: "server-only" }), { status: 201 });
    }
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.binding).not.toHaveProperty("projectId");
  expect(result.view.title).toBe("Старт");
  expect(publishedMissionGameState(result.binding, result.view, "chronicle").options[0].id).toBe("finish");
});

it("applies a turn with the server-side credential and renders an ending", async () => {
  const created = await createPublishedMissionSession({ engineBaseUrl: "https://engine.example", publicMissionId: "mission:p:q", publicSessionId: "browser-session", mode: "chronicle", listing, newSessionId: () => "engine-session", fetchImpl: async () => new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0 }, credential: "server-only" }), { status: 201 }) });
  if (!created.ok) throw new Error("setup failed");
  const result = await applyPublishedMissionTurn({ binding: created.binding, choiceId: "finish", idempotencyKey: "turn-1", fetchImpl: async (_url, init) => {
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer server-only");
    return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 1 }, target: { kind: "ending", endingId: "done" } }), { status: 200 });
  } });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.view.sceneId).toBe("ending:done");
  expect(publishedMissionGameState(result.binding, result.view, "chronicle", result.target).status).toBe("victory");
});
