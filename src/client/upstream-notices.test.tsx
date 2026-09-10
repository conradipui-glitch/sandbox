import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ApiError } from "./api";
import { CatalogNotice, RetryToast, catalogNoticeText, failureMessage, shouldDropSession } from "./upstream-notices";

describe("FIN-03 E17: upstream failures surface as explicit, retryable states", () => {
  it("renders the failure with an explicit retry button instead of an empty screen", () => {
    const html = renderToString(<RetryToast message="Движок не ответил на ход" onRetry={() => {}} busy={false} />);
    expect(html).toContain("Движок не ответил на ход");
    expect(html).toContain("Повторить");
    expect(html).toContain("role=\"alert\"");
  });

  it("does not offer a retry button when the failure cannot be retried", () => {
    const html = renderToString(<RetryToast message="Миссия недоступна" onRetry={null} busy={false} />);
    expect(html).toContain("Миссия недоступна");
    expect(html).not.toContain("Повторить");
  });

  it("disables the retry button while a retry is already running", () => {
    const html = renderToString(<RetryToast message="Сбой" onRetry={() => {}} busy={true} />);
    expect(html).toContain("disabled");
  });
});

describe("FIN-03 E17: a cached catalog is never presented as fresh", () => {
  it("says the catalog was not refreshed and offers a refresh", () => {
    const text = catalogNoticeText(false, "Движок недоступен");
    expect(text).not.toBeNull();
    expect(text!).toContain("не обновлён");
    const html = renderToString(<CatalogNotice text={text!} onRetry={() => {}} busy={false} />);
    expect(html).toContain("не обновлён");
    expect(html).toContain("Обновить");
  });

  it("shows nothing when the catalog really is live", () => {
    expect(catalogNoticeText(true, null)).toBeNull();
    expect(renderToString(<CatalogNotice text={null} onRetry={() => {}} busy={false} />)).toBe("");
  });
});

describe("FIN-03: failure classification", () => {
  it("drops a saved session only on a genuine 404", () => {
    expect(shouldDropSession(new ApiError("Сессия не найдена", 404, "PUBLIC_MISSION_SESSION_NOT_FOUND"))).toBe(true);
    expect(shouldDropSession(new ApiError("Движок недоступен", 503, "MISSION_STATE_UNAVAILABLE"))).toBe(false);
    expect(shouldDropSession(new Error("network"))).toBe(false);
  });

  it("keeps the player-facing message of an API failure", () => {
    expect(failureMessage(new ApiError("Движок недоступен", 503), "Не удалось")).toBe("Движок недоступен");
    expect(failureMessage(new Error(""), "Не удалось")).toBe("Не удалось");
    expect(failureMessage(null, "Не удалось")).toBe("Не удалось");
  });
});
