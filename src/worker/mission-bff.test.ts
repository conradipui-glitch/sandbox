import { describe, expect, it, vi } from "vitest";
import {
  applyMissionPreviewTurn,
  createMissionPreviewSession,
  type MissionBffBinding,
  type MissionBffRegistry
} from "./mission-bff";

const registry: MissionBffRegistry = {
  "cargo-station": { projectId: "station-project", questId: "cargo-quest" },
  "night-watch": { projectId: "station-project", questId: "watch-quest" }
};

function missionDoc() {
  return {
    contentRevision: 3,
    contentHash: "c".repeat(64),
    story: {
      entrySceneId: "depot",
      scenes: [
        {
          id: "depot",
          title: "Депо",
          text: "Ночь.",
          choices: [
            { id: "go-tracks", label: "На пути", targetSceneId: "tracks", endingId: null },
            { id: "go-watchman", label: "В сторожку", targetSceneId: "watchman", endingId: null }
          ]
        },
        {
          id: "tracks",
          title: "Пути",
          text: "Тупик.",
          choices: [{ id: "open", label: "Открыть", targetSceneId: null, endingId: "found" }]
        },
        {
          id: "watchman",
          title: "Сторожка",
          text: "Молчание.",
          choices: [{ id: "leave", label: "Уйти", targetSceneId: null, endingId: "lost" }]
        }
      ],
      endings: [
        { id: "found", title: "Найден", text: "Ящики." },
        { id: "lost", title: "Потерян", text: "Рассвело." }
      ]
    }
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubEngine(scenes: Record<string, { scene: string; turn: number; target?: unknown }>) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === "POST" && path.endsWith("/mission/sessions")) {
      return jsonResponse({ session: { currentSceneId: "depot", turn: 0 } }, 201);
    }
    if (init?.method === "POST" && path.endsWith("/turns")) {
      const body = JSON.parse(String(init.body)) as { baseTurn: number; choiceId: string };
      const key = `${body.baseTurn}:${body.choiceId}`;
      const next = scenes[key];
      if (!next) return jsonResponse({ error: { code: "MISSION_TURN_CONFLICT", currentTurn: 1 } }, 409);
      return jsonResponse({ session: { currentSceneId: next.scene, turn: next.turn }, target: next.target ?? { kind: "scene", sceneId: next.scene } });
    }
    return jsonResponse({ mission: missionDoc() });
  });
}

const base = {
  controlBaseUrl: "http://engine.test",
  registry,
  newSessionId: (() => {
    let n = 0;
    return () => `bff-session-${(n += 1)}`;
  })()
};

describe("M02 mission BFF without per-quest branches", () => {
  it("starts two registry missions and diverges A/B without new ifs", async () => {
    const fetchImpl = stubEngine({
      "0:go-tracks": { scene: "tracks", turn: 1 },
      "0:go-watchman": { scene: "watchman", turn: 1 }
    });
    const startedA = await createMissionPreviewSession({ ...base, fetchImpl, scenarioRef: "cargo-station", publicSessionId: "pub-a" });
    expect(startedA.ok).toBe(true);
    if (!startedA.ok) return;
    expect(startedA.view.sceneId).toBe("depot");
    expect(startedA.view.choices.map((choice) => choice.choiceId)).toEqual(["go-tracks", "go-watchman"]);

    const startedB = await createMissionPreviewSession({ ...base, fetchImpl, scenarioRef: "night-watch", publicSessionId: "pub-b" });
    expect(startedB.ok).toBe(true);
    if (!startedB.ok) return;

    const turnA = await applyMissionPreviewTurn({
      fetchImpl,
      controlBaseUrl: base.controlBaseUrl,
      binding: startedA.binding as MissionBffBinding,
      choiceId: "go-tracks",
      idempotencyKey: "bff-turn-a"
    });
    expect(turnA.ok).toBe(true);
    if (!turnA.ok) return;
    expect(turnA.view.sceneId).toBe("tracks");

    const turnB = await applyMissionPreviewTurn({
      fetchImpl,
      controlBaseUrl: base.controlBaseUrl,
      binding: startedB.binding as MissionBffBinding,
      choiceId: "go-watchman",
      idempotencyKey: "bff-turn-b"
    });
    expect(turnB.ok).toBe(true);
    if (!turnB.ok) return;
    expect(turnB.view.sceneId).toBe("watchman");
  });

  it("rejects unknown scenarios, foreign choices and stale turns", async () => {
    const fetchImpl = stubEngine({ "0:go-tracks": { scene: "tracks", turn: 1 } });
    const unknown = await createMissionPreviewSession({ ...base, fetchImpl, scenarioRef: "nope", publicSessionId: "pub-x" });
    expect(unknown).toMatchObject({ ok: false, status: 404, code: "MISSION_UNKNOWN" });

    const started = await createMissionPreviewSession({ ...base, fetchImpl, scenarioRef: "cargo-station", publicSessionId: "pub-y" });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const foreign = await applyMissionPreviewTurn({
      fetchImpl,
      controlBaseUrl: base.controlBaseUrl,
      binding: started.binding as MissionBffBinding,
      choiceId: "hack",
      idempotencyKey: "bff-turn-x"
    });
    expect(foreign).toMatchObject({ ok: false, status: 422, code: "MISSION_CHOICE_NOT_IN_SCENE" });

    const stale = await applyMissionPreviewTurn({
      fetchImpl,
      controlBaseUrl: base.controlBaseUrl,
      binding: started.binding as MissionBffBinding,
      choiceId: "go-watchman",
      idempotencyKey: "bff-turn-y"
    });
    expect(stale).toMatchObject({ ok: false, status: 409, code: "MISSION_TURN_CONFLICT" });
  });

  it("maps engine outage to 503 without leaking upstream bodies", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const started = await createMissionPreviewSession({ ...base, fetchImpl, scenarioRef: "cargo-station", publicSessionId: "pub-z" });
    expect(started).toMatchObject({ ok: false, status: 503, code: "MISSION_ENGINE_UNAVAILABLE" });
  });
});
