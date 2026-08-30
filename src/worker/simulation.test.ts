import { describe, expect, it } from "vitest";
import { createInitialState } from "./scenarios";
import { applyOutcome, simulateTurn } from "./simulation";
import { gameModes, worldCharacters, worldContextForTurn } from "./world";
import { extractAiText } from "./index";

describe("history simulation", () => {
  it("creates a playable state", () => {
    const state = createInitialState("session-1", "russia-1917");
    expect(state.status).toBe("active");
    expect(state.options).toHaveLength(3);
    expect(state.metrics).toHaveLength(5);
    expect(state.mode).toBe("campaign");
  });

  it("is deterministic for the same state and action", () => {
    const state = createInitialState("session-1", "russia-1917");
    const action = "Начать переговоры с Советом и немедленно обсудить землю";
    expect(simulateTurn(state, action)).toEqual(simulateTurn(state, action));
  });

  it("advances the timeline and keeps metrics bounded", () => {
    const state = createInitialState("session-1", "russia-1917");
    const action = "Передать землю крестьянам";
    const outcome = simulateTurn(state, action);
    const next = applyOutcome(state, action, outcome);
    expect(next.turn).toBe(2);
    expect(next.timeline.length).toBeGreaterThan(state.timeline.length);
    expect(next.metrics.every((metric) => metric.value >= 0 && metric.value <= 100)).toBe(true);
    expect(outcome.scene.activeCharacterIds.length).toBeLessThanOrEqual(2);
    expect(next.briefing).toBe(outcome.nextBriefing);
    expect(next.briefing).not.toContain(outcome.headline);
  });

  it("supports three modes and distinct voiced characters", () => {
    expect(Object.keys(gameModes)).toEqual(["chronicle", "campaign", "sandbox"]);
    expect(new Set(worldCharacters.map((character) => character.id)).size).toBe(worldCharacters.length);
    expect(worldCharacters.find((character) => character.id === "lidia-vetrova")?.voice).toContain("вопрос");
  });

  it("opens the first short chronicle with a concrete human tradeoff", () => {
    const state = createInitialState("train-1", "last-train-1917", "campaign");
    expect(state.mode).toBe("chronicle");
    expect(state.scenarioTitle).toContain("Последний поезд");
    expect(state.options.map((option) => option.id)).toEqual(["train-wounded", "train-coal", "train-delegation"]);
    const outcome = simulateTurn(state, "Посадить раненых первыми");
    expect(outcome.scene.locationId).toBe("nikolaevsky-platform");
    expect(outcome.scene.activeCharacterIds).toContain("rail-belyaev");
    expect(outcome.nextBriefing).not.toContain(outcome.headline);
    const next = applyOutcome(state, "Посадить раненых первыми", outcome);
    expect(next.turn).toBe(2);
    expect(next.status).toBe("active");
  });

  it("keeps the scene contract grounded in the world state", () => {
    const train = createInitialState("train-scene-1", "last-train-1917", "chronicle");
    const trainWorld = worldContextForTurn(train, "Показать список раненых и вызвать телеграфиста");
    expect(trainWorld.mode.id).toBe("chronicle");
    expect(trainWorld.entityPool.some((entity) => entity.id === "freight-train")).toBe(true);
    expect(trainWorld.cast.map((character) => character?.id)).toContain("lidia-vetrova");

    const campaign = createInitialState("campaign-scene-1", "russia-1917", "campaign");
    const campaignWorld = worldContextForTurn(campaign, "Обсудить хлеб и рабочую смену на фабрике");
    expect(campaignWorld.cast.map((character) => character?.id)).toContain("worker-novikova");
    expect(campaignWorld.entityPool.length).toBeGreaterThan(0);
  });

  it("keeps the open sandbox active without a turn limit", () => {
    const state = createInitialState("sandbox-1", "russia-1917", "sandbox");
    state.turn = 80;
    const next = applyOutcome(state, "Продолжить федеративные переговоры", simulateTurn(state, "Продолжить федеративные переговоры"));
    expect(next.status).toBe("active");
    expect(worldContextForTurn(state, "Отправить автомобиль с телеграммой").cast.some((character) => character?.id === "lidia-vetrova")).toBe(true);
    expect(worldContextForTurn(state, "Поручить Лидии Ветровой доставить график").cast.some((character) => character?.id === "lidia-vetrova")).toBe(true);
  });

  it("reads both current chat-completions and legacy Workers AI responses", () => {
    expect(extractAiText({ response: "legacy" })).toBe("legacy");
    expect(extractAiText({ choices: [{ message: { content: "current" } }] })).toBe("current");
    expect(extractAiText({ choices: [{ message: { content: [{ type: "text", text: "structured" }] } }] })).toBe("structured");
  });
});
