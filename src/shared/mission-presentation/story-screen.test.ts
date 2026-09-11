import { describe, expect, it } from "vitest";
import type { PreviewDialogueLineView, PreviewFrameView } from "./view-model";
import {
  activeDialogueLine,
  activeIntroFrame,
  advanceDialogueOnInput,
  advanceIntroOnInput,
  advanceSequenceProgress,
  dialogueKeyAction,
  dialogueLinesOf,
  dialogueSequenceKey,
  initializeSequenceProgress,
  introSequenceKey,
  isLastSequenceStep,
  reconcileSequenceProgress
} from "./story-screen";

function line(lineId: string, text: string, speakerId: string | null = null): PreviewDialogueLineView {
  return { lineId, speakerId, text };
}

function frame(dialogue: readonly PreviewDialogueLineView[], overrides: Partial<PreviewFrameView> = {}): PreviewFrameView {
  return {
    kind: "scene",
    title: "Депо",
    text: "Ночь.",
    scene: { backgroundUrl: null, backgroundFit: "cover", layers: [], musicTitle: null },
    choices: [],
    dialogue,
    turn: 0,
    contentRevision: 1,
    contentHash: "a".repeat(64),
    rendererVersion: "1.0.0",
    ...overrides
  };
}

const TWO = [line("d1", "Первая реплика"), line("d2", "Вторая реплика", "keeper")];

describe("FIN-05 site slice: authored dialogue advances in order", () => {
  it("maps only the advance keys, with the Studio's strict modifiers", () => {
    expect(dialogueKeyAction({ key: "ArrowRight" })).toBe("advance");
    expect(dialogueKeyAction({ key: "ArrowDown" })).toBe("advance");
    expect(dialogueKeyAction({ key: "Enter" })).toBe("advance");
    expect(dialogueKeyAction({ key: " " })).toBe("advance");
    expect(dialogueKeyAction({ key: "PageDown" })).toBe("advance");
    expect(dialogueKeyAction({ key: "Escape" })).toBeNull();
    expect(dialogueKeyAction({ key: "a" })).toBeNull();
    // Service combinations are never captured.
    expect(dialogueKeyAction({ key: "Enter", ctrlKey: true })).toBeNull();
    expect(dialogueKeyAction({ key: " ", metaKey: true })).toBeNull();
    expect(dialogueKeyAction({ key: "ArrowRight", altKey: true })).toBeNull();
  });

  it("leaves keys raised by a self-activating control to that control", () => {
    // Space/Enter on the focused "Далее" button already activates it; capturing
    // the same key again would advance two lines for one key press.
    expect(dialogueKeyAction({ key: " ", target: { tagName: "BUTTON" } })).toBeNull();
    expect(dialogueKeyAction({ key: "Enter", target: { tagName: "button" } })).toBeNull();
    expect(dialogueKeyAction({ key: "ArrowRight", target: { tagName: "A" } })).toBeNull();
    expect(dialogueKeyAction({ key: " ", target: { tagName: "DIV" } })).toBe("advance");
    expect(dialogueKeyAction({ key: "ArrowRight", target: { tagName: "div" } })).toBe("advance");
    expect(dialogueKeyAction({ key: " ", target: null })).toBe("advance");
  });

  it("identifies the dialogue sequence by authored content, not frame identity", () => {
    const key = dialogueSequenceKey(frame(TWO));
    expect(key.length).toBeGreaterThan(0);
    // A structurally equal frame (a re-render that rebuilt the object) keeps the key.
    expect(dialogueSequenceKey(frame(TWO.map((entry) => ({ ...entry }))))).toBe(key);
    // A different authored sequence is a different key.
    expect(dialogueSequenceKey(frame([TWO[0]]))).not.toBe(key);
    expect(dialogueSequenceKey(frame([line("d1", "Другой текст"), TWO[1]]))).not.toBe(key);
    // A republished revision is a different key even with the same lines.
    expect(dialogueSequenceKey(frame(TWO, { contentHash: "b".repeat(64) }))).not.toBe(key);
    // A frame without dialogue has no sequence.
    expect(dialogueSequenceKey(frame([]))).toBe("");
  });

  it("survives a frame re-render: the same authored sequence keeps the position", () => {
    const first = frame(TWO);
    const started = initializeSequenceProgress(dialogueSequenceKey(first));
    const advanced = advanceDialogueOnInput(started, first, { id: "input-1" });
    expect(activeDialogueLine(first, advanced)?.lineId).toBe("d2");

    // Re-render: a brand-new frame object with the same authored content.
    const rerendered = frame(TWO.map((entry) => ({ ...entry })));
    const afterRerender = reconcileSequenceProgress(advanced, dialogueSequenceKey(rerendered), dialogueLinesOf(rerendered).length);
    expect(afterRerender.index).toBe(1);
    expect(activeDialogueLine(rerendered, afterRerender)?.lineId).toBe("d2");

    // A different scene resets the position, it does not keep the old index.
    const other = frame([line("o1", "Другая сцена")], { title: "Двор" });
    const reset = reconcileSequenceProgress(afterRerender, dialogueSequenceKey(other), dialogueLinesOf(other).length);
    expect(reset.index).toBe(0);
    expect(activeDialogueLine(other, reset)?.lineId).toBe("o1");
  });

  it("advances exactly one line per input event and never past the last line", () => {
    const key = dialogueSequenceKey(frame(TWO));
    const first = initializeSequenceProgress(key);
    const input = { nativeEvent: 1 };

    const once = advanceSequenceProgress(first, key, TWO.length, input);
    expect(once.index).toBe(1);
    // The very same input event must not advance twice (click bubbling / duplicate handler).
    const twice = advanceSequenceProgress(once, key, TWO.length, input);
    expect(twice.index).toBe(1);
    expect(twice).toEqual(once);

    const next = advanceSequenceProgress(twice, key, TWO.length, { nativeEvent: 2 });
    expect(next.index).toBe(2);
    // Past the last line the position stays put instead of wrapping to the first.
    const past = advanceSequenceProgress(next, key, TWO.length, { nativeEvent: 3 });
    expect(past.index).toBe(TWO.length);
    expect(activeDialogueLine(frame(TWO), past)).toBeNull();
    expect(isLastSequenceStep(next, TWO.length)).toBe(true);
    expect(isLastSequenceStep(twice, TWO.length)).toBe(true);
    expect(isLastSequenceStep(first, TWO.length)).toBe(false);
  });

  it("keeps the authored speaker id and never invents a speaker name", () => {
    const value = activeDialogueLine(frame(TWO), { sequenceKey: dialogueSequenceKey(frame(TWO)), index: 1, consumedInput: null });
    expect(value?.speakerId).toBe("keeper");
    expect(value && "speaker" in value).toBe(false);
    expect(value && "speakerName" in value).toBe(false);
  });

  it("paces intro screens with the same sequence rules", () => {
    const frames = [frame(TWO, { kind: "intro", title: "Пролог" }), frame(TWO, { kind: "intro", title: "Второе вступление" })];
    const key = introSequenceKey(frames);
    expect(key.length).toBeGreaterThan(0);
    expect(introSequenceKey(frames.map((entry) => ({ ...entry })))).toBe(key);
    expect(introSequenceKey([frames[1]])).not.toBe(key);
    expect(introSequenceKey([])).toBe("");

    const first = initializeSequenceProgress(key);
    expect(activeIntroFrame(frames, first)?.title).toBe("Пролог");
    const second = advanceIntroOnInput(first, frames, { id: "next" });
    expect(activeIntroFrame(frames, second)?.title).toBe("Второе вступление");
    // The last page stays on the last page; "Начать" is the terminal control.
    expect(isLastSequenceStep(second, frames.length)).toBe(true);
    expect(advanceIntroOnInput(second, frames, { id: "next-2" }).index).toBe(frames.length);
    expect(introSequenceKey(frames)).toBe(key);
  });
});
