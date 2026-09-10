import { describe, expect, it } from "vitest";
import { fetchPublishedCatalog, toScenarioSummaries } from "./public-catalog";

const response = {
  missions: [{
    publicMissionId: "mission:p:q",
    slug: "missing-cargo",
    releaseId: "release-1",
    contentHash: "a".repeat(64),
    channel: "production",
    listing: {
      title: "Пропавший груз",
      summary: "Ночная станция.",
      period: "1917",
      place: "Петроград",
      playerRole: "Распорядитель",
      estimatedMinutes: 20,
      supportedModes: ["choice"]
    }
  }]
};

describe("M06 public catalog", () => {
  it("reads and projects only published mission fields", async () => {
    const catalog = await fetchPublishedCatalog("https://engine.example/public/v1/missions", async () => new Response(JSON.stringify(response), { status: 200 }));
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    expect(toScenarioSummaries(catalog.missions)).toEqual([{
      id: "mission:p:q",
      title: "Пропавший груз",
      period: "1917 · Петроград",
      role: "Распорядитель",
      hook: "Ночная станция.",
      difficulty: "Доступно",
      accent: "#c94c36",
      available: true
    }]);
  });

  it("fails explicitly on upstream errors instead of returning a stale hardcoded list", async () => {
    const catalog = await fetchPublishedCatalog("https://engine.example/public/v1/missions", async () => new Response("down", { status: 503 }));
    expect(catalog).toEqual({ ok: false, status: 503, code: "PUBLIC_CATALOG_UNAVAILABLE" });
  });
});
