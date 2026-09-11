import type { GameState } from "../shared/types";

/**
 * The publication link contract.
 *
 * The Studio's publication panel links players to `<site-base>/p/<releaseId>/`
 * (see `publicMissionUrl` there). The site owns what that link means: the page
 * resolves the identifier against the published catalog and refuses to open
 * anything that is not a published mission.
 */
export const PUBLISHED_MISSION_PAGE_PATH = /^\/p\/([^/]+)\/?$/;

const PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

/**
 * The identifier of a publication link, or null when the link names something
 * that cannot be a public id (a malformed percent-escape, an over-long or
 * illegal segment). A null identifier is rendered as a 404 — it is never
 * guessed.
 */
export function publishedMissionIdentifier(pathname: string): string | null {
  const match = PUBLISHED_MISSION_PAGE_PATH.exec(pathname);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return PUBLIC_ID.test(decoded) ? decoded : null;
}

export type SiteRoute =
  | { readonly kind: "analytics" }
  | { readonly kind: "published-mission"; readonly identifier: string | null }
  | { readonly kind: "app" };

export function siteRoute(pathname: string): SiteRoute {
  if (pathname === "/analytics") return { kind: "analytics" };
  if (PUBLISHED_MISSION_PAGE_PATH.test(pathname)) {
    return { kind: "published-mission", identifier: publishedMissionIdentifier(pathname) };
  }
  return { kind: "app" };
}

/**
 * A published link may only ever open a published mission. The authored
 * presentation discriminator is the contract that says so: a legacy state that
 * happens to carry the same id must be refused instead of played.
 */
export function publishedLinkStateIsAuthored(state: GameState | null): boolean {
  return state?.presentation?.kind === "published-mission";
}
