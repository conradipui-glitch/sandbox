import { describe, expect, it } from "vitest";
import { createInitialState } from "./scenarios";
import { applyOutcome, simulateTurn } from "./simulation";
import { gameModes, worldCharacters, worldContextForTurn } from "./world";
import { campaignActForTurn } from "../shared/campaign";
import { russia1917CampaignBeatForTurn, russia1917CampaignBeats } from "./scenario-beats";
import { florenceBeatForTurn } from "./florence";
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

  it("opens the Florence prototype and distinguishes executable, conditional and impossible freeform moves", () => {
    const state = createInitialState("florence-1", "florence-workshop", "campaign");
    expect(state.mode).toBe("chronicle");
    expect(state.scenarioTitle).toContain("Флоренция");
    expect(state.role).toContain("мастерской");

    const care = simulateTurn(state, "Отправить Джулиано к лекарю и взять растирку красок на себя");
    expect(care.resolution?.status).toBe("executed");
    expect(care.resolution?.cost).toMatch(/срок|мастерской/i);

    const negotiate = simulateTurn(state, "Попросить кардинала принять черновой картон и дать мастерской отсрочку");
    expect(negotiate.resolution?.status).toBe("conditional");
    expect(negotiate.resolution?.requirement).toMatch(/кардинал|подпись|аванс/i);

    const impossible = simulateTurn(state, "Приказать закончить фреску за час без красок, денег и людей");
    expect(impossible.resolution?.status).toBe("blocked");
    expect(impossible.summary).toMatch(/не может/i);
  });

  it("moves Florence to the next pressure point and ends after six turns", () => {
    const first = createInitialState("florence-sequence", "florence-workshop", "chronicle");
    const firstAction = "Показать кардиналу черновой картон и запросить отсрочку до утра";
    const firstOutcome = simulateTurn(first, firstAction);
    const second = applyOutcome(first, firstAction, firstOutcome);
    expect(second.options.map((option) => option.title)).toEqual(florenceBeatForTurn(2).options.map((option) => option.title));

    const blockedAction = "Закончить фреску за час без красок, денег и людей";
    const blockedOutcome = simulateTurn(first, blockedAction);
    const blocked = applyOutcome(first, blockedAction, blockedOutcome);
    expect(blocked.options.map((option) => option.title)).toEqual(florenceBeatForTurn(1).options.map((option) => option.title));

    let state = first;
    for (let turn = 0; turn < 6; turn += 1) {
      const action = "Проверить пигмент на картоне и записать реальный объём работы";
      state = applyOutcome(state, action, simulateTurn(state, action));
    }
    expect(state.status).toBe("victory");
    expect(state.turn).toBe(7);
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

  it("guides the long campaign with an act question and human-scale fallback beat", () => {
    expect(russia1917CampaignBeats).toHaveLength(8);
    expect(russia1917CampaignBeatForTurn(1).headline).toBe("Мандат попросили показать вслух");
    expect(russia1917CampaignBeatForTurn(27).headline).toBe("Институт пережил кабинет");
    expect(campaignActForTurn(1).number).toBe(1);
    expect(campaignActForTurn(8).number).toBe(2);
    expect(campaignActForTurn(17).number).toBe(3);
    expect(campaignActForTurn(27).number).toBe(4);

    const state = createInitialState("campaign-beat-1", "russia-1917", "campaign");
    const outcome = simulateTurn(state, "Опубликовать проект указа до заседания");
    expect(outcome.headline).toBe("Мандат попросили показать вслух");
    expect(outcome.nextOptions).toHaveLength(3);
    expect(outcome.scene.activeCharacterIds).toEqual(["minister-levitsky", "lidia-vetrova"]);
    expect(outcome.scene.propIds).toContain("printing-press");
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
