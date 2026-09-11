import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MissionDialogue, MissionIntroPager, MissionSceneStage } from "./components";
import type { PreviewDialogueLineView, PreviewFrameView } from "./view-model";

const dialogue: readonly PreviewDialogueLineView[] = [
  { lineId: "d1", speakerId: null, text: "Первая реплика" },
  { lineId: "d2", speakerId: "keeper", text: "Вторая реплика" }
];

function sceneFrame(overrides: Partial<PreviewFrameView> = {}): PreviewFrameView {
  return {
    kind: "scene",
    title: "Депо",
    text: "Ночь.",
    scene: { backgroundUrl: null, backgroundFit: "cover", layers: [], musicTitle: null },
    choices: [],
    dialogue,
    turn: 0,
    contentRevision: 1,
    contentHash: "a".repeat(64),
    rendererVersion: "1.0.0",
    ...overrides
  };
}

function introFrame(index: number, count: number, title: string): PreviewFrameView {
  return {
    kind: "intro",
    title,
    text: `Страница ${index + 1}`,
    scene: { backgroundUrl: null, backgroundFit: "cover", layers: [], musicTitle: null },
    choices: [],
    dialogue: [],
    introPage: { index, count, hasNext: index < count - 1 },
    turn: 0,
    contentRevision: 1,
    contentHash: "c".repeat(64),
    rendererVersion: "1.0.0"
  };
}

describe("FIN-05 site slice: the shared renderer plays dialogue and pages intros", () => {
  it("renders the first authored line and its advance control", () => {
    const html = renderToString(<MissionDialogue frame={sceneFrame()} />);
    expect(html).toContain("Первая реплика");
    expect(html).not.toContain("Вторая реплика");
    expect(html).toContain('data-dialogue-line="d1"');
    expect(html).toContain('data-dialogue-count="2"');
    expect(html).toContain("Далее");
    // The stage still renders it as part of the authored scene.
    const stage = renderToString(<MissionSceneStage frame={sceneFrame()} />);
    expect(stage).toContain("Первая реплика");
    expect(stage).toContain('data-dialogue-index="0"');
  });

  it("disables advancing while the stage is paused", () => {
    const paused = renderToString(<MissionSceneStage frame={sceneFrame()} paused />);
    expect(paused).toContain('data-dialogue-paused="1"');
    expect(paused).toContain("disabled");
    expect(paused).toContain("Первая реплика");
  });

  it("offers Начать instead of Далее on the last line", () => {
    const last = renderToString(<MissionDialogue frame={{ ...sceneFrame(), dialogue: [dialogue[1]] }} />);
    expect(last).toContain("Начать");
    expect(last).not.toContain(">Далее<");
    expect(last).toContain('data-dialogue-last="1"');
  });

  it("pages intro screens: Далее until the last page, then Начать", () => {
    const first = renderToString(<MissionIntroPager frames={[introFrame(0, 2, "Пролог"), introFrame(1, 2, "Второе вступление")]} onBegin={() => {}} />);
    expect(first).toContain("Пролог");
    expect(first).not.toContain("Второе вступление");
    expect(first).toContain("Далее");
    expect(first).toContain("1 / 2");

    const only = renderToString(<MissionIntroPager frames={[introFrame(0, 1, "Единственное вступление")]} onBegin={() => {}} />);
    expect(only).toContain("Начать");
    expect(only).not.toContain(">Далее<");

    expect(renderToString(<MissionIntroPager frames={[]} onBegin={() => {}} />)).toBe("");
  });

  it("keeps the intro control on the frame's own page state", () => {
    const hasNext = renderToString(<MissionIntroPager frames={[introFrame(0, 3, "Первый")]} onBegin={() => {}} />);
    expect(hasNext).toContain("Далее");
    expect(hasNext).toContain("1 / 3");
  });
});
