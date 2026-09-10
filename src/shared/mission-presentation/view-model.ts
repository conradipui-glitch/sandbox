/**
 * M04 shared mission presentation view-model. Data-driven: no scenario IDs,
 * no hardcoded characters or places. Legacy scenarios enter through
 * `mission-legacy-adapter.ts`.
 */

export const MISSION_RENDERER_VERSION = "1.0.0" as const;
export const PREVIEW_BRIDGE_VERSION = 1 as const;

export type PreviewLayerKind = "actor" | "item" | "text";
export type PreviewLayerAnimation = "breathe" | "arrive" | "none";

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
  readonly layers: readonly PreviewLayerView[];
  readonly musicTitle: string | null;
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
