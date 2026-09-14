import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  PublishedMissionStage,
  isPublishedMissionGame,
  missionChoiceSubmission,
  missionTurnSubmission
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
  it("renders authoritative runtime panels and the confirmed decision history", () => {
    const richState = state({
      kind: "published-mission",
      publicMissionId: "mission:chernobyl:shift",
      frame: frame(),
      reaction: "applied",
      runtime: {
        resources: [{ id: "coal", title: "Запас угля", description: "Топливо.", unit: "тонна", value: 3, min: 0, max: 10, delta: -2 }],
        participants: [{ id: "porter", title: "Носильщик", description: "Ждёт приказа.", status: "waiting", locationId: "yard", locationTitle: "Двор" }],
        history: [{ id: "turn-1", turn: 1, choiceId: "seal", choiceLabel: "Герметизировать", fromTitle: "Бункер", toTitle: "Контур закрыт", deltas: [{ resourceId: "coal", delta: -2 }], terminal: false }],
        lastResolution: { id: "turn-1", turn: 1, choiceId: "seal", choiceLabel: "Герметизировать", fromTitle: "Бункер", toTitle: "Контур закрыт", deltas: [{ resourceId: "coal", delta: -2 }], terminal: false }
      }
    });
    const html = renderToString(<PublishedMissionStage state={richState} onTurn={() => {}} onExit={() => {}} busy={false} />);
    expect(html).toContain("Состояние мира");
    expect(html).toContain("Запас угля");
    expect(html).toContain("3 / 10");
    expect(html).toContain("−2 после решения");
    expect(html).toContain("Участники");
    expect(html).toContain("Носильщик");
    expect(html).toContain("Ждёт приказа.");
    expect(html).toContain("События истории");
    expect(html).toContain("Герметизировать");
    expect(html).toContain("Контур закрыт");
    expect(html).toContain("После вашего решения");
  });

  it("shows a real processing overlay while a published turn is pending", () => {
    const html = renderToString(
      <PublishedMissionStage state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" })} onTurn={() => {}} onExit={() => {}} busy />
    );
    expect(html).toContain("Мир отвечает на ваше решение");
    expect(html).toContain("История применяет последствия");
  });

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

  it("offers the authored choices together with a free-text turn, like the original player", () => {
    const html = renderToString(
      <PublishedMissionStage state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start" })} onTurn={() => {}} onExit={() => {}} busy={false} />
    );
    expect(html).toContain("Герметизировать");
    expect(html).toContain("mp-player-action");
    expect(html).toContain("можно написать что угодно своими словами");
    expect(html).toContain("Разыграть ход");
  });

  it("sends a picked choice as prepared and typed words as freeform", () => {
    expect(missionTurnSubmission("Герметизировать", "seal")).toEqual({ action: "Герметизировать", source: "prepared", optionId: "seal" });
    expect(missionTurnSubmission("Своя идея", null)).toEqual({ action: "Своя идея", source: "freeform" });
    // Whitespace is not a turn: the server rejects an empty freeform action.
    expect(missionTurnSubmission("   ", null)).toEqual({ action: "", source: "freeform" });
    expect(missionTurnSubmission("Герметизировать", null)).toEqual({ action: "Герметизировать", source: "freeform" });
  });

  it("keeps the free-text turn out of the way while the ending is up", () => {
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame({ kind: "ending", title: "Тихий контур", text: "Никто не пришёл.", choices: [] }), reaction: "applied" })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).not.toContain("Разыграть ход");
  });

  it("renders the authored composition: preset, inherited background and music", () => {
    const composed = frame({
      scene: {
        ...frame().scene,
        backgroundSource: "inherited",
        animationPreset: "rise",
        layers: [{ ...frame().scene.layers[0], animation: "rise" }],
        musicTitle: "bunker-theme",
        musicUrl: "/api/missions/mission%3Achernobyl%3Ashift/sessions/session-1/assets/bunker-theme"
      }
    });
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: composed, reaction: "start" })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).toContain('data-animation-preset="rise"');
    expect(html).toContain("mp-anim-rise");
    expect(html).toContain('data-background-source="inherited"');
    expect(html).toContain("bunker-theme");
    expect(html).toContain("Музыка сцены");
    expect(html).toContain('data-music-state="playing"');
    expect(html).toContain("Выключить звук");
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

function introFrame(index: number, count: number, title: string): PreviewFrameView {
  return {
    kind: "intro",
    title,
    text: `Страница ${index + 1} вступления.`,
    scene: { backgroundUrl: null, backgroundFit: "cover", layers: [], musicTitle: null },
    choices: [],
    introPage: { index, count, hasNext: index < count - 1 },
    turn: 0,
    contentRevision: 3,
    contentHash: "a".repeat(64),
    rendererVersion: "1.0.0"
  };
}

describe("FIN-05 site slice: the published player plays dialogue and pages intros", () => {
  it("shows the authored dialogue of the current scene", () => {
    const withDialogue = frame({
      dialogue: [
        { lineId: "d1", speakerId: null, text: "Первая реплика" },
        { lineId: "d2", speakerId: "keeper", text: "Вторая реплика" }
      ]
    });
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: withDialogue, reaction: "start" })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).toContain("Первая реплика");
    expect(html).not.toContain("Вторая реплика");
    expect(html).toContain('data-dialogue-line="d1"');
  });

  it("pages the authored intros before the mission starts, without scene choices", () => {
    const intros = [
      { ...introFrame(0, 2, "Пролог"), introKicker: "Флоренция · 1512", introNote: "Первый ответ за вами" } as PreviewFrameView,
      introFrame(1, 2, "Второе вступление")
    ];
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start", intros })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).toContain("Пролог");
    expect(html).toContain("Флоренция · 1512");
    expect(html).toContain("Первый ответ за вами");
    expect(html).toContain("Далее");
    expect(html).toContain("1 / 2");
    expect(html).not.toContain("Второе вступление");
    // Paging an intro is local: the scene's choices are not offered yet.
    expect(html).not.toContain("Герметизировать");
  });

  it("shows no started mission while the intros are paged, so no turn can be spent", () => {
    const intros = [introFrame(0, 1, "Пролог")];
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame(), reaction: "start", intros })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    // The intro screen is up...
    expect(html).toContain("Пролог");
    expect(html).toContain('data-intro-count="1"');
    // ...and nothing of the started mission is on screen: no turn counter, no
    // choice panel, no exit back to the listing. Paging is local to the player.
    expect(html).not.toContain("· Ход");
    expect(html).not.toContain("mp-choices");
    expect(html).not.toContain("Герметизировать");
    expect(html).not.toContain("Гудит реактор.");
    // The intro keeps the explicit route back to the mission listing, matching
    // the original player, but exposes no gameplay controls or scene content.
    expect(html).toContain("К списку миссий");
    expect(html).toContain("Вступление");
  });

  it("does not re-show the intros once the mission has moved on", () => {
    const intros = [introFrame(0, 1, "Пролог")];
    const html = renderToString(
      <PublishedMissionStage
        state={state({ kind: "published-mission", publicMissionId: "mission:chernobyl:shift", frame: frame({ turn: 2 }), reaction: "applied", intros })}
        onTurn={() => {}} onExit={() => {}} busy={false}
      />
    );
    expect(html).not.toContain("Пролог");
    expect(html).toContain("Герметизировать");
  });
});
