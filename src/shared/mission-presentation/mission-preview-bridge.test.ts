import { describe, expect, it } from "vitest";
import {
  PREVIEW_BRIDGE_VERSION,
  PREVIEW_PROTOCOL,
  buildPreviewFrameMessage,
  validatePreviewInbound,
  validatePreviewOutbound
} from "./mission-preview-bridge";
import type { PreviewFrameView } from "./view-model";

const ORIGIN = "https://studio.test";
const NONCE = "n0nce-0123456789abcdef";
const frame = { kind: "scene", title: "T", text: "x", scene: { layers: [] }, rendererVersion: "1.0.0" } as unknown as PreviewFrameView;

describe("M04 preview bridge", () => {
  it("accepts a well-formed frame and round-trips ready/selection/transform", () => {
    const message = buildPreviewFrameMessage(NONCE, "screen", frame);
    expect(message.protocol).toBe(PREVIEW_PROTOCOL);
    expect(message.version).toBe(PREVIEW_BRIDGE_VERSION);
    const accepted = validatePreviewOutbound(ORIGIN, ORIGIN, message);
    expect(accepted.ok).toBe(true);

    expect(validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "ready", nonce: NONCE
    })).toMatchObject({ ok: true, type: "ready" });

    expect(validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "selection", nonce: NONCE,
      payload: { layerId: "actor-1" }
    })).toMatchObject({ ok: true, type: "selection" });

    expect(validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "transform", nonce: NONCE,
      payload: { layerId: "actor-1", x: 0.3, y: 0.4, scale: 1, rotation: 0 }
    })).toMatchObject({ ok: true, type: "transform" });
  });

  it("rejects wrong origin, nonce, version, types and oversized frames", () => {
    const message = buildPreviewFrameMessage(NONCE, "screen", frame);
    expect(validatePreviewOutbound("https://evil.test", ORIGIN, message)).toMatchObject({ ok: false, code: "BRIDGE_ORIGIN" });
    expect(validatePreviewOutbound(ORIGIN, ORIGIN, { ...message, version: 999 })).toMatchObject({ ok: false, code: "BRIDGE_VERSION" });
    expect(validatePreviewOutbound(ORIGIN, ORIGIN, { ...message, mode: "hack" })).toMatchObject({ ok: false, code: "BRIDGE_MODE" });
    expect(validatePreviewOutbound(ORIGIN, ORIGIN, {
      ...message, frame: { ...frame, text: "x".repeat(30_000) }
    })).toMatchObject({ ok: false, code: "BRIDGE_SHAPE" });

    const badNonce = validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "ready", nonce: "wrong"
    });
    expect(badNonce).toMatchObject({ ok: false, code: "BRIDGE_NONCE" });

    const badType = validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "eval", nonce: NONCE, payload: "alert(1)"
    });
    expect(badType).toMatchObject({ ok: false, code: "BRIDGE_TYPE" });

    const badTransform = validatePreviewInbound(ORIGIN, ORIGIN, NONCE, {
      protocol: PREVIEW_PROTOCOL, version: PREVIEW_BRIDGE_VERSION, type: "transform", nonce: NONCE,
      payload: { layerId: "a", x: "far", y: 0, scale: 1, rotation: 0 }
    });
    expect(badTransform).toMatchObject({ ok: false, code: "BRIDGE_TYPE" });
  });
});
