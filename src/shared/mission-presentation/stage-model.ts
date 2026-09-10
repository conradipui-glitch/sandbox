import type {
  PreviewFrameView,
  PreviewLayerView
} from "./view-model";

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
