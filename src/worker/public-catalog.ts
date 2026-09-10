import type { ScenarioSummary } from "../shared/types";

export interface PublishedCatalogMission {
  readonly publicMissionId: string;
  readonly slug: string;
  readonly releaseId: string;
  readonly contentHash: string;
  readonly channel: "production";
  readonly listing: {
    readonly title: string;
    readonly summary: string;
    readonly period: string;
    readonly place: string;
    readonly playerRole: string;
    readonly estimatedMinutes: number;
    readonly supportedModes: readonly string[];
  };
}

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
