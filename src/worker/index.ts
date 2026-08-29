import type { GameMode, GameState, MetricId, SceneCue, TurnOutcome } from "../shared/types";
import { createInitialState, scenarioSummaries } from "./scenarios";
import { applyOutcome, simulateTurn } from "./simulation";
import { gameModes, worldContextForTurn } from "./world";

interface Env {
  AI: Ai;
  HISTORY_SESSIONS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

interface StoredGame {
  state: GameState;
  processedKeys: Record<string, GameState>;
}

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

function errorResponse(message: string, status = 400) {
  return json({ error: message }, status);
}

function cleanAction(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);
}

function parseAiJson(text: string): Partial<TurnOutcome> | null {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = match?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return JSON.parse(candidate) as Partial<TurnOutcome>;
  } catch {
    return null;
  }
}

interface WorkersAiChatResponse {
  response?: string;
  choices?: Array<{
    text?: string;
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
}

export function extractAiText(result: WorkersAiChatResponse): string {
  if (typeof result.response === "string") return result.response;
  const choice = result.choices?.[0];
  if (typeof choice?.text === "string") return choice.text;
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("");
  return "";
}

function validateAiOutcome(candidate: Partial<TurnOutcome> | null, fallback: TurnOutcome): TurnOutcome {
  if (!candidate || typeof candidate.headline !== "string" || typeof candidate.summary !== "string") return fallback;
  const validIds = new Set<MetricId>(["legitimacy", "economy", "army", "stability", "diplomacy"]);
  const effects = Array.isArray(candidate.effects)
    ? candidate.effects
        .filter((item) => item && validIds.has(item.id as MetricId) && Number.isFinite(item.delta))
        .map((item) => ({ id: item.id as MetricId, delta: Math.max(-10, Math.min(10, Math.round(item.delta))), reason: String(item.reason || "Последствие решения") }))
    : fallback.effects;
  const scene = candidate.scene && typeof candidate.scene === "object"
    ? {
        locationId: String(candidate.scene.locationId || fallback.scene.locationId).slice(0, 80),
        activeCharacterIds: Array.isArray(candidate.scene.activeCharacterIds) ? candidate.scene.activeCharacterIds.map(String).slice(0, 2) : fallback.scene.activeCharacterIds,
        propIds: Array.isArray(candidate.scene.propIds) ? candidate.scene.propIds.map(String).slice(0, 3) : fallback.scene.propIds,
        ambientId: typeof candidate.scene.ambientId === "string" ? candidate.scene.ambientId.slice(0, 80) : null,
        atmosphere: typeof candidate.scene.atmosphere === "string" ? candidate.scene.atmosphere.slice(0, 240) : fallback.scene.atmosphere,
      } satisfies SceneCue
    : fallback.scene;

  return {
    ...fallback,
    headline: candidate.headline.slice(0, 140),
    summary: candidate.summary.slice(0, 1000),
    dispatch: typeof candidate.dispatch === "string" ? candidate.dispatch.slice(0, 420) : fallback.dispatch,
    effects: effects.length ? effects : fallback.effects,
    reactions: Array.isArray(candidate.reactions) && candidate.reactions.length ? candidate.reactions.slice(0, 4) : fallback.reactions,
    nextOptions: Array.isArray(candidate.nextOptions) && candidate.nextOptions.length === 3 ? candidate.nextOptions : fallback.nextOptions,
    daysPassed: Number.isFinite(candidate.daysPassed) ? Math.max(2, Math.min(45, Math.round(candidate.daysPassed!))) : fallback.daysPassed,
    surprise: typeof candidate.surprise === "string" ? candidate.surprise.slice(0, 450) : fallback.surprise,
    scene,
    source: "ai",
  };
}

async function generateOutcome(env: Env, state: GameState, action: string): Promise<TurnOutcome> {
  const fallback = simulateTurn(state, action);
  try {
    const compactState = {
      mode: state.mode,
      date: state.date,
      turn: state.turn,
      metrics: state.metrics,
      factions: state.factions,
      lastEvents: state.timeline.slice(-5),
    };
    const world = worldContextForTurn(state, action);
    const result = (await env.AI.run("@cf/zai-org/glm-4.7-flash", {
      messages: [
        {
          role: "system",
          content:
            "Ты — движок и режиссёр серьёзной альтернативно-исторической стратегии. Моделируй причинные последствия без магии, морализаторства и предопределённого канона. Учитывай логистику, институты, ограниченность власти и частичное знание персонажей. Персонажи преследуют собственные цели, помнят обращение игрока, могут ошибаться, лгать, торговаться и отказываться. Юмор редкий, наблюдательный и никогда не превращает бедность или насилие в шутку. Пиши по-русски. Верни только валидный JSON.",
        },
        {
          role: "user",
          content: `Сценарий: Россия, март 1917. Игрок — глава Временного правительства.\nСостояние: ${JSON.stringify(compactState)}\nРежиссёрский контекст мира: ${JSON.stringify(world)}\nРешение игрока: ${action}\n\nВыбери максимум двух активных персонажей из контекста. Дай каждому характерную реакцию в пределах его знаний. Микросцену используй только при выполненном триггере. Предмет или техника должны иметь цену/ограничение.\n\nВерни JSON: {"headline":"до 100 знаков","summary":"2-4 конкретных абзаца","dispatch":"короткая газетная или телеграфная цитата","effects":[{"id":"legitimacy|economy|army|stability|diplomacy","delta":целое от -10 до 10,"reason":"почему"}],"reactions":[{"faction":"название или имя персонажа","stance":"поддержка|настороженность|противодействие","text":"характерная конкретная реакция"}],"nextOptions":[ровно 3 объекта {"id":"латиница","title":"название","description":"что именно","risk":"низкий|средний|высокий","intent":"полное действие"}],"daysPassed":число 2..45,"surprise":"непредвиденный, но причинный эффект или null","scene":{"locationId":"id места","activeCharacterIds":["до 2 id персонажей"],"propIds":["до 3 id предметов"],"ambientId":"id микросцены или null","atmosphere":"свет, погода и один фоновый звук"}}`,
        },
      ],
      max_completion_tokens: 1600,
      reasoning_effort: "low",
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_object" },
      temperature: 0.72,
    })) as WorkersAiChatResponse;
    return validateAiOutcome(parseAiJson(extractAiText(result)), fallback);
  } catch (error) {
    console.warn("Workers AI fallback", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export class HistorySession implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  private async getStored(): Promise<StoredGame | null> {
    return (await this.ctx.storage.get<StoredGame>("game")) ?? null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") {
      const body = (await request.json()) as { id?: string; scenarioId?: string; mode?: GameMode };
      if (!body.id) return errorResponse("Не передан идентификатор сессии");
      const existing = await this.getStored();
      if (existing) return json(existing.state);
      const mode = body.mode && body.mode in gameModes ? body.mode : "campaign";
      const state = createInitialState(body.id, body.scenarioId ?? "russia-1917", mode);
      await this.ctx.storage.put("game", { state, processedKeys: {} } satisfies StoredGame);
      return json(state, 201);
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const stored = await this.getStored();
      return stored ? json(stored.state) : errorResponse("Сессия не найдена", 404);
    }

    if (request.method === "POST" && url.pathname === "/turn") {
      const body = (await request.json()) as { action?: unknown; idempotencyKey?: unknown };
      const action = cleanAction(body.action);
      const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 80) : "";
      if (action.length < 4) return errorResponse("Опишите решение хотя бы несколькими словами");
      const stored = await this.getStored();
      if (!stored) return errorResponse("Сессия не найдена", 404);
      if (key && stored.processedKeys[key]) return json(stored.processedKeys[key]);
      if (stored.state.status !== "active") return errorResponse("Эта ветка истории уже завершена", 409);

      const outcome = await generateOutcome(this.env, stored.state, action);
      const state = applyOutcome(stored.state, action, outcome);
      const processedKeys = key ? { ...stored.processedKeys, [key]: state } : stored.processedKeys;
      const trimmedKeys = Object.fromEntries(Object.entries(processedKeys).slice(-10));
      await this.ctx.storage.put("game", { state, processedKeys: trimmedKeys } satisfies StoredGame);
      return json(state);
    }

    return errorResponse("Маршрут не найден", 404);
  }
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "living-history-sandbox", aiModel: "@cf/zai-org/glm-4.7-flash" });
  }
  if (request.method === "GET" && url.pathname === "/api/scenarios") return json(scenarioSummaries);

  if (request.method === "POST" && url.pathname === "/api/games") {
    const body = (await request.json().catch(() => ({}))) as { scenarioId?: string; mode?: GameMode };
    const id = crypto.randomUUID();
    const stub = env.HISTORY_SESSIONS.get(env.HISTORY_SESSIONS.idFromName(id));
    return stub.fetch("https://session/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, scenarioId: body.scenarioId ?? "russia-1917", mode: body.mode ?? "campaign" }),
    });
  }

  const match = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)(?:\/(turn))?$/i);
  if (match) {
    const [, id, action] = match;
    const stub = env.HISTORY_SESSIONS.get(env.HISTORY_SESSIONS.idFromName(id));
    if (request.method === "GET" && !action) return stub.fetch("https://session/state");
    if (request.method === "POST" && action === "turn") {
      const body = await request.text();
      return stub.fetch("https://session/turn", { method: "POST", headers: { "content-type": "application/json" }, body });
    }
  }

  return errorResponse("API-маршрут не найден", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        console.error(error);
        return errorResponse("Внутренняя ошибка игрового движка", 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
