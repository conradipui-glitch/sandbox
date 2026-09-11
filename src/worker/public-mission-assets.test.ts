import { describe, expect, it } from "vitest";
import worker from "./b11-entry";
import {
  createPublishedMissionSession,
  fetchPublishedMissionAsset,
  publishedMissionAssetUrl,
  publishedMissionGameState,
  type PublishedMissionBinding
} from "./public-mission-bff";

const doc = {
  contentRevision: 3,
  contentHash: "c".repeat(64),
  story: {
    entrySceneId: "start",
    scenes: [{ id: "start", title: "Смена", text: "Гудит реактор.", choices: [{ id: "seal", label: "Герметизировать" }] }],
    endings: [{ id: "done", title: "Тихий контур", text: "Никто не пришёл." }]
  },
  screens: {
    intros: [],
    scenes: { start: { background: { assetId: "bunker-bg", hash: "d".repeat(64) }, music: null, layers: [] } },
    endings: {}
  },
  defaults: null
};
const listing = { title: "Смена", period: "1986", role: "Инженер", hook: "Не дать контуру разойтись." };

const BINDING_CREDENTIAL = "session-credential-value";

async function started(): Promise<PublishedMissionBinding> {
  const created = await createPublishedMissionSession({
    engineBaseUrl: "https://engine.example",
    publicMissionId: "mission:chernobyl:shift",
    publicSessionId: "browser-session",
    mode: "chronicle",
    listing,
    newSessionId: () => "engine-session",
    fetchImpl: async () => new Response(
      JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: BINDING_CREDENTIAL }),
      { status: 201 }
    )
  });
  if (!created.ok) throw new Error("setup failed");
  return created.binding;
}

function pngBytes(): ArrayBuffer {
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
}

function byteList(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer));
}

describe("FIN-03 B04 site side: assets of an already started published mission", () => {
  it("requests the asset for the pinned revision with the session credential", async () => {
    const binding = await started();
    const seen: Array<{ url: string; authorization: string | null }> = [];
    const response = await fetchPublishedMissionAsset({
      binding,
      assetId: "bunker-bg",
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
        return new Response(pngBytes(), { status: 200, headers: { "content-type": "image/png" } });
      }
    });
    // The credential is what keeps the asset available after unpublish/republish.
    // FIN-03 стыковка: the upstream URL is pinned to the *engine* session the
    // credential was issued for, not the browser session id.
    expect(seen[0].url).toBe("https://engine.example/public/v1/missions/mission%3Achernobyl%3Ashift/sessions/engine-session/assets/bunker-bg");
    expect(seen[0].authorization).toBe(`Bearer ${BINDING_CREDENTIAL}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("keeps the bytes immutable only with an explicit revision identity in the URL and etag", async () => {
    const binding = await started();
    const response = await fetchPublishedMissionAsset({
      binding,
      assetId: "bunker-bg",
      fetchImpl: async () => new Response(pngBytes(), { status: 200, headers: { "content-type": "image/png" } })
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(pngBytes()));
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("cache-control")).toContain("private");
    const etag = response.headers.get("etag") ?? "";
    expect(etag).toContain(doc.contentHash.slice(0, 32));
    expect(etag).toContain("bunker-bg");
    expect(response.headers.get("x-mission-revision")).toBe("3");
  });

  it("never marks a failed upstream request as immutable or fresh", async () => {
    const binding = await started();
    const timedOut = await fetchPublishedMissionAsset({
      binding,
      assetId: "bunker-bg",
      fetchImpl: async () => { throw new Error("upstream timeout"); }
    });
    expect(timedOut.status).toBe(503);
    expect(timedOut.headers.get("cache-control")).toBe("no-store");
    expect(await timedOut.json()).toMatchObject({ code: "MISSION_ASSET_UNAVAILABLE" });

    const missing = await fetchPublishedMissionAsset({
      binding,
      assetId: "bunker-bg",
      fetchImpl: async () => new Response(null, { status: 404 })
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.json()).toMatchObject({ code: "MISSION_ASSET_NOT_FOUND" });
  });
});

describe("FIN-03 B04: the asset URL depends on the started session, not the current publication", () => {
  it("pins the URL to the session so a republished revision cannot steal it", async () => {
    const binding = await started();
    expect(publishedMissionAssetUrl(binding, "bunker-bg")).toBe(
      "/api/missions/mission%3Achernobyl%3Ashift/sessions/browser-session/assets/bunker-bg"
    );
  });

  it("renders the pinned asset URL into the authored frame", async () => {
    const binding = await started();
    const state = publishedMissionGameState(binding, { sceneId: "start", title: "Смена", text: "Гудит.", choices: [], turn: 0, contentRevision: 3, contentHash: doc.contentHash }, "chronicle");
    expect(state.presentation?.frame.scene.backgroundUrl).toBe(
      "/api/missions/mission%3Achernobyl%3Ashift/sessions/browser-session/assets/bunker-bg"
    );
    expect(state.contentSource).toBe("live");
  });
});

describe("FIN-03 B04 worker route: /api/missions/:ref/sessions/:id/assets/:assetId", () => {
  const catalogWithMission = { missions: [{ publicMissionId: "mission:chernobyl:shift", slug: "chernobyl-shift", releaseId: "release-1", contentHash: "e".repeat(64), channel: "production", listing: { title: "Смена", summary: "Не дать контуру разойтись.", period: "1986", place: "Блок 4", playerRole: "Инженер", estimatedMinutes: 12, supportedModes: ["choice"] } }] };

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

  it("serves a started game's asset even after the mission is no longer in the published catalog", async () => {
    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    const assetRequests: Array<{ url: string; authorization: string | null }> = [];
    let catalogPublished = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://engine/public/v1/missions") {
        return Response.json(catalogPublished ? catalogWithMission : { missions: [] });
      }
      if (url.endsWith("/sessions") && init?.method === "POST") {
        return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: BINDING_CREDENTIAL }), { status: 201 });
      }
      if (url.includes("/assets/")) {
        assetRequests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
        return new Response(pngBytes(), { status: 200, headers: { "content-type": "image/png" } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const env = {
        ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions",
        ENGINE_PUBLIC_MISSION_URL: "https://engine",
        PUBLIC_MISSION_ROUTE_SESSIONS: namespace
      } as any;
      const created = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "mission:chernobyl:shift", mode: "chronicle" })
      }), env);
      expect(created.status).toBe(201);
      const game = await created.json() as { id: string; presentation: { frame: { scene: { backgroundUrl: string } } } };
      const assetUrl = game.presentation.frame.scene.backgroundUrl;
      expect(assetUrl).toBe(`/api/missions/mission%3Achernobyl%3Ashift/sessions/${game.id}/assets/bunker-bg`);

      // The mission is unpublished while the player is mid-game.
      catalogPublished = false;

      const asset = await worker.fetch(new Request(`https://site.example${assetUrl}`), env);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/png");
      expect(byteList(await asset.arrayBuffer())).toEqual(byteList(pngBytes()));
      expect(assetRequests[0].authorization).toBe(`Bearer ${BINDING_CREDENTIAL}`);
      // FIN-03 стыковка: the BFF must ask the engine's session-pinned asset
      // route, never the mission-scoped path that follows the latest publication.
      expect(assetRequests[0].url).toMatch(/\/public\/v1\/missions\/[^/]+\/sessions\/[^/]+\/assets\/bunker-bg$/);
      expect(assetRequests[0].url).not.toBe("https://engine/public/v1/missions/mission%3Achernobyl%3Ashift/assets/bunker-bg");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("answers an unknown session asset with an uncacheable 404 instead of legacy content", async () => {
    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      throw new Error(`unexpected fetch ${String(input)}`);
    }) as typeof fetch;
    try {
      const env = {
        ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions",
        ENGINE_PUBLIC_MISSION_URL: "https://engine",
        PUBLIC_MISSION_ROUTE_SESSIONS: namespace
      } as any;
      const response = await worker.fetch(new Request("https://site.example/api/missions/mission:chernobyl:shift/sessions/no-such-session/assets/bunker-bg"), env);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ code: "MISSION_ASSET_NOT_FOUND" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("FIN-03 E16: a withdrawn publication keeps the started game on its pinned revision", () => {
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

  it("renders the pinned authored revision with an explicit pinned marker when the engine session is gone", async () => {
    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    let sessionReadable = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://engine/public/v1/missions") {
        return Response.json({ missions: [{ publicMissionId: "mission:chernobyl:shift", slug: "chernobyl-shift", releaseId: "release-1", contentHash: "e".repeat(64), channel: "production", listing: { title: "Смена", summary: "Не дать контуру разойтись.", period: "1986", place: "Блок 4", playerRole: "Инженер", estimatedMinutes: 12, supportedModes: ["choice"] } }] });
      }
      if (url.endsWith("/sessions") && init?.method === "POST") {
        return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: BINDING_CREDENTIAL }), { status: 201 });
      }
      if (init?.method === "GET" && url.includes("/sessions/")) {
        if (!sessionReadable) return new Response(JSON.stringify({ error: { code: "PUBLIC_MISSION_RELEASE_STALE" } }), { status: 404 });
        return Response.json({ session: { currentSceneId: "start", turn: 0, world: null } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const env = {
        ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions",
        ENGINE_PUBLIC_MISSION_URL: "https://engine",
        PUBLIC_MISSION_ROUTE_SESSIONS: namespace
      } as any;
      const created = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "mission:chernobyl:shift", mode: "chronicle" })
      }), env);
      const game = await created.json() as { id: string };
      sessionReadable = false;

      const reloaded = await worker.fetch(new Request(`https://site.example/api/games/${game.id}`), env);
      expect(reloaded.status).toBe(200);
      const state = await reloaded.json() as { contentSource: string; scenarioId: string; presentation: { kind: string; frame: { title: string } } };
      expect(state.contentSource).toBe("pinned");
      // The authored revision survives: no legacy art, no empty screen.
      expect(state.presentation.kind).toBe("published-mission");
      expect(state.presentation.frame.title).toBe("Смена");
      expect(state.scenarioId).toBe("mission:chernobyl:shift");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
