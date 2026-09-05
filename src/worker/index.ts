import type { ActionSource, DecisionOption, GameMode, GameState, MetricId, SceneCue, TurnOutcome } from "../shared/types";
import { campaignActForTurn } from "../shared/campaign";
import { createSessionAnalytics, normalizeVisitorId, publicAnalytics, recordSuccessfulTurn, registerSessionOpen, type SessionAnalytics } from "./analytics";
import { type ProductAnalyticsEvent } from "./product-analytics";
import { createInitialState, scenarioSummaries } from "./scenarios";
import { applyOutcome, simulateTurn } from "./simulation";
import { florenceMessages, florenceEditorialMessages, validateFlorenceAi } from './florence-ai';
import { gameModes, microEncounters, worldCharacters, worldContextForTurn, worldEntities } from "./world";

const validCharacterIds = new Set(worldCharacters.map((character) => character.id));
const validEntityIds = new Set(worldEntities.map((entity) => entity.id));
const validAmbientIds = new Set(microEncounters.map((encounter) => encounter.id));

interface Env {
  AI: Ai;
  HISTORY_SESSIONS: DurableObjectNamespace;
  PRODUCT_ANALYTICS: DurableObjectNamespace;
  ASSETS: Fetcher;
  DEEPSEEK_API_KEY?: string;
  ANALYTICS_DASHBOARD_TOKEN?: string;
}

interface StoredGame {
  state: GameState;
  processedKeys: Record<string, GameState>;
  analytics?: SessionAnalytics;
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

function cleanOptionId(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9-]{2,80}$/i.test(value) ? value : null;
}

function resolveActionSource(state: GameState, action: string, requestedSource: unknown, optionId: string | null): ActionSource {
  if (requestedSource !== "prepared" || !optionId) return "freeform";
  const option = state.options.find((item) => item.id === optionId);
  if (!option) return "freeform";
  const preparedActions = [
    cleanAction(option.intent),
    cleanAction(`${option.title}: ${option.description}`),
  ].filter(Boolean);
  return preparedActions.includes(action) ? "prepared" : "freeform";
}

function logProductEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ category: "product_analytics", schemaVersion: 1, event, ...data }));
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

interface WorkersAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

interface WorkersAiChatResponse {
  response?: string;
  usage?: WorkersAiUsage;
  choices?: Array<{
    text?: string;
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
}

function usageFromResponse(usage?: WorkersAiUsage): TurnOutcome["usage"] | undefined {
  if (!usage) return undefined;
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? inputTokens + outputTokens);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0) return undefined;
  return { inputTokens: Math.round(inputTokens), outputTokens: Math.round(outputTokens), totalTokens: Math.round(totalTokens) };
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

function normalizeAiOptions(candidate: unknown, fallback: DecisionOption[]): DecisionOption[] {
  if (!Array.isArray(candidate) || candidate.length !== 3) return fallback;
  const genericIntent = /^(полное\s+действие|действие|команда|action|full\s+action)$/i;

  return candidate.map((item, index) => {
    const safeFallback = fallback[index];
    if (!item || typeof item !== "object") return safeFallback;
    const option = item as Partial<DecisionOption>;
    const title = cleanAction(option.title);
    const description = cleanAction(option.description);
    const intent = cleanAction(option.intent);
    const risk = option.risk === "низкий" || option.risk === "средний" || option.risk === "высокий"
      ? option.risk
      : safeFallback.risk;
    const id = typeof option.id === "string" && /^[a-z0-9-]{2,80}$/i.test(option.id)
      ? option.id
      : safeFallback.id;

    if (title.length < 3 || description.length < 8) return safeFallback;
    return {
      id,
      title: title.slice(0, 100),
      description: description.slice(0, 280),
      risk,
      intent: intent.length >= 4 && !genericIntent.test(intent)
        ? intent.slice(0, 700)
        : `${title}: ${description}`,
    };
  });
}

function validateAiOutcome(candidate: Partial<TurnOutcome> | null, fallback: TurnOutcome, provider: "deepseek" | "cloudflare"): TurnOutcome {
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
        activeCharacterIds: Array.isArray(candidate.scene.activeCharacterIds)
          ? candidate.scene.activeCharacterIds.map(String).filter((id) => validCharacterIds.has(id)).slice(0, 2)
          : fallback.scene.activeCharacterIds,
        propIds: Array.isArray(candidate.scene.propIds)
          ? candidate.scene.propIds.map(String).filter((id) => validEntityIds.has(id)).slice(0, 3)
          : fallback.scene.propIds,
        ambientId: typeof candidate.scene.ambientId === "string" && validAmbientIds.has(candidate.scene.ambientId) ? candidate.scene.ambientId : null,
        atmosphere: typeof candidate.scene.atmosphere === "string" ? candidate.scene.atmosphere.slice(0, 240) : fallback.scene.atmosphere,
      } satisfies SceneCue
    : fallback.scene;

  return {
    ...fallback,
    headline: candidate.headline.slice(0, 140),
    summary: candidate.summary.slice(0, 5000),
    nextBriefing: typeof candidate.nextBriefing === "string" ? candidate.nextBriefing.slice(0, 500) : fallback.nextBriefing,
    dispatch: typeof candidate.dispatch === "string" ? candidate.dispatch.slice(0, 420) : fallback.dispatch,
    effects: effects.length ? effects : fallback.effects,
    reactions: Array.isArray(candidate.reactions) && candidate.reactions.length ? candidate.reactions.slice(0, 4) : fallback.reactions,
    nextOptions: normalizeAiOptions(candidate.nextOptions, fallback.nextOptions),
    daysPassed: Number.isFinite(candidate.daysPassed) ? Math.max(2, Math.min(45, Math.round(candidate.daysPassed!))) : fallback.daysPassed,
    surprise: typeof candidate.surprise === "string" ? candidate.surprise.slice(0, 450) : fallback.surprise,
    scene,
    source: "ai",
    provider,
  };
}

export async function generateOutcome(env: Env, state: GameState, action: string): Promise<TurnOutcome> {
  const florence = state.scenarioId === 'florence-workshop';
  const fallback = florence ? null : simulateTurn(state, action);
  const compactState = {
    mode: state.mode,
    date: state.date,
    turn: state.turn,
    metrics: state.metrics,
    factions: state.factions,
    lastEvents: state.timeline.slice(-5),
  };
  const world = worldContextForTurn(state, action);
  const campaignAct = state.mode === "campaign" ? campaignActForTurn(state.turn) : null;
  const scenarioBrief = state.scenarioId === "last-train-1917"
    ? "Сценарий: «Последний поезд из Петрограда», апрель 1917 года. Игрок — распорядитель эвакуационного эшелона на Николаевском вокзале. До рассвета есть один исправный состав; раненые, уголь и солдатская делегация претендуют на один маршрут. Это короткая хроника о цене порядка посадки, а не викторина по истории."
    : `Сценарий: Россия, март 1917. Игрок — глава Временного правительства.${campaignAct ? ` Сейчас ${campaignAct.title}: ${campaignAct.question} Фокус акта — ${campaignAct.focus}.` : ""}`;
  const messages = florence ? florenceMessages(state, action) : [
    {
      role: "system" as const,
      content:
        "Ты — ведущий интерактивной исторической игры. Пиши ясным современным русским языком: сначала кто пришёл и чего хочет, затем что случилось и что можно сделать. При первом появлении объясняй роль человека. Не рассчитывай на знания игрока об истории. Избегай канцелярита и метафор вместо причин. Прочитай весь ход, включая бытовые и смешные дополнения: они должны получить реакцию и влиять на следующие варианты. Моделируй причинные последствия без магии и морализаторства. Учитывай логистику, ограниченность власти и частичное знание персонажей. Они помнят обращение игрока, могут торговаться и отказываться. В истории о поезде все разговоры идут в одну ночь: поезд не может одновременно уйти в dispatch и оставаться у перрона в nextBriefing. Об отправлении объявляй только после соответствующего решения игрока. Не превращай покупку угощения в трату последних денег, если игрок этого не сказал. Реплики, последствия и следующая ситуация должны описывать одно состояние мира. Разбей summary на короткие абзацы. Верни только валидный JSON.",
    },
    {
      role: "user" as const,
      content: `${scenarioBrief}\nСостояние: ${JSON.stringify(compactState)}\nРежиссёрский контекст мира: ${JSON.stringify(world)}\nРешение игрока: ${action}\n\nВыбери максимум двух активных персонажей из контекста. Дай каждому характерную реакцию в пределах его знаний. Микросцену используй только при выполненном триггере. Предмет или техника должны иметь цену/ограничение. Для короткой хроники держи причинную дугу вокруг одного состава и не расширяй конфликт до общей истории страны. Для кампании держи вопрос текущего акта в центре, а три nextOptions делай разными человеческими ставками: прозрачность, скорость исполнения и передача полномочий. Не превращай акт в пересказ учебника — покажи исполнителя, ресурс, задержку и цену.\n\nВажно: summary описывает последствия уже принятого решения. nextBriefing — это новая оперативная ситуация следующего хода; не повторяй в нём headline, summary, dispatch или формулировку приказа. Пиши о том, что теперь стало узким местом и кто должен первым действовать.\n\nВ каждом nextOptions.intent напиши готовую конкретную команду игрока длиной 8–180 знаков. Никогда не пиши туда слова «полное действие», «действие» или «команда» — это поле сразу подставляется в редактор приказа.\n\nВерни JSON: {"headline":"до 100 знаков","summary":"2-4 конкретных абзаца","nextBriefing":"новая вводка следующего хода, 1-2 конкретных предложения без повтора последствий","dispatch":"короткая газетная или телеграфная цитата","effects":[{"id":"legitimacy|economy|army|stability|diplomacy","delta":целое от -10 до 10,"reason":"почему"}],"reactions":[{"faction":"название или имя персонажа","stance":"поддержка|настороженность|противодействие","text":"характерная конкретная реакция"}],"nextOptions":[ровно 3 объекта {"id":"латиница","title":"название","description":"что именно","risk":"низкий|средний|высокий","intent":"конкретная команда игрока"}],"daysPassed":число 1..45,"surprise":"непредвиденный, но причинный эффект или null","scene":{"locationId":"id места","activeCharacterIds":["до 2 id персонажей"],"propIds":["до 3 id предметов"],"ambientId":"id микросцены или null","atmosphere":"свет, погода и один фоновый звук"}}`,
    },
  ];

  if (env.DEEPSEEK_API_KEY) {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          max_tokens: florence ? 4500 : 1600,
          temperature: 0.72,
          stream: false,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`DeepSeek API ${response.status}: ${(await response.text()).slice(0, 240)}`);
      const result = (await response.json()) as WorkersAiChatResponse;
      let parsed = parseAiJson(extractAiText(result));
      let usage = usageFromResponse(result.usage);
      if (florence) {
        // Validate the primary answer before asking the optional editor to touch it.
        // A bad editorial pass must never erase an otherwise usable AI scene.
        const draftOutcome = validateFlorenceAi(parsed, state, action, 'deepseek');
        if (!draftOutcome) {
          throw new Error(parsed ? 'ai_primary_invalid_contract' : 'ai_primary_invalid_json', { cause: parsed ? { fields: ['headline', 'summary', 'resolution', 'advanceScene', 'nextBriefing', 'nextOptions', 'reflection'].filter(k => k in parsed), status: parsed.resolution?.status, optionCount: parsed.nextOptions?.length, advanceType: typeof parsed.advanceScene } : undefined });
        }
        let finalOutcome = draftOutcome;
        try {
          const reviewResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST', headers: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'deepseek-v4-flash', messages: florenceEditorialMessages(state, action, parsed), thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 4500, temperature: 0.35, stream: false }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!reviewResponse.ok) throw new Error(`Narrative review failed: ${reviewResponse.status}`);
          const reviewed = await reviewResponse.json() as WorkersAiChatResponse;
          const reviewedParsed = parseAiJson(extractAiText(reviewed));
          const reviewedOutcome = validateFlorenceAi(reviewedParsed, state, action, 'deepseek');
          const reviewUsage = usageFromResponse(reviewed.usage);
          if (reviewUsage) usage = { inputTokens: (usage?.inputTokens ?? 0) + reviewUsage.inputTokens, outputTokens: (usage?.outputTokens ?? 0) + reviewUsage.outputTokens, totalTokens: (usage?.totalTokens ?? 0) + reviewUsage.totalTokens };
          if (reviewedOutcome) finalOutcome = reviewedOutcome;
          else console.warn('Narrative review returned an invalid contract; using validated draft');
        } catch (reviewError) {
          console.warn('Narrative review skipped; using validated draft', reviewError instanceof Error ? reviewError.message : reviewError);
        }
        return { ...finalOutcome, model: 'deepseek-v4-flash', usage };
      }
      const outcome = validateAiOutcome(parsed, fallback!, "deepseek");
      if (outcome?.source === "ai") return { ...outcome, model: 'deepseek-v4-flash', usage };
      console.warn("DeepSeek returned an invalid game outcome");
    } catch (error) {
      console.warn("DeepSeek fallback", error instanceof Error ? error.message : error);
      if (florence) {
        if (error instanceof Error && /^ai_[a-z_]+$/.test(error.message)) throw error;
        throw new Error(error instanceof Error && error.name === 'TimeoutError' ? 'ai_primary_timeout' : error instanceof Error && error.message.startsWith('Narrative review failed') ? 'ai_review_http' : 'ai_primary_unavailable');
      }
    }
  }

  try {
    for (let attempt = 0; attempt < (florence ? 2 : 1); attempt++) {
    const result = (await env.AI.run("@cf/zai-org/glm-4.7-flash", {
      messages,
      // Keep the preview response comfortably inside the Worker request window.
      // Florence asks for a complete scene card, not a long essay; 3k tokens is
      // enough for the JSON contract and avoids timing out GLM on the long brief.
      max_completion_tokens: florence ? 3000 : 1600,
      reasoning_effort: "low",
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_object" },
      temperature: 0.72,
    })) as WorkersAiChatResponse;
    const parsed = parseAiJson(extractAiText(result));
    const outcome = florence ? validateFlorenceAi(parsed, state, action, 'cloudflare') : validateAiOutcome(parsed, fallback!, "cloudflare");
    if (!outcome) {
      if (attempt === 0 && florence) continue;
      throw new Error(parsed ? 'ai_invalid_contract' : 'ai_invalid_json');
    }
    return { ...outcome, model: '@cf/zai-org/glm-4.7-flash', usage: usageFromResponse(result.usage) };
    }
    throw new Error('ai_invalid_contract');
  } catch (error) {
    console.warn("Workers AI fallback", error instanceof Error ? error.message : error);
    if (florence) throw new Error(error instanceof Error && ['ai_invalid_contract', 'ai_invalid_json'].includes(error.message) ? error.message : 'ai_unavailable');
    return fallback!;
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

  private recordProductEvent(event: ProductAnalyticsEvent) {
    const analytics = this.env.PRODUCT_ANALYTICS.get(this.env.PRODUCT_ANALYTICS.idFromName("global"));
    this.ctx.waitUntil(
      analytics.fetch("https://analytics/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      }).catch((error) => console.warn("Product analytics aggregation skipped", error instanceof Error ? error.message : error)),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") {
      const body = (await request.json()) as { id?: string; scenarioId?: string; mode?: GameMode; visitorId?: unknown };
      if (!body.id) return errorResponse("Не передан идентификатор сессии");
      const existing = await this.getStored();
      if (existing) return json(existing.state);
      const mode = body.mode && body.mode in gameModes ? body.mode : "campaign";
      const state = createInitialState(body.id, body.scenarioId ?? "russia-1917", mode);
      const analytics = createSessionAnalytics(normalizeVisitorId(body.visitorId), state.createdAt);
      await this.ctx.storage.put("game", { state, processedKeys: {}, analytics } satisfies StoredGame);
      logProductEvent("session_started", {
        sessionId: state.id,
        visitorId: analytics.anonymousVisitorId,
        scenarioId: state.scenarioId,
        mode: state.mode,
      });
      this.recordProductEvent({
        type: "session_started",
        occurredAt: state.createdAt,
        visitorId: analytics.anonymousVisitorId,
        sessionId: state.id,
        scenarioId: state.scenarioId,
        mode: state.mode,
      });
      return json(state, 201);
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const stored = await this.getStored();
      if (!stored) return errorResponse("Сессия не найдена", 404);
      const occurredAt = new Date().toISOString();
      const visitorId = normalizeVisitorId(request.headers.get("x-lh-visitor-id"));
      const previousDayCount = stored.analytics?.activeDays.length ?? 0;
      const baseAnalytics = stored.analytics ?? createSessionAnalytics(visitorId, stored.state.createdAt);
      const analytics = registerSessionOpen(baseAnalytics, visitorId, occurredAt);
      await this.ctx.storage.put("game", { ...stored, analytics } satisfies StoredGame);
      if (!stored.analytics || analytics.activeDays.length > previousDayCount) {
        logProductEvent("session_opened", {
          sessionId: stored.state.id,
          visitorId: analytics.anonymousVisitorId,
          scenarioId: stored.state.scenarioId,
          mode: stored.state.mode,
          activeDayCount: analytics.activeDays.length,
          returnedOnLaterDay: analytics.activeDays.length > 1,
        });
        this.recordProductEvent({
          type: "session_opened",
          occurredAt,
          visitorId: analytics.anonymousVisitorId,
          sessionId: stored.state.id,
          scenarioId: stored.state.scenarioId,
          mode: stored.state.mode,
        });
      }
      return json(stored.state);
    }

    if (request.method === "GET" && url.pathname === "/metrics") {
      const stored = await this.getStored();
      if (!stored) return errorResponse("Сессия не найдена", 404);
      const analytics = stored.analytics ?? createSessionAnalytics(null, stored.state.createdAt);
      return json(publicAnalytics(analytics));
    }

    if (request.method === "POST" && url.pathname === "/turn") {
      const body = (await request.json()) as { action?: unknown; idempotencyKey?: unknown; source?: unknown; optionId?: unknown; visitorId?: unknown };
      const action = cleanAction(body.action);
      const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 80) : "";
      if (action.length < 4) return errorResponse("Опишите решение хотя бы несколькими словами");
      const stored = await this.getStored();
      if (!stored) return errorResponse("Сессия не найдена", 404);
      if (key && stored.processedKeys[key]) return json(stored.processedKeys[key]);
      if (stored.state.status !== "active") return errorResponse("Эта ветка истории уже завершена", 409);

      const startedAt = Date.now();
      const visitorId = normalizeVisitorId(body.visitorId);
      const actionSource = resolveActionSource(stored.state, action, body.source, cleanOptionId(body.optionId));
      let outcome: TurnOutcome;
      try { outcome = await generateOutcome(this.env, stored.state, action); }
      catch (cause) { return json({ error: 'Ведущий пока не смог ответить. Текст остался в поле ввода, ход не потрачен. Попробуйте ещё раз.', code: cause instanceof Error && /^ai_[a-z_]+$/.test(cause.message) ? cause.message : 'ai_unavailable', ...(cause instanceof Error && cause.message === 'ai_review_invalid_contract' ? { details: cause.cause } : {}) }, 503); }
      const state = applyOutcome(stored.state, action, outcome);
      const processedKeys = key ? { ...stored.processedKeys, [key]: state } : stored.processedKeys;
      const trimmedKeys = Object.fromEntries(Object.entries(processedKeys).slice(-10));
      const baseAnalytics = stored.analytics ?? createSessionAnalytics(visitorId, stored.state.createdAt);
      const openedAnalytics = registerSessionOpen(baseAnalytics, visitorId, state.updatedAt);
      if (state.scenarioId === 'florence-workshop' && outcome.advanceScene === false) {
        await this.ctx.storage.put('game', { state, processedKeys: trimmedKeys, analytics: openedAnalytics } satisfies StoredGame);
        return json(state);
      }
      const provider = outcome.provider ?? "simulation";
      const resolutionMs = Date.now() - startedAt;
      const analytics = recordSuccessfulTurn(openedAnalytics, {
        source: actionSource,
        provider,
        usage: outcome.usage,
        resolutionMs,
        occurredAt: state.updatedAt,
      });
      await this.ctx.storage.put("game", { state, processedKeys: trimmedKeys, analytics } satisfies StoredGame);
      logProductEvent("meaningful_action_completed", {
        sessionId: state.id,
        visitorId: analytics.anonymousVisitorId,
        scenarioId: state.scenarioId,
        mode: state.mode,
        turn: state.turn - 1,
        source: actionSource,
        provider,
        resolutionMs,
        inputTokens: outcome.usage?.inputTokens ?? 0,
        outputTokens: outcome.usage?.outputTokens ?? 0,
        totalTokens: outcome.usage?.totalTokens ?? 0,
        resolutionStatus: outcome.resolution?.status ?? null,
        meaningfulActions: analytics.meaningfulActions,
        statusAfterTurn: state.status,
      });
      this.recordProductEvent({
        type: "meaningful_action_completed",
        occurredAt: state.updatedAt,
        visitorId: analytics.anonymousVisitorId,
        sessionId: state.id,
        scenarioId: state.scenarioId,
        mode: state.mode,
        source: actionSource,
        provider,
        usage: outcome.usage,
        resolutionMs,
        resolutionStatus: outcome.resolution?.status,
        statusAfterTurn: state.status,
      });
      return json(state);
    }

    return errorResponse("Маршрут не найден", 404);
  }
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({
      ok: true,
      service: "living-history-sandbox",
      primaryAi: env.DEEPSEEK_API_KEY ? "deepseek-v4-flash" : "@cf/zai-org/glm-4.7-flash",
      fallbackAi: env.DEEPSEEK_API_KEY ? "@cf/zai-org/glm-4.7-flash" : "simulation",
    });
  }
  if (request.method === "GET" && url.pathname === "/api/scenarios") return json(scenarioSummaries);
  if (request.method === "GET" && url.pathname === "/api/analytics/overview") {
    const expectedToken = env.ANALYTICS_DASHBOARD_TOKEN;
    if (!expectedToken) {
      return Response.json({ error: "Дашборд ещё не настроен: добавьте секрет ANALYTICS_DASHBOARD_TOKEN." }, { status: 503 });
    }
    if (request.headers.get("x-lh-analytics-token") !== expectedToken) {
      return Response.json({ error: "Нужен действующий токен доступа к дашборду." }, { status: 401 });
    }
    const analytics = env.PRODUCT_ANALYTICS.get(env.PRODUCT_ANALYTICS.idFromName("global"));
    return analytics.fetch("https://analytics/overview");
  }

  if (request.method === "POST" && url.pathname === "/api/games") {
    const body = (await request.json().catch(() => ({}))) as { scenarioId?: string; mode?: GameMode; visitorId?: unknown };
    const id = crypto.randomUUID();
    const stub = env.HISTORY_SESSIONS.get(env.HISTORY_SESSIONS.idFromName(id));
    return stub.fetch("https://session/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, scenarioId: body.scenarioId ?? "russia-1917", mode: body.mode ?? "campaign", visitorId: body.visitorId }),
    });
  }

  const match = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)(?:\/(turn|metrics))?$/i);
  if (match) {
    const [, id, action] = match;
    const stub = env.HISTORY_SESSIONS.get(env.HISTORY_SESSIONS.idFromName(id));
    if (request.method === "GET" && !action) {
      const visitorId = request.headers.get("x-lh-visitor-id");
      return stub.fetch("https://session/state", { headers: visitorId ? { "x-lh-visitor-id": visitorId } : undefined });
    }
    if (request.method === "GET" && action === "metrics") return stub.fetch("https://session/metrics");
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

export { ProductAnalytics } from "./product-analytics";
