import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RuntimeRouteSession,
  chooseNewSessionRuntime,
  handleEngineBff,
  normalizeEngineBaseUrl,
} from "./engine-bff";

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
}

function createRouteNamespace() {
  const sessions = new Map<string, RuntimeRouteSession>();
  return {
    idFromName(name: string) { return { name }; },
    get(id: { name: string }) {
      let session = sessions.get(id.name);
      if (!session) {
        session = new RuntimeRouteSession({ storage: new MemoryStorage() } as unknown as DurableObjectState);
        sessions.set(id.name, session);
      }
      return { fetch: (input: RequestInfo | URL, init?: RequestInit) => session!.fetch(new Request(input, init)) };
    },
  } as unknown as DurableObjectNamespace;
}

function playerView(revision = 0) {
  return {
    sessionId: "engine-session-1",
    release: { questId: "florence-workshop", releaseId: "florence-r1" },
    revision,
    clock: { elapsedSeconds: revision * 60 },
    entities: [],
    resources: [],
    items: [],
    terminal: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("B11.2 runtime rollout boundary", () => {
  it("selects Engine only for newly eligible Florence sessions", () => {
    expect(chooseNewSessionRuntime({ scenarioId: "russia-1917", rollout: "on" })).toBe("legacy");
    expect(chooseNewSessionRuntime({ scenarioId: "florence-workshop", rollout: "off" })).toBe("legacy");
    expect(chooseNewSessionRuntime({ scenarioId: "florence-workshop", rollout: "test" })).toBe("legacy");
    expect(chooseNewSessionRuntime({ scenarioId: "florence-workshop", rollout: "test", requestedRuntime: "engine" })).toBe("engine");
    expect(chooseNewSessionRuntime({ scenarioId: "florence-workshop", rollout: "on" })).toBe("engine");
    expect(chooseNewSessionRuntime({ scenarioId: "florence-workshop", rollout: "unexpected", requestedRuntime: "engine" })).toBe("legacy");
  });

  it("accepts only bounded http(s) Engine base URLs", () => {
    expect(normalizeEngineBaseUrl("https://engine.example.test/")).toBe("https://engine.example.test");
    expect(normalizeEngineBaseUrl("http://127.0.0.1:8787///")).toBe("http://127.0.0.1:8787");
    expect(normalizeEngineBaseUrl("file:///tmp/runtime")).toBeNull();
    expect(normalizeEngineBaseUrl("https://user:secret@engine.test")).toBeNull();
    expect(normalizeEngineBaseUrl("https://engine.test?route=florence")).toBeNull();
  });

  it("pins an Engine route after create even when the rollout flag is switched off", async () => {
    const routeNamespace = createRouteNamespace();
    const env = {
      RUNTIME_ROUTE_SESSIONS: routeNamespace,
      ENGINE_RUNTIME_URL: "https://engine.test",
      ENGINE_FLORENCE_ROLLOUT: "test",
      ENGINE_FLORENCE_PROJECT_ID: "living-history",
      ENGINE_FLORENCE_QUEST_ID: "florence-workshop",
    };
    let legacyCalls = 0;
    const legacyFetch = async () => {
      legacyCalls += 1;
      return Response.json({ runtime: "legacy" });
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/v1/sessions") {
        return Response.json({
          sessionId: "engine-session-1",
          credential: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
          playerView: playerView(0),
        }, { status: 201 });
      }
      if (request.method === "GET" && url.pathname === "/v1/sessions/engine-session-1") {
        return Response.json({ playerView: playerView(0) });
      }
      return Response.json({ error: "unexpected upstream request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await handleEngineBff(
      new Request("https://sandbox.test/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "florence-workshop", mode: "chronicle", runtime: "engine" }),
      }),
      env,
      legacyFetch,
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { id: string; runtime: string };
    expect(createdBody.runtime).toBe("engine");
    expect(legacyCalls).toBe(0);

    env.ENGINE_FLORENCE_ROLLOUT = "off";
    const resumed = await handleEngineBff(
      new Request(`https://sandbox.test/api/games/${createdBody.id}`),
      env,
      legacyFetch,
    );
    expect(resumed.status).toBe(200);
    const resumedBody = await resumed.json() as { runtime: string };
    expect(resumedBody.runtime).toBe("engine");
    expect(legacyCalls).toBe(0);

    const legacy = await handleEngineBff(
      new Request("https://sandbox.test/api/games/00000000-0000-4000-8000-000000000000"),
      env,
      legacyFetch,
    );
    expect(legacy.status).toBe(200);
    expect(await legacy.json()).toEqual({ runtime: "legacy" });
    expect(legacyCalls).toBe(1);
  });

  it("routes prepared options explicitly and keeps free text on the intent boundary", async () => {
    const routeNamespace = createRouteNamespace();
    const env = {
      RUNTIME_ROUTE_SESSIONS: routeNamespace,
      ENGINE_RUNTIME_URL: "https://engine.test",
      ENGINE_FLORENCE_ROLLOUT: "test",
      ENGINE_FLORENCE_PROJECT_ID: "living-history",
      ENGINE_FLORENCE_QUEST_ID: "florence-workshop",
    };
    const upstreamBodies: unknown[] = [];
    const upstreamKeys: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/v1/sessions") {
        return Response.json({
          sessionId: "engine-session-1",
          credential: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
          playerView: playerView(0),
        }, { status: 201 });
      }
      if (request.method === "GET" && url.pathname === "/v1/sessions/engine-session-1") {
        return Response.json({ playerView: playerView(0) });
      }
      if (request.method === "POST" && url.pathname === "/v1/sessions/engine-session-1/actions") {
        upstreamBodies.push(await request.json());
        upstreamKeys.push(request.headers.get("idempotency-key") ?? "");
        return Response.json({ kind: "action_result", playerView: playerView(1) });
      }
      return Response.json({ error: "unexpected upstream request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const legacyFetch = async () => Response.json({ runtime: "legacy" });

    const created = await handleEngineBff(
      new Request("https://sandbox.test/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "florence-workshop", mode: "chronicle", runtime: "engine" }),
      }),
      env,
      legacyFetch,
    );
    const createdBody = await created.json() as { id: string };

    const prepared = await handleEngineBff(
      new Request(`https://sandbox.test/api/games/${createdBody.id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "Предложить письменные условия",
          source: "prepared",
          optionId: "draft",
          idempotencyKey: "prepared-1",
        }),
      }),
      env,
      legacyFetch,
    );
    expect(prepared.status).toBe(200);
    expect(upstreamBodies[0]).toEqual({
      expectedRevision: 0,
      action: { type: "authored.option", optionId: "draft" },
    });
    expect(upstreamKeys[0]).toBe("prepared-1");

    const freeform = await handleEngineBff(
      new Request(`https://sandbox.test/api/games/${createdBody.id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "Сначала проверю записи поставки и поговорю с Риччи",
          source: "freeform",
          idempotencyKey: "freeform-1",
        }),
      }),
      env,
      legacyFetch,
    );
    expect(freeform.status).toBe(200);
    expect(upstreamBodies[1]).toEqual({
      expectedRevision: 0,
      input: { kind: "text", text: "Сначала проверю записи поставки и поговорю с Риччи" },
    });
    expect(upstreamKeys[1]).toBe("freeform-1");

    const malformedPrepared = await handleEngineBff(
      new Request(`https://sandbox.test/api/games/${createdBody.id}/turn`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "Подготовленный ход без optionId",
          source: "prepared",
          idempotencyKey: "prepared-bad",
        }),
      }),
      env,
      legacyFetch,
    );
    expect(malformedPrepared.status).toBe(400);
    expect(upstreamBodies).toHaveLength(2);
  });
});