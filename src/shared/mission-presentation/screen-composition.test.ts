import { describe, expect, it } from "vitest";
import {
  normalizeAnimationPreset,
  presetToLayerAnimation,
  resolveScreenAnimation,
  resolveScreenBackground,
  resolveScreenMusic
} from "./screen-composition";

const hash = (char: string) => char.repeat(64);

describe("FIN-05 site half: the authored screen composition resolves without scenario branches", () => {
  it("normalizes the author's animation preset and rejects anything else", () => {
    expect(normalizeAnimationPreset(" breath ")).toBe("breath");
    expect(normalizeAnimationPreset("FADE")).toBe("fade");
    expect(normalizeAnimationPreset("rise")).toBe("rise");
    expect(normalizeAnimationPreset("none")).toBe("none");
    expect(normalizeAnimationPreset("sparkle")).toBe("none");
    expect(normalizeAnimationPreset(null)).toBe("none");
    expect(normalizeAnimationPreset(42)).toBe("none");
  });

  it("maps each preset to the shared renderer's ambient/entrance class", () => {
    expect(presetToLayerAnimation("breath")).toBe("breathe");
    expect(presetToLayerAnimation("fade")).toBe("fade");
    expect(presetToLayerAnimation("rise")).toBe("rise");
    expect(presetToLayerAnimation("none")).toBe("none");
    expect(presetToLayerAnimation("sparkle")).toBe("none");
  });

  it("keeps the placement static under reduced motion or pause", () => {
    expect(resolveScreenAnimation("breath", { reducedMotion: false, paused: false })).toEqual({
      preset: "breath",
      animate: true,
      reason: "ok"
    });
    expect(resolveScreenAnimation("breath", { reducedMotion: true, paused: false })).toEqual({
      preset: "breath",
      animate: false,
      reason: "reduced-motion"
    });
    expect(resolveScreenAnimation("rise", { reducedMotion: false, paused: true })).toEqual({
      preset: "rise",
      animate: false,
      reason: "paused"
    });
    // The preset is still known while the inner transform is suppressed.
    expect(presetToLayerAnimation("breath", { reducedMotion: true, paused: false })).toBe("none");
    expect(presetToLayerAnimation("fade", { reducedMotion: false, paused: true })).toBe("none");
  });

  it("resolves the authored background as own, inherited or none", () => {
    const defaults = { background: { assetId: "default-bg", hash: hash("1") } };
    expect(resolveScreenBackground({ background: { assetId: "own-bg", hash: hash("2") }, inheritBackground: false }, defaults)).toEqual({
      assetId: "own-bg",
      source: "own",
      ref: { assetId: "own-bg", hash: hash("2") }
    });
    expect(resolveScreenBackground({ background: null, inheritBackground: true }, defaults)).toEqual({
      assetId: "default-bg",
      source: "inherited",
      ref: { assetId: "default-bg", hash: hash("1") }
    });
    expect(resolveScreenBackground({ background: null, inheritBackground: false }, defaults)).toEqual({
      assetId: null,
      source: "none",
      ref: null
    });
    // A screen without its own flag inherits by default, like the Studio default screen.
    expect(resolveScreenBackground({ background: null }, defaults).source).toBe("inherited");
    expect(resolveScreenBackground({ background: null, inheritBackground: true }, null).source).toBe("none");
    expect(resolveScreenBackground({ background: null, inheritBackground: true }, { background: null }).source).toBe("none");
  });

  it("reports real music states including the browser autoplay block", () => {
    expect(resolveScreenMusic({ hasTrack: false, muted: false, autoplayAllowed: true })).toEqual({
      state: "none",
      shouldPlay: false,
      label: "Музыка не задана"
    });
    expect(resolveScreenMusic({ hasTrack: true, muted: true, autoplayAllowed: true })).toEqual({
      state: "muted",
      shouldPlay: false,
      label: "Звук выключен"
    });
    expect(resolveScreenMusic({ hasTrack: true, muted: false, autoplayAllowed: false }).state).toBe("blocked");
    expect(resolveScreenMusic({ hasTrack: true, muted: false, autoplayAllowed: false }).shouldPlay).toBe(false);
    expect(resolveScreenMusic({ hasTrack: true, muted: false, autoplayAllowed: true })).toEqual({
      state: "playing",
      shouldPlay: true,
      label: "Играет"
    });
  });
});
