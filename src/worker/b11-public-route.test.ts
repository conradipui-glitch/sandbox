import { describe, expect, it } from "vitest";
import worker from "./b11-entry";

const doc = {
  contentRevision: 1,
  contentHash: "a".repeat(64),
  story: { entrySceneId: "start", scenes: [{ id: "start", title: "Старт", text: "Ночь.", choices: [{ id: "finish", label: "Закончить", targetSceneId: null, endingId: "done" }] }], endings: [{ id: "done", title: "Готово", text: "Рассвет." }] }
};
const catalog = { missions: [{ publicMissionId: "mission:p:q", slug: "cargo", releaseId: "release-1", contentHash: "b".repeat(64), channel: "production", listing: { title: "Груз", summary: "Найти груз.", period: "1917", place: "Станция", playerRole: "Кладовщик", estimatedMinutes: 10, supportedModes: ["choice"] } }] };

class FakeNamespace {
  readonly records = new Map<string, unknown>();
  idFromName(name: string) { return name; }
  get(id: string) {
    return { fetch: async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { this.records.set(id, JSON.parse(String(init.body))); return Response.json({ ok: true }); }
      const value = this.records.get(id);
      return value ? Response.json(value) : new Response(null, { status: 404 });
    } };
  }
}

describe("M06 generic published mission route", () => {
  it("keeps the finale when the player reloads the page (F04)", async () => {
    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    // The engine keeps the entry scene id at a finale and records the ending
    // in the world; the authoritative GET must therefore be reconciled.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://engine/public/v1/missions") return Response.json(catalog);
      if (url.endsWith("/sessions") && init?.method === "POST") return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: "server-only" }), { status: 201 });
      if (url.endsWith("/turns") && init?.method === "POST") {
        return Response.json({ mission: doc, session: { currentSceneId: "start", turn: 1, world: { schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 }, locations: [], entities: [], resources: [], items: [], terminal: { reason: "mission.ending", outcome: "done" } } }, target: { kind: "ending", endingId: "done" } });
      }
      if (init?.method === "GET" && url.includes("/sessions/")) {
        return Response.json({ mission: doc, session: { currentSceneId: "start", turn: 1, world: { schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 }, locations: [], entities: [], resources: [], items: [], terminal: { reason: "mission.ending", outcome: "done" } } } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const env = { ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions", ENGINE_PUBLIC_MISSION_URL: "https://engine", PUBLIC_MISSION_ROUTE_SESSIONS: namespace } as any;
      const created = await worker.fetch(new Request("https://site.example/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "mission:p:q", mode: "chronicle" }) }), env);
      expect(created.status).toBe(201);
      const game = await created.json() as { id: string };
      const turned = await worker.fetch(new Request(`https://site.example/api/games/${game.id}/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finish", source: "prepared", optionId: "finish", idempotencyKey: "turn-1" }) }), env);
      expect(turned.status).toBe(200);
      expect((await turned.json() as { status: string }).status).toBe("victory");

      const reloaded = await worker.fetch(new Request(`https://site.example/api/games/${game.id}`), env);
      expect(reloaded.status).toBe(200);
      const state = await reloaded.json() as { status: string; options: unknown[]; briefing: string };
      expect(state.status).toBe("victory");
      expect(state.options.length).toBe(0);
      expect(state.briefing).toContain("Рассвет.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates, reloads and advances a published card through the worker BFF", async () => {
    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://engine/public/v1/missions") return Response.json(catalog);
      if (url.endsWith("/sessions") && init?.method === "POST") return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0 }, credential: "server-only" }), { status: 201 });
      if (url.endsWith("/turns") && init?.method === "POST") return Response.json({ mission: doc, session: { currentSceneId: "start", turn: 1 }, target: { kind: "ending", endingId: "done" } });
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const env = { ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions", ENGINE_PUBLIC_MISSION_URL: "https://engine", PUBLIC_MISSION_ROUTE_SESSIONS: namespace } as any;
      const created = await worker.fetch(new Request("https://site.example/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "mission:p:q", mode: "chronicle" }) }), env);
      expect(created.status).toBe(201);
      const game = await created.json() as { id: string; options: Array<{ id: string }> };
      expect(game.options[0].id).toBe("finish");
      const reloaded = await worker.fetch(new Request(`https://site.example/api/games/${game.id}`), env);
      expect(reloaded.status).toBe(200);
      const turned = await worker.fetch(new Request(`https://site.example/api/games/${game.id}/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finish", source: "prepared", optionId: "finish", idempotencyKey: "turn-1" }) }), env);
      expect(turned.status).toBe(200);
      expect((await turned.json() as { status: string }).status).toBe("victory");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
