/**
 * M02 generic mission BFF: preview sessions for engine missions without a
 * per-quest `if`. A data registry maps a public scenarioRef to engine
 * mission coordinates; all engine traffic goes to the Control mission
 * endpoints. Live route wiring lands with the publication registry (M06);
 * this module is pure and tested with stubbed fetch.
 */

import type { FrameDocShape } from "../shared/mission-presentation/frame-build";

export interface MissionBffRegistryEntry {
  readonly projectId: string;
  readonly questId: string;
}

export type MissionBffRegistry = Readonly<Record<string, MissionBffRegistryEntry>>;

export interface MissionBffSceneView {
  readonly sceneId: string;
  readonly title: string;
  readonly text: string;
  readonly choices: readonly {
    readonly choiceId: string;
    readonly label: string;
  }[];
  readonly turn: number;
  readonly contentRevision: number;
  readonly contentHash: string;
}

export interface MissionBffBinding {
  readonly version: 1;
  readonly publicSessionId: string;
  readonly scenarioRef: string;
  readonly projectId: string;
  readonly questId: string;
  readonly contentRevision: number;
  readonly contentHash: string;
  readonly missionDoc: MissionDocShape;
  readonly missionSessionId: string;
  readonly turn: number;
  readonly currentSceneId: string;
}

export interface MissionDocShape {
  readonly contentRevision: number;
  readonly contentHash: string;
  /** Authored presentation of the pinned revision; drives the shared renderer. */
  readonly screens?: FrameDocShape["screens"];
  readonly defaults?: FrameDocShape["defaults"];
  readonly story: {
    readonly entrySceneId: string;
    readonly scenes: readonly {
      readonly id: string;
      readonly title: string;
      readonly text: string;
      /** The contract's `MissionScene.dialogue`. */
      readonly dialogue?: readonly {
        readonly id: string;
        readonly speakerId: string | null;
        readonly text: string;
      }[];
      readonly choices: readonly {
        readonly id: string;
        readonly label: string;
        readonly targetSceneId: string | null;
        readonly endingId: string | null;
      }[];
    }[];
    readonly endings: readonly { readonly id: string; readonly title: string; readonly text: string }[];
  };
}

export type MissionBffResult =
  | { readonly ok: true; readonly status: number; readonly body: unknown }
  | { readonly ok: false; readonly status: number; readonly code: string };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function emptyWorld() {
  return {
    schemaVersion: "1.0",
    revision: 0,
    clock: { elapsedSeconds: 0 },
    locations: [],
    entities: [],
    resources: [],
    items: [],
    terminal: null
  };
}

export function missionSceneView(
  doc: MissionDocShape,
  currentSceneId: string,
  turn: number
): MissionBffSceneView | null {
  const scene = doc.story.scenes.find((entry) => entry.id === currentSceneId) ?? null;
  if (!scene) return null;
  return {
    sceneId: scene.id,
    title: scene.title,
    text: scene.text,
    choices: scene.choices.map((choice) => ({
      choiceId: choice.id,
      label: choice.label
    })),
    turn,
    contentRevision: doc.contentRevision,
    contentHash: doc.contentHash
  };
}

async function readEngineJson(response: Response): Promise<{ ok: boolean; payload: unknown }> {
  const payload = await response.json().catch(() => null);
  return { ok: response.ok, payload };
}

export async function createMissionPreviewSession(input: {
  readonly fetchImpl?: typeof fetch;
  readonly controlBaseUrl: string;
  readonly serviceHeaders?: Record<string, string>;
  readonly registry: MissionBffRegistry;
  readonly scenarioRef: string;
  readonly publicSessionId: string;
  readonly newSessionId: () => string;
}): Promise<
  | { readonly ok: true; readonly binding: MissionBffBinding; readonly view: MissionBffSceneView }
  | { readonly ok: false; readonly status: number; readonly code: string }
> {
  const entry = input.registry[input.scenarioRef];
  if (!entry) return { ok: false, status: 404, code: "MISSION_UNKNOWN" };
  if (!ID.test(input.publicSessionId)) return { ok: false, status: 400, code: "MISSION_BAD_SESSION" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = { "content-type": "application/json", ...(input.serviceHeaders ?? {}) };
  const questBase = `${input.controlBaseUrl}/control/v1/projects/${encodeURIComponent(entry.projectId)}/quests/${encodeURIComponent(entry.questId)}/mission`;

  const docRes = await fetchImpl(`${questBase}`, { headers }).then(readEngineJson).catch(() => null);
  if (!docRes || !docRes.ok || !isMissionDoc((docRes.payload as { mission?: unknown } | null)?.mission)) {
    return { ok: false, status: 503, code: "MISSION_ENGINE_UNAVAILABLE" };
  }
  const doc = (docRes.payload as { mission: MissionDocShape }).mission;

  const missionSessionId = input.newSessionId();
  const createRes = await fetchImpl(`${questBase}/sessions`, {
    method: "POST",
    headers: { ...headers, "idempotency-key": `bff-${input.publicSessionId}` },
    body: JSON.stringify({ sessionId: missionSessionId, initialWorld: emptyWorld() })
  }).then(readEngineJson).catch(() => null);
  if (!createRes || !createRes.ok) {
    return { ok: false, status: 503, code: "MISSION_SESSION_CREATE_FAILED" };
  }
  const session = (createRes.payload as { session?: { currentSceneId?: unknown; turn?: unknown } | null })?.session;
  if (!session || typeof session.currentSceneId !== "string" || typeof session.turn !== "number") {
    return { ok: false, status: 503, code: "MISSION_SESSION_CREATE_FAILED" };
  }
  const view = missionSceneView(doc, session.currentSceneId, session.turn);
  if (!view) return { ok: false, status: 503, code: "MISSION_SESSION_CREATE_FAILED" };
  return {
    ok: true,
    binding: {
      version: 1,
      publicSessionId: input.publicSessionId,
      scenarioRef: input.scenarioRef,
      projectId: entry.projectId,
      questId: entry.questId,
      contentRevision: doc.contentRevision,
      contentHash: doc.contentHash,
      missionDoc: doc,
      missionSessionId,
      turn: session.turn,
      currentSceneId: session.currentSceneId
    },
    view
  };
}

export async function applyMissionPreviewTurn(input: {
  readonly fetchImpl?: typeof fetch;
  readonly controlBaseUrl: string;
  readonly serviceHeaders?: Record<string, string>;
  readonly binding: MissionBffBinding;
  readonly choiceId: string;
  readonly idempotencyKey: string;
}): Promise<
  | { readonly ok: true; readonly binding: MissionBffBinding; readonly view: MissionBffSceneView; readonly target: unknown; readonly replay?: boolean }
  | { readonly ok: false; readonly status: number; readonly code: string }
> {
  if (!ID.test(input.choiceId)) return { ok: false, status: 400, code: "MISSION_BAD_CHOICE" };
  const scene = input.binding.missionDoc.story.scenes.find((entry) => entry.id === input.binding.currentSceneId);
  const known = scene?.choices.some((choice) => choice.id === input.choiceId) ?? false;
  if (!known) return { ok: false, status: 422, code: "MISSION_CHOICE_NOT_IN_SCENE" };
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = { "content-type": "application/json", ...(input.serviceHeaders ?? {}) };
  const url =
    `${input.controlBaseUrl}/control/v1/projects/${encodeURIComponent(input.binding.projectId)}` +
    `/quests/${encodeURIComponent(input.binding.questId)}/mission/sessions/` +
    `${encodeURIComponent(input.binding.missionSessionId)}/turns`;
  const turnRes = await fetchImpl(url, {
    method: "POST",
    headers: { ...headers, "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ baseTurn: input.binding.turn, choiceId: input.choiceId })
  }).then(readEngineJson).catch(() => null);
  if (!turnRes) return { ok: false, status: 503, code: "MISSION_ENGINE_UNAVAILABLE" };
  const payload = turnRes.payload as {
    session?: { currentSceneId?: unknown; turn?: unknown } | null;
    target?: unknown;
    error?: { code?: unknown };
  } | null;
  if (!turnRes.ok) {
    const code = typeof payload?.error?.code === "string" ? payload.error.code : "MISSION_TURN_FAILED";
    if (code === "MISSION_TURN_CONFLICT") return { ok: false, status: 409, code };
    if (code === "MISSION_IDEMPOTENCY_KEY_REUSED") return { ok: false, status: 409, code };
    if (typeof code === "string" && code.startsWith("MISSION_TURN_")) return { ok: false, status: 422, code };
    return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  }
  if (!payload || !payload.session || typeof payload.session.currentSceneId !== "string" || typeof payload.session.turn !== "number") {
    return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  }
  const next: MissionBffBinding = {
    ...input.binding,
    turn: payload.session.turn,
    currentSceneId: payload.session.currentSceneId
  };
  if (payload.target !== null && typeof payload.target === "object") {
    const target = payload.target as { kind?: unknown; sceneId?: unknown; endingId?: unknown };
    if (target.kind === "ending" && typeof target.endingId === "string") {
      const ending = next.missionDoc.story.endings.find((entry) => entry.id === target.endingId);
      if (!ending) return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
      return {
        ok: true,
        binding: next,
        view: {
          sceneId: `ending:${ending.id}`,
          title: ending.title,
          text: ending.text,
          choices: [],
          turn: next.turn,
          contentRevision: next.contentRevision,
          contentHash: next.contentHash
        },
        target: payload.target
      };
    }
  }
  const view = missionSceneView(next.missionDoc, next.currentSceneId, next.turn);
  if (!view) return { ok: false, status: 503, code: "MISSION_TURN_FAILED" };
  return { ok: true, binding: next, view, target: payload.target };
}

function isMissionDoc(value: unknown): value is MissionDocShape {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Record<string, unknown>;
  const story = doc.story as Record<string, unknown> | undefined;
  return (
    typeof doc.contentRevision === "number" &&
    typeof doc.contentHash === "string" &&
    !!story &&
    typeof story.entrySceneId === "string" &&
    Array.isArray(story.scenes) &&
    Array.isArray(story.endings)
  );
}
