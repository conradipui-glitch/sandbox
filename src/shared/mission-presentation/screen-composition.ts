/**
 * FIN-05 site half: pure resolvers for the authored screen composition.
 *
 * Mirrors the Studio composition semantics (`apps/studio/src/screen-composition.ts`)
 * but renders through the shared preview vocabulary. Data-driven: no scenario
 * IDs, no fallback art. Everything here is a pure function so the frame builder
 * can consume the composition the author saved without touching gameplay state.
 */

import {
  SCREEN_ANIMATION_PRESETS,
  type PreviewLayerAnimation,
  type ScreenAnimationPreset
} from "./view-model";

export { SCREEN_ANIMATION_PRESETS } from "./view-model";
export type { ScreenAnimationPreset } from "./view-model";

/** One authored asset reference as it appears in a published mission revision. */
export interface FrameAssetRefLike {
  readonly assetId: string;
  readonly hash: string;
}

export function normalizeAnimationPreset(value: unknown): ScreenAnimationPreset {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (SCREEN_ANIMATION_PRESETS as readonly string[]).includes(normalized)
    ? (normalized as ScreenAnimationPreset)
    : "none";
}

export interface ScreenMotionContext {
  readonly reducedMotion: boolean;
  readonly paused: boolean;
}

export interface ScreenMotionResolution {
  readonly preset: ScreenAnimationPreset;
  /** The inner transform (breathing/entrance) may play. */
  readonly animate: boolean;
  readonly reason: "ok" | "reduced-motion" | "paused";
}

/**
 * The outer transform of a layer is the author's placement; the inner transform
 * (the preset) is the ambient motion. Under reduced motion or pause the scene is
 * static but the preset stays known.
 */
export function resolveScreenAnimation(preset: unknown, context: ScreenMotionContext): ScreenMotionResolution {
  const normalized = normalizeAnimationPreset(preset);
  if (context.reducedMotion) return { preset: normalized, animate: false, reason: "reduced-motion" };
  if (context.paused) return { preset: normalized, animate: false, reason: "paused" };
  return { preset: normalized, animate: normalized !== "none", reason: "ok" };
}

/**
 * Maps the author's preset to the shared renderer's class. `breath` is the
 * ambient loop; `fade` and `rise` are distinct entrances; `none` is static.
 */
export function presetToLayerAnimation(
  preset: unknown,
  context: ScreenMotionContext = { reducedMotion: false, paused: false }
): PreviewLayerAnimation {
  if (!resolveScreenAnimation(preset, context).animate) return "none";
  const normalized = normalizeAnimationPreset(preset);
  if (normalized === "breath") return "breathe";
  if (normalized === "fade") return "fade";
  if (normalized === "rise") return "rise";
  return "none";
}

// --- Background inheritance (own / inherited / none) ---

export interface ScreenBackgroundInput {
  readonly background?: FrameAssetRefLike | null;
  readonly inheritBackground?: boolean;
}

export interface ScreenDefaultsInput {
  readonly background?: FrameAssetRefLike | null;
}

export interface ScreenBackgroundResolution {
  readonly assetId: string | null;
  readonly source: "own" | "inherited" | "none";
}

/**
 * A screen shows its own background, or inherits the mission default when it
 * asks to, or shows none. An absent `inheritBackground` means inherit, matching
 * the Studio's default screen.
 */
export function resolveScreenBackground(
  screen: ScreenBackgroundInput | null | undefined,
  defaults: ScreenDefaultsInput | null | undefined
): ScreenBackgroundResolution {
  const own = screen?.background ?? null;
  if (own && typeof own.assetId === "string" && own.assetId.length > 0) {
    return { assetId: own.assetId, source: "own" };
  }
  const inherits = screen?.inheritBackground !== false;
  const inherited = defaults?.background ?? null;
  if (inherits && inherited && typeof inherited.assetId === "string" && inherited.assetId.length > 0) {
    return { assetId: inherited.assetId, source: "inherited" };
  }
  return { assetId: null, source: "none" };
}

// --- Music: real play/mute states including the browser autoplay block ---

export type ScreenMusicState = "none" | "playing" | "muted" | "blocked";

export interface ScreenMusicInput {
  readonly hasTrack: boolean;
  readonly muted: boolean;
  readonly autoplayAllowed: boolean;
}

export interface ScreenMusicResolution {
  readonly state: ScreenMusicState;
  readonly shouldPlay: boolean;
  readonly label: string;
}

export function resolveScreenMusic(input: ScreenMusicInput): ScreenMusicResolution {
  if (!input.hasTrack) return { state: "none", shouldPlay: false, label: "Музыка не задана" };
  if (input.muted) return { state: "muted", shouldPlay: false, label: "Звук выключен" };
  if (!input.autoplayAllowed) return { state: "blocked", shouldPlay: false, label: "Нажмите «Играть»: браузер блокирует автозапуск" };
  return { state: "playing", shouldPlay: true, label: "Играет" };
}
