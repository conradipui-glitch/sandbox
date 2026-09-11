/**
 * FIN-05 site slice: player-side semantics for the authored story screens —
 * the dialogue lines of a scene and the paging of the authored intro screens.
 *
 * The contract carries the data (`MissionScene.dialogue`, `MissionIntroScreen[]`);
 * this module carries only the player's rules over it:
 *
 * - advancing is an authored-content sequence, identified by the authored
 *   content (`contentHash` + the lines themselves), so a frame that is rebuilt
 *   on re-render keeps the player's position;
 * - one input event moves the sequence forward at most once, even when the same
 *   native event reaches two handlers (a control that bubbles to its container);
 * - nothing here spends a gameplay turn: paging an intro is local to the player.
 *
 * Mirrors the Studio's strict-modifier rule (`screenKeyAction` in
 * `apps/studio/src/screen-composition.ts`): service combinations are not captured.
 */

import type { PreviewDialogueLineView, PreviewFrameView } from "./view-model";

const ADVANCE_KEYS = new Set(["ArrowRight", "ArrowDown", "Enter", " ", "PageDown"]);

export type DialogueKeyAction = "advance";

export interface DialogueKeyEvent {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  /**
   * The event target. A key raised by a control that activates itself (the
   * focused "Далее" button) is left to that control, so one key press never
   * advances two lines. Typed as `unknown` so any host event shape is accepted
   * without pulling a DOM lib into the shared module.
   */
  readonly target?: unknown;
}

const SELF_ACTIVATING = new Set(["BUTTON", "A", "INPUT", "TEXTAREA", "SELECT"]);

export function dialogueKeyAction(event: DialogueKeyEvent): DialogueKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = (event.target ?? null) as { readonly tagName?: unknown; readonly isContentEditable?: unknown } | null;
  const tag = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : null;
  if (tag !== null && SELF_ACTIVATING.has(tag)) return null;
  if (target?.isContentEditable === true) return null;
  return ADVANCE_KEYS.has(event.key) ? "advance" : null;
}

/** The player's position inside one authored sequence. */
export interface SequenceProgress {
  /** Identity of the authored sequence (content, not object identity). */
  readonly sequenceKey: string;
  readonly index: number;
  /** Identity of the last input event already consumed by this sequence. */
  readonly consumedInput: object | null;
}

function sequenceMax(length: number): number {
  return Number.isSafeInteger(length) && length > 0 ? length : 0;
}

export function initializeSequenceProgress(sequenceKey: string): SequenceProgress {
  return { sequenceKey, index: 0, consumedInput: null };
}

/**
 * Re-anchors a position to the sequence actually being rendered. A frame that
 * merely re-rendered keeps its key and therefore its position; a different
 * authored screen starts from the beginning.
 */
export function reconcileSequenceProgress(
  progress: SequenceProgress,
  sequenceKey: string,
  length: number
): SequenceProgress {
  if (progress.sequenceKey !== sequenceKey) return initializeSequenceProgress(sequenceKey);
  const max = sequenceMax(length);
  return progress.index > max ? { ...progress, index: max } : progress;
}

/**
 * Moves one step forward. The same input event is consumed only once, and the
 * sequence stops at the end instead of wrapping around.
 */
export function advanceSequenceProgress(
  progress: SequenceProgress,
  sequenceKey: string,
  length: number,
  input: object
): SequenceProgress {
  const current = reconcileSequenceProgress(progress, sequenceKey, length);
  if (current.consumedInput === input) return current;
  const max = sequenceMax(length);
  if (max === 0) return { ...current, consumedInput: input };
  return { sequenceKey: current.sequenceKey, index: Math.min(max, current.index + 1), consumedInput: input };
}

/** True when the position is on (or past) the last step; an empty sequence is terminal. */
export function isLastSequenceStep(progress: SequenceProgress, length: number): boolean {
  const max = sequenceMax(length);
  return max === 0 || progress.index >= max - 1;
}

// --- Authored dialogue of a scene ---

export function dialogueLinesOf(frame: PreviewFrameView): readonly PreviewDialogueLineView[] {
  return frame.dialogue ?? [];
}

/**
 * Identity of the authored dialogue sequence. Includes the lines themselves, so
 * an edited line is a different sequence while a rebuilt frame object is not.
 */
export function dialogueSequenceKey(frame: PreviewFrameView): string {
  const lines = dialogueLinesOf(frame);
  if (lines.length === 0) return "";
  const authored = lines.map((line) => `${line.lineId}\u001f${line.speakerId ?? ""}\u001f${line.text}`).join("\u001e");
  return [frame.contentHash, frame.kind, frame.title, authored].join("\u0000");
}

export function activeDialogueLine(frame: PreviewFrameView, progress: SequenceProgress): PreviewDialogueLineView | null {
  const lines = dialogueLinesOf(frame);
  const index = progress.index;
  return Number.isSafeInteger(index) && index >= 0 && index < lines.length ? lines[index] : null;
}

export function advanceDialogueOnInput(
  progress: SequenceProgress,
  frame: PreviewFrameView,
  input: object
): SequenceProgress {
  return advanceSequenceProgress(progress, dialogueSequenceKey(frame), dialogueLinesOf(frame).length, input);
}

// --- Authored intro screens ---

/** Identity of the authored intro sequence; an empty list has no sequence. */
export function introSequenceKey(frames: readonly PreviewFrameView[]): string {
  if (frames.length === 0) return "";
  const authored = frames.map((frame) => `${frame.title}\u001f${frame.text}`).join("\u001e");
  return [frames[0].contentHash, frames[0].kind, authored].join("\u0000");
}

export function activeIntroFrame(
  frames: readonly PreviewFrameView[],
  progress: SequenceProgress
): PreviewFrameView | null {
  const index = progress.index;
  return Number.isSafeInteger(index) && index >= 0 && index < frames.length ? frames[index] : null;
}

export function advanceIntroOnInput(
  progress: SequenceProgress,
  frames: readonly PreviewFrameView[],
  input: object
): SequenceProgress {
  return advanceSequenceProgress(progress, introSequenceKey(frames), frames.length, input);
}
