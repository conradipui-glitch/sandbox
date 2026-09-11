import { describe, expect, it } from "vitest";
import { buildMissionFrame, buildMissionIntroFrame, type FrameDocShape } from "./frame-build";

const hash = (char: string) => char.repeat(64);

const doc: FrameDocShape = {
  contentRevision: 4,
  contentHash: hash("a"),
  story: {
    entrySceneId: "cellar",
    scenes: [
      { id: "cellar", title: "Подвал", text: "Сыро и тихо.", choices: [{ id: "open", label: "Открыть ящик" }] },
      { id: "yard", title: "Двор", text: "Утро.", choices: [{ id: "leave", label: "Уйти" }] }
    ],
    endings: [{ id: "quiet", title: "Тихий уход", text: "Никто не заметил." }]
  },
  screens: {
    intros: [{ id: "brief", title: "Пролог", body: "Вам поручено найти груз.", background: { assetId: "intro-bg", hash: hash("b") } }],
    scenes: {
      cellar: {
        background: { assetId: "cellar-bg", hash: hash("c") },
        music: { assetId: "cellar-theme", hash: hash("d") },
        layers: [
          { id: "lamp", kind: "item", name: "Лампа", asset: { assetId: "lamp", hash: hash("e") }, x: 0.2, y: 0.4, z: 2 },
          { id: "label", kind: "text", name: "Надпись", visible: false }
        ]
      },
      yard: { background: { assetId: "yard-bg", hash: hash("f") }, music: null, layers: [] }
    },
    endings: {
      quiet: { background: { assetId: "dawn-bg", hash: hash("0") }, music: null, layers: [{ id: "sun", kind: "actor", name: "Рассвет", z: 1 }] }
    }
  },
  defaults: { background: { assetId: "default-bg", hash: hash("1") } }
};

const resolve = (assetId: string) => `/api/missions/mission:p:q/assets/${assetId}`;

describe("R03 frame builder renders authored data", () => {
  it("renders an authored scene with its own background, layers and choices", () => {
    const frame = buildMissionFrame({ doc, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(frame).not.toBeNull();
    expect(frame!.kind).toBe("scene");
    expect(frame!.title).toBe("Подвал");
    expect(frame!.text).toBe("Сыро и тихо.");
    expect(frame!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/cellar-bg");
    expect(frame!.scene.musicTitle).toBe("cellar-theme");
    expect(frame!.scene.layers.map((layer) => layer.id)).toEqual(["lamp", "label"]);
    expect(frame!.scene.layers[0].assetUrl).toBe("/api/missions/mission:p:q/assets/lamp");
    expect(frame!.scene.layers[1].visible).toBe(false);
    expect(frame!.choices).toEqual([{ choiceId: "open", label: "Открыть ящик" }]);
    expect(frame!.contentHash).toBe(doc.contentHash);
  });

  it("renders an authored ending with no choices", () => {
    const frame = buildMissionFrame({ doc, sceneId: "cellar", endingId: "quiet", turn: 1, resolveAsset: resolve });
    expect(frame!.kind).toBe("ending");
    expect(frame!.title).toBe("Тихий уход");
    expect(frame!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/dawn-bg");
    expect(frame!.choices.length).toBe(0);
  });

  it("renders the authored intro", () => {
    const frame = buildMissionIntroFrame({ doc, turn: 0, resolveAsset: resolve });
    expect(frame!.kind).toBe("intro");
    expect(frame!.title).toBe("Пролог");
    expect(frame!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/intro-bg");
  });

  it("never invents a scene for an unknown scene or ending", () => {
    expect(buildMissionFrame({ doc, sceneId: "missing", turn: 0, resolveAsset: resolve })).toBeNull();
    expect(buildMissionFrame({ doc, sceneId: "cellar", endingId: "missing", turn: 1, resolveAsset: resolve })).toBeNull();
    expect(buildMissionIntroFrame({ doc: { ...doc, screens: undefined }, turn: 0, resolveAsset: resolve })).toBeNull();
  });

  it("falls back to the mission default background when a scene has no screen of its own", () => {
    const withoutScene = buildMissionFrame({ doc: { ...doc, screens: { ...doc.screens, scenes: {} } }, sceneId: "yard", turn: 0, resolveAsset: resolve });
    expect(withoutScene!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/default-bg");
    const withoutDefaults = buildMissionFrame({ doc: { ...doc, screens: { ...doc.screens, scenes: {} }, defaults: null }, sceneId: "yard", turn: 0, resolveAsset: resolve });
    expect(withoutDefaults!.scene.backgroundUrl).toBeNull();
  });
});

describe("FIN-05 site half: the published frame carries the authored composition", () => {
  it("applies the author's animation preset to every layer", () => {
    const withPreset = buildMissionFrame({ doc: { ...doc, defaults: { ...doc.defaults!, animationPreset: "breath" } }, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(withPreset!.scene.animationPreset).toBe("breath");
    expect(withPreset!.scene.layers.every((layer) => layer.animation === "breathe")).toBe(true);

    const rise = buildMissionFrame({ doc: { ...doc, defaults: { ...doc.defaults!, animationPreset: "rise" } }, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(rise!.scene.layers.every((layer) => layer.animation === "rise")).toBe(true);

    // An unknown preset is not invented.
    const unknown = buildMissionFrame({ doc: { ...doc, defaults: { ...doc.defaults!, animationPreset: "sparkle" } }, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(unknown!.scene.animationPreset).toBe("none");
    expect(unknown!.scene.layers.every((layer) => layer.animation === "none")).toBe(true);
  });

  it("distinguishes an own background from an inherited one and from none", () => {
    const own = buildMissionFrame({ doc, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(own!.scene.backgroundSource).toBe("own");
    expect(own!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/cellar-bg");

    const inheritedDoc: FrameDocShape = {
      ...doc,
      screens: { ...doc.screens, scenes: { ...doc.screens!.scenes, yard: { background: null, inheritBackground: true, music: null, layers: [] } } }
    };
    const inherited = buildMissionFrame({ doc: inheritedDoc, sceneId: "yard", turn: 0, resolveAsset: resolve });
    expect(inherited!.scene.backgroundSource).toBe("inherited");
    expect(inherited!.scene.backgroundUrl).toBe("/api/missions/mission:p:q/assets/default-bg");

    const optedOutDoc: FrameDocShape = {
      ...doc,
      screens: { ...doc.screens, scenes: { ...doc.screens!.scenes, yard: { background: null, inheritBackground: false, music: null, layers: [] } } }
    };
    const optedOut = buildMissionFrame({ doc: optedOutDoc, sceneId: "yard", turn: 0, resolveAsset: resolve });
    expect(optedOut!.scene.backgroundSource).toBe("none");
    expect(optedOut!.scene.backgroundUrl).toBeNull();
  });

  it("resolves the authored music into a session-pinned URL", () => {
    const frame = buildMissionFrame({ doc, sceneId: "cellar", turn: 0, resolveAsset: resolve });
    expect(frame!.scene.musicTitle).toBe("cellar-theme");
    expect(frame!.scene.musicUrl).toBe("/api/missions/mission:p:q/assets/cellar-theme");

    const silent = buildMissionFrame({ doc, sceneId: "yard", turn: 0, resolveAsset: resolve });
    expect(silent!.scene.musicTitle).toBeNull();
    expect(silent!.scene.musicUrl).toBeNull();
  });
});
