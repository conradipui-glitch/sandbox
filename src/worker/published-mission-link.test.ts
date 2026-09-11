import { describe, expect, it } from "vitest";
import worker from "./b11-entry";

/**
 * The publication-link contract, exercised through the real Worker entry with a
 * stubbed engine: the Studio links players to `/p/<releaseId>/`, and the site
 * must open exactly the published mission behind that link.
 */

const doc = {
  contentRevision: 1,
  contentHash: "a".repeat(64),
  story: {
    entrySceneId: "start",
    scenes: [{ id: "start", title: "Мастерская", text: "Ночь. Пахнет маслом.", choices: [{ id: "finish", label: "Закончить роспись", targetSceneId: null, endingId: "done" }] }],
    endings: [{ id: "done", title: "Рассвет", text: "Свет лёг на фреску." }]
  }
};
const releaseId = "release-mflorence1";
const catalog = {
  missions: [{
    publicMissionId: "mission:florence:florence-workshop",
    slug: "florence-master-class",
    releaseId,
    contentHash: "b".repeat(64),
    channel: "production",
    listing: { title: "Мастерская под давлением", summary: "Заказчик ждёт роспись.", period: "1512", place: "Флоренция", playerRole: "Художник", estimatedMinutes: 15, supportedModes: ["choice"] }
  }]
};
const SHELL = "<!doctype html><html><body><div id=\"root\"></div></body></html>";

class FakePublishedNamespace {
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

/** The legacy worker reaches its Durable Object for POST /api/games. */
class FakeLegacyNamespace {
  idFromName(name: string) { return name; }
  get(_id: string) {
    return { fetch: async () => Response.json({ id: "legacy-session", scenarioId: "florence-workshop", options: [] }, { status: 201 }) };
  }
}

function env(overrides: Record<string, unknown> = {}) {
  return {
    ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions",
    ENGINE_PUBLIC_MISSION_URL: "https://engine",
    PUBLIC_MISSION_ROUTE_SESSIONS: new FakePublishedNamespace(),
    HISTORY_SESSIONS: new FakeLegacyNamespace(),
    ASSETS: { fetch: async () => new Response(SHELL, { status: 200, headers: { "content-type": "text/html" } }) },
    ...overrides
  } as any;
}

/** The engine: catalog + public publication session API. */
function stubEngine(options: { catalogResponse?: () => Response } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://engine/public/v1/missions") return options.catalogResponse ? options.catalogResponse() : Response.json(catalog);
    if (url.endsWith("/sessions") && init?.method === "POST") {
      return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: "server-only" }), { status: 201 });
    }
    if (url.endsWith("/turns") && init?.method === "POST") {
      return Response.json({ mission: doc, session: { currentSceneId: "start", turn: 1, world: null }, target: { kind: "ending", endingId: "done" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}

describe("publication link: /p/<identifier>/ resolves the published mission", () => {
  it("answers the published card for the Studio's release-id link", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request(`https://site.example/api/missions/${releaseId}`), env());
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as { mission: { publicMissionId: string; releaseId: string } };
      expect(body.mission.publicMissionId).toBe("mission:florence:florence-workshop");
      expect(body.mission.releaseId).toBe(releaseId);
    } finally {
      restore();
    }
  });

  it("resolves the same publication by its slug and by its public id", async () => {
    const restore = stubEngine();
    try {
      for (const identifier of ["florence-master-class", "mission:florence:florence-workshop"]) {
        const response = await worker.fetch(new Request(`https://site.example/api/missions/${encodeURIComponent(identifier)}`), env());
        expect(response.status).toBe(200);
        const body = await response.json() as { mission: { publicMissionId: string } };
        expect(body.mission.publicMissionId).toBe("mission:florence:florence-workshop");
      }
    } finally {
      restore();
    }
  });

  it("answers 404 for a link that names no published mission", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request("https://site.example/api/missions/release-unknown"), env());
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json() as { code: string };
      expect(body.code).toBe("PUBLIC_MISSION_NOT_FOUND");
    } finally {
      restore();
    }
  });

  it("answers 5xx when the catalog cannot be read, never a missing mission", async () => {
    for (const upstream of [500, 404]) {
      const restore = stubEngine({ catalogResponse: () => new Response(null, { status: upstream }) });
      try {
        const response = await worker.fetch(new Request(`https://site.example/api/missions/${releaseId}`), env());
        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(response.status).toBeLessThan(600);
        expect(response.headers.get("x-lh-catalog-state")).toBe("unavailable");
        const body = await response.json() as { code: string };
        expect(body.code).toBe("PUBLIC_CATALOG_UNAVAILABLE");
      } finally {
        restore();
      }
    }
  });
});

describe("publication link: the page itself never lies about the link", () => {
  it("serves the site shell with 200 for a published link", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request(`https://site.example/p/${releaseId}/`), env());
      expect(response.status).toBe(200);
      expect(response.headers.get("x-lh-mission-link")).toBe("published");
      expect(await response.text()).toContain('id="root"');
    } finally {
      restore();
    }
  });

  it("serves the shell with 404 for an unknown link, so the player sees the honest state", async () => {
    const restore = stubEngine();
    try {
      for (const path of ["/p/release-unknown/", "/p/not%ZZ"]) {
        const response = await worker.fetch(new Request(`https://site.example${path}`), env());
        expect(response.status).toBe(404);
        expect(response.headers.get("x-lh-mission-link")).toBe("not-found");
        expect(await response.text()).toContain('id="root"');
      }
    } finally {
      restore();
    }
  });

  it("serves the shell with 5xx when the catalog is down", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("catalog timeout"); }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request(`https://site.example/p/${releaseId}/`), env());
      expect(response.status).toBe(503);
      expect(response.headers.get("x-lh-mission-link")).toBe("unavailable");
      expect(await response.text()).toContain('id="root"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("never re-wraps the shell with an encoding header the new response cannot honour", async () => {
    // The asset router serves the SPA shell gzipped. Re-wrapping the body to
    // carry the link's status must not keep claiming that encoding: a browser
    // that trusts the header renders an empty page.
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request(`https://site.example/p/${releaseId}/`), env({
        ASSETS: { fetch: async () => new Response(SHELL, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip", "content-length": String(SHELL.length), etag: "\"shell\"" } }) }
      }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      expect(response.headers.get("etag")).toBeNull();
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain('id="root"');
    } finally {
      restore();
    }
  });
});

describe("publication link: the session starts through the public game contract", () => {
  it("starts the published mission when the link's release id is used", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: releaseId, mode: "chronicle" })
      }), env());
      expect(response.status).toBe(201);
      const state = await response.json() as { scenarioId: string; presentation?: { kind: string; publicMissionId: string } };
      expect(state.presentation?.kind).toBe("published-mission");
      expect(state.presentation?.publicMissionId).toBe("mission:florence:florence-workshop");
      // The authored mission, not a legacy scenario, is what came back.
      expect(state.scenarioId).toBe("mission:florence:florence-workshop");
    } finally {
      restore();
    }
  });

  it("keeps an unknown published reference a 404 and never falls back to legacy", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "mission:unknown:quest", mode: "chronicle" })
      }), env());
      expect(response.status).toBe(404);
      const body = await response.json() as { code: string };
      expect(body.code).toBe("PUBLIC_MISSION_NOT_FOUND");
    } finally {
      restore();
    }
  });

  it("keeps a legacy card playable next to the published ones", async () => {
    const restore = stubEngine();
    try {
      const response = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "florence-workshop", mode: "chronicle" })
      }), env());
      // The published namespace must not intercept a legacy reference it does
      // not own: the legacy handler answers with its own game state.
      expect(response.status).toBe(201);
      const body = await response.json() as { id: string; presentation?: unknown };
      expect(body.id).toBe("legacy-session");
      expect(body.presentation).toBeUndefined();
    } finally {
      restore();
    }
  });
});
