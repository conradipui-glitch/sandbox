import {
  MissionChoicePanel,
  MissionEndingScreen,
  MissionIntroScreen,
  MissionSceneStage
} from "../shared/mission-presentation/components";
import type { GameState, TurnSubmission } from "../shared/types";
import "../shared/mission-presentation/tokens.css";

/**
 * R03: a published authored mission renders through the shared mission
 * renderer. The legacy scenario art is never used as a fallback for it.
 */
export function isPublishedMissionGame(state: GameState): boolean {
  return state.presentation?.kind === "published-mission";
}

export function missionChoiceSubmission(choiceId: string): TurnSubmission {
  return { action: choiceId, source: "prepared", optionId: choiceId };
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
  const frame = state.presentation?.frame;
  if (!frame) return null;
  if (frame.kind === "ending") return <MissionEndingScreen frame={frame} onExit={onExit} />;
  if (frame.kind === "intro") return <MissionIntroScreen frame={frame} onBegin={() => onTurn({ action: "begin", source: "prepared" })} />;
  return (
    <main className="mp-published" data-scenario-ref={state.scenarioId}>
      <header className="mp-published-header">
        <button type="button" className="mp-primary" onClick={onExit}>К списку миссий</button>
        <div>
          <span>{state.scenarioTitle}</span>
          <small>{state.role} · Ход {frame.turn}</small>
        </div>
      </header>
      {state.contentSource === "pinned" && (
        <p className="mp-pinned-notice" role="status">
          Движок сейчас недоступен: история продолжается на закреплённой версии этой миссии. Новые ходы отправятся, как только движок ответит.
        </p>
      )}
      <MissionSceneStage frame={frame} paused={busy} />
      <section className="mp-published-body">
        <h1>{frame.title}</h1>
        <p>{frame.text}</p>
      </section>
      <MissionChoicePanel
        choices={frame.choices}
        disabled={busy}
        onChoose={(choiceId) => onTurn(missionChoiceSubmission(choiceId))}
      />
    </main>
  );
}
