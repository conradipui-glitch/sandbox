import { describe, expect, it } from "vitest";
import { createSessionAnalytics, normalizeVisitorId, publicAnalytics, recordSuccessfulTurn, registerSessionOpen } from "./analytics";

describe("session analytics", () => {
  const visitorId = "9b1de790-47c1-4c7b-89f5-0b2a37dbb21a";

  it("accepts anonymous UUIDs and rejects arbitrary identifiers", () => {
    expect(normalizeVisitorId(visitorId)).toBe(visitorId);
    expect(normalizeVisitorId("player@example.com")).toBeNull();
    expect(normalizeVisitorId("short-id")).toBeNull();
    expect(normalizeVisitorId("9b1de790-47c1-4c7b-zzzz-0b2a37dbb21a")).toBeNull();
  });

  it("registers a return on a later UTC day only once", () => {
    const started = createSessionAnalytics(visitorId, "2026-09-03T20:00:00.000Z");
    const returned = registerSessionOpen(started, visitorId, "2026-09-04T07:00:00.000Z");
    const refreshed = registerSessionOpen(returned, visitorId, "2026-09-04T08:00:00.000Z");

    expect(refreshed.activeDays).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("counts only successful turns and separates prepared from freeform", () => {
    const started = createSessionAnalytics(visitorId, "2026-09-03T20:00:00.000Z");
    const prepared = recordSuccessfulTurn(started, {
      source: "prepared",
      provider: "cloudflare",
      usage: { inputTokens: 800, outputTokens: 300, totalTokens: 1100 },
      resolutionMs: 420,
      occurredAt: "2026-09-03T20:01:00.000Z",
    });
    const freeform = recordSuccessfulTurn(prepared, {
      source: "freeform",
      provider: "simulation",
      resolutionMs: 20,
      occurredAt: "2026-09-03T20:02:00.000Z",
    });

    expect(freeform).toMatchObject({
      meaningfulActions: 2,
      preparedActions: 1,
      freeformActions: 1,
      aiTurns: 1,
      simulationTurns: 1,
      totalTokens: 1100,
      averageResolutionMs: 220,
      maxResolutionMs: 420,
    });
  });

  it("does not expose the anonymous visitor identifier", () => {
    const summary = publicAnalytics(createSessionAnalytics(visitorId, "2026-09-03T20:00:00.000Z"));
    expect(summary).not.toHaveProperty("anonymousVisitorId");
    expect(summary).not.toHaveProperty("resolutionMsTotal");
  });
});
