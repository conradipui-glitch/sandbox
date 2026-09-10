import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MissionCard, MissionChoicePanel, MissionSceneStage } from "./components";
import { layerAnimationClass, layerOuterStyle } from "./stage-model";
import { legacySceneToPreview } from "./mission-legacy-adapter";
import type { PreviewFrameView } from "./view-model";

function frame(): PreviewFrameView {
  return {
    kind: "scene",
    title: "Депо",
    text: "Ночь.",
    scene: {
      backgroundUrl: "/assets/bg.png",
      backgroundFit: "cover",
      layers: [
        {
          id: "actor-1", kind: "actor", name: "Кладовщик", visible: true,
          assetUrl: "/assets/keeper.png", assetAlt: "Кладовщик",
          x: 0.24, y: 0.62, scale: 1, rotation: 0, flipH: false, flipV: false,
          opacity: 1, z: 10, animation: "breathe"
        },
        {
          id: "actor-2", kind: "actor", name: "Сторож", visible: true,
          assetUrl: "/assets/watchman.png", assetAlt: "Сторож",
          x: 0.76, y: 0.62, scale: 1.1, rotation: -8, flipH: true, flipV: false,
          opacity: 0.9, z: 11, animation: "arrive"
        },
        {
          id: "note-1", kind: "text", name: "Накладная", visible: true,
          assetUrl: null, assetAlt: "",
          x: 0.5, y: 0.12, scale: 1, rotation: 0, flipH: false, flipV: false,
          opacity: 1, z: 30, animation: "none"
        },
        {
          id: "hidden-1", kind: "item", name: "Спрятано", visible: false,
          assetUrl: "/assets/key.png", assetAlt: "Ключ",
          x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false,
          opacity: 1, z: 5, animation: "none"
        }
      ],
      musicTitle: null
    },
    choices: [
      { choiceId: "c1", label: "На пути" },
      { choiceId: "c2", label: "В сторожку" }
    ],
    turn: 2,
    contentRevision: 3,
    contentHash: "c".repeat(64),
    rendererVersion: "1.0.0"
  };
}

describe("M04 shared mission presentation", () => {
  it("renders three visible layers in z-order with authored transforms outside animation", () => {
    const html = renderToString(<MissionSceneStage frame={frame()} />);
    expect(html).toContain("/assets/bg.png");
    expect(html).toContain("/assets/keeper.png");
    expect(html).toContain("/assets/watchman.png");
    expect(html).not.toContain("/assets/key.png");
    const order = ["actor-1", "actor-2", "note-1"].map((id) => html.indexOf(`data-layer-id="${id}"`));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(html).toContain("rotate(-8deg)");
    expect(html).toContain("scaleX(-1)");
    expect(html).toContain("mp-anim-breathe");
    expect(html).toContain("mp-anim-arrive");
    expect(html).toContain("mp-anim-none");
  });

  it("keeps authored placement and ambient animation on separate elements", () => {
    const layer = {
      id: "a", kind: "actor", name: "x", visible: true, assetUrl: null, assetAlt: "",
      x: 0.3, y: 0.4, scale: 2, rotation: 45, flipH: true, flipV: true,
      opacity: 0.5, z: 7
    } as const;
    const outer = layerOuterStyle(layer);
    expect(outer.transform).toContain("rotate(45deg)");
    expect(outer.transform).toContain("scale(2)");
    expect(outer.transform).toContain("scaleX(-1)");
    expect(outer.transform).toContain("scaleY(-1)");
    expect(outer.zIndex).toBe(7);
    expect(layerAnimationClass({ ...layer, animation: "breathe" })).toContain("mp-anim-breathe");
    expect(layerAnimationClass({ ...layer, animation: "none" })).toContain("mp-anim-none");
  });

  it("renders choices and card without scenario-specific content", () => {
    const choices = renderToString(<MissionChoicePanel choices={frame().choices} onChoose={() => {}} />);
    expect(choices).toContain("На пути");
    expect(choices).toContain("В сторожку");
    const card = renderToString(
      <MissionCard
        card={{
          title: "Груз", summary: "Найти.", coverUrl: null,
          period: "1917", place: "Станция", playerRole: "Кладовщик",
          estimatedMinutes: 20, status: "draft"
        }}
        onOpen={() => {}}
      />
    );
    expect(card).toContain("Добавить обложку");
    expect(card).not.toContain("Флоренция");
    expect(card).not.toContain("florence");
  });

  it("adapts legacy scenes without scenario branches", () => {
    const view = legacySceneToPreview({
      backgroundUrl: "/assets/old.png",
      characters: [
        { id: "a", src: "/assets/a.png", alt: "A", side: "left" },
        { id: "b", src: "/assets/b.png", alt: "B", side: "right" }
      ],
      props: [{ id: "p", label: "Стол" }]
    });
    expect(view.layers.length).toBe(3);
    expect(view.layers[0].x).toBeLessThan(view.layers[1].x);
    expect(view.layers.every((layer) => layer.animation === "breathe" || layer.animation === "none")).toBe(true);
  });
});
