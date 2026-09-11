import type {
  PreviewFrameView,
  PreviewLayerView,
  PreviewSceneView
} from "./view-model";
import {
  DEFAULT_FRAME_ASPECT,
  fitScreenAsset,
  normalizeFitMode,
  normalizeFocalPoint,
  type ScreenAssetFit
} from "./screen-composition";

export interface AuthoredLayerInput {
  readonly id: string;
  readonly kind: "actor" | "item" | "text";
  readonly name: string;
  readonly visible: boolean;
  readonly assetUrl: string | null;
  readonly assetAlt?: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
  readonly opacity: number;
  readonly z: number;
  readonly animation?: PreviewLayerView["animation"];
}

function clampNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Authored placement lives on the OUTER wrapper only
 * (translate/rotate/scale/flip/opacity/z-index). The INNER element carries
 * the ambient animation, so breathing/arrival never overwrite placement.
 */
export function layerOuterStyle(layer: AuthoredLayerInput): Record<string, string | number> {
  const flips = `${layer.flipH ? " scaleX(-1)" : ""}${layer.flipV ? " scaleY(-1)" : ""}`;
  return {
    left: `${clampNumber(layer.x, 0) * 100}%`,
    top: `${clampNumber(layer.y, 0) * 100}%`,
    zIndex: Math.trunc(clampNumber(layer.z, 0)),
    opacity: clampNumber(layer.opacity, 1),
    transform: `translate(-50%, -50%) rotate(${clampNumber(layer.rotation, 0)}deg) scale(${clampNumber(layer.scale, 1)})${flips}`
  };
}

export function layerAnimationClass(layer: AuthoredLayerInput): string {
  const animation = layer.animation ?? "breathe";
  if (animation === "arrive") return "mp-layer-anim mp-anim-arrive";
  if (animation === "fade") return "mp-layer-anim mp-anim-fade";
  if (animation === "rise") return "mp-layer-anim mp-anim-rise";
  if (animation === "none") return "mp-layer-anim mp-anim-none";
  return "mp-layer-anim mp-anim-breathe";
}

export function isSafePreviewUrl(value: string | null): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value, "https://preview.invalid");
    return parsed.origin === "https://preview.invalid";
  } catch {
    return false;
  }
}

export function frameStatusText(frame: PreviewFrameView, dirty: boolean): string {
  if (dirty) return "Экран: несохранённые изменения — это не доказательство gameplay";
  return `Экран · revision ${frame.contentRevision}`;
}

// --- Background fit/crop/focal mapping onto the shared stage ---

export type BackgroundFitInput = Pick<PreviewSceneView, "backgroundFit"> &
  Partial<Pick<PreviewSceneView, "backgroundFocal" | "backgroundAspect">>;

function round(value: number): number {
  return Number(value.toFixed(4));
}

function percent(value: number): string {
  return `${round(value * 100)}%`;
}

function safeFrameAspect(frameAspect: unknown): number {
  return typeof frameAspect === "number" && Number.isFinite(frameAspect) && frameAspect > 0 ? frameAspect : DEFAULT_FRAME_ASPECT;
}

/**
 * The exact asset fit of the resolved background, or null while the asset's real
 * dimensions are unknown (nothing is invented: the stage then falls back to CSS).
 */
export function backgroundFit(input: BackgroundFitInput, frameAspect: number = DEFAULT_FRAME_ASPECT): ScreenAssetFit | null {
  const aspect = input.backgroundAspect;
  if (typeof aspect !== "number" || !Number.isFinite(aspect) || aspect <= 0) return null;
  return fitScreenAsset(aspect, safeFrameAspect(frameAspect), normalizeFitMode(input.backgroundFit), normalizeFocalPoint(input.backgroundFocal));
}

/**
 * Inline geometry for the background element. The frame is the containing block
 * and the element's natural box is the asset at frame height (`height: 100%`),
 * so `left`/`top` are frame percentages and the scale reproduces the Studio's
 * projection: the authored focal point lands in the frame centre and `cover`
 * crops exactly as the Studio model says.
 *
 * Without the asset aspect the style stays empty except for the focal-aware CSS
 * object-fit/object-position fallback, which is what a centred `cover` does today.
 */
export function backgroundStyle(input: BackgroundFitInput, frameAspect: number = DEFAULT_FRAME_ASPECT): Record<string, string | number> {
  const fit = backgroundFit(input, frameAspect);
  if (!fit) {
    const focal = normalizeFocalPoint(input.backgroundFocal);
    return { objectFit: normalizeFitMode(input.backgroundFit), objectPosition: `${percent(focal.x)} ${percent(focal.y)}` };
  }
  return {
    height: "100%",
    width: "auto",
    left: percent(fit.offsetX / safeFrameAspect(frameAspect)),
    top: percent(fit.offsetY),
    // The `.mp-background` CSS default is `inset: 0`; the geometry must win.
    right: "auto",
    bottom: "auto",
    transformOrigin: "left top",
    transform: `scale(${round(fit.scale)})`
  };
}

/** Data attributes that make the resolved fit/crop inspectable (and testable). */
export function backgroundDataAttributes(input: BackgroundFitInput, frameAspect: number = DEFAULT_FRAME_ASPECT): Record<string, string> {
  const focal = normalizeFocalPoint(input.backgroundFocal);
  const attributes: Record<string, string> = {
    "data-fit": normalizeFitMode(input.backgroundFit),
    "data-focal": `${round(focal.x)},${round(focal.y)}`
  };
  const fit = backgroundFit(input, frameAspect);
  if (fit) {
    attributes["data-crop"] = fit.crop ? "1" : "0";
    attributes["data-source-rect"] = `${round(fit.sourceX)},${round(fit.sourceY)},${round(fit.sourceW)},${round(fit.sourceH)}`;
  }
  return attributes;
}
