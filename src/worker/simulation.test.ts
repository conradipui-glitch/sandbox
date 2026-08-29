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
  });

  it("supports three modes and distinct voiced characters", () => {
    expect(Object.keys(gameModes)).toEqual(["chronicle", "campaign", "sandbox"]);
    expect(new Set(worldCharacters.map((character) => character.id)).size).toBe(worldCharacters.length);
    expect(worldCharacters.find((character) => character.id === "lidia-vetrova")?.voice).toContain("вопрос");
  });

  it("keeps the open sandbox active without a turn limit", () => {
    const state = createInitialState("sandbox-1", "russia-1917", "sandbox");
    state.turn = 80;
    const next = applyOutcome(state, "Продолжить федеративные переговоры", simulateTurn(state, "Продолжить федеративные переговоры"));
    expect(next.status).toBe("active");
    expect(worldContextForTurn(state, "Отправить автомобиль с телеграммой").cast.some((character) => character?.id === "lidia-vetrova")).toBe(true);
  });

  it("reads both current chat-completions and legacy Workers AI responses", () => {
    expect(extractAiText({ response: "legacy" })).toBe("legacy");
    expect(extractAiText({ choices: [{ message: { content: "current" } }] })).toBe("current");
    expect(extractAiText({ choices: [{ message: { content: [{ type: "text", text: "structured" }] } }] })).toBe("structured");
  });
});
