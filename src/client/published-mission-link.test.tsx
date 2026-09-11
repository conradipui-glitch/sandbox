import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ApiError } from "./api";
import {
  PUBLISHED_MISSION_PAGE_PATH,
  publishedLinkStateIsAuthored,
  publishedMissionIdentifier,
  siteRoute
} from "./published-mission-link";
import { PublishedMissionLinkView, publishedLinkFailure } from "./PublishedMissionLinkPage";
import type { GameState } from "../shared/types";

describe("the publication link is a route of the site, not a chip of the landing", () => {
  it("recognises the link the Studio publishes", () => {
    expect(siteRoute("/p/release-mflorence1/")).toEqual({ kind: "published-mission", identifier: "release-mflorence1" });
    expect(siteRoute("/p/release-mflorence1")).toEqual({ kind: "published-mission", identifier: "release-mflorence1" });
    expect(siteRoute("/p/mission%3Aflorence%3Aflorence-workshop/")).toEqual({
      kind: "published-mission",
      identifier: "mission:florence:florence-workshop"
    });
  });

  it("keeps the landing, the analytics page and deeper paths on their own routes", () => {
    expect(siteRoute("/")).toEqual({ kind: "app" });
    expect(siteRoute("/analytics")).toEqual({ kind: "analytics" });
    // `/p/<id>/<more>` is not a publication link: nothing is guessed for it.
    expect(siteRoute("/p/release-1/extra")).toEqual({ kind: "app" });
    expect(PUBLISHED_MISSION_PAGE_PATH.test("/p/release-1/extra")).toBe(false);
  });

  it("treats a malformed identifier as a missing link, never as a wildcard", () => {
    expect(publishedMissionIdentifier("/p/%ZZ/")).toBeNull();
    expect(publishedMissionIdentifier("/p/" + "a".repeat(201) + "/")).toBeNull();
    expect(siteRoute("/p/%ZZ/")).toEqual({ kind: "published-mission", identifier: null });
  });

  it("refuses a legacy state behind a publication link (no legacy fallback)", () => {
    const legacy: GameState = {
      id: "legacy-session", scenarioId: "florence-workshop", mode: "chronicle", scenarioTitle: "Мастерская", role: "Художник",
      date: "1512", turn: 1, status: "active", briefing: "", objective: "", metrics: [], factions: [], options: [], timeline: [],
      lastOutcome: null, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString()
    };
    expect(publishedLinkStateIsAuthored(legacy)).toBe(false);
    expect(publishedLinkStateIsAuthored(null)).toBe(false);
  });

  it("says plainly when a link is a 404 and when the publications are down", () => {
    expect(publishedLinkFailure(new ApiError("Published mission not found", 404, "PUBLIC_MISSION_NOT_FOUND")))
      .toEqual({ kind: "not-found", message: "Такой опубликованной миссии нет: возможно, выпуск отозвали или ссылка скопирована не полностью." });
    expect(publishedLinkFailure(new ApiError("Published mission catalog unavailable", 503, "PUBLIC_CATALOG_UNAVAILABLE")))
      .toEqual({ kind: "unavailable", message: "Published mission catalog unavailable" });
    // A transport failure has no status at all: it is still an explicit,
    // retryable unavailable state, not an empty screen.
    expect(publishedLinkFailure(new Error("Failed to fetch")).kind).toBe("unavailable");
  });
});

describe("the publication link page states are honest", () => {
  it("shows a loading state while the published card is resolved", () => {
    const html = renderToString(<PublishedMissionLinkView phase={{ kind: "loading" }} busy={false} onRetry={() => {}} />);
    expect(html).toContain("Открываем миссию");
    expect(html).toContain("каталог публикаций");
  });

  it("shows a 404 screen with a way back for an unknown link", () => {
    const html = renderToString(
      <PublishedMissionLinkView phase={{ kind: "not-found", message: "Эта ссылка не ведёт к опубликованной миссии." }} busy={false} onRetry={() => {}} />
    );
    expect(html).toContain("404");
    expect(html).toContain("не найдена");
    expect(html).toContain("href=\"/\"");
  });

  it("shows a retryable unavailable screen when the catalog fails", () => {
    const html = renderToString(
      <PublishedMissionLinkView phase={{ kind: "unavailable", message: "Публикации сейчас недоступны." }} busy={false} onRetry={() => {}} />
    );
    expect(html).toContain("Публикации недоступны");
    expect(html).toContain("Повторить");
    expect(html).toContain("href=\"/\"");
  });
});
