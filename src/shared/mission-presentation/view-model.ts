/**
 * M04 shared mission presentation view-model. Data-driven: no scenario IDs,
 * no hardcoded characters or places. Legacy scenarios enter through
 * `mission-legacy-adapter.ts`.
 */

export const MISSION_RENDERER_VERSION = "1.0.0" as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;

export type PreviewLayerKind = "actor" | "item" | "text";

/**
 * The author's animation preset vocabulary (mirrors the Studio's
 * `screen-composition.ts`). `PreviewLayerAnimation` is the renderer class it
 * maps to: `breath` is ambient, `fade`/`rise` are entrances.
 */
export const SCREEN_ANIMATION_PRESETS = ["none", "fade", "rise", "breath"] as const;
export type ScreenAnimationPreset = (typeof SCREEN_ANIMATION_PRESETS)[number];
export type PreviewLayerAnimation = "breathe" | "arrive" | "fade" | "rise" | "none";

export interface PreviewLayerView {
  readonly id: string;
  readonly kind: PreviewLayerKind;
  readonly name: string;
  readonly visible: boolean;
  /** Resolved by the host; preview accepts same-origin or relative URLs only. */
  readonly assetUrl: string | null;
  readonly assetAlt: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
  readonly opacity: number;
  readonly z: number;
  readonly animation: PreviewLayerAnimation;
}

export interface PreviewSceneView {
  readonly backgroundUrl: string | null;
  readonly backgroundFit: "cover" | "contain";
  /** Where the resolved background came from: the screen's own ref, the
   * mission default it inherits, or nothing. */
  readonly backgroundSource?: "own" | "inherited" | "none";
  /** The author's animation preset for the whole screen (Studio default). */
  readonly animationPreset?: ScreenAnimationPreset;
  readonly layers: readonly PreviewLayerView[];
  readonly musicTitle: string | null;
  /** Same-origin URL of the authored music, or null when the screen has none. */
  readonly musicUrl?: string | null;
}

export interface PreviewChoiceView {
  readonly choiceId: string;
  readonly label: string;
}

export interface PreviewFrameView {
  readonly kind: "intro" | "scene" | "ending";
  readonly title: string;
  readonly text: string;
  readonly scene: PreviewSceneView;
  readonly choices: readonly PreviewChoiceView[];
  readonly turn: number;
  readonly contentRevision: number;
  readonly contentHash: string;
  readonly rendererVersion: typeof MISSION_RENDERER_VERSION;
}

export interface MissionCardView {
  readonly title: string;
  readonly summary: string;
  readonly coverUrl: string | null;
  readonly period: string;
  readonly place: string;
  readonly playerRole: string;
  readonly estimatedMinutes: number;
  readonly status: "draft" | "ready" | "published" | "outdated";
}
