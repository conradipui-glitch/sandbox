/**
 * M06/R03 frame builder: turns one immutable authored mission revision into the
 * shared presentation frame that the preview and the real site both render.
 * Data-driven: the only inputs are the mission document, the current scene or
 * ending, and a public asset URL resolver. No scenario IDs, no fallback art.
 */

import { normalizeAnimationPreset, presetToLayerAnimation, resolveScreenBackground, type FrameAssetRefLike } from "./screen-composition";
import { MISSION_RENDERER_VERSION, type PreviewFrameView, type PreviewLayerView, type PreviewSceneView } from "./view-model";

export interface FrameAssetRef {
  readonly assetId: string;
  readonly hash: string;
}

export interface FrameLayerInput {
  readonly id: string;
  readonly kind: "actor" | "item" | "text";
  readonly name: string;
  readonly visible?: boolean;
  readonly asset?: FrameAssetRef | null;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly flipH?: boolean;
  readonly flipV?: boolean;
  readonly opacity?: number;
  readonly z?: number;
}

/** One authored screen: its own/inherited background, layers and music. */
export interface FrameScreenShape {
  readonly background: FrameAssetRef | null;
  /** Whether a screen without its own background may use the mission default. */
  readonly inheritBackground?: boolean;
  readonly layers: readonly FrameLayerInput[];
  readonly music: FrameAssetRef | null;
}

export interface FrameDocShape {
  readonly contentRevision: number;
  readonly contentHash: string;
  readonly story: {
    readonly entrySceneId: string;
    readonly scenes: readonly {
      readonly id: string;
      readonly title: string;
      readonly text: string;
      readonly choices: readonly { readonly id: string; readonly label: string }[];
    }[];
    readonly endings: readonly { readonly id: string; readonly title: string; readonly text: string }[];
  };
  readonly screens?: {
    readonly intros?: readonly { readonly id: string; readonly title: string; readonly body: string; readonly background: FrameAssetRef | null }[];
    readonly scenes?: Readonly<Record<string, FrameScreenShape>>;
    readonly endings?: Readonly<Record<string, FrameScreenShape>>;
  };
  readonly defaults?: {
    readonly background: FrameAssetRef | null;
    readonly theme?: string;
    /** The author's animation preset for the whole mission (Studio default). */
    readonly animationPreset?: string;
  } | null;
}

/**
 * Same-origin URL for one asset of a pinned published revision. It is pinned to
 * the started session, so the BFF can attach the session credential and keep the
 * asset readable after a republish or an unpublish.
 */
export type FrameAssetResolver = (assetId: string) => string;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

const EMPTY_SCENE: PreviewSceneView = Object.freeze({
  backgroundUrl: null,
  backgroundFit: "cover" as const,
  backgroundSource: "none" as const,
  animationPreset: "none" as const,
  layers: Object.freeze([]),
  musicTitle: null,
  musicUrl: null
});

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function layerView(layer: FrameLayerInput, resolve: FrameAssetResolver, animation: PreviewLayerView["animation"]): PreviewLayerView | null {
  if (!layer || typeof layer.id !== "string" || !ID.test(layer.id)) return null;
  if (layer.kind !== "actor" && layer.kind !== "item" && layer.kind !== "text") return null;
  const assetId = layer.asset && typeof layer.asset.assetId === "string" && ID.test(layer.asset.assetId) ? layer.asset.assetId : null;
  return {
    id: layer.id,
    kind: layer.kind,
    name: typeof layer.name === "string" && layer.name.length > 0 ? layer.name : layer.id,
    visible: layer.visible !== false,
    assetUrl: assetId ? resolve(assetId) : null,
    assetAlt: typeof layer.name === "string" && layer.name.length > 0 ? layer.name : layer.id,
    x: finite(layer.x, 0),
    y: finite(layer.y, 0),
    scale: finite(layer.scale, 1),
    rotation: finite(layer.rotation, 0),
    flipH: layer.flipH === true,
    flipV: layer.flipV === true,
    opacity: finite(layer.opacity, 1),
    z: finite(layer.z, 0),
    animation
  };
}

/**
 * Renders one authored screen. The background is resolved as the screen's own
 * ref, the mission default it inherits, or nothing (the Studio's own/inherited/
 * none rule); the authored animation preset drives every layer's ambient motion;
 * the authored music becomes a same-origin URL for the player.
 */
function screenScene(
  screen: FrameScreenShape | undefined,
  defaults: FrameDocShape["defaults"],
  resolve: FrameAssetResolver
): PreviewSceneView {
  const background = resolveScreenBackground(screen ?? null, defaults ?? null);
  const backgroundUrl = background.assetId && ID.test(background.assetId) ? resolve(background.assetId) : null;
  const animationPreset = normalizeAnimationPreset(defaults?.animationPreset);
  const animation = presetToLayerAnimation(animationPreset);
  const layers = (screen?.layers ?? []).map((layer) => layerView(layer, resolve, animation)).filter((layer): layer is PreviewLayerView => layer !== null);
  const musicId = screen?.music && typeof screen.music.assetId === "string" && ID.test(screen.music.assetId) ? screen.music.assetId : null;
  return {
    backgroundUrl,
    backgroundFit: "cover",
    backgroundSource: background.source,
    animationPreset,
    layers: Object.freeze(layers),
    musicTitle: musicId,
    musicUrl: musicId ? resolve(musicId) : null
  };
}

export function buildMissionFrame(input: {
  readonly doc: FrameDocShape;
  readonly sceneId: string;
  readonly endingId?: string | null;
  readonly turn: number;
  readonly resolveAsset: FrameAssetResolver;
}): PreviewFrameView | null {
  const { doc, resolveAsset } = input;
  const turn = Number.isSafeInteger(input.turn) && input.turn >= 0 ? input.turn : 0;
  const base = {
    turn,
    contentRevision: doc.contentRevision,
    contentHash: doc.contentHash,
    rendererVersion: MISSION_RENDERER_VERSION
  };

  if (typeof input.endingId === "string" && input.endingId.length > 0) {
    const ending = doc.story.endings.find((entry) => entry.id === input.endingId);
    if (!ending) return null;
    const screen = doc.screens?.endings?.[ending.id];
    return { kind: "ending", title: ending.title, text: ending.text, scene: screen ? screenScene(screen, doc.defaults ?? null, resolveAsset) : EMPTY_SCENE, choices: Object.freeze([]), ...base };
  }

  const scene = doc.story.scenes.find((entry) => entry.id === input.sceneId);
  if (!scene) return null;
  const screen = doc.screens?.scenes?.[scene.id];
  return {
    kind: "scene",
    title: scene.title,
    text: scene.text,
    scene: screenScene(screen, doc.defaults ?? null, resolveAsset),
    choices: Object.freeze((scene.choices ?? []).map((choice) => ({ choiceId: choice.id, label: choice.label }))),
    ...base
  };
}

export function buildMissionIntroFrame(input: {
  readonly doc: FrameDocShape;
  readonly introId?: string;
  readonly turn: number;
  readonly resolveAsset: FrameAssetResolver;
}): PreviewFrameView | null {
  const intro = input.doc.screens?.intros?.find((entry) => !input.introId || entry.id === input.introId);
  if (!intro) return null;
  const backgroundUrl = intro.background && ID.test(intro.background.assetId) ? input.resolveAsset(intro.background.assetId) : null;
  return {
    kind: "intro",
    title: intro.title,
    text: intro.body,
    scene: { backgroundUrl, backgroundFit: "cover", backgroundSource: backgroundUrl ? "own" : "none", animationPreset: "none", layers: Object.freeze([]), musicTitle: null, musicUrl: null },
    choices: Object.freeze([]),
    turn: Number.isSafeInteger(input.turn) && input.turn >= 0 ? input.turn : 0,
    contentRevision: input.doc.contentRevision,
    contentHash: input.doc.contentHash,
    rendererVersion: MISSION_RENDERER_VERSION
  };
}

/** Re-exported for the docs/tests that pin the authored asset-ref shape. */
export type { FrameAssetRefLike };
