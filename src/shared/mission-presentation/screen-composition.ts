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
  /**
   * Optional dimensions of the authored asset. The published mission carries
   * immutable `assetId + hash` refs; when the material library also serialises
   * its manifest dimensions (the engine's `widthPx`/`heightPx`), the fit/crop
   * can be computed before the browser has loaded the image.
   */
  readonly widthPx?: number | null;
  readonly heightPx?: number | null;
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
  /** The ref the id came from, so the caller can read the asset's dimensions. */
  readonly ref: FrameAssetRefLike | null;
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
    return { assetId: own.assetId, source: "own", ref: own };
  }
  const inherits = screen?.inheritBackground !== false;
  const inherited = defaults?.background ?? null;
  if (inherits && inherited && typeof inherited.assetId === "string" && inherited.assetId.length > 0) {
    return { assetId: inherited.assetId, source: "inherited", ref: inherited };
  }
  return { assetId: null, source: "none", ref: null };
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

// --- Background geometry: contain/cover, focal point and crop ---

export type ScreenFitMode = "contain" | "cover";

export interface ScreenFocalPoint {
  readonly x: number;
  readonly y: number;
}

/** The Studio's default: the frame centre. */
export const DEFAULT_SCREEN_FOCAL: ScreenFocalPoint = Object.freeze({ x: 0.5, y: 0.5 });

/** Both the Studio composition frame and the shared stage are 16:9. */
export const DEFAULT_FRAME_ASPECT = 16 / 9;

/**
 * One resolved asset fit, in frame coordinates normalized by frame HEIGHT
 * (frame = frameAspect x 1, the asset = assetAspect x 1) — the exact shape the
 * Studio's `fitScreenAsset` produces, so the site renders what the author saw.
 * `sourceX/Y/W/H` is the visible part of the asset (the crop).
 */
export interface ScreenAssetFit {
  readonly mode: ScreenFitMode;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceW: number;
  readonly sourceH: number;
  readonly crop: boolean;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Fail-closed: anything that is not the author's `contain` is `cover`. */
export function normalizeFitMode(value: unknown): ScreenFitMode {
  return typeof value === "string" && value.trim().toLowerCase() === "contain" ? "contain" : "cover";
}

/** Fail-closed focal point: a non-finite or out-of-range value cannot move the frame centre. */
export function normalizeFocalPoint(value: unknown): ScreenFocalPoint {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { x?: unknown; y?: unknown }) : null;
  return {
    x: clampUnit(finiteOr(raw?.x, DEFAULT_SCREEN_FOCAL.x)),
    y: clampUnit(finiteOr(raw?.y, DEFAULT_SCREEN_FOCAL.y))
  };
}

/** The authored fit of one screen; absent or unknown fields keep the Studio default. */
export function resolveScreenFit(input: { readonly fit?: unknown; readonly focal?: unknown }): {
  readonly mode: ScreenFitMode;
  readonly focal: ScreenFocalPoint;
} {
  return { mode: normalizeFitMode(input.fit), focal: normalizeFocalPoint(input.focal) };
}

/**
 * contain fits the whole asset (bands are allowed), cover fills the frame
 * (cropping). The asset's focal point is projected into the frame centre, which
 * makes the crop/focal point predictable at any proportions. Mirrors the
 * Studio's `fitScreenAsset` arithmetic exactly.
 */
export function fitScreenAsset(
  assetAspect: number,
  frameAspect: number,
  mode: ScreenFitMode,
  focal: ScreenFocalPoint = DEFAULT_SCREEN_FOCAL
): ScreenAssetFit {
  const safeAsset = Number.isFinite(assetAspect) && assetAspect > 0 ? assetAspect : frameAspect;
  const safeFrame = Number.isFinite(frameAspect) && frameAspect > 0 ? frameAspect : 1;
  const fx = clampUnit(focal.x);
  const fy = clampUnit(focal.y);
  // The frame is normalized by height: frame = (safeFrame, 1), asset = (safeAsset, 1).
  const scale = mode === "cover"
    ? Math.max(safeFrame / safeAsset, 1)
    : Math.min(safeFrame / safeAsset, 1);
  const width = safeAsset * scale;
  const height = scale;
  const offsetX = safeFrame / 2 - fx * width;
  const offsetY = 1 / 2 - fy * height;
  // The visible part of the asset: [0,width]x[0,height] intersected with the frame.
  const visibleLeft = Math.max(0, -offsetX);
  const visibleTop = Math.max(0, -offsetY);
  const visibleRight = Math.min(width, safeFrame - offsetX);
  const visibleBottom = Math.min(height, 1 - offsetY);
  const sourceW = clampUnit((visibleRight - visibleLeft) / width);
  const sourceH = clampUnit((visibleBottom - visibleTop) / height);
  return {
    mode,
    scale,
    width,
    height,
    offsetX,
    offsetY,
    sourceX: clampUnit(Math.min(visibleLeft / width, 1 - sourceW)),
    sourceY: clampUnit(Math.min(visibleTop / height, 1 - sourceH)),
    sourceW,
    sourceH,
    crop: width > safeFrame + 1e-9 || height > 1 + 1e-9
  };
}

/** Aspect (w/h) of an authored asset ref, or null when the library has no dimensions. */
export function assetAspectFromRef(ref: FrameAssetRefLike | null | undefined): number | null {
  if (!ref) return null;
  const width = finiteOr(ref.widthPx, 0);
  const height = finiteOr(ref.heightPx, 0);
  return width > 0 && height > 0 ? width / height : null;
}
