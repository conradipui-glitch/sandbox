import type { DecisionOption, GameMode, GameState, ScenarioSummary } from "../shared/types";
import { buildMissionFrame, buildMissionIntroFrames, type FrameDocShape } from "../shared/mission-presentation/frame-build";
import { missionSceneView, type MissionBffSceneView, type MissionDocShape } from "./mission-bff";

export interface PublishedMissionTerminal {
  readonly kind: "ending";
  readonly endingId: string;
}

export interface PublishedMissionBinding {
  readonly version: 1;
  readonly publicSessionId: string;
  readonly scenarioRef: string;
  readonly mode: GameMode;
  readonly engineBaseUrl: string;
  readonly credential: string;
  readonly listing: Pick<ScenarioSummary, "title" | "period" | "role" | "hook">;
  readonly missionDoc: MissionDocShape;
  readonly missionSessionId: string;
  readonly turn: number;
  readonly currentSceneId: string;
  /**
   * Canonical terminal of the engine session. The engine keeps the previous
   * scene id at a finale and records the ending in the world, so the ending
   * must be stored explicitly or a reload silently returns to the last scene.
   */
  readonly terminal: PublishedMissionTerminal | null;
}

export interface PublishedMissionTurnResult {
  readonly binding: PublishedMissionBinding;
  readonly view: MissionBffSceneView;
  readonly target: unknown;
  readonly replay?: boolean;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function emptyWorld() {
  return { schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 }, locations: [], entities: [], resources: [], items: [], terminal: null };
}

async function jsonResult(response: Response): Promise<{ ok: boolean; status: number; payload: any }> {
  return { ok: response.ok, status: response.status, payload: await response.json().catch(() => null) };
}

function terminalFromTarget(target: any): PublishedMissionTerminal | null {
  return target?.kind === "ending" && typeof target.endingId === "string" ? { kind: "ending", endingId: target.endingId } : null;
}

/** The engine records a finale in `world.terminal`, keeping the previous scene id. */
function terminalFromWorld(world: any): PublishedMissionTerminal | null {
  const terminal = world?.terminal;
  if (!terminal || typeof terminal !== "object") return null;
  return typeof terminal.outcome === "string" ? { kind: "ending", endingId: terminal.outcome } : null;
}

function viewFor(
  doc: MissionDocShape,
  session: { currentSceneId: string; turn: number },
  terminal: PublishedMissionTerminal | null = null
): MissionBffSceneView | null {
  if (terminal) {
    const ending = doc.story.endings.find((entry) => entry.id === terminal.endingId);
    if (!ending) return null;
    return { sceneId: `ending:${ending.id}`, title: ending.title, text: ending.text, choices: [], turn: session.turn, contentRevision: doc.contentRevision, contentHash: doc.contentHash };
  }
  return missionSceneView(doc, session.currentSceneId, session.turn);
}

function isMissionDoc(value: unknown): value is MissionDocShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as any;
  return Number.isSafeInteger(doc.contentRevision) && typeof doc.contentHash === "string" && doc.story && typeof doc.story.entrySceneId === "string" && Array.isArray(doc.story.scenes) && Array.isArray(doc.story.endings);
}

export function publishedMissionSceneView(binding: PublishedMissionBinding): MissionBffSceneView | null {
  return viewFor(binding.missionDoc, { currentSceneId: binding.currentSceneId, turn: binding.turn }, binding.terminal ?? null);
}

/**
 * FIN-03 B04: the asset URL is pinned to the started session, not to the
 * currently published revision. The same URL keeps resolving the assets of the
 * revision the session was created from after a new version is published or the
 * mission is unpublished; the BFF adds the session credential upstream.
 */
export function publishedMissionAssetUrl(
  binding: Pick<PublishedMissionBinding, "scenarioRef" | "publicSessionId">,
  assetId: string
): string {
  return `/api/missions/${encodeURIComponent(binding.scenarioRef)}/sessions/${encodeURIComponent(binding.publicSessionId)}/assets/${encodeURIComponent(assetId)}`;
}

export const PUBLISHED_MISSION_ASSET_PATH =
  /^\/api\/missions\/([A-Za-z0-9][A-Za-z0-9._:%-]{0,199})\/sessions\/([A-Za-z0-9][A-Za-z0-9._:%-]{0,199})\/assets\/([A-Za-z0-9][A-Za-z0-9._:%-]{0,199})$/;

/**
 * Decodes one path segment that may arrive percent-encoded (a mission ref like
 * `mission:slug:quest` is encoded as `mission%3Aslug%3Aquest`). Returns null for
 * anything that is not a plain public id after decoding.
 */
export function decodeMissionIdSegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return ID.test(decoded) ? decoded : null;
}

function assetError(status: number, code: string): Response {
  // A failure, a 404 or an unauthenticated answer must never be cached as
  // immutable — that is exactly how a stale picture survives an unpublish.
  return Response.json({ error: "Published mission asset unavailable", code }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" }
  });
}

/**
 * Fetches one asset of the session's pinned revision from the public mission
 * API. The session credential is mandatory: it is what keeps the assets of an
 * already started game readable after the mission is unpublished or a newer
 * revision is published.
 */
export async function fetchPublishedMissionAsset(input: {
  readonly fetchImpl?: typeof fetch;
  readonly binding: PublishedMissionBinding;
  readonly assetId: string;
}): Promise<Response> {
  if (!ID.test(input.assetId)) return assetError(400, "MISSION_BAD_ASSET");
  // The engine serves a started game's assets from the session-pinned route
  // (the credential is bound to that engine session id), so the BFF must ask
  // for `/sessions/{missionSessionId}/assets/{assetId}` — the mission-scoped
  // `/assets/{assetId}` path only reflects the current publication.
  const upstream = await (input.fetchImpl ?? fetch)(
    `${input.binding.engineBaseUrl}/public/v1/missions/${encodeURIComponent(input.binding.scenarioRef)}/sessions/${encodeURIComponent(input.binding.missionSessionId)}/assets/${encodeURIComponent(input.assetId)}`,
    { method: "GET", headers: { authorization: `Bearer ${input.binding.credential}` } }
  ).catch(() => null);
  if (!upstream) return assetError(503, "MISSION_ASSET_UNAVAILABLE");
  if (!upstream.ok) {
    return upstream.status === 404 ? assetError(404, "MISSION_ASSET_NOT_FOUND") : assetError(503, "MISSION_ASSET_UNAVAILABLE");
  }
  const body = await upstream.arrayBuffer().catch(() => null);
  if (!body) return assetError(503, "MISSION_ASSET_UNAVAILABLE");
  const revisionHash = /^[0-9a-f]{64}$/.test(input.binding.missionDoc.contentHash) ? input.binding.missionDoc.contentHash : null;
  const headers: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "x-content-type-options": "nosniff"
  };
  if (revisionHash) {
    // The URL is session-pinned and the ETag carries the pinned revision hash,
    // so these bytes really are immutable. Without a revision identity they are
    // not, and the response stays uncacheable.
    headers.etag = `"${revisionHash.slice(0, 32)}-${input.assetId}"`;
    headers["x-mission-revision"] = String(input.binding.missionDoc.contentRevision);
    headers["cache-control"] = "private, max-age=31536000, immutable";
  } else {
    headers["cache-control"] = "private, no-store";
  }
  return new Response(body, { status: 200, headers });
}

/**
 * Re-reads the authoritative engine session. Used when the local binding may be
 * behind the engine — for example when a turn was applied but the response or
 * the storage write was lost.
 */
export async function reconcilePublishedMissionSession(input: {
  readonly fetchImpl?: typeof fetch;
  readonly binding: PublishedMissionBinding;
}): Promise<{ readonly ok: true; readonly binding: PublishedMissionBinding; readonly view: MissionBffSceneView } | { readonly ok: false; readonly status: number; readonly code: string }> {
  const response = await (input.fetchImpl ?? fetch)(
    `${input.binding.engineBaseUrl}/public/v1/missions/${encodeURIComponent(input.binding.scenarioRef)}/sessions/${encodeURIComponent(input.binding.missionSessionId)}`,
    { method: "GET", headers: { authorization: `Bearer ${input.binding.credential}` } }
  ).then(jsonResult).catch(() => null);
  if (!response || !response.ok) {
    return { ok: false, status: response?.status === 404 ? 404 : 503, code: typeof response?.payload?.error?.code === "string" ? response.payload.error.code : "MISSION_STATE_UNAVAILABLE" };
  }
  const session = response.payload?.session;
  if (!session || typeof session.currentSceneId !== "string" || typeof session.turn !== "number" || !Number.isSafeInteger(session.turn)) {
    return { ok: false, status: 503, code: "MISSION_STATE_UNAVAILABLE" };
  }
  const binding: PublishedMissionBinding = {
    ...input.binding,
    turn: session.turn,
    currentSceneId: session.currentSceneId,
    terminal: terminalFromWorld(session.world) ?? input.binding.terminal ?? null
  };
  const view = viewFor(binding.missionDoc, { currentSceneId: binding.currentSceneId, turn: binding.turn }, binding.terminal);
  if (!view) return { ok: false, status: 503, code: "MISSION_STATE_INVALID" };
  return { ok: true, binding, view };
}

export async function createPublishedMissionSession(input: {
  readonly fetchImpl?: typeof fetch;
  readonly engineBaseUrl: string;
  readonly publicMissionId: string;
  readonly publicSessionId: string;
  readonly mode: GameMode;
  readonly listing: Pick<ScenarioSummary, "title" | "period" | "role" | "hook">;
  readonly newSessionId: () => string;
}): Promise<{ readonly ok: true; readonly binding: PublishedMissionBinding; readonly view: MissionBffSceneView } | { readonly ok: false; readonly status: number; readonly code: string }> {
  if (!ID.test(input.publicMissionId) || !ID.test(input.publicSessionId)) return { ok: false, status: 400, code: "MISSION_BAD_SESSION" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const engineBaseUrl = input.engineBaseUrl.replace(/\/+$/, "");
  const missionSessionId = input.newSessionId();
  if (!ID.test(missionSessionId)) return { ok: false, status: 400, code: "MISSION_BAD_SESSION" };
  const response = await fetchImpl(`${engineBaseUrl}/public/v1/missions/${encodeURIComponent(input.publicMissionId)}/sessions`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": `public-bff-${input.publicSessionId}` },
    body: JSON.stringify({ sessionId: missionSessionId, initialWorld: emptyWorld() })
  }).then(jsonResult).catch(() => null);
  const mission = response?.payload?.mission;
  const session = response?.payload?.session;
  const credential = response?.payload?.credential;
  if (!response || !response.ok || !isMissionDoc(mission) || !session || typeof session.currentSceneId !== "string" || typeof session.turn !== "number" || typeof credential !== "string") {
    return { ok: false, status: response?.status === 404 ? 404 : 503, code: response?.payload?.error?.code === "PUBLIC_MISSION_RELEASE_STALE" ? "MISSION_RELEASE_STALE" : "MISSION_SESSION_CREATE_FAILED" };
  }
  const view = viewFor(mission, session);
  if (!view) return { ok: false, status: 503, code: "MISSION_SESSION_CREATE_FAILED" };
  return { ok: true, view, binding: { version: 1, publicSessionId: input.publicSessionId, scenarioRef: input.publicMissionId, mode: input.mode, engineBaseUrl, credential, listing: input.listing, missionDoc: mission, missionSessionId, turn: session.turn, currentSceneId: session.currentSceneId, terminal: terminalFromWorld(session.world) } };
}

export async function applyPublishedMissionTurn(input: {
  readonly fetchImpl?: typeof fetch;
  readonly binding: PublishedMissionBinding;
  readonly choiceId: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly ok: true } & PublishedMissionTurnResult | { readonly ok: false; readonly status: number; readonly code: string }> {
  if (!ID.test(input.choiceId) || !ID.test(input.idempotencyKey)) return { ok: false, status: 400, code: "MISSION_BAD_TURN" };
  const response = await (input.fetchImpl ?? fetch)(`${input.binding.engineBaseUrl}/public/v1/missions/${encodeURIComponent(input.binding.scenarioRef)}/sessions/${encodeURIComponent(input.binding.missionSessionId)}/turns`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${input.binding.credential}`, "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ baseTurn: input.binding.turn, choiceId: input.choiceId })
  }).then(jsonResult).catch(() => null);
  if (!response || !response.ok) {
    const code = typeof response?.payload?.error?.code === "string" ? response.payload.error.code : "MISSION_TURN_FAILED";
    return { ok: false, status: response?.status === 409 ? 409 : response?.status === 422 ? 422 : 503, code };
  }
  const session = response.payload?.session;
  if (!session || typeof session.currentSceneId !== "string" || typeof session.turn !== "number") return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  const terminal = terminalFromTarget(response.payload?.target) ?? terminalFromWorld(session.world) ?? input.binding.terminal ?? null;
  const view = viewFor(input.binding.missionDoc, session, terminal);
  if (!view) return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  return { ok: true, binding: { ...input.binding, turn: session.turn, currentSceneId: session.currentSceneId, terminal }, view, target: response.payload?.target ?? null, ...(response.payload?.replay ? { replay: true } : {}) };
}

export function publishedMissionGameState(
  binding: PublishedMissionBinding,
  view: MissionBffSceneView,
  mode: GameMode,
  target: unknown = null,
  contentSource: "live" | "pinned" = "live"
): GameState {
  const ended = view.sceneId.startsWith("ending:");
  const options: DecisionOption[] = view.choices.map((choice) => ({ id: choice.choiceId, title: choice.label, description: "Выбор опубликованной миссии", risk: "средний", intent: "choice" }));
  // Session-pinned URL: assets of the started game stay resolvable after a
  // republish or an unpublish (see publishedMissionAssetUrl).
  const resolveAsset = (assetId: string) => publishedMissionAssetUrl(binding, assetId);
  const frame = buildMissionFrame({
    doc: binding.missionDoc as unknown as FrameDocShape,
    sceneId: binding.currentSceneId,
    endingId: binding.terminal?.endingId ?? null,
    turn: view.turn,
    resolveAsset
  });
  // The authored intro screens are the mission's opening framing. They are
  // carried as paged frames next to the current scene; paging them is local to
  // the player and never spends a gameplay turn.
  const intros = buildMissionIntroFrames({
    doc: binding.missionDoc as unknown as FrameDocShape,
    turn: view.turn,
    resolveAsset
  });
  return {
    id: binding.publicSessionId, scenarioId: binding.scenarioRef, mode, scenarioTitle: binding.listing.title, role: binding.listing.role,
    date: binding.listing.period, turn: view.turn, status: ended ? "victory" : "active", briefing: `${view.title}\n\n${view.text}`,
    objective: binding.listing.hook, metrics: [], factions: [], options,
    contentSource,
    timeline: [{ id: "mission-turn", date: binding.listing.period, title: `Ход ${view.turn}`, description: typeof target === "object" && target ? "Решение применено" : "Миссия начата", kind: "decision" }],
    // The authored frame is the only presentation source for a published
    // mission: the legacy scenario art must never be substituted for it.
    ...(frame ? { presentation: { kind: "published-mission" as const, publicMissionId: binding.scenarioRef, frame, ...(intros.length > 0 ? { intros } : {}), reaction: typeof target === "object" && target ? ("applied" as const) : ("start" as const) } } : {}),
    lastOutcome: null, createdAt: new Date(0).toISOString(), updatedAt: new Date().toISOString()
  };
}

export function isPublishedMissionBinding(value: unknown): value is PublishedMissionBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as PublishedMissionBinding;
  if (binding.terminal !== undefined && binding.terminal !== null) {
    const terminal = binding.terminal as { kind?: unknown; endingId?: unknown };
    if (terminal.kind !== "ending" || typeof terminal.endingId !== "string") return false;
  }
  return binding.version === 1 && ID.test(binding.publicSessionId) && ID.test(binding.scenarioRef) && (binding.mode === "chronicle" || binding.mode === "campaign" || binding.mode === "sandbox") && typeof binding.engineBaseUrl === "string" && typeof binding.credential === "string" && isMissionDoc(binding.missionDoc) && ID.test(binding.missionSessionId) && Number.isSafeInteger(binding.turn) && typeof binding.currentSceneId === "string";
}
