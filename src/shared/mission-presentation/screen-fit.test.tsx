import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  DEFAULT_SCREEN_FOCAL,
  fitScreenAsset,
  normalizeFitMode,
  normalizeFocalPoint,
  resolveScreenFit
} from "./screen-composition";
import { backgroundDataAttributes, backgroundStyle } from "./stage-model";
import { MissionSceneStage } from "./components";
import { buildMissionFrame, type FrameDocShape } from "./frame-build";

const hash = (char: string) => char.repeat(64);
const FRAME_ASPECT = 16 / 9;

describe("FIN-05 site half: contain/cover geometry mirrors the Studio's fitScreenAsset", () => {
  it("cover fills the frame and crops a square asset to the frame's height", () => {
    const fit = fitScreenAsset(1, FRAME_ASPECT, "cover");
    expect(fit.mode).toBe("cover");
    expect(fit.scale).toBeCloseTo(FRAME_ASPECT, 6);
    expect(fit.width).toBeCloseTo(FRAME_ASPECT, 6);
    expect(fit.height).toBeCloseTo(FRAME_ASPECT, 6);
    // The centred focal point sits in the frame centre: no horizontal offset.
    expect(fit.offsetX).toBeCloseTo(0, 6);
    expect(fit.offsetY).toBeCloseTo(0.5 - FRAME_ASPECT / 2, 6);
    // Only the middle 1/frameAspect of the square is visible -> crop.
    expect(fit.sourceW).toBeCloseTo(1, 6);
    expect(fit.sourceH).toBeCloseTo(1 / FRAME_ASPECT, 6);
    expect(fit.crop).toBe(true);
  });

  it("contain fits the whole asset and leaves the band visible instead of cropping", () => {
    const fit = fitScreenAsset(1, FRAME_ASPECT, "contain");
    expect(fit.mode).toBe("contain");
    expect(fit.scale).toBeCloseTo(1, 6);
    expect(fit.width).toBeCloseTo(1, 6);
    expect(fit.height).toBeCloseTo(1, 6);
    expect(fit.offsetX).toBeCloseTo(FRAME_ASPECT / 2 - 0.5, 6);
    expect(fit.offsetY).toBeCloseTo(0, 6);
    expect(fit.sourceW).toBeCloseTo(1, 6);
    expect(fit.sourceH).toBeCloseTo(1, 6);
    expect(fit.crop).toBe(false);
  });

  it("projects the author's focal point into the frame centre, which decides the crop", () => {
    // A 2:1 asset in a square frame: cover crops horizontally around the focal point.
    const centred = fitScreenAsset(2, 1, "cover", { x: 0.5, y: 0.5 });
    expect(centred.sourceX).toBeCloseTo(0.25, 6);
    expect(centred.sourceW).toBeCloseTo(0.5, 6);

    const left = fitScreenAsset(2, 1, "cover", { x: 0, y: 0.5 });
    expect(left.offsetX).toBeCloseTo(0.5, 6);
    expect(left.sourceX).toBeCloseTo(0, 6);
    expect(left.sourceW).toBeCloseTo(0.25, 6);

    const right = fitScreenAsset(2, 1, "cover", { x: 1, y: 0.5 });
    expect(right.offsetX).toBeCloseTo(-1.5, 6);
    expect(right.sourceX).toBeCloseTo(0.75, 6);
    expect(right.sourceW).toBeCloseTo(0.25, 6);
  });

  it("is NaN-safe: an unknown asset aspect falls back to the frame, junk stays finite", () => {
    const fit = fitScreenAsset(Number.NaN, FRAME_ASPECT, "cover");
    expect(Number.isFinite(fit.scale)).toBe(true);
    expect(Number.isFinite(fit.offsetX)).toBe(true);
    const zeroFrame = fitScreenAsset(1, 0, "contain");
    expect(Number.isFinite(zeroFrame.scale)).toBe(true);
  });

  it("fails closed on an unknown fit mode or focal point", () => {
    expect(normalizeFitMode("contain")).toBe("contain");
    expect(normalizeFitMode(" Cover ")).toBe("cover");
    expect(normalizeFitMode("zoom")).toBe("cover");
    expect(normalizeFitMode(null)).toBe("cover");
    expect(normalizeFitMode(42)).toBe("cover");

    expect(normalizeFocalPoint({ x: 0.2, y: 0.8 })).toEqual({ x: 0.2, y: 0.8 });
    expect(normalizeFocalPoint({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    expect(normalizeFocalPoint(null)).toEqual(DEFAULT_SCREEN_FOCAL);
    expect(normalizeFocalPoint({ x: Number.NaN, y: "0.2" })).toEqual(DEFAULT_SCREEN_FOCAL);

    expect(resolveScreenFit({ fit: "contain", focal: { x: 0.2, y: 0.8 } })).toEqual({
      mode: "contain",
      focal: { x: 0.2, y: 0.8 }
    });
    expect(resolveScreenFit({})).toEqual({ mode: "cover", focal: DEFAULT_SCREEN_FOCAL });
    expect(resolveScreenFit({ fit: "zoom", focal: "left" })).toEqual({ mode: "cover", focal: DEFAULT_SCREEN_FOCAL });
  });
});

describe("FIN-05 site half: the background element reproduces the Studio geometry", () => {
  it("places the asset in frame coordinates so the focal point lands in the frame centre", () => {
    const style = backgroundStyle({ backgroundFit: "cover", backgroundFocal: { x: 0.5, y: 0.5 }, backgroundAspect: 1 }, FRAME_ASPECT);
    // height is the frame height (asset box = aspect x 1); left/top are frame percentages.
    expect(style.height).toBe("100%");
    expect(style.transformOrigin).toBe("left top");
    expect(style.transform).toBe("scale(1.7778)");
    expect(style.left).toBe("0%");
    expect(style.top).toBe("-38.8889%");
    // The CSS `inset: 0` default must not stretch the element over the geometry.
    expect(style.right).toBe("auto");
    expect(style.bottom).toBe("auto");

    const focused = backgroundStyle({ backgroundFit: "cover", backgroundFocal: { x: 0, y: 0.5 }, backgroundAspect: 2 }, 1);
    expect(focused.transform).toBe("scale(1)");
    expect(focused.left).toBe("50%");
    expect(focused.top).toBe("0%");

    // The horizontal offset is in height-normalized units, so it must be divided
    // by the frame aspect: a 2:1 asset in a 16:9 frame puts its left edge at 50%.
    const wide = backgroundStyle({ backgroundFit: "cover", backgroundFocal: { x: 0, y: 0.5 }, backgroundAspect: 2 }, FRAME_ASPECT);
    expect(wide.left).toBe("50%");
    expect(wide.top).toBe("0%");
    expect(wide.transform).toBe("scale(1)");
  });

  it("falls back to CSS object-fit while the real asset dimensions are still unknown", () => {
    const style = backgroundStyle({ backgroundFit: "contain", backgroundFocal: { x: 0, y: 1 } });
    expect(style.objectFit).toBe("contain");
    expect(style.objectPosition).toBe("0% 100%");
    expect(style.transform).toBeUndefined();
    expect(backgroundDataAttributes({ backgroundFit: "contain", backgroundFocal: { x: 0, y: 1 } })).toEqual({
      "data-fit": "contain",
      "data-focal": "0,1"
    });
  });

  it("reports the visible crop of the resolved asset as data attributes", () => {
    const attrs = backgroundDataAttributes({ backgroundFit: "cover", backgroundFocal: { x: 0.5, y: 0.5 }, backgroundAspect: 1 }, FRAME_ASPECT);
    expect(attrs["data-fit"]).toBe("cover");
    expect(attrs["data-crop"]).toBe("1");
    // Attributes are rounded for the DOM; the exact model values stay available.
    expect(attrs["data-source-rect"]).toBe("0,0.2187,1,0.5625");
    const fit = fitScreenAsset(1, FRAME_ASPECT, "cover");
    expect(fit.sourceY).toBeCloseTo(0.21875, 6);
    expect(fit.sourceH).toBeCloseTo(0.5625, 6);

    const contained = backgroundDataAttributes({ backgroundFit: "contain", backgroundFocal: { x: 0.5, y: 0.5 }, backgroundAspect: 1 }, FRAME_ASPECT);
    expect(contained["data-crop"]).toBe("0");
    expect(contained["data-source-rect"]).toBe("0,0,1,1");
  });
});

describe("FIN-05 site half: the frame carries the authored fit/focal into the renderer", () => {
  const doc: FrameDocShape = {
    contentRevision: 2,
    contentHash: hash("a"),
    story: {
      entrySceneId: "piazza",
      scenes: [{ id: "piazza", title: "Пьяцца", text: "Полдень.", choices: [{ id: "go", label: "Идти" }] }],
      endings: [{ id: "end", title: "Финал", text: "Конец." }]
    },
    screens: {
      intros: [],
      scenes: {
        piazza: {
          background: { assetId: "piazza-bg", hash: hash("b"), widthPx: 96, heightPx: 54 },
          layers: [],
          music: null
        }
      },
      endings: {}
    },
    defaults: { background: { assetId: "default-bg", hash: hash("c"), widthPx: 1920, heightPx: 1080 } }
  };
  const resolve = (assetId: string) => `/api/missions/mission:p:q/assets/${assetId}`;

  it("reads the authored fit and focal point and the library dimensions of the resolved asset", () => {
    const authored = buildMissionFrame({
      doc: { ...doc, screens: { ...doc.screens, scenes: { piazza: { ...doc.screens!.scenes!.piazza, fit: "contain", focal: { x: 0, y: 1 } } } } },
      sceneId: "piazza",
      turn: 0,
      resolveAsset: resolve
    });
    expect(authored!.scene.backgroundFit).toBe("contain");
    expect(authored!.scene.backgroundFocal).toEqual({ x: 0, y: 1 });
    expect(authored!.scene.backgroundAspect).toBeCloseTo(96 / 54, 6);
  });

  it("defaults to the Studio's cover/centre and invents nothing for junk or missing fields", () => {
    const plain = buildMissionFrame({ doc, sceneId: "piazza", turn: 0, resolveAsset: resolve });
    expect(plain!.scene.backgroundFit).toBe("cover");
    expect(plain!.scene.backgroundFocal).toEqual({ x: 0.5, y: 0.5 });
    expect(plain!.scene.backgroundAspect).toBeCloseTo(96 / 54, 6);

    const junk = buildMissionFrame({
      doc: { ...doc, screens: { ...doc.screens, scenes: { piazza: { ...doc.screens!.scenes!.piazza, fit: "zoom", focal: { x: 9, y: "top" } } } } },
      sceneId: "piazza",
      turn: 0,
      resolveAsset: resolve
    });
    expect(junk!.scene.backgroundFit).toBe("cover");
    expect(junk!.scene.backgroundFocal).toEqual({ x: 1, y: 0.5 });

    const noDimensionsDoc: FrameDocShape = {
      ...doc,
      screens: {
        intros: [],
        scenes: { piazza: { background: { assetId: "piazza-bg", hash: hash("b") }, layers: [], music: null } },
        endings: {}
      }
    };
    const noDimensions = buildMissionFrame({ doc: noDimensionsDoc, sceneId: "piazza", turn: 0, resolveAsset: resolve });
    expect(noDimensions!.scene.backgroundAspect).toBeNull();

    // An inherited background keeps its own focus, not the screen's.
    const inherited = buildMissionFrame({
      doc: { ...doc, screens: { ...doc.screens, scenes: { piazza: { background: null, inheritBackground: true, fit: "contain", layers: [], music: null } } } },
      sceneId: "piazza",
      turn: 0,
      resolveAsset: resolve
    });
    expect(inherited!.scene.backgroundSource).toBe("inherited");
    expect(inherited!.scene.backgroundAspect).toBeCloseTo(1920 / 1080, 6);
  });

  it("renders the fit, the focal point and the crop on the shared stage", () => {
    const html = renderToString(
      <MissionSceneStage
        frame={{
          kind: "scene",
          title: "Пьяцца",
          text: "Полдень.",
          scene: {
            backgroundUrl: "/api/missions/mission:p:q/assets/piazza-bg",
            backgroundFit: "contain",
            backgroundFocal: { x: 0, y: 1 },
            backgroundAspect: 96 / 54,
            backgroundSource: "own",
            layers: [],
            musicTitle: null
          },
          choices: [],
          turn: 0,
          contentRevision: 2,
          contentHash: hash("a"),
          rendererVersion: "1.0.0"
        }}
      />
    );
    expect(html).toContain('data-fit="contain"');
    expect(html).toContain('data-focal="0,1"');
    expect(html).toContain('data-crop="0"');
    // contain + focal x=0/y=1: the asset is shifted so its focal point sits in the
    // frame centre, so the visible window is the bottom-right quarter.
    expect(html).toContain('data-source-rect="0,0.5,0.5,0.5"');
    expect(html).toContain("transform-origin:left top");
  });
});
