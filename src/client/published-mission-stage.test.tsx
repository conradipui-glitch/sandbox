import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  PublishedMissionStage,
  isPublishedMissionGame,
  missionChoiceSubmission
} from "./PublishedMissionStage";
import type { GameState } from "../shared/types";
import type { PreviewFrameView } from "../shared/mission-presentation/view-model";

function frame(overrides: Partial<PreviewFrameView> = {}): PreviewFrameView {
  return {
    kind: "scene",
    title: "Бункер",
    text: "Гудит реактор.",
    scene: {
      backgroundUrl: "/api/missions/mission%3Achernobyl%3Ashift/sessions/session-1/assets/bunker-bg",
      backgroundFit: "cover",
      layers: [{ id: "reactor", kind: "item", name: "Реактор", visible: true, assetUrl: "/api/missions/mission%3Achernobyl%3Ashift/sessions/session-1/assets/reactor", assetAlt: "Реактор", x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false, opacity: 1, z: 1, animation: "none" }],
      musicTitle: null
    },
    choices: [{ choiceId: "seal", label: "Герметизировать" }],
    turn: 0,
    contentRevision: 3,
    contentHash: "a".repeat(64),
    rendererVersion: "1.0.0",
    ...overrides
  };
}

function state(presentation?: GameState["presentation"]): GameState {
  return {
    id: "session-1", scenarioId: "mission:chernobyl:shift", mode: "chronicle", scenarioTitle: "Смена", role: "Инженер",
    date: "1986", turn: 0, status: "active", briefing: "Бункер\n\nГудит реактор.", objective: "Не дать контуру разойтись.",
    metrics: [], factions: [], options: [], timeline: [], lastOutcome: null,
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    ...(presentation ? { presentation } : {})
  };
}

describe("R03 site renders the authored mission", () => {
  it("detects a published mission through the contract discriminator", () => {
    expect(isPublishedMissionGame(state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" }))).toBe(true);
    expect(isPublishedMissionGame(state())).toBe(false);
  });

  it("renders the authored scene, background, layers and choices", () => {
    const html = renderToString(
      <PublishedMissionStage state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" })} onTurn={() => {}} onExit={() => {}} busy={false} />
    );
    expect(html).toContain("Бункер");
    expect(html).toContain("Гудит реактор.");
    expect(html).toContain("bunker-bg");
    expect(html).toContain("Реактор");
    expect(html).toContain("Герметизировать");
  });

  it("renders an authored ending without choices", () => {
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame({ kind: "ending", title: "Тихий контур", text: "Никто не пришёл.", choices: [] }), reaction: "applied" })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).toContain("Тихий контур");
    expect(html).not.toContain("Герметизировать");
  });

  it("maps a chosen option to a mission turn submission", () => {
    expect(missionChoiceSubmission("seal")).toEqual({ action: "seal", source: "prepared", optionId: "seal" });
  });

  it("says plainly when the game continues on its pinned revision (E16)", () => {
    const pinned = renderToString(
      <PublishedMissionStage
        state={{ ...state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" }), contentSource: "pinned" }}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(pinned).toContain("закреплённой версии");
    // The authored content is still the only source of truth.
    expect(pinned).toContain("Гудит реактор.");
    expect(pinned).toContain("bunker-bg");

    const live = renderToString(
      <PublishedMissionStage
        state={{ ...state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" }), contentSource: "live" }}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(live).not.toContain("закреплённой версии");
  });
});
