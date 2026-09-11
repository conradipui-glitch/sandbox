import type { PublishedMissionCard, ScenarioSummary } from "../shared/types";

/** The public catalog card: one authored mission as the engine publishes it. */
export type PublishedCatalogMission = PublishedMissionCard;

export type PublishedCatalogResult =
  | { readonly ok: true; readonly missions: readonly PublishedCatalogMission[] }
  | { readonly ok: false; readonly status: number; readonly code: "PUBLIC_CATALOG_UNAVAILABLE" | "PUBLIC_CATALOG_INVALID" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HASH = /^[0-9a-f]{64}$/;

function isMission(value: unknown): value is PublishedCatalogMission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const listing = candidate.listing;
  if (!listing || typeof listing !== "object" || Array.isArray(listing)) return false;
  const data = listing as Record<string, unknown>;
  return typeof candidate.publicMissionId === "string" && ID.test(candidate.publicMissionId)
    && typeof candidate.slug === "string" && /^[a-z0-9][a-z0-9-]{1,98}$/.test(candidate.slug)
    && typeof candidate.releaseId === "string" && ID.test(candidate.releaseId)
    && typeof candidate.contentHash === "string" && HASH.test(candidate.contentHash)
    && candidate.channel === "production"
    && typeof data.title === "string" && data.title.length > 0
    && typeof data.summary === "string"
    && typeof data.period === "string" && typeof data.place === "string"
    && typeof data.playerRole === "string"
    && Number.isSafeInteger(data.estimatedMinutes) && Number(data.estimatedMinutes) >= 1
    && Array.isArray(data.supportedModes) && data.supportedModes.length > 0 && data.supportedModes.every((mode) => typeof mode === "string");
}

export async function fetchPublishedCatalog(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishedCatalogResult> {
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) return { ok: false, status: response.status, code: "PUBLIC_CATALOG_UNAVAILABLE" };
    const body = await response.json().catch(() => null) as { missions?: unknown } | null;
    if (!body || !Array.isArray(body.missions) || !body.missions.every(isMission)) {
      return { ok: false, status: 502, code: "PUBLIC_CATALOG_INVALID" };
    }
    return { ok: true, missions: body.missions };
  } catch {
    return { ok: false, status: 503, code: "PUBLIC_CATALOG_UNAVAILABLE" };
  }
}

export function toScenarioSummaries(missions: readonly PublishedCatalogMission[]): ScenarioSummary[] {
  return missions.map((mission) => ({
    id: mission.publicMissionId,
    title: mission.listing.title,
    period: [mission.listing.period, mission.listing.place].filter(Boolean).join(" · "),
    role: mission.listing.playerRole,
    hook: mission.listing.summary,
    difficulty: "Доступно" as const,
    accent: "#c94c36",
    available: true,
  }));
}

/**
 * Resolves one published mission by any identifier the public catalog exposes.
 *
 * The Studio's publication panel links players to `/p/<releaseId>/`, while the
 * mission's own public id is `mission:<project>:<quest>` and the catalog also
 * carries the author's `slug`. All three name the same publication, so the site
 * accepts all three and always continues with the canonical `publicMissionId`.
 */
export function matchPublishedMission(
  missions: readonly PublishedCatalogMission[],
  identifier: string,
): PublishedCatalogMission | null {
  return missions.find((mission) =>
    mission.publicMissionId === identifier
    || mission.slug === identifier
    || mission.releaseId === identifier
  ) ?? null;
}
