import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MissionCardView,
  PreviewChoiceView,
  PreviewFrameView
} from "./view-model";
import { resolveScreenMusic } from "./screen-composition";
import {
  activeDialogueLine,
  activeIntroFrame,
  advanceIntroOnInput,
  advanceSequenceProgress,
  dialogueKeyAction,
  dialogueLinesOf,
  dialogueSequenceKey,
  initializeSequenceProgress,
  introSequenceKey,
  isLastSequenceStep,
  reconcileSequenceProgress,
  type SequenceProgress
} from "./story-screen";
import { backgroundDataAttributes, backgroundStyle, isSafePreviewUrl, layerAnimationClass, layerOuterStyle } from "./stage-model";

/**
 * The player's input events, described structurally. The shared module is also
 * type-checked by the worker project, which has no DOM lib, so React's own DOM
 * event types are not referenced here.
 */
interface PointerInputEvent {
  readonly nativeEvent: object;
  readonly stopPropagation?: () => void;
}

interface KeyInputEvent {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly target?: unknown;
  readonly nativeEvent: object;
}

/**
 * Minimal surface of the audio element used here. This shared module is also
 * type-checked by the worker project, which has no DOM lib, so the element is
 * bound through a callback ref and handled as this narrow interface.
 */
interface PlayableAudio {
  volume: number;
  muted: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export interface MissionMusicControls {
  readonly muted: boolean;
  readonly onToggleMute: () => void;
}

/**
 * Plays the authored music of a screen. The track is the one the author saved
 * on the screen; the state follows the real mute toggle and the browser's
 * autoplay decision (a blocked track offers "Играть" instead of pretending).
 */
export function MissionMusic({ url, title, muted, onToggleMute }: { url: string; title: string | null; muted: boolean; onToggleMute: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const resolved = resolveScreenMusic({ hasTrack: true, muted, autoplayAllowed: !blocked });
  const audioRef = useRef<PlayableAudio | null>(null);
  const bindAudio = useCallback((element: unknown) => {
    audioRef.current = (element as PlayableAudio | null) ?? null;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.22;
    audio.muted = resolved.state === "muted" || resolved.state === "blocked";
    if (resolved.shouldPlay) Promise.resolve(audio.play()).catch(() => setBlocked(true));
    else audio.pause();
  }, [resolved.state, resolved.shouldPlay]);

  if (!isSafePreviewUrl(url)) return null;
  return (
    <div className="mp-music" data-music-state={resolved.state}>
      <audio ref={bindAudio} className="mp-music-audio" src={url} loop preload="auto" />
      <span className="mp-music-title">{title && title.length > 0 ? title : "Музыка сцены"}</span>
      {resolved.state === "blocked" ? (
        <button type="button" className="mp-music-button" onClick={() => setBlocked(false)}>
          Играть
        </button>
      ) : (
        <button type="button" className="mp-music-button" aria-pressed={resolved.state === "muted"} onClick={onToggleMute}>
          {resolved.state === "muted" ? "Включить звук" : "Выключить звук"}
        </button>
      )}
      <span className="mp-music-state">{resolved.label}</span>
    </div>
  );
}

/**
 * Minimal surface of the loaded background image: the real dimensions of the
 * authored material, which is what turns the fit/focal projection into an exact
 * crop. Bound through a callback ref/event because the worker project that
 * type-checks this module has no DOM lib.
 */
interface MeasurableImage {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export function MissionSceneStage({ frame, paused, music }: { frame: PreviewFrameView; paused?: boolean; music?: MissionMusicControls }) {
  const ordered = [...frame.scene.layers]
    .filter((layer) => layer.visible)
    .sort((a, b) => a.z - b.z);
  const backgroundUrl = frame.scene.backgroundUrl;
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  useEffect(() => {
    // A different screen is a different asset: nothing carries over.
    setMeasuredAspect(null);
  }, [backgroundUrl]);
  const scene = { ...frame.scene, backgroundAspect: measuredAspect ?? frame.scene.backgroundAspect ?? null };
  const measureBackground = useCallback((event: unknown) => {
    // Narrowed by hand: the shared module must not depend on the DOM lib.
    const element = (event as { readonly currentTarget?: MeasurableImage } | null)?.currentTarget;
    if (element && element.naturalWidth > 0 && element.naturalHeight > 0) {
      setMeasuredAspect(element.naturalWidth / element.naturalHeight);
    }
  }, []);
  return (
    <section className="mp-stage" aria-label={`Сцена: ${frame.title}`} data-paused={paused ? "1" : undefined} data-animation-preset={frame.scene.animationPreset ?? "none"}>
      {backgroundUrl && isSafePreviewUrl(backgroundUrl) ? (
        <img
          className="mp-background"
          src={backgroundUrl as string}
          alt=""
          style={backgroundStyle(scene)}
          data-background-source={frame.scene.backgroundSource ?? "own"}
          {...backgroundDataAttributes(scene)}
          onLoad={measureBackground}
        />
      ) : (
        <div className="mp-background mp-background-empty" aria-hidden="true" />
      )}
      <div className="mp-grid" aria-hidden="true" />
      {ordered.map((layer) => (
        <div key={layer.id} className="mp-layer" style={layerOuterStyle(layer)} data-layer-id={layer.id}>
          <div className={layerAnimationClass(layer)}>
            {layer.kind === "text" ? (
              <p className="mp-layer-text">{layer.name}</p>
            ) : layer.assetUrl && isSafePreviewUrl(layer.assetUrl) ? (
              <img src={layer.assetUrl} alt={layer.assetAlt} draggable={false} />
            ) : (
              <div className="mp-layer-missing" role="img" aria-label={`Слой без изображения: ${layer.name}`} />
            )}
          </div>
        </div>
      ))}
      {dialogueLinesOf(frame).length > 0 ? <MissionDialogue frame={frame} disabled={paused} /> : null}
      {music && frame.scene.musicUrl ? (
        <MissionMusic url={frame.scene.musicUrl} title={frame.scene.musicTitle} muted={music.muted} onToggleMute={music.onToggleMute} />
      ) : null}
      <div className="mp-caption">
        <span>{frame.title}</span>
      </div>
    </section>
  );
}

/**
 * Plays the scene's authored dialogue, one line at a time and in author order.
 * Click/tap on the line, the advance key (Enter/Space/arrows/PageDown), or the
 * control advance it. The position is keyed by the authored dialogue, so a
 * re-rendered frame does not restart it, and a single input event advances at
 * most once. A paused stage (busy turn, authoring preview) neither advances nor
 * animates, and reduced motion only affects the reveal animation, not advancing.
 */
export function MissionDialogue({
  frame,
  disabled,
  onAdvance
}: {
  frame: PreviewFrameView;
  disabled?: boolean;
  onAdvance?: () => void;
}) {
  const lines = dialogueLinesOf(frame);
  const sequenceKey = dialogueSequenceKey(frame);
  const [stored, setStored] = useState<SequenceProgress>(() => initializeSequenceProgress(sequenceKey));
  const progress = reconcileSequenceProgress(stored, sequenceKey, lines.length);
  const line = activeDialogueLine(frame, progress);
  const last = isLastSequenceStep(progress, lines.length);
  const advance = useCallback(
    (input: object) => {
      if (disabled) return;
      setStored((current) => advanceSequenceProgress(current, sequenceKey, lines.length, input));
    },
    [disabled, sequenceKey, lines.length]
  );

  if (lines.length === 0 || !line) return null;

  const onPointer = (event: PointerInputEvent) => {
    if (disabled) return;
    advance(event.nativeEvent);
  };
  const onKey = (event: KeyInputEvent) => {
    if (disabled) return;
    if (dialogueKeyAction(event) === "advance") advance(event.nativeEvent);
  };
  // The control stops the container click so one press cannot advance twice;
  // both handlers also pass the same native event, which the guard dedupes.
  const onControl = (event: PointerInputEvent) => {
    event.stopPropagation?.();
    if (last) onAdvance?.();
    else advance(event.nativeEvent);
  };

  return (
    <div
      className="mp-dialogue"
      role="group"
      aria-label="Реплики сцены"
      tabIndex={0}
      data-dialogue-line={line.lineId}
      data-dialogue-index={progress.index}
      data-dialogue-count={lines.length}
      data-dialogue-last={last ? "1" : undefined}
      data-dialogue-paused={disabled ? "1" : undefined}
      data-speaker-id={line.speakerId ?? undefined}
      onClick={onPointer}
      onKeyDown={onKey}
    >
      <p className="mp-dialogue-text">{line.text}</p>
      <div className="mp-dialogue-controls">
        <span className="mp-dialogue-progress">{`${progress.index + 1} / ${lines.length}`}</span>
        <button type="button" className="mp-dialogue-advance" disabled={disabled} onClick={onControl}>
          {last ? "Начать" : "Далее"}
        </button>
      </div>
    </div>
  );
}

export function MissionChoicePanel({
  choices,
  onChoose,
  disabled
}: {
  choices: readonly PreviewChoiceView[];
  onChoose: (choiceId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mp-choices" role="group" aria-label="Выбор игрока">
      {choices.map((choice) => (
        <button
          key={choice.choiceId}
          type="button"
          className="mp-choice"
          disabled={disabled}
          onClick={() => onChoose(choice.choiceId)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/**
 * One authored intro screen. When it belongs to a multi-page intro the control
 * pages on with "Далее"; the last page offers "Начать".
 */
export function MissionIntroScreen({
  frame,
  onBegin,
  onNext
}: {
  frame: PreviewFrameView;
  onBegin: () => void;
  onNext?: (input: object) => void;
}) {
  const page = frame.introPage;
  // "Далее" only makes sense when the host can actually page on; otherwise the
  // screen offers "Начать" rather than a control that does nothing.
  const hasNext = page !== undefined && page.hasNext === true && onNext !== undefined;
  return (
    <section
      className="mp-intro"
      aria-label={`Вступление: ${frame.title}`}
      data-intro-index={page ? page.index : 0}
      data-intro-count={page ? page.count : 1}
    >
      <MissionSceneStage frame={{ ...frame, choices: [] }} paused />
      <div className="mp-intro-body">
        <h1>{frame.title}</h1>
        <p>{frame.text}</p>
        {page ? <span className="mp-intro-progress">{`${page.index + 1} / ${page.count}`}</span> : null}
        {hasNext ? (
          <button type="button" className="mp-primary mp-intro-next" onClick={(event) => onNext?.(event.nativeEvent)}>
            Далее
          </button>
        ) : (
          <button type="button" className="mp-primary mp-intro-begin" onClick={() => onBegin()}>
            Начать
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Pages through the authored intro screens. Paging is local to the player — it
 * never spends a gameplay turn; "Начать" on the last page is the host's own
 * action. The position is keyed by the authored intro sequence, so a re-rendered
 * list of frames keeps the page the player is on.
 */
export function MissionIntroPager({
  frames,
  onBegin
}: {
  frames: readonly PreviewFrameView[];
  onBegin: () => void;
}) {
  const sequenceKey = introSequenceKey(frames);
  const [stored, setStored] = useState<SequenceProgress>(() => initializeSequenceProgress(sequenceKey));
  const progress = reconcileSequenceProgress(stored, sequenceKey, frames.length);
  const advance = useCallback(
    (input: object) => {
      setStored((current) => advanceIntroOnInput(current, frames, input));
    },
    [frames]
  );
  const active = activeIntroFrame(frames, progress);
  if (!active) return null;
  return <MissionIntroScreen key={active.title} frame={active} onBegin={onBegin} onNext={advance} />;
}

export function MissionEndingScreen({ frame, onExit, music }: { frame: PreviewFrameView; onExit: () => void; music?: MissionMusicControls }) {
  return (
    <section className="mp-ending" aria-label={`Финал: ${frame.title}`}>
      <MissionSceneStage frame={{ ...frame, choices: [] }} paused music={music} />
      <div className="mp-ending-body">
        <h1>{frame.title}</h1>
        <p>{frame.text}</p>
        <button type="button" className="mp-primary" onClick={onExit}>
          К списку миссий
        </button>
      </div>
    </section>
  );
}

export function MissionCard({ card, onOpen }: { card: MissionCardView; onOpen: () => void }) {
  return (
    <article className="mp-card" data-status={card.status}>
      {card.coverUrl && isSafePreviewUrl(card.coverUrl) ? (
        <img className="mp-card-cover" src={card.coverUrl} alt="" />
      ) : (
        <div className="mp-card-cover mp-card-cover-empty" aria-hidden="true">
          <span>Добавить обложку</span>
        </div>
      )}
      <div className="mp-card-body">
        <h2>{card.title}</h2>
        <p>{card.summary}</p>
        <small>
          {card.period} · {card.place} · {card.playerRole} · ~{card.estimatedMinutes} мин
        </small>
        <button type="button" className="mp-primary" onClick={onOpen}>
          Играть
        </button>
      </div>
    </article>
  );
}
