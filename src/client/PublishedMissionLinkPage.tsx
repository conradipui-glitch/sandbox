import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { GameMode, GameState, TurnSubmission } from "../shared/types";
import { api, ApiError } from "./api";
import { PublishedMissionStage } from "./PublishedMissionStage";
import { publishedLinkStateIsAuthored } from "./published-mission-link";
import { failureMessage, RetryToast, shouldDropSession } from "./upstream-notices";

const sessionStorageKey = "living-history-session";

/**
 * A publication link is always a *short chronicle* of one authored mission: the
 * engine's listing advertises `choice`/`free-input`, not the site's history
 * length, so the link starts the mission in its own default mode.
 */
export const PUBLISHED_LINK_MODE: GameMode = "chronicle";

export type PublishedLinkPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "playing"; readonly state: GameState }
  | { readonly kind: "not-found"; readonly message: string }
  | { readonly kind: "unavailable"; readonly message: string };

/**
 * A link that names nothing published is a 404; anything that is not the
 * published mission's own 404 (a timeout, an upstream 5xx, a broken catalog) is
 * an explicit unavailable state with a retry, never a silent empty page.
 */
export function publishedLinkFailure(cause: unknown): PublishedLinkPhase {
  if (cause instanceof ApiError && cause.status === 404) {
    // The engine's own wording is English and belongs to the API; the player
    // reads the site, so a 404 says in the player's language what happened.
    return {
      kind: "not-found",
      message: "Такой опубликованной миссии нет: возможно, выпуск отозвали или ссылка скопирована не полностью.",
    };
  }
  return {
    kind: "unavailable",
    message: failureMessage(cause, "Публикации сейчас недоступны. Попробуйте ещё раз."),
  };
}

/** The states a publication link can show before the mission itself is on screen. */
export function PublishedMissionLinkView({
  phase,
  busy,
  onRetry,
}: {
  phase: Exclude<PublishedLinkPhase, { kind: "playing" }>;
  busy: boolean;
  onRetry: () => void;
}) {
  if (phase.kind === "loading") {
    return (
      <main className="mission-link shell">
        <div className="mission-link-card" role="status">
          <span className="mission-link-kicker">Опубликованная миссия</span>
          <h1>Открываем миссию…</h1>
          <p>Сайт спрашивает каталог публикаций и готовит сессию ровно той версии, которую выпустил автор.</p>
          <div className="mission-link-actions"><LoaderCircle className="spin" size={20} /></div>
        </div>
      </main>
    );
  }

  if (phase.kind === "not-found") {
    return (
      <main className="mission-link shell">
        <div className="mission-link-card" role="alert">
          <span className="mission-link-kicker">404 · ссылка не найдена</span>
          <h1>Опубликованная миссия не найдена</h1>
          <p>{phase.message}</p>
          <div className="mission-link-actions">
            <a className="mission-link-button" href="/">К списку историй</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mission-link shell">
      <div className="mission-link-card" role="alert">
        <span className="mission-link-kicker">Публикации недоступны</span>
        <h1>Не удалось открыть опубликованную миссию</h1>
        <p>{phase.message}</p>
        <div className="mission-link-actions">
          <button type="button" onClick={onRetry} disabled={busy}>
            <RefreshCw className={busy ? "spin" : undefined} size={17} /> Повторить
          </button>
          <a className="mission-link-button" href="/">К списку историй</a>
        </div>
      </div>
    </main>
  );
}

/**
 * The page behind `/p/<identifier>/`.
 *
 * The path is the contract: the identifier is resolved against the published
 * catalog, and the session is then started through the ordinary public
 * `POST /api/games` with the mission's canonical `publicMissionId`. The authored
 * presentation discriminator is verified before anything is rendered, so a
 * publication link can never fall back to a legacy scenario that happens to
 * share the id.
 */
export function PublishedMissionLinkPage({ identifier }: { readonly identifier: string | null }) {
  const [phase, setPhase] = useState<PublishedLinkPhase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  /** A saved game of this same published mission is resumed, not restarted. */
  const resumeSaved = useCallback(async (publicMissionId: string): Promise<GameState | null> => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(sessionStorageKey);
    } catch {
      return null;
    }
    if (!saved) return null;
    try {
      const existing = await api.getGame(saved);
      if (publishedLinkStateIsAuthored(existing) && existing.scenarioId === publicMissionId) return existing;
      return null;
    } catch (cause) {
      // Only a genuine 404 means the saved session is gone; any other failure
      // leaves the saved game alone and the page simply starts a fresh one.
      if (shouldDropSession(cause)) {
        try {
          localStorage.removeItem(sessionStorageKey);
        } catch {
          /* storage may be unavailable; nothing to clean up */
        }
      }
      return null;
    }
  }, []);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    setRetry(null);
    if (!identifier) {
      setPhase({ kind: "not-found", message: "Адрес ссылки не похож на идентификатор опубликованной миссии." });
      setBusy(false);
      return;
    }
    try {
      const { mission } = await api.publishedMission(identifier);
      const resumed = await resumeSaved(mission.publicMissionId);
      if (resumed) {
        setPhase({ kind: "playing", state: resumed });
        return;
      }
      const state = await api.createGame(mission.publicMissionId, PUBLISHED_LINK_MODE);
      // The contract check: no legacy fallback is ever played behind a
      // publication link.
      if (!publishedLinkStateIsAuthored(state)) {
        setPhase({
          kind: "not-found",
          message: "Ссылка ведёт к миссии, но сайт не получил её опубликованную версию.",
        });
        return;
      }
      try {
        localStorage.setItem(sessionStorageKey, state.id);
      } catch {
        /* storage may be unavailable; the game still plays in this tab */
      }
      setPhase({ kind: "playing", state });
    } catch (cause) {
      setPhase(publishedLinkFailure(cause));
    } finally {
      setBusy(false);
    }
  }, [identifier, resumeSaved]);

  useEffect(() => {
    void open();
  }, [open]);

  const playTurn = useCallback(async (
    submission: TurnSubmission,
    attempt?: { submission: TurnSubmission; idempotencyKey: string }
  ) => {
    if (phase.kind !== "playing" || busy) return;
    const pending = attempt ?? { submission, idempotencyKey: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    setRetry(null);
    try {
      const next = await api.playTurn(phase.state.id, pending.submission, pending.idempotencyKey);
      setPhase({ kind: "playing", state: next });
    } catch (cause) {
      if (shouldDropSession(cause)) {
        setPhase({ kind: "not-found", message: "Эта игра больше не существует в движке." });
        return;
      }
      setError(failureMessage(cause, "Мир не ответил на ход"));
      setRetry(() => () => void playTurn(pending.submission, pending));
    } finally {
      setBusy(false);
    }
  }, [phase, busy]);

  const exit = useCallback(() => {
    try {
      localStorage.removeItem(sessionStorageKey);
    } catch {
      /* storage may be unavailable; nothing to clean up */
    }
    window.location.assign("/");
  }, []);

  if (phase.kind === "playing") {
    return (
      <div className="app-root">
        <PublishedMissionStage state={phase.state} onTurn={(submission) => void playTurn(submission)} onExit={exit} busy={busy} />
        {error && <RetryToast message={error} onRetry={retry} busy={busy} onDismiss={() => { setError(null); setRetry(null); }} />}
      </div>
    );
  }

  return (
    <div className="app-root">
      <PublishedMissionLinkView phase={phase} busy={busy} onRetry={() => void open()} />
    </div>
  );
}
