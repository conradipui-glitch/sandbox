import type {
  MissionCardView,
  PreviewChoiceView,
  PreviewFrameView
} from "./view-model";
import { isSafePreviewUrl, layerAnimationClass, layerOuterStyle } from "./stage-model";

export function MissionSceneStage({ frame, paused }: { frame: PreviewFrameView; paused?: boolean }) {
  const ordered = [...frame.scene.layers]
    .filter((layer) => layer.visible)
    .sort((a, b) => a.z - b.z);
  return (
    <section className="mp-stage" aria-label={`Сцена: ${frame.title}`} data-paused={paused ? "1" : undefined}>
      {frame.scene.backgroundUrl && isSafePreviewUrl(frame.scene.backgroundUrl) ? (
        <img
          className="mp-background"
          src={frame.scene.backgroundUrl as string}
          alt=""
          data-fit={frame.scene.backgroundFit}
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

export function MissionEndingScreen({ frame, onExit }: { frame: PreviewFrameView; onExit: () => void }) {
  return (
    <section className="mp-ending" aria-label={`Финал: ${frame.title}`}>
      <MissionSceneStage frame={{ ...frame, choices: [] }} paused />
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
