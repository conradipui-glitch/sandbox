import { expect, it } from "vitest";
import {
  applyPublishedMissionTurn,
  createPublishedMissionSession,
  publishedMissionGameState,
  publishedMissionSceneView,
  reconcilePublishedMissionSession,
  type PublishedMissionBinding
} from "./public-mission-bff";

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

function endingWorld() {
  return { schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 }, locations: [], entities: [], resources: [], items: [], terminal: { reason: "mission.ending", outcome: "done" } };
}

async function started(): Promise<PublishedMissionBinding> {
  const created = await createPublishedMissionSession({
    engineBaseUrl: "https://engine.example",
    publicMissionId: "mission:p:q",
    publicSessionId: "browser-session",
    mode: "chronicle",
    listing,
    newSessionId: () => "engine-session",
    fetchImpl: async () => new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: "server-only" }), { status: 201 })
  });
  if (!created.ok) throw new Error("setup failed");
  return created.binding;
}

it("keeps the ending after the browser reloads the game", async () => {
  const binding = await started();
  const turned = await applyPublishedMissionTurn({
    binding,
    choiceId: "finish",
    idempotencyKey: "turn-1",
    fetchImpl: async () => new Response(JSON.stringify({
      mission: doc,
      session: { currentSceneId: "start", turn: 1, world: endingWorld() },
      target: { kind: "ending", endingId: "done" }
    }), { status: 200 })
  });
  expect(turned.ok).toBe(true);
  if (!turned.ok) return;
  expect(turned.view.sceneId).toBe("ending:done");

  // A reload renders from the stored binding alone, without the turn response.
  const reloaded = publishedMissionSceneView(turned.binding);
  expect(reloaded).not.toBeNull();
  expect(reloaded!.sceneId).toBe("ending:done");
  expect(reloaded!.choices.length).toBe(0);
  const state = publishedMissionGameState(turned.binding, reloaded!, "chronicle");
  expect(state.status).toBe("victory");
  expect(state.briefing).toContain("Рассвет.");
});

it("reconciles from the engine when the local binding write was lost", async () => {
  const binding = await started();
  const reconciled = await reconcilePublishedMissionSession({
    binding,
    fetchImpl: async (_url, init) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer server-only");
      return new Response(JSON.stringify({
        mission: doc,
        session: { currentSceneId: "start", turn: 1, world: endingWorld() }
      }), { status: 200 });
    }
  });
  expect(reconciled.ok).toBe(true);
  if (!reconciled.ok) return;
  expect(reconciled.binding.turn).toBe(1);
  const view = publishedMissionSceneView(reconciled.binding);
  expect(view?.sceneId).toBe("ending:done");
  expect(publishedMissionGameState(reconciled.binding, view!, "chronicle").status).toBe("victory");
});

it("retries a lost turn response without applying the effect twice", async () => {
  const binding = await started();
  const lost = await applyPublishedMissionTurn({
    binding,
    choiceId: "finish",
    idempotencyKey: "turn-1",
    fetchImpl: async () => { throw new Error("response lost"); }
  });
  expect(lost.ok).toBe(false);

  const seen: any[] = [];
  const retried = await applyPublishedMissionTurn({
    binding,
    choiceId: "finish",
    idempotencyKey: "turn-1",
    fetchImpl: async (_url, init) => {
      seen.push({ key: (init?.headers as Record<string, string>)["idempotency-key"], body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({
        mission: doc,
        session: { currentSceneId: "start", turn: 1, world: endingWorld() },
        target: { kind: "ending", endingId: "done" },
        replay: true
      }), { status: 200 });
    }
  });
  expect(seen[0].key).toBe("turn-1");
  expect(seen[0].body.baseTurn).toBe(0);
  expect(retried.ok).toBe(true);
  if (!retried.ok) return;
  expect(retried.replay).toBe(true);
  expect(publishedMissionSceneView(retried.binding)?.sceneId).toBe("ending:done");
});
