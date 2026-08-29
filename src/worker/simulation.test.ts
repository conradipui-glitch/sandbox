import { describe, expect, it } from "vitest";
import { createInitialState } from "./scenarios";
import { applyOutcome, simulateTurn } from "./simulation";

describe("history simulation", () => {
  it("creates a playable state", () => {
    const state = createInitialState("session-1", "russia-1917");
    expect(state.status).toBe("active");
    expect(state.options).toHaveLength(3);
    expect(state.metrics).toHaveLength(5);
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
  });
});
