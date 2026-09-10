/**
 * M04 preview iframe bridge, protocol v1. The preview bundle accepts frames
 * only from the configured parent origin; the host accepts only the three
 * inbound event types. No scripts, no arbitrary URLs, no credentials cross
 * the bridge.
 *
 * Selection layerId conventions: plain layer IDs select canvas layers;
 * `choice:<choiceId>` activates a play-mode choice, `intro:begin` and
 * `ending:exit` drive intro/ending buttons. The host maps these to Control
 * calls; the preview never calls gameplay APIs itself.
 */

import {
  PREVIEW_BRIDGE_VERSION,
  type PreviewFrameView
} from "./view-model";

export { MISSION_RENDERER_VERSION, PREVIEW_BRIDGE_VERSION } from "./view-model";

export const PREVIEW_PROTOCOL = "lhc-mission-preview" as const;
const MAX_FRAME_CHARS = 256_000;
const MAX_TEXT_CHARS = 20_000;

export type PreviewInboundType = "ready" | "selection" | "transform";
export type PreviewOutboundType = "frame";

export interface PreviewInboundEvent {
  readonly protocol: typeof PREVIEW_PROTOCOL;
  readonly version: typeof PREVIEW_BRIDGE_VERSION;
  readonly type: PreviewInboundType;
  readonly nonce: string;
  readonly payload: unknown;
}

export interface PreviewOutboundFrame {
  readonly protocol: typeof PREVIEW_PROTOCOL;
  readonly version: typeof PREVIEW_BRIDGE_VERSION;
  readonly type: PreviewOutboundType;
  readonly nonce: string;
  readonly mode: "screen" | "play";
  readonly frame: PreviewFrameView;
}

export interface PreviewSelection {
  readonly layerId: string;
}

export interface PreviewTransform {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Host side: validate one inbound message event from the preview iframe. */
export function validatePreviewInbound(
  eventOrigin: string,
  expectedOrigin: string,
  expectedNonce: string,
  data: unknown
): { readonly ok: true; readonly type: PreviewInboundType; readonly payload: unknown } | { readonly ok: false; readonly code: string } {
  if (eventOrigin !== expectedOrigin) return { ok: false, code: "BRIDGE_ORIGIN" };
  if (!isRecord(data)) return { ok: false, code: "BRIDGE_SHAPE" };
  if (data.protocol !== PREVIEW_PROTOCOL || data.version !== PREVIEW_BRIDGE_VERSION) {
    return { ok: false, code: "BRIDGE_VERSION" };
  }
  if (data.nonce !== expectedNonce || typeof data.nonce !== "string" || !NONCE.test(data.nonce)) {
    return { ok: false, code: "BRIDGE_NONCE" };
  }
  if (data.type === "ready") return { ok: true, type: "ready", payload: null };
  if (data.type === "selection" && isRecord(data.payload) && typeof data.payload.layerId === "string" && ID.test(data.payload.layerId)) {
    return { ok: true, type: "selection", payload: { layerId: data.payload.layerId } satisfies PreviewSelection };
  }
  if (data.type === "transform" && isRecord(data.payload)) {
    const payload = data.payload as Record<string, unknown>;
    const numbers = [payload.x, payload.y, payload.scale, payload.rotation];
    if (typeof payload.layerId === "string" && ID.test(payload.layerId) && numbers.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return {
        ok: true,
        type: "transform",
        payload: {
          layerId: payload.layerId,
          x: payload.x as number,
          y: payload.y as number,
          scale: payload.scale as number,
          rotation: payload.rotation as number
        } satisfies PreviewTransform
      };
    }
  }
  return { ok: false, code: "BRIDGE_TYPE" };
}

/** Preview side: validate one outbound frame from the host. */
export function validatePreviewOutbound(
  eventOrigin: string,
  allowedParentOrigin: string,
  data: unknown
): { readonly ok: true; readonly frame: PreviewOutboundFrame } | { readonly ok: false; readonly code: string } {
  if (eventOrigin !== allowedParentOrigin) return { ok: false, code: "BRIDGE_ORIGIN" };
  if (!isRecord(data)) return { ok: false, code: "BRIDGE_SHAPE" };
  if (data.protocol !== PREVIEW_PROTOCOL || data.version !== PREVIEW_BRIDGE_VERSION || data.type !== "frame") {
    return { ok: false, code: "BRIDGE_VERSION" };
  }
  if (typeof data.nonce !== "string" || !NONCE.test(data.nonce)) return { ok: false, code: "BRIDGE_NONCE" };
  if (data.mode !== "screen" && data.mode !== "play") return { ok: false, code: "BRIDGE_MODE" };
  let frame: PreviewFrameView;
  try {
    const text = JSON.stringify(data.frame);
    if (text.length > MAX_FRAME_CHARS) return { ok: false, code: "BRIDGE_TOO_LARGE" };
    frame = data.frame as PreviewFrameView;
  } catch {
    return { ok: false, code: "BRIDGE_SHAPE" };
  }
  if (!isRecord(frame) || !isRecord(frame.scene) || !Array.isArray((frame.scene as Record<string, unknown>).layers)) {
    return { ok: false, code: "BRIDGE_SHAPE" };
  }
  if (typeof frame.title !== "string" || typeof frame.text !== "string" || frame.text.length > MAX_TEXT_CHARS) {
    return { ok: false, code: "BRIDGE_SHAPE" };
  }
  if (frame.rendererVersion !== undefined && typeof frame.rendererVersion !== "string") {
    return { ok: false, code: "BRIDGE_SHAPE" };
  }
  return {
    ok: true,
    frame: {
      protocol: PREVIEW_PROTOCOL,
      version: PREVIEW_BRIDGE_VERSION,
      type: "frame",
      nonce: data.nonce,
      mode: data.mode,
      frame
    } satisfies PreviewOutboundFrame
  };
}

export function buildPreviewFrameMessage(nonce: string, mode: "screen" | "play", frame: PreviewFrameView): PreviewOutboundFrame {
  return { protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "frame", nonce, mode, frame };
}
