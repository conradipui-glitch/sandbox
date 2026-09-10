import { RefreshCw, ShieldAlert } from "lucide-react";
import { ApiError } from "./api";

/**
 * FIN-03 E17: an upstream failure must become an explicit, retryable state.
 * These helpers and components keep that decision testable without a browser.
 */

/** A 404 is the only failure that means the saved session no longer exists. */
export function shouldDropSession(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 404;
}

/** Player-facing message for any failure, never an empty string. */
export function failureMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message;
  return fallback;
}

/**
 * The published catalog is cached by the edge (`max-age` + stale-while-revalidate),
 * so the site may be showing an older list. When the refresh actually failed we
 * must say the list was not updated instead of presenting it as fresh.
 */
export function catalogNoticeText(live: boolean, error: string | null): string | null {
  if (live && !error) return null;
  return error
    ? `Каталог миссий не обновлён: ${error}. Показан сохранённый список.`
    : "Каталог миссий не обновлён. Показан сохранённый список.";
}

export function RetryToast({ message, onRetry, busy, onDismiss }: {
  message: string;
  onRetry: (() => void) | null;
  busy: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className="error-toast" role="alert">
      <ShieldAlert size={18} />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="error-retry" onClick={onRetry} disabled={busy}>
          <RefreshCw className={busy ? "spin" : undefined} size={15} /> Повторить
        </button>
      )}
      {onDismiss && <button type="button" className="error-dismiss" onClick={onDismiss} aria-label="Закрыть">×</button>}
    </div>
  );
}

export function CatalogNotice({ text, onRetry, busy }: {
  text: string | null;
  onRetry: () => void;
  busy: boolean;
}) {
  if (!text) return null;
  return (
    <div className="catalog-notice" role="status">
      <ShieldAlert size={17} />
      <span>{text}</span>
      <button type="button" onClick={onRetry} disabled={busy}>
        <RefreshCw className={busy ? "spin" : undefined} size={14} /> Обновить
      </button>
    </div>
  );
}
