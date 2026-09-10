import { describe, expect, it } from "vitest";
import worker from "./b11-entry";

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

const doc = {
  contentRevision: 1,
  contentHash: "a".repeat(64),
  story: { entrySceneId: "start", scenes: [{ id: "start", title: "Старт", text: "Ночь.", choices: [] }], endings: [{ id: "done", title: "Готово", text: "Рассвет." }] }
};
const catalog = { missions: [{ publicMissionId: "mission:p:q", slug: "cargo", releaseId: "release-1", contentHash: "b".repeat(64), channel: "production", listing: { title: "Груз", summary: "Найти груз.", period: "1917", place: "Станция", playerRole: "Кладовщик", estimatedMinutes: 10, supportedModes: ["choice"] } }] };

function env(namespace = new FakeNamespace()) {
  return { ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions", ENGINE_PUBLIC_MISSION_URL: "https://engine", PUBLIC_MISSION_ROUTE_SESSIONS: namespace } as any;
}

describe("R03/F06 published namespace never falls back to legacy", () => {
  it("answers a 5xx instead of a hidden legacy fallback when the catalog is down", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) return new Response(null, { status: 503 });
      // A legacy fallback would answer 200 here: it must not be reached.
      return Response.json([{ id: "florence-workshop", title: "Мастерская" }]);
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "mission:p:q", mode: "chronicle" }) }), env());
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.status).toBeLessThan(600);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("answers 404 for an unknown published mission instead of creating a legacy game", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) return Response.json(catalog);
      return Response.json({ id: "legacy-game", options: [] });
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "mission:missing:quest", mode: "chronicle" }) }), env());
      expect(response.status).toBe(404);
      const body = await response.json() as { code?: string };
      expect(body.code).toBe("PUBLIC_MISSION_NOT_FOUND");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still routes a supported legacy scenario to the legacy handler", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) return Response.json(catalog);
      return Response.json({ id: "legacy-game", options: [] });
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "florence-workshop", mode: "chronicle" }) }), env());
      // The legacy handler keeps its own contract: the published namespace must
      // not intercept an unknown-to-catalog non-mission reference.
      const body = await response.json().catch(() => null) as { code?: string } | null;
      expect(body?.code).not.toBe("PUBLIC_MISSION_NOT_FOUND");
      expect(response.status).not.toBe(404);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps legacy cards visible in the catalog next to published ones", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) return Response.json(catalog);
      return Response.json([{ id: "florence-workshop", title: "Мастерская", period: "1492", role: "Подмастерье", hook: "Заказ гильдии" }]);
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/scenarios"), env());
      expect(response.status).toBe(200);
      const cards = await response.json() as Array<{ id: string }>;
      const ids = cards.map((card) => card.id);
      expect(ids).toContain("mission:p:q");
      expect(ids).toContain("florence-workshop");
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("answers an explicit failure instead of a stale catalog when the catalog upstream times out (E17)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) throw new Error("catalog upstream timeout");
      // A stale list answered as 200 here is exactly the defect: it must not be reached.
      return Response.json([{ id: "florence-workshop", title: "Мастерская" }]);
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/scenarios"), env());
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-lh-catalog-state")).toBe("unavailable");
      const body = await response.json() as { code?: string; error?: string };
      expect(body.code).toBe("PUBLIC_CATALOG_UNAVAILABLE");
      expect(body.error).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks a successfully refreshed catalog as live", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("public/v1/missions")) return Response.json(catalog);
      return Response.json([{ id: "florence-workshop", title: "Мастерская", period: "1492", role: "Подмастерье", hook: "Заказ гильдии" }]);
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request("https://site.example/api/scenarios"), env());
      expect(response.status).toBe(200);
      expect(response.headers.get("x-lh-catalog-state")).toBe("live");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
