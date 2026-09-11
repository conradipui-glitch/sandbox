import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MissionCardView,
  PreviewChoiceView,
  PreviewFrameView
} from "./view-model";
import { resolveScreenMusic } from "./screen-composition";
import { backgroundDataAttributes, backgroundStyle, isSafePreviewUrl, layerAnimationClass, layerOuterStyle } from "./stage-model";

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
      {music && frame.scene.musicUrl ? (
        <MissionMusic url={frame.scene.musicUrl} title={frame.scene.musicTitle} muted={music.muted} onToggleMute={music.onToggleMute} />
      ) : null}
      <div className="mp-caption">
        <span>{frame.title}</span>
      </div>
    </section>
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

export function MissionIntroScreen({ frame, onBegin }: { frame: PreviewFrameView; onBegin: () => void }) {
  return (
    <section className="mp-intro" aria-label={`Вступление: ${frame.title}`}>
      <MissionSceneStage frame={{ ...frame, choices: [] }} paused />
      <div className="mp-intro-body">
        <h1>{frame.title}</h1>
        <p>{frame.text}</p>
        <button type="button" className="mp-primary" onClick={onBegin}>
          Начать
        </button>
      </div>
    </section>
  );
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
