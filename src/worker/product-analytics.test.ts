import { describe, expect, it } from "vitest";
import { overviewFromState, recordProductEvent, type ProductAnalyticsEvent } from "./product-analytics";

const visitorId = "9b1de790-47c1-4c7b-89f5-0b2a37dbb21a";

function event(overrides: Partial<ProductAnalyticsEvent> = {}): ProductAnalyticsEvent {
  return {
    type: "session_started",
    occurredAt: "2026-09-04T08:00:00.000Z",
    visitorId,
    sessionId: "session-a",
    scenarioId: "last-train-1917",
    mode: "chronicle",
    ...overrides,
  };
}

describe("product analytics aggregation", () => {
  it("counts a visitor once per day while preserving session and action volume", () => {
    const started = recordProductEvent(undefined, event(), undefined);
    const opened = recordProductEvent(started.state, event({ type: "session_opened", occurredAt: "2026-09-04T12:00:00.000Z" }), started.visitor);
    const action = recordProductEvent(opened.state, event({
      type: "meaningful_action_completed",
      source: "freeform",
      provider: "cloudflare",
      usage: { inputTokens: 900, outputTokens: 300, totalTokens: 1200 },
      resolutionMs: 420,
    }), opened.visitor);
    const overview = overviewFromState(action.state, "2026-09-04T13:00:00.000Z");

    expect(overview.days[0]).toMatchObject({
      uniqueVisitors: 1,
      activatedVisitors: 1,
      newVisitors: 1,
      startedSessions: 1,
      meaningfulActions: 1,
      freeformActions: 1,
      aiTurns: 1,
      totalTokens: 1200,
      resolutionMsTotal: 420,
    });
  });

  it("attributes a next-day return to the original cohort only once", () => {
    const started = recordProductEvent(undefined, event(), undefined);
    const returned = recordProductEvent(started.state, event({ type: "session_opened", occurredAt: "2026-09-05T08:00:00.000Z" }), started.visitor);
    const repeated = recordProductEvent(returned.state, event({ type: "meaningful_action_completed", occurredAt: "2026-09-05T09:00:00.000Z", source: "prepared", provider: "simulation" }), returned.visitor);
    const overview = overviewFromState(repeated.state, "2026-09-05T10:00:00.000Z");

    expect(overview.d1EligibleVisitors).toBe(1);
    expect(overview.d1ReturnedVisitors).toBe(1);
    expect(overview.days[0].d1ReturnedVisitors).toBe(1);
    expect(overview.days[1].uniqueVisitors).toBe(1);
  });

  it("does not include visitor identifiers in the overview", () => {
    const recorded = recordProductEvent(undefined, event(), undefined);
    expect(JSON.stringify(overviewFromState(recorded.state, "2026-09-04T10:00:00.000Z"))).not.toContain(visitorId);
  });

  it("makes yesterday's cohort eligible even when today has no new event", () => {
    const recorded = recordProductEvent(undefined, event(), undefined);
    const overview = overviewFromState(recorded.state, "2026-09-05T10:00:00.000Z");

    expect(overview.d1EligibleVisitors).toBe(1);
    expect(overview.d1ReturnedVisitors).toBe(0);
  });
});
