# B11 — Florence Engine test routing

Status: **test-only integration boundary**. Do not enable production rollout until B11.3 semantic acceptance is GREEN.

## Purpose

B11.2 adds the smallest BFF boundary required to route **new** Florence sessions to Living History Engine without rewriting the legacy `HistorySession` Durable Object or any existing save.

The public `/api/games/:id` id remains owned by `sandbox`. An Engine-routed session gets a durable `RuntimeRouteSession` binding containing the upstream Engine session identity and credential. Requests for an id with no Engine binding continue through the legacy worker unchanged.

## Rollout modes

`ENGINE_FLORENCE_ROLLOUT` has three accepted values:

- `off` — all new sessions use the legacy route;
- `test` — Florence uses Engine only when the create request explicitly includes `runtime: "engine"`;
- `on` — every newly created Florence session uses Engine.

Any other value is treated as `off`.

Only `scenarioId = florence-workshop` is eligible. Other scenarios stay legacy in B11.

## Pinning rule

The rollout flag is evaluated only for `POST /api/games` before a route binding exists.

After an Engine route binding is written:

1. `GET /api/games/:id` reads that binding and uses the stored Engine base URL, upstream session id and credential;
2. `POST /api/games/:id/turn` uses the same stored binding;
3. changing the global rollout flag does not migrate the session;
4. an old id with no route binding continues to use `HistorySession` and its existing `StoredGame`.

This is intentionally separate from the legacy save schema. There is no conversion step.

## Safe test configuration

Set the Worker variables to a reachable test Engine installation with a published Florence quest:

```text
ENGINE_FLORENCE_ROLLOUT=test
ENGINE_RUNTIME_URL=https://<test-engine-host>
ENGINE_FLORENCE_PROJECT_ID=<published-project-id>
ENGINE_FLORENCE_QUEST_ID=florence-workshop
```

Then create an explicit Engine test session by adding `runtime: "engine"` to the Florence create request. The normal current client does not send this field, so `test` mode leaves ordinary players on legacy.

If the Engine target or published quest is unavailable, Engine creation fails closed with `503`; it does **not** silently create a legacy session after Engine was explicitly selected.

## Rollback

To stop new Engine assignment:

1. set `ENGINE_FLORENCE_ROLLOUT=off`;
2. keep `RUNTIME_ROUTE_SESSIONS` and `HistorySession` Durable Objects intact;
3. do not delete bindings for already-created Engine sessions;
4. do not modify or convert old `StoredGame` records.

After rollback, new Florence sessions are legacy. Existing legacy sessions remain legacy. Existing Engine-bound test sessions remain pinned to Engine and can be inspected independently.

## Current B11.2 limit

The routing/pinning boundary is real, but the current Engine HTTP action service only exposes the earlier `core.paint` action path. The migrated Florence authored beats therefore are **not yet accepted as a playable semantic replacement**. B11.3 must add generic authored-option execution and run old/new canonical + counter-route comparison before `ENGINE_FLORENCE_ROLLOUT=on` is allowed.

The Engine response is intentionally returned as a test envelope (`runtime: "engine"`, `engine: ...`) rather than pretending to be the legacy `GameState`. A client-compatible facade belongs to the semantic integration slice after the Engine can actually execute the migrated quest.

## FIN-03 — published mission site contract (assets, unpublish, upstream failure)

Status: **implemented locally on `feat/fin03-site-assets`, not verified against the live VPS engine.**

### Assets belong to the session, not to the current publication

A started game's asset URL is pinned to the session that owns it:

```text
GET /api/missions/{publicMissionId}/sessions/{publicSessionId}/assets/{assetId}
```

The BFF resolves the session binding from `PUBLISHED_MISSION_ROUTE_SESSIONS`, then calls the engine with the session credential:

```text
GET {engine}/public/v1/missions/{publicMissionId}/assets/{assetId}
authorization: Bearer <session credential>
```

The browser never sees the credential. Because the request is credentialed, the engine answers with the revision the session was created from — the game keeps its own pictures after a republish or an unpublish, and `publishedMissionAssetUrl()` is the only place that builds the URL.

Caching rules on the site side:

- `etag` is derived from the pinned revision `contentHash` plus the asset id;
- `cache-control: private, max-age=31536000, immutable` is emitted **only** when that revision hash is present and the upstream answer was a 2xx — those bytes are immutable;
- every failure path (timeout, 5xx, 4xx, unknown session) answers `cache-control: no-store`, so a failed or unauthenticated answer can never be replayed as if it were the asset.

### A withdrawn publication never becomes legacy content (E16)

`GET /api/games/:id` reconciles with the engine first. If the engine session is no longer readable (unpublished, withdrawn, upstream down), the route no longer answers 404: the started game continues from the authored revision stored in its binding, the response is marked `contentSource: "pinned"` (header `x-lh-mission-source: pinned`), and the site shows that it is running on the pinned version. Legacy scenario art is never substituted for a published mission.

### Upstream failure is an explicit state (E17)

- `GET /api/scenarios` returns an explicit error (`cache-control: no-store`, `x-lh-catalog-state: unavailable`) when the catalog cannot be refreshed, instead of a stale list that looks freshly loaded; a successful refresh is marked `x-lh-catalog-state: live`.
- The client keeps the shipped fallback list only until a live catalog arrives, and labels it as not refreshed, with a refresh button.
- A failed turn, start or session reload becomes a toast with a **Повторить** button; a retry replays the same turn under the same idempotency key, so a lost response cannot apply the effect twice. Only a genuine 404 drops the saved session.

### Not verified here

Everything above is covered by vitest with a stubbed upstream. The live VPS engine behaviours — that a credentialed asset request really returns the pinned revision after unpublish, and the real latency/timeout shapes — can only be confirmed against the running engine and a browser pass.
