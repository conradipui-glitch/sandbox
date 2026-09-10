import legacyWorker, { HistorySession, ProductAnalytics } from "./index";
import { handleEngineBff, RuntimeRouteSession, type EngineBffEnv } from "./engine-bff";
import { fetchPublishedCatalog, toScenarioSummaries } from "./public-catalog";
import type { ScenarioSummary } from "../shared/types";
import {
  applyPublishedMissionTurn,
  createPublishedMissionSession,
  decodeMissionIdSegment,
  fetchPublishedMissionAsset,
  isPublishedMissionBinding,
  PUBLISHED_MISSION_ASSET_PATH,
  publishedMissionGameState,
  publishedMissionSceneView,
  reconcilePublishedMissionSession,
  type PublishedMissionBinding
} from "./public-mission-bff";

export { HistorySession, ProductAnalytics, RuntimeRouteSession };

export class PublishedMissionRouteSession {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/binding") {
      const binding = await this.state.storage.get<PublishedMissionBinding>("binding");
      return binding ? Response.json(binding) : new Response(null, { status: 404 });
    }
    if (request.method === "POST" && url.pathname === "/binding") {
      const value = await request.json().catch(() => null);
      if (!isPublishedMissionBinding(value)) return Response.json({ error: "invalid binding" }, { status: 400 });
      await this.state.storage.put("binding", value);
      return Response.json({ ok: true });
    }
    return new Response(null, { status: 404 });
  }
}

async function readStoredBinding(namespace: DurableObjectNamespace | undefined, id: string): Promise<PublishedMissionBinding | null> {
  if (!namespace) return null;
  const response = await namespace.get(namespace.idFromName(id)).fetch("https://published-mission/binding");
  if (!response.ok) return null;
  const binding = await response.json().catch(() => null);
  return isPublishedMissionBinding(binding) ? binding : null;
}

async function writeStoredBinding(namespace: DurableObjectNamespace | undefined, binding: PublishedMissionBinding): Promise<boolean> {
  if (!namespace) return false;
  const response = await namespace.get(namespace.idFromName(binding.publicSessionId)).fetch("https://published-mission/binding", { method: "POST", body: JSON.stringify(binding) });
  return response.ok;
}

function publicEngineBase(env: EngineBffEnv, catalogUrl: string): string | null {
  const configured = env.ENGINE_PUBLIC_MISSION_URL;
  if (typeof configured === "string" && configured.length > 0) return configured.replace(/\/+$/, "");
  try { return new URL(catalogUrl).origin; } catch { return null; }
}

/** The published namespace is reserved: it must never fall through to legacy. */
function isPublishedMissionRef(scenarioRef: string): boolean {
  return scenarioRef.startsWith("mission:");
}

function isLegacyCard(value: unknown): value is { id: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Record<string, unknown>;
  return typeof card.id === "string" && card.id.length > 0 && !isPublishedMissionRef(card.id);
}

/** Published cards first, then legacy cards; deduplicated by id. */
function mergeScenarioCards(published: readonly ScenarioSummary[], legacy: readonly unknown[]): ScenarioSummary[] {
  const merged: ScenarioSummary[] = [];
  const seen = new Set<string>();
  for (const card of published) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    merged.push(card);
  }
  const extra = legacy.filter(isLegacyCard).filter((card) => !seen.has(card.id)) as unknown as ScenarioSummary[];
  extra.sort((left, right) => String(left.title).localeCompare(String(right.title), "ru"));
  for (const card of extra) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    merged.push(card);
  }
  return merged;
}

async function publishedRequest(request: Request, env: EngineBffEnv, url: URL): Promise<Response | null> {
  const catalogUrl = env.ENGINE_PUBLIC_CATALOG_URL;
  const namespace = env.PUBLIC_MISSION_ROUTE_SESSIONS;
  if (typeof catalogUrl !== "string" || catalogUrl.length === 0 || !namespace) return null;
  const gameMatch = /^\/api\/games\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})$/.exec(url.pathname);
  const turnMatch = /^\/api\/games\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})\/turn$/.exec(url.pathname);

  if (request.method === "POST" && url.pathname === "/api/games") {
    const body = await request.clone().json().catch(() => null) as { scenarioId?: unknown; mode?: unknown } | null;
    if (!body || typeof body.scenarioId !== "string" || (body.mode !== "chronicle" && body.mode !== "campaign" && body.mode !== "sandbox")) return null;
    const catalog = await fetchPublishedCatalog(catalogUrl);
    if (!catalog.ok) return Response.json({ error: "Published mission catalog unavailable", code: catalog.code }, { status: catalog.status });
    const mission = catalog.missions.find((entry) => entry.publicMissionId === body.scenarioId || entry.slug === body.scenarioId);
    if (!mission) {
      // A reserved published reference that the catalog does not know is a
      // contract 404 — it must not silently become a legacy game.
      if (isPublishedMissionRef(body.scenarioId)) {
        return Response.json({ error: "Published mission not found", code: "PUBLIC_MISSION_NOT_FOUND" }, { status: 404 });
      }
      return null;
    }
    const engineBaseUrl = publicEngineBase(env, catalogUrl);
    if (!engineBaseUrl) return Response.json({ error: "Published mission runtime unavailable", code: "PUBLIC_MISSION_RUNTIME_UNAVAILABLE" }, { status: 503 });
    const publicSessionId = crypto.randomUUID();
    const listing = toScenarioSummaries([mission])[0];
    const created = await createPublishedMissionSession({
      engineBaseUrl,
      publicMissionId: mission.publicMissionId,
      publicSessionId,
      mode: body.mode,
      listing,
      newSessionId: () => crypto.randomUUID()
    });
    if (!created.ok) return Response.json({ error: "Published mission session unavailable", code: created.code }, { status: created.status });
    if (!(await writeStoredBinding(namespace, created.binding))) return Response.json({ error: "Published mission session unavailable", code: "PUBLIC_MISSION_ROUTE_UNAVAILABLE" }, { status: 503 });
    return Response.json(publishedMissionGameState(created.binding, created.view, created.binding.mode), { status: 201, headers: { "cache-control": "no-store" } });
  }

  const sessionId = gameMatch?.[1] ?? turnMatch?.[1];
  if (!sessionId) {
    // FIN-03 B04: assets of an already started game. The URL is pinned to the
    // session, so these requests must be answered from the session binding (and
    // its credential) or not at all — never by legacy content.
    const assetMatch = PUBLISHED_MISSION_ASSET_PATH.exec(url.pathname);
    if (assetMatch && request.method === "GET") {
      const scenarioRef = decodeMissionIdSegment(assetMatch[1]);
      const assetSessionId = decodeMissionIdSegment(assetMatch[2]);
      const assetId = decodeMissionIdSegment(assetMatch[3]);
      const assetBinding = assetSessionId ? await readStoredBinding(namespace, assetSessionId) : null;
      if (!scenarioRef || !assetId || !assetBinding || assetBinding.scenarioRef !== scenarioRef) {
        return Response.json({ error: "Published mission asset not found", code: "MISSION_ASSET_NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });
      }
      return fetchPublishedMissionAsset({ binding: assetBinding, assetId });
    }
    return null;
  }
  const binding = await readStoredBinding(namespace, sessionId);
  if (!binding) return null;
  if (gameMatch && request.method === "GET") {
    // The engine session is authoritative: if a previous turn was applied but
    // this binding write was lost, recover the real turn/ending before render.
    const reconciled = await reconcilePublishedMissionSession({ binding });
    if (reconciled.ok) {
      if (reconciled.binding.turn !== binding.turn || reconciled.binding.terminal?.endingId !== binding.terminal?.endingId) {
        await writeStoredBinding(namespace, reconciled.binding);
      }
      return Response.json(publishedMissionGameState(reconciled.binding, reconciled.view, reconciled.binding.mode), { headers: { "cache-control": "no-store" } });
    }
    // The engine session is no longer readable: the mission was unpublished,
    // withdrawn, or the upstream is down. E16 forbids substituting legacy
    // content for a published mission, and a dead screen is not an option
    // either — the started game continues on its pinned authored revision and
    // says so, so the player never reads stale content as freshly synced.
    const view = publishedMissionSceneView(binding);
    if (!view) return Response.json({ error: "Published mission state unavailable", code: "PUBLIC_MISSION_STATE_INVALID" }, { status: 503, headers: { "cache-control": "no-store" } });
    return Response.json(publishedMissionGameState(binding, view, binding.mode, null, "pinned"), {
      headers: { "cache-control": "no-store", "x-lh-mission-source": "pinned" }
    });
  }
  if (turnMatch && request.method === "POST") {
    const body = await request.json().catch(() => null) as { optionId?: unknown; idempotencyKey?: unknown } | null;
    if (!body || typeof body.optionId !== "string" || typeof body.idempotencyKey !== "string") return Response.json({ error: "Invalid published mission turn", code: "MISSION_BAD_TURN" }, { status: 400 });
    const turned = await applyPublishedMissionTurn({ binding, choiceId: body.optionId, idempotencyKey: body.idempotencyKey });
    if (!turned.ok) return Response.json({ error: "Published mission turn failed", code: turned.code }, { status: turned.status });
    if (!(await writeStoredBinding(namespace, turned.binding))) return Response.json({ error: "Published mission session unavailable", code: "PUBLIC_MISSION_ROUTE_UNAVAILABLE" }, { status: 503 });
    return Response.json(publishedMissionGameState(turned.binding, turned.view, turned.binding.mode, turned.target), { headers: { "cache-control": "no-store" } });
  }
  return null;
}

export default {
  async fetch(request: Request, env: EngineBffEnv & Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);
    const catalogUrl = env.ENGINE_PUBLIC_CATALOG_URL;
    if (request.method === "GET" && url.pathname === "/api/scenarios" && typeof catalogUrl === "string" && catalogUrl.length > 0) {
      const catalog = await fetchPublishedCatalog(catalogUrl);
      // FIN-03 E17: a failed refresh is stated, never papered over with a cached
      // or legacy list that would look freshly loaded.
      if (!catalog.ok) {
        return Response.json({ error: "Published mission catalog unavailable", code: catalog.code }, {
          status: catalog.status,
          headers: { "cache-control": "no-store", "x-lh-catalog-state": "unavailable" }
        });
      }
      // The published catalog is additive: legacy cards stay visible next to
      // the published ones instead of being replaced by them.
      let legacy: readonly unknown[] = [];
      try {
        const legacyResponse = await legacyWorker.fetch(new Request(new URL("/api/scenarios", url.origin), { method: "GET" }), env as never);
        if (legacyResponse.ok) {
          const parsed = await legacyResponse.json().catch(() => null);
          if (Array.isArray(parsed)) legacy = parsed;
        }
      } catch {
        legacy = [];
      }
      return Response.json(mergeScenarioCards(toScenarioSummaries(catalog.missions), legacy), {
        headers: { "cache-control": "public, max-age=15, stale-while-revalidate=30", "x-content-type-options": "nosniff", "x-lh-catalog-state": "live" }
      });
    }
    const published = await publishedRequest(request, env, url);
    if (published) return published;
    return handleEngineBff(
      request,
      env,
      (legacyRequest) => legacyWorker.fetch(legacyRequest, env as never),
    );
  },
} satisfies ExportedHandler<EngineBffEnv & Record<string, unknown>>;
