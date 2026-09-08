import type { DecisionOption, GameMode, GameState, Metric } from "../shared/types";

export type FlorenceRolloutMode = "off" | "test" | "on";
export type NewSessionRuntime = "legacy" | "engine";

export interface EngineBffEnv {
  RUNTIME_ROUTE_SESSIONS: DurableObjectNamespace;
  ENGINE_RUNTIME_URL?: string;
  ENGINE_FLORENCE_ROLLOUT?: string;
  ENGINE_FLORENCE_PROJECT_ID?: string;
  ENGINE_FLORENCE_QUEST_ID?: string;
}

interface EngineResourceView {
  id: string;
  unit: string;
  value: number;
}

interface EngineTerminalView {
  reason: string;
  outcome: string;
}

interface EnginePlayerView {
  sessionId: string;
  release: { questId: string; releaseId: string };
  revision: number;
  clock: { elapsedSeconds: number };
  entities: unknown[];
  resources: EngineResourceView[];
  items: unknown[];
  terminal: EngineTerminalView | null;
}

interface EngineSituationOption {
  id: string;
  status: "executed" | "conditional" | "blocked";
  meaning: string | null;
}

interface EngineSituation {
  questId: string;
  revision: number;
  elapsedSeconds: number;
  beat: null | {
    id: string;
    title: string | null;
    options: EngineSituationOption[];
  };
}

interface EngineSessionCreateResponse {
  sessionId: string;
  credential: string;
  playerView: EnginePlayerView;
  situation: EngineSituation;
}

interface EngineActionView {
  optionId: string | null;
  beatId: string | null;
  status: "executed" | "conditional" | "blocked";
  durationSeconds: number;
  reasonCode: string | null;
}

interface EngineStatePayload {
  playerView: EnginePlayerView;
  situation: EngineSituation;
  action?: EngineActionView;
}

export interface EngineRouteBinding {
  version: 1;
  runtime: "engine";
  publicSessionId: string;
  scenarioId: "florence-workshop";
  mode: GameMode;
  engineBaseUrl: string;
  engineSessionId: string;
  credential: string;
  projectId: string;
  questId: string;
  createdAt: string;
}

const FLORENCE_OPTION_TITLES: Readonly<Record<string, string>> = Object.freeze({
  draft: "Предложить письменные условия",
  healer: "Отправить Джулиано к лекарю",
  close: "Остановить работу на ночь",
  ledger: "Сверить записи поставки",
  team: "Перераспределить работу",
  refuse: "Отказаться убрать имя",
  counter: "Выдвинуть встречное условие",
  advance: "Принять аванс",
  protect: "Зафиксировать ответственность",
  pigment: "Проверить пигмент",
  testimony: "Получить свидетельство",
  withdraw: "Отозвать сделку",
  public: "Вынести спор на публику",
  "share-ledger": "Показать записи обеим сторонам",
  rest: "Дать мастерской отдых",
  deliver: "Предъявить подготовленный фрагмент",
  sign: "Оставить подпись на работе",
  workshop: "Сохранить мастерскую",
});

export function normalizeFlorenceRollout(value: unknown): FlorenceRolloutMode {
  return value === "test" || value === "on" ? value : "off";
}

/** Runtime selection is evaluated once, before a public session id is bound. */
export function chooseNewSessionRuntime(input: {
  scenarioId: string;
  rollout: unknown;
  requestedRuntime?: unknown;
}): NewSessionRuntime {
  if (input.scenarioId !== "florence-workshop") return "legacy";
  const rollout = normalizeFlorenceRollout(input.rollout);
  if (rollout === "on") return "engine";
  if (rollout === "test" && input.requestedRuntime === "engine") return "engine";
  return "legacy";
}

export function normalizeEngineBaseUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function isRuntimeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
}

function isCredential(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(value);
}

function isGameMode(value: unknown): value is GameMode {
  return value === "chronicle" || value === "campaign" || value === "sandbox";
}

function isEngineResource(value: unknown): value is EngineResourceView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isRuntimeId(record.id)
    && typeof record.unit === "string"
    && Number.isFinite(record.value);
}

function isEngineTerminal(value: unknown): value is EngineTerminalView | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.reason === "string" && typeof record.outcome === "string";
}

function isEnginePlayerView(value: unknown): value is EnginePlayerView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const release = record.release;
  const clock = record.clock;
  return isRuntimeId(record.sessionId)
    && Number.isSafeInteger(record.revision)
    && Number(record.revision) >= 0
    && !!release && typeof release === "object" && !Array.isArray(release)
    && isRuntimeId((release as Record<string, unknown>).questId)
    && isRuntimeId((release as Record<string, unknown>).releaseId)
    && !!clock && typeof clock === "object" && !Array.isArray(clock)
    && Number.isSafeInteger((clock as Record<string, unknown>).elapsedSeconds)
    && Number((clock as Record<string, unknown>).elapsedSeconds) >= 0
    && Array.isArray(record.entities)
    && Array.isArray(record.resources) && record.resources.every(isEngineResource)
    && Array.isArray(record.items)
    && isEngineTerminal(record.terminal);
}

function isSituationStatus(value: unknown): value is EngineSituationOption["status"] {
  return value === "executed" || value === "conditional" || value === "blocked";
}

function isEngineSituation(value: unknown): value is EngineSituation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!isRuntimeId(record.questId)
    || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0
    || !Number.isSafeInteger(record.elapsedSeconds) || Number(record.elapsedSeconds) < 0) return false;
  if (record.beat === null) return true;
  if (!record.beat || typeof record.beat !== "object" || Array.isArray(record.beat)) return false;
  const beat = record.beat as Record<string, unknown>;
  if (!isRuntimeId(beat.id) || !(beat.title === null || typeof beat.title === "string") || !Array.isArray(beat.options)) return false;
  return beat.options.every((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return false;
    const candidate = option as Record<string, unknown>;
    return isRuntimeId(candidate.id)
      && isSituationStatus(candidate.status)
      && (candidate.meaning === null || typeof candidate.meaning === "string");
  });
}

function isEngineActionView(value: unknown): value is EngineActionView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.optionId === null || isRuntimeId(record.optionId))
    && (record.beatId === null || isRuntimeId(record.beatId))
    && isSituationStatus(record.status)
    && Number.isSafeInteger(record.durationSeconds) && Number(record.durationSeconds) >= 0
    && (record.reasonCode === null || typeof record.reasonCode === "string");
}

function isEngineStatePayload(value: unknown): value is EngineStatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isEnginePlayerView(record.playerView)
    && isEngineSituation(record.situation)
    && (record.action === undefined || isEngineActionView(record.action));
}

function isEngineSessionCreateResponse(value: unknown): value is EngineSessionCreateResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return isRuntimeId(record.sessionId)
    && isCredential(record.credential)
    && isEnginePlayerView(record.playerView)
    && isEngineSituation(record.situation);
}

function isEngineRouteBinding(value: unknown): value is EngineRouteBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === 1
    && record.runtime === "engine"
    && isRuntimeId(record.publicSessionId)
    && record.scenarioId === "florence-workshop"
    && isGameMode(record.mode)
    && normalizeEngineBaseUrl(record.engineBaseUrl) === record.engineBaseUrl
    && isRuntimeId(record.engineSessionId)
    && isCredential(record.credential)
    && isRuntimeId(record.projectId)
    && isRuntimeId(record.questId)
    && typeof record.createdAt === "string";
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function resourceValue(view: EnginePlayerView, id: string): number {
  return view.resources.find((resource) => resource.id === id)?.value ?? 0;
}

function engineMetrics(view: EnginePlayerView): Metric[] {
  return [
    { id: "legitimacy", label: "Доверие гильдии", value: resourceValue(view, "guild-trust"), trend: 0 },
    { id: "economy", label: "Деньги мастерской", value: resourceValue(view, "workshop-cash"), trend: 0 },
    { id: "army", label: "Синий пигмент", value: resourceValue(view, "pigment-jars"), trend: 0 },
    { id: "stability", label: "Готовность фрески", value: resourceValue(view, "fresco-progress"), trend: 0 },
    { id: "diplomacy", label: "Доверие заказчика", value: resourceValue(view, "patron-trust"), trend: 0 },
  ];
}

function engineOptions(situation: EngineSituation): DecisionOption[] {
  if (!situation.beat) return [];
  return situation.beat.options.map((option) => ({
    id: option.id,
    title: FLORENCE_OPTION_TITLES[option.id] ?? option.id,
    description: option.meaning ?? "Авторский ход Living History Engine.",
    risk: option.status === "blocked" ? "высокий" : option.status === "conditional" ? "средний" : "низкий",
    intent: option.id,
  }));
}

function engineGameState(
  binding: EngineRouteBinding,
  payload: EngineStatePayload,
): GameState & { runtime: "engine"; engineReleaseId: string } {
  const view = payload.playerView;
  const options = engineOptions(payload.situation);
  const terminal = view.terminal;
  const lastOutcome = payload.action ? {
    headline: terminal?.outcome ?? (payload.situation.beat?.title ?? "Решение зафиксировано"),
    summary: payload.action.status === "blocked"
      ? "Ход заблокирован правилами текущего состояния; мир не изменён."
      : payload.action.status === "conditional"
        ? "Попытка зафиксирована, но желаемый результат ещё не считается достигнутым."
        : "Ход исполнен Living History Engine и изменения состояния зафиксированы.",
    nextBriefing: payload.situation.beat?.title ?? terminal?.outcome,
    dispatch: payload.action.optionId
      ? (FLORENCE_OPTION_TITLES[payload.action.optionId] ?? payload.action.optionId)
      : "Ход не исполнен",
    effects: [],
    reactions: [],
    nextOptions: options,
    daysPassed: 0,
    surprise: null,
    scene: {
      locationId: "workshop",
      activeCharacterIds: [],
      propIds: [],
      ambientId: null,
      atmosphere: terminal ? "Итог решения" : "Мастерская под давлением",
    },
    source: "simulation" as const,
    provider: "simulation" as const,
    resolution: {
      status: payload.action.status,
      explanation: payload.action.reasonCode ?? (payload.action.status === "conditional"
        ? "Условие или запрос зафиксирован без выдуманного успеха."
        : payload.action.status === "blocked"
          ? "Предусловия не выполнены; состояние не изменено."
          : "Ход исполнен по авторским правилам Engine."),
      cost: `${payload.action.durationSeconds} сек. игрового времени`,
    },
  } : null;

  return {
    id: binding.publicSessionId,
    scenarioId: binding.scenarioId,
    mode: binding.mode,
    scenarioTitle: "Флоренция: Мастерская под давлением",
    role: "Художник и хозяин мастерской",
    date: "1512-04-17",
    turn: view.revision + 1,
    status: terminal ? "victory" : "active",
    briefing: terminal?.outcome
      ?? payload.situation.beat?.title
      ?? "История продолжается.",
    objective: "К утру договориться с заказчиком о судьбе незаконченной росписи, сохранив причинность решений, людей и право на авторство.",
    metrics: engineMetrics(view),
    factions: [
      { name: "Ученики мастерской", power: 52, mood: "Ждут решения мастера" },
      { name: "Гильдия", power: 73, mood: "Сверяет доказательства" },
      { name: "Сторона заказчика", power: 81, mood: "Ведёт переговоры" },
    ],
    options,
    timeline: [{
      id: "engine-origin",
      date: "1512-04-17",
      title: "Мастерская под давлением",
      description: "Кардинал перенёс показ, ученик заболел, поставка пигмента спорна, а условия оплаты затрагивают авторство.",
      kind: "origin",
    }],
    lastOutcome,
    createdAt: binding.createdAt,
    updatedAt: binding.createdAt,
    runtime: "engine",
    engineReleaseId: view.release.releaseId,
  };
}

function engineTarget(env: EngineBffEnv): { baseUrl: string; projectId: string; questId: string } | null {
  const baseUrl = normalizeEngineBaseUrl(env.ENGINE_RUNTIME_URL);
  const projectId = env.ENGINE_FLORENCE_PROJECT_ID;
  const questId = env.ENGINE_FLORENCE_QUEST_ID;
  if (!baseUrl || !isRuntimeId(projectId) || !isRuntimeId(questId)) return null;
  return { baseUrl, projectId, questId };
}

async function readBinding(env: EngineBffEnv, publicSessionId: string): Promise<EngineRouteBinding | null> {
  const stub = env.RUNTIME_ROUTE_SESSIONS.get(env.RUNTIME_ROUTE_SESSIONS.idFromName(publicSessionId));
  const response = await stub.fetch("https://runtime-route/binding");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`runtime_binding_read_${response.status}`);
  const value = await response.json();
  if (!isEngineRouteBinding(value)) throw new Error("runtime_binding_corrupt");
  return value;
}

async function writeBinding(env: EngineBffEnv, binding: EngineRouteBinding): Promise<"created" | "replay" | "conflict"> {
  const stub = env.RUNTIME_ROUTE_SESSIONS.get(env.RUNTIME_ROUTE_SESSIONS.idFromName(binding.publicSessionId));
  const response = await stub.fetch("https://runtime-route/bind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(binding),
  });
  if (response.status === 201) return "created";
  if (response.status === 200) return "replay";
  if (response.status === 409) return "conflict";
  throw new Error(`runtime_binding_write_${response.status}`);
}

async function createEngineSession(env: EngineBffEnv, input: {
  publicSessionId: string;
  scenarioId: "florence-workshop";
  mode: GameMode;
}): Promise<Response> {
  const target = engineTarget(env);
  if (!target) {
    return json({ error: "Engine test route is not configured", code: "ENGINE_ROUTE_NOT_CONFIGURED" }, 503);
  }

  const engineResponse = await fetch(`${target.baseUrl}/v1/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: target.projectId, questId: target.questId }),
  });
  const payload = await engineResponse.json().catch(() => null);
  if (!engineResponse.ok || !isEngineSessionCreateResponse(payload)) {
    return json({
      error: "Engine session could not be created",
      code: "ENGINE_SESSION_CREATE_FAILED",
      upstreamStatus: engineResponse.status,
    }, 503);
  }

  const binding: EngineRouteBinding = {
    version: 1,
    runtime: "engine",
    publicSessionId: input.publicSessionId,
    scenarioId: input.scenarioId,
    mode: input.mode,
    engineBaseUrl: target.baseUrl,
    engineSessionId: payload.sessionId,
    credential: payload.credential,
    projectId: target.projectId,
    questId: target.questId,
    createdAt: new Date().toISOString(),
  };
  const stored = await writeBinding(env, binding);
  if (stored !== "created") {
    return json({ error: "Session route collision", code: "SESSION_ROUTE_COLLISION" }, 409);
  }

  return json(engineGameState(binding, { playerView: payload.playerView, situation: payload.situation }), 201);
}

async function fetchEngineState(binding: EngineRouteBinding): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(`${binding.engineBaseUrl}/v1/sessions/${encodeURIComponent(binding.engineSessionId)}`, {
    headers: { authorization: `Bearer ${binding.credential}` },
  });
  return { response, payload: await response.json().catch(() => null) };
}

async function handleBoundEngineSession(request: Request, binding: EngineRouteBinding, action: string | undefined): Promise<Response> {
  if (request.method === "GET" && !action) {
    const upstream = await fetchEngineState(binding);
    if (!upstream.response.ok || !isEngineStatePayload(upstream.payload)) {
      return json({ error: "Pinned Engine session is unavailable", code: "ENGINE_SESSION_UNAVAILABLE", upstreamStatus: upstream.response.status }, 503);
    }
    return json(engineGameState(binding, upstream.payload));
  }

  if (request.method === "GET" && action === "metrics") {
    return json({ error: "Engine metrics adapter is outside B11", code: "ENGINE_METRICS_ADAPTER_PENDING" }, 501);
  }

  if (request.method === "POST" && action === "turn") {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const text = typeof body?.action === "string" ? body.action.trim().slice(0, 700) : "";
    const source = body?.source;
    const optionId = typeof body?.optionId === "string" ? body.optionId : "";
    const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
    const prepared = source === "prepared";
    if (!isRuntimeId(idempotencyKey)
      || (prepared && !isRuntimeId(optionId))
      || (!prepared && text.length < 1)) {
      return json({ error: "Invalid Engine turn request", code: "INVALID_ENGINE_TURN" }, 400);
    }

    const current = await fetchEngineState(binding);
    if (!current.response.ok || !isEngineStatePayload(current.payload)) {
      return json({ error: "Pinned Engine session is unavailable", code: "ENGINE_SESSION_UNAVAILABLE", upstreamStatus: current.response.status }, 503);
    }

    const upstreamBody = prepared
      ? {
          expectedRevision: current.payload.playerView.revision,
          action: { type: "authored.option", optionId },
        }
      : {
          expectedRevision: current.payload.playerView.revision,
          input: { kind: "text", text },
        };
    const upstream = await fetch(`${binding.engineBaseUrl}/v1/sessions/${encodeURIComponent(binding.engineSessionId)}/actions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${binding.credential}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(upstreamBody),
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return json({
        error: "Engine turn failed",
        code: "ENGINE_TURN_FAILED",
        upstreamStatus: upstream.status,
        upstream: payload,
      }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 503);
    }
    if (!isEngineStatePayload(payload) || !payload.action) {
      return json({ error: "Engine returned an incompatible player response", code: "ENGINE_RESPONSE_INVALID" }, 503);
    }
    return json(engineGameState(binding, payload));
  }

  return json({ error: "API route not found" }, 404);
}

/**
 * B11 wrapper. Legacy requests are delegated unchanged. New Engine sessions
 * receive a durable binding and a server-side compatibility GameState view;
 * the browser never calculates Engine effects or terminal outcomes.
 */
export async function handleEngineBff(
  request: Request,
  env: EngineBffEnv,
  legacyFetch: (request: Request) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/games") {
    const clone = request.clone();
    const body = await clone.json().catch(() => null) as Record<string, unknown> | null;
    const scenarioId = typeof body?.scenarioId === "string" ? body.scenarioId : "russia-1917";
    const runtime = chooseNewSessionRuntime({
      scenarioId,
      rollout: env.ENGINE_FLORENCE_ROLLOUT,
      requestedRuntime: body?.runtime,
    });
    if (runtime === "legacy") return legacyFetch(request);

    const mode: GameMode = isGameMode(body?.mode) ? body.mode : "chronicle";
    return createEngineSession(env, {
      publicSessionId: crypto.randomUUID(),
      scenarioId: "florence-workshop",
      mode,
    });
  }

  const match = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)(?:\/(turn|metrics))?$/i);
  if (!match) return legacyFetch(request);
  const publicSessionId = match[1];
  if (!publicSessionId) return legacyFetch(request);
  const binding = await readBinding(env, publicSessionId);
  if (!binding) return legacyFetch(request);
  return handleBoundEngineSession(request, binding, match[2]);
}

export class RuntimeRouteSession implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/binding") {
      const binding = await this.ctx.storage.get<EngineRouteBinding>("binding");
      return binding ? json(binding) : json({ error: "not found" }, 404);
    }

    if (request.method === "POST" && url.pathname === "/bind") {
      const candidate = await request.json().catch(() => null);
      if (!isEngineRouteBinding(candidate)) return json({ error: "invalid binding" }, 400);
      const existing = await this.ctx.storage.get<EngineRouteBinding>("binding");
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(candidate)
          ? json(existing)
          : json({ error: "binding conflict" }, 409);
      }
      await this.ctx.storage.put("binding", candidate);
      return json(candidate, 201);
    }

    return json({ error: "not found" }, 404);
  }
}