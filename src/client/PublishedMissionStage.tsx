import { useCallback, useState } from "react";
import {
  MissionChoicePanel,
  MissionEndingScreen,
  MissionIntroPager,
  MissionSceneStage,
  type MissionMusicControls
} from "../shared/mission-presentation/components";
import type {
  GameState,
  PublishedMissionHistoryView,
  PublishedMissionRuntimeView,
  TurnSubmission
} from "../shared/types";
import "../shared/mission-presentation/tokens.css";

const MUSIC_MUTED_KEY = "living-history-music-muted";

function readStoredMute(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUSIC_MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

/** A published mission is rendered only from its pinned authored frame/runtime. */
export function isPublishedMissionGame(state: GameState): boolean {
  return state.presentation?.kind === "published-mission";
}

export function missionChoiceSubmission(choiceId: string): TurnSubmission {
  return { action: choiceId, source: "prepared", optionId: choiceId };
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0";
}

function resourceTitle(runtime: PublishedMissionRuntimeView, resourceId: string): string {
  return runtime.resources.find((entry) => entry.id === resourceId)?.title ?? resourceId;
}

function PublishedResourcePanel({ runtime }: { runtime: PublishedMissionRuntimeView }) {
  return (
    <aside className="mp-runtime-rail" aria-label="Состояние мира">
      <h2>Состояние мира</h2>
      <p className="mp-runtime-help">Только значения подтверждённой игровой сессии. Изменения показаны после каждого решения.</p>
      <div className="mp-runtime-resources">
        {runtime.resources.map((resource) => (
          <article className="mp-runtime-resource" key={resource.id}>
            <div><strong>{resource.title}</strong><span>{`${resource.value} / ${resource.max} ${resource.unit}`}</span></div>
            <meter min={resource.min} max={resource.max} value={resource.value}>{resource.value}</meter>
            {resource.delta !== 0 ? <small data-delta={resource.delta > 0 ? "up" : "down"}>{`${signed(resource.delta)} после решения`}</small> : <small>Без изменений</small>}
            <p>{resource.description}</p>
          </article>
        ))}
      </div>
      <section className="mp-runtime-participants" aria-label="Участники">
        <h3>Участники</h3>
        {runtime.participants.map((participant) => (
          <article key={participant.id}>
            <strong>{participant.title}</strong>
            <p>{participant.description}</p>
            {participant.locationTitle ? <small>Сейчас: {participant.locationTitle}</small> : null}
          </article>
        ))}
      </section>
    </aside>
  );
}

function ResolutionDeltas({ runtime, entry }: { runtime: PublishedMissionRuntimeView; entry: PublishedMissionHistoryView }) {
  if (entry.deltas.length === 0) return <p className="mp-resolution-neutral">Состояние мира не изменилось.</p>;
  return (
    <ul className="mp-resolution-deltas">
      {entry.deltas.map((delta) => (
        <li key={delta.resourceId} data-delta={delta.delta > 0 ? "up" : "down"}>
          <span>{resourceTitle(runtime, delta.resourceId)}</span><strong>{signed(delta.delta)}</strong>
        </li>
      ))}
    </ul>
  );
}

function PublishedResolution({ runtime }: { runtime: PublishedMissionRuntimeView }) {
  const result = runtime.lastResolution;
  if (!result) return null;
  return (
    <section className="mp-resolution" aria-label="После вашего решения">
      <span className="mp-eyebrow">После вашего решения</span>
      <h2>{result.choiceLabel}</h2>
      <p>История перешла от сцены «{result.fromTitle}» к сцене «{result.toTitle}».</p>
      <ResolutionDeltas runtime={runtime} entry={result} />
    </section>
  );
}

function PublishedChronicle({ runtime }: { runtime: PublishedMissionRuntimeView }) {
  return (
    <aside className="mp-runtime-chronicle" aria-label="События истории">
      <h2>События истории</h2>
      {runtime.history.length === 0 ? (
        <p className="mp-runtime-empty">История началась. Первое решение будет записано здесь.</p>
      ) : (
        <ol>
          {[...runtime.history].reverse().map((entry) => (
            <li key={entry.id}>
              <small>Ход {entry.turn}</small>
              <strong>{entry.choiceLabel}</strong>
              <span>{entry.toTitle}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

function PublishedThinking() {
  return (
    <div className="mp-thinking" role="status" aria-live="polite">
      <div className="mp-thinking-orbit" aria-hidden="true"><i /><i /><i /></div>
      <div className="mp-thinking-card">
        <span>Несколько последствий сходятся в одной сцене</span>
        <strong>Мир отвечает на ваше решение</strong>
        <p>История применяет последствия</p>
      </div>
    </div>
  );
}

function PublishedHeader({ state, onExit, intro = false }: { state: GameState; onExit: () => void; intro?: boolean }) {
  return (
    <header className="mp-published-header">
      <button type="button" className="mp-published-back" onClick={onExit}>← К списку миссий</button>
      <div className="mp-published-identity">
        <span>{intro ? "Вступление" : state.scenarioTitle}</span>
        <small>{intro ? state.scenarioTitle : state.role}</small>
      </div>
      <div className="mp-published-turn">{intro ? "Вступление" : state.status === "active" ? `Ход ${state.turn + 1}` : "Финал"}</div>
    </header>
  );
}

export function PublishedMissionStage({
  state,
  onTurn,
  onExit,
  busy
}: {
  state: GameState;
  onTurn: (submission: TurnSubmission) => void;
  onExit: () => void;
  busy: boolean;
}) {
  const [muted, setMuted] = useState(readStoredMute);
  const [introsSeen, setIntrosSeen] = useState(false);
  const toggleMusic = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem(MUSIC_MUTED_KEY, String(next));
      } catch {
        /* storage may be unavailable; the in-memory toggle still works */
      }
      return next;
    });
  }, []);
  const music: MissionMusicControls = { muted, onToggleMute: toggleMusic };

  const presentation = state.presentation;
  const frame = presentation?.frame;
  if (!frame) return null;

  const intros = presentation?.intros ?? [];
  if (!introsSeen && intros.length > 0 && frame.turn === 0) {
    return (
      <main className="mp-published mp-published-intro" data-scenario-ref={state.scenarioId}>
        <PublishedHeader state={state} onExit={onExit} intro />
        <MissionIntroPager frames={intros} onBegin={() => setIntrosSeen(true)} />
      </main>
    );
  }

  const runtime = presentation?.runtime;
  if (frame.kind === "ending") {
    return (
      <main className="mp-published" data-scenario-ref={state.scenarioId}>
        <PublishedHeader state={state} onExit={onExit} />
        <div className="mp-runtime-layout">
          {runtime ? <PublishedResourcePanel runtime={runtime} /> : <aside className="mp-runtime-rail mp-runtime-unavailable">Состояние мира недоступно для этого выпуска.</aside>}
          <section className="mp-runtime-main"><PublishedResolution runtime={runtime ?? { resources: [], participants: [], history: [], lastResolution: null }} /><MissionEndingScreen frame={frame} onExit={onExit} music={music} /></section>
          {runtime ? <PublishedChronicle runtime={runtime} /> : <aside className="mp-runtime-chronicle mp-runtime-unavailable">Хроника начнётся в следующем выпуске.</aside>}
        </div>
      </main>
    );
  }

  return (
    <main className="mp-published" data-scenario-ref={state.scenarioId}>
      <PublishedHeader state={state} onExit={onExit} />
      {state.contentSource === "pinned" && (
        <p className="mp-pinned-notice" role="status">
          Движок сейчас недоступен: история продолжается на закреплённой версии этой миссии. Новые ходы отправятся, как только движок ответит.
        </p>
      )}
      <div className="mp-runtime-layout">
        {runtime ? <PublishedResourcePanel runtime={runtime} /> : <aside className="mp-runtime-rail mp-runtime-unavailable">Состояние мира недоступно для этого выпуска.</aside>}
        <div className="mp-runtime-main">
          <MissionSceneStage frame={frame} paused={busy} music={music} />
          {runtime ? <PublishedResolution runtime={runtime} /> : null}
          <section className="mp-published-body">
            <span className="mp-eyebrow">Сцена {state.turn + 1}</span>
            <h1>{frame.title}</h1>
            <p>{frame.text}</p>
          </section>
          <section className="mp-decision" aria-label="Что вы сделаете">
            <h2>Что вы сделаете?</h2>
            <MissionChoicePanel choices={frame.choices} disabled={busy} onChoose={(choiceId) => onTurn(missionChoiceSubmission(choiceId))} />
          </section>
        </div>
        {runtime ? <PublishedChronicle runtime={runtime} /> : <aside className="mp-runtime-chronicle mp-runtime-unavailable">Хроника начнётся в следующем выпуске.</aside>}
      </div>
      {busy ? <PublishedThinking /> : null}
    </main>
  );
}
