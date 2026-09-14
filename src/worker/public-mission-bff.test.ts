import { describe, expect, it } from "vitest";
import { applyPublishedMissionTurn, createPublishedMissionSession, publishedMissionGameState } from "./public-mission-bff";

  const doc = {
    contentRevision: 2,
    contentHash: "a".repeat(64),
    story: {
      entrySceneId: "start",
      scenes: [{ id: "start", title: "Старт", text: "Ночь.", dialogue: [{ id: "s1", speakerId: null, text: "Ночь." }], choices: [{ id: "finish", label: "Закончить", targetSceneId: null, endingId: "done" }] }],
      endings: [{ id: "done", title: "Готово", text: "Рассвет." }]
    },
    screens: { intros: [{ id: "brief", title: "Пролог", body: "Найдите груз.", background: null }], scenes: {}, endings: {} }
  };
const listing = { title: "Груз", period: "1917 · Станция", role: "Кладовщик", hook: "Найти груз." };
const runtime = {
  schemaVersion: 1,
  locations: [{ id: "yard", title: "Двор", description: "Грузовой двор." }],
  participants: [{ id: "porter", title: "Носильщик", description: "Ждёт приказа." }],
  resources: [{ id: "coal", title: "Запас угля", description: "Топливо.", unit: "тонна", min: 0, max: 10 }]
};
const world0 = {
  schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 },
  locations: [{ id: "yard" }],
  entities: [{ id: "porter", type: "character", status: "waiting", locationId: "yard" }],
  resources: [{ id: "coal", unit: "тонна", value: 3, min: 0, max: 10 }], items: [], terminal: null
};
const world1 = {
  ...world0, revision: 1,
  resources: [{ id: "coal", unit: "тонна", value: 1, min: 0, max: 10 }]
};

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
      return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: world0 }, runtime, credential: "server-only" }), { status: 201 });
    }
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.binding).not.toHaveProperty("projectId");
  expect(result.binding.runtime).toEqual(runtime);
  expect(result.binding.world).toEqual(world0);
  expect(result.binding.history).toEqual([]);
  expect(result.view.title).toBe("Старт");
  const game = publishedMissionGameState(result.binding, result.view, "chronicle");
  expect(game.options[0].id).toBe("finish");
  expect(game.presentation?.runtime?.resources).toEqual([
    { id: "coal", title: "Запас угля", description: "Топливо.", unit: "тонна", value: 3, min: 0, max: 10, delta: 0 }
  ]);
  expect(game.presentation?.runtime?.participants).toEqual([
    { id: "porter", title: "Носильщик", description: "Ждёт приказа.", status: "waiting", locationId: "yard", locationTitle: "Двор" }
  ]);
});

it("applies a turn with the server-side credential and renders an ending", async () => {
  const created = await createPublishedMissionSession({ engineBaseUrl: "https://engine.example", publicMissionId: "mission:p:q", publicSessionId: "browser-session", mode: "chronicle", listing, newSessionId: () => "engine-session", fetchImpl: async () => new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: world0 }, runtime, credential: "server-only" }), { status: 201 }) });
  if (!created.ok) throw new Error("setup failed");
  const result = await applyPublishedMissionTurn({ binding: created.binding, choiceId: "finish", idempotencyKey: "turn-1", fetchImpl: async (_url, init) => {
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer server-only");
    return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 1, world: { ...world1, terminal: { outcome: "done" } } }, target: { kind: "ending", endingId: "done" } }), { status: 200 });
  } });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.view.sceneId).toBe("ending:done");
  expect(result.binding.world?.resources[0].value).toBe(1);
  expect(result.binding.history).toEqual([{
    id: "turn-1",
    turn: 1,
    choiceId: "finish",
    choiceLabel: "Закончить",
    fromTitle: "Старт",
    toTitle: "Готово",
    deltas: [{ resourceId: "coal", delta: -2 }],
    terminal: true
  }]);
  const state = publishedMissionGameState(result.binding, result.view, "chronicle", result.target);
  expect(state.status).toBe("victory");
  expect(state.presentation?.runtime?.resources[0].delta).toBe(-2);
  expect(state.presentation?.runtime?.history[0].choiceLabel).toBe("Закончить");
  expect(state.presentation?.runtime?.lastResolution?.toTitle).toBe("Готово");
});

it("carries the authored dialogue and the paged intros in the published state (FIN-05 site slice)", async () => {
  const created = await createPublishedMissionSession({ engineBaseUrl: "https://engine.example", publicMissionId: "mission:p:q", publicSessionId: "browser-session", mode: "chronicle", listing, newSessionId: () => "engine-session", fetchImpl: async () => new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: world0 }, runtime, credential: "server-only" }), { status: 201 }) });
  if (!created.ok) throw new Error("setup failed");
  const state = publishedMissionGameState(created.binding, created.view, "chronicle");
  const frame = state.presentation?.frame;
  expect(frame?.kind).toBe("scene");
  expect(frame?.turn).toBe(0);
  expect(frame?.dialogue?.map((entry) => entry.lineId)).toEqual(["s1"]);
  // The intros are attached as paged frames; the frame itself stays the scene,
  // so paging an intro never consumes a gameplay turn.
  expect(state.presentation?.intros?.map((page) => page.title)).toEqual(["Пролог"]);
  expect(state.presentation?.intros?.[0].introPage).toEqual({ index: 0, count: 1, hasNext: false });
});
