/**
 * Legacy adapter: old hardcoded scene descriptors become data-driven
 * preview layers. No scenario IDs inside — the caller supplies resolved
 * asset URLs and labels.
 */

import type { PreviewSceneView } from "./view-model";

export interface LegacySceneInput {
  readonly backgroundUrl: string | null;
  readonly backgroundFit?: "cover" | "contain";
  readonly characters: readonly { readonly id: string; readonly src: string; readonly alt: string; readonly side: "left" | "right" | "center" }[];
  readonly props: readonly { readonly id: string; readonly label: string }[];
  readonly musicTitle?: string | null;
}

const SIDE_X: Record<string, number> = { left: 0.24, center: 0.5, right: 0.76 };

export function legacySceneToPreview(input: LegacySceneInput): PreviewSceneView {
  const layers: PreviewSceneView["layers"] = [
    ...input.characters.slice(0, 8).map((character, index) => ({
      id: `legacy-character-${character.id}`,
      kind: "actor" as const,
      name: character.alt,
      visible: true,
      assetUrl: character.src,
      assetAlt: character.alt,
      x: SIDE_X[character.side] ?? 0.5,
      y: 0.62,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      z: 10 + index,
      animation: "breathe" as const
    })),
    ...input.props.slice(0, 8).map((prop, index) => ({
      id: `legacy-prop-${prop.id}`,
      kind: "text" as const,
      name: prop.label,
      visible: true,
      assetUrl: null,
      assetAlt: "",
      x: 0.5,
      y: 0.12,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      z: 30 + index,
      animation: "none" as const
    }))
  ];
  return {
    backgroundUrl: input.backgroundUrl,
    backgroundFit: input.backgroundFit ?? "cover",
    layers,
    musicTitle: input.musicTitle ?? null
  };
}
