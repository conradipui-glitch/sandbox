import type { DecisionOption, GameMode, GameState, PublishedMissionRuntimeView, ScenarioSummary } from "../shared/types";
import { buildMissionFrame, buildMissionIntroFrames, type FrameDocShape } from "../shared/mission-presentation/frame-build";
import { missionSceneView, type MissionBffSceneView, type MissionDocShape } from "./mission-bff";

export interface PublishedMissionTerminal {
  readonly kind: "ending";
  readonly endingId: string;
}

export interface PublishedRuntimeMetadata {
  readonly schemaVersion: 1;
  readonly locations: readonly { readonly id: string; readonly title: string; readonly description: string }[];
  readonly participants: readonly { readonly id: string; readonly title: string; readonly description: string }[];
  readonly resources: readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly unit: string;
    readonly min: number;
    readonly max: number;
  }[];
}

export interface PublishedWorldSnapshot {
  readonly schemaVersion: string;
  readonly revision: number;
  readonly clock: { readonly elapsedSeconds: number };
  readonly locations: readonly { readonly id: string }[];
  readonly entities: readonly {
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly locationId: string | null;
  }[];
  readonly resources: readonly {
    readonly id: string;
    readonly unit: string;
    readonly value: number;
    readonly min: number;
    readonly max: number;
  }[];
  readonly items: readonly unknown[];
  readonly terminal?: unknown;
}

export interface PublishedMissionHistoryEntry {
  readonly id: string;
  readonly turn: number;
  readonly choiceId: string;
  readonly choiceLabel: string;
  readonly fromTitle: string;
  readonly toTitle: string;
  readonly deltas: readonly { readonly resourceId: string; readonly delta: number }[];
  readonly terminal: boolean;
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
  /** Public labels from the pinned compiled release. Absent on legacy bindings. */
  readonly runtime?: PublishedRuntimeMetadata;
  /** Last authoritative world snapshot. Absent on legacy bindings. */
  readonly world?: PublishedWorldSnapshot;
  /** Confirmed decisions made in this browser session. */
  readonly history?: readonly PublishedMissionHistoryEntry[];
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

/**
 * The input modes the pinned revision declares in its own listing. A mission
 * that does not declare `free-input` is played by its authored choices only, and
 * the player must not be offered a field the engine will refuse.
 */
export function missionInputModes(doc: MissionDocShape): readonly string[] {
  const modes = (doc as { readonly listing?: { readonly supportedModes?: unknown } }).listing?.supportedModes;
  return Array.isArray(modes) && modes.length > 0 && modes.every((mode) => typeof mode === "string")
    ? (modes as readonly string[])
    : ["choice"];
}

function isRuntimeMetadata(value: unknown): value is PublishedRuntimeMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const runtime = value as any;
  const common = (entry: any) => entry && typeof entry.id === "string" && ID.test(entry.id) && typeof entry.title === "string" && typeof entry.description === "string";
  return runtime.schemaVersion === 1
    && Array.isArray(runtime.locations) && runtime.locations.every(common)
    && Array.isArray(runtime.participants) && runtime.participants.every(common)
    && Array.isArray(runtime.resources) && runtime.resources.every((entry: any) => common(entry)
      && typeof entry.unit === "string" && Number.isFinite(entry.min) && Number.isFinite(entry.max));
}

function worldSnapshot(value: unknown): PublishedWorldSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const world = value as any;
  if (typeof world.schemaVersion !== "string" || !Number.isSafeInteger(world.revision) || !world.clock || !Number.isFinite(world.clock.elapsedSeconds) || !Array.isArray(world.locations) || !Array.isArray(world.entities) || !Array.isArray(world.resources) || !Array.isArray(world.items)) return undefined;
  if (!world.locations.every((entry: any) => entry && typeof entry.id === "string" && ID.test(entry.id))) return undefined;
  if (!world.entities.every((entry: any) => entry && typeof entry.id === "string" && ID.test(entry.id) && typeof entry.type === "string" && typeof entry.status === "string" && (entry.locationId === null || (typeof entry.locationId === "string" && ID.test(entry.locationId))))) return undefined;
  if (!world.resources.every((entry: any) => entry && typeof entry.id === "string" && ID.test(entry.id) && typeof entry.unit === "string" && Number.isFinite(entry.value) && Number.isFinite(entry.min) && Number.isFinite(entry.max))) return undefined;
  return {
    schemaVersion: world.schemaVersion,
    revision: world.revision,
    clock: { elapsedSeconds: world.clock.elapsedSeconds },
    locations: world.locations.map((entry: any) => ({ id: entry.id })),
    entities: world.entities.map((entry: any) => ({ id: entry.id, type: entry.type, status: entry.status, locationId: entry.locationId ?? null })),
    resources: world.resources.map((entry: any) => ({ id: entry.id, unit: entry.unit, value: entry.value, min: entry.min, max: entry.max })),
    items: world.items,
    terminal: world.terminal ?? null
  };
}

function resourceDeltas(before: PublishedWorldSnapshot | undefined, after: PublishedWorldSnapshot | undefined): readonly { resourceId: string; delta: number }[] {
  if (!before || !after) return [];
  const previous = new Map(before.resources.map((entry) => [entry.id, entry.value]));
  return after.resources
    .map((entry) => ({ resourceId: entry.id, delta: entry.value - (previous.get(entry.id) ?? entry.value) }))
    .filter((entry) => entry.delta !== 0);
}

function choiceLabel(binding: PublishedMissionBinding, choiceId: string): string {
  const scene = binding.missionDoc.story.scenes.find((entry) => entry.id === binding.currentSceneId);
  return scene?.choices.find((choice) => choice.id === choiceId)?.label ?? choiceId;
}

function runtimeView(binding: PublishedMissionBinding): PublishedMissionRuntimeView | undefined {
  if (!binding.runtime || !binding.world) return undefined;
  const lastResolution = binding.history?.at(-1) ?? null;
  const deltas = new Map((lastResolution?.deltas ?? []).map((entry) => [entry.resourceId, entry.delta]));
  const locations = new Map(binding.runtime.locations.map((entry) => [entry.id, entry.title]));
  const entities = new Map(binding.world.entities.map((entry) => [entry.id, entry]));
  const resources = new Map(binding.world.resources.map((entry) => [entry.id, entry]));
  return {
    resources: binding.runtime.resources.flatMap((definition) => {
      const state = resources.get(definition.id);
      return state ? [{ ...definition, value: state.value, min: state.min, max: state.max, unit: state.unit, delta: deltas.get(definition.id) ?? 0 }] : [];
    }),
    participants: binding.runtime.participants.flatMap((definition) => {
      const state = entities.get(definition.id);
      return state ? [{ ...definition, status: state.status, locationId: state.locationId, locationTitle: state.locationId ? locations.get(state.locationId) ?? null : null }] : [];
    }),
    history: [...(binding.history ?? [])],
    lastResolution
  };
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
  const world = worldSnapshot(session.world);
  const binding: PublishedMissionBinding = {
    ...input.binding,
    turn: session.turn,
    currentSceneId: session.currentSceneId,
    ...(world ? { world } : {}),
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
  const world = worldSnapshot(session.world);
  const runtime = isRuntimeMetadata(response.payload?.runtime) ? response.payload.runtime : undefined;
  return {
    ok: true,
    view,
    binding: {
      version: 1,
      publicSessionId: input.publicSessionId,
      scenarioRef: input.publicMissionId,
      mode: input.mode,
      engineBaseUrl,
      credential,
      listing: input.listing,
      missionDoc: mission,
      missionSessionId,
      turn: session.turn,
      currentSceneId: session.currentSceneId,
      ...(runtime ? { runtime } : {}),
      ...(world ? { world } : {}),
      history: [],
      terminal: terminalFromWorld(session.world)
    }
  };
}

export async function applyPublishedMissionTurn(input: {
  readonly fetchImpl?: typeof fetch;
  readonly binding: PublishedMissionBinding;
  /** Авторский вариант — либо свободный текст игрока, но не оба сразу. */
  readonly choiceId?: string;
  readonly text?: string;
  readonly idempotencyKey: string;
}): Promise<{ readonly ok: true } & PublishedMissionTurnResult | { readonly ok: false; readonly status: number; readonly code: string; readonly explanation?: string }> {
  if (!ID.test(input.idempotencyKey)) return { ok: false, status: 400, code: "MISSION_BAD_TURN" };
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const isTextTurn = text.length > 0;
  if (isTextTurn ? text.length > 700 : !ID.test(input.choiceId ?? "")) return { ok: false, status: 400, code: "MISSION_BAD_TURN" };
  const body = isTextTurn ? { baseTurn: input.binding.turn, input: { kind: "text", text } } : { baseTurn: input.binding.turn, choiceId: input.choiceId };
  const response = await (input.fetchImpl ?? fetch)(`${input.binding.engineBaseUrl}/public/v1/missions/${encodeURIComponent(input.binding.scenarioRef)}/sessions/${encodeURIComponent(input.binding.missionSessionId)}/turns`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${input.binding.credential}`, "idempotency-key": input.idempotencyKey },
    body: JSON.stringify(body)
  }).then(jsonResult).catch(() => null);
  if (!response || !response.ok) {
    const code = typeof response?.payload?.error?.code === "string" ? response.payload.error.code : "MISSION_TURN_FAILED";
    const explanation = typeof response?.payload?.error?.explanation === "string" ? response.payload.error.explanation : undefined;
    const status = response?.status === 409 ? 409 : response?.status === 422 ? 422 : response?.status === 400 ? 400 : 503;
    return { ok: false, status, code, ...(explanation === undefined ? {} : { explanation }) };
  }
  const session = response.payload?.session;
  if (!session || typeof session.currentSceneId !== "string" || typeof session.turn !== "number") return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  const terminal = terminalFromTarget(response.payload?.target) ?? terminalFromWorld(session.world) ?? input.binding.terminal ?? null;
  const view = viewFor(input.binding.missionDoc, session, terminal);
  if (!view) return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  // Применённый авторский вариант возвращает движок: свободный ход сводится к
  // одному из них, и хроника должна называть именно его.
  const appliedChoiceId = typeof response.payload?.choiceId === "string" && ID.test(response.payload.choiceId)
    ? response.payload.choiceId
    : input.choiceId ?? "";
  const nextWorld = worldSnapshot(session.world);
  const previousView = viewFor(input.binding.missionDoc, { currentSceneId: input.binding.currentSceneId, turn: input.binding.turn }, input.binding.terminal ?? null);
  const historyEntry: PublishedMissionHistoryEntry = {
    id: `turn-${session.turn}`,
    turn: session.turn,
    choiceId: appliedChoiceId,
    choiceLabel: isTextTurn ? text : choiceLabel(input.binding, appliedChoiceId),
    fromTitle: previousView?.title ?? input.binding.currentSceneId,
    toTitle: view.title,
    deltas: resourceDeltas(input.binding.world, nextWorld),
    terminal: terminal !== null
  };
  return {
    ok: true,
    binding: {
      ...input.binding,
      turn: session.turn,
      currentSceneId: session.currentSceneId,
      ...(nextWorld ? { world: nextWorld } : {}),
      history: [...(input.binding.history ?? []), historyEntry],
      terminal
    },
    view,
    target: response.payload?.target ?? null,
    ...(response.payload?.replay ? { replay: true } : {})
  };
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
  const runtime = runtimeView(binding);
  return {
    id: binding.publicSessionId, scenarioId: binding.scenarioRef, mode, scenarioTitle: binding.listing.title, role: binding.listing.role,
    date: binding.listing.period, turn: view.turn, status: ended ? "victory" : "active", briefing: `${view.title}\n\n${view.text}`,
    objective: binding.listing.hook, metrics: [], factions: [], options,
    contentSource,
    timeline: [{ id: "mission-turn", date: binding.listing.period, title: `Ход ${view.turn}`, description: typeof target === "object" && target ? "Решение применено" : "Миссия начата", kind: "decision" }],
    // The authored frame is the only presentation source for a published
    // mission: the legacy scenario art must never be substituted for it.
    ...(frame ? { presentation: {
      kind: "published-mission" as const,
      publicMissionId: binding.scenarioRef,
      frame,
      ...(intros.length > 0 ? { intros } : {}),
      ...(runtime ? { runtime } : {}),
      inputModes: missionInputModes(binding.missionDoc),
      reaction: typeof target === "object" && target ? ("applied" as const) : ("start" as const)
    } } : {}),
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
