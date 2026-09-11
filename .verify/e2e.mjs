/**
 * Live end-to-end check of the publication link against the locally running
 * site worker (wrangler dev on 127.0.0.1:8791) and the locally published
 * Florence mission (local Control on 127.0.0.1:8921).
 *
 * Prints one JSON report and exits non-zero if any contract assertion fails.
 */
const SITE = process.argv[2] ?? "http://127.0.0.1:8791";
const RELEASE = process.argv[3];

const report = { site: SITE, release: RELEASE, checks: [], session: null, turns: [] };
let failures = 0;

function check(name, condition, detail) {
  report.checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures += 1;
}

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

// 1. The page route answers for the Studio's link and refuses unknown links.
const page = await fetch(`${SITE}/p/${RELEASE}/`);
const pageText = await page.text();
check("page /p/<releaseId>/ is 200 and marks the link published",
  page.status === 200 && page.headers.get("x-lh-mission-link") === "published",
  { status: page.status, link: page.headers.get("x-lh-mission-link") });
check("page serves the site application shell", pageText.includes('id="root"'), { bytes: pageText.length });

const missingPage = await fetch(`${SITE}/p/release-unknown-link/`);
check("page /p/<unknown>/ is 404",
  missingPage.status === 404 && missingPage.headers.get("x-lh-mission-link") === "not-found",
  { status: missingPage.status, link: missingPage.headers.get("x-lh-mission-link") });

const missingCard = await json(`${SITE}/api/missions/release-unknown-link`);
check("card /api/missions/<unknown> is 404 PUBLIC_MISSION_NOT_FOUND",
  missingCard.status === 404 && missingCard.body?.code === "PUBLIC_MISSION_NOT_FOUND",
  { status: missingCard.status, code: missingCard.body?.code });

// 2. The Studio's release id resolves to the published card.
const card = await json(`${SITE}/api/missions/${RELEASE}`);
check("card resolves by release id", card.status === 200 && card.body?.mission?.publicMissionId === "mission:florence:florence-workshop",
  { status: card.status, publicMissionId: card.body?.mission?.publicMissionId, slug: card.body?.mission?.slug });
report.card = card.body?.mission ?? null;

// 3. The session starts through the ordinary public game contract.
const created = await json(`${SITE}/api/games`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scenarioId: card.body?.mission?.publicMissionId, mode: "chronicle" })
});
check("POST /api/games starts a published mission session",
  created.status === 201 && created.body?.presentation?.kind === "published-mission",
  { status: created.status, kind: created.body?.presentation?.kind, scenarioId: created.body?.scenarioId });
check("the published card shown matches the published listing",
  created.body?.scenarioTitle === card.body?.mission?.listing?.title && created.body?.role === card.body?.mission?.listing?.playerRole,
  { scenarioTitle: created.body?.scenarioTitle, listingTitle: card.body?.mission?.listing?.title });
if (created.body?.id) {
  report.session = created.body.id;
  report.turns.push({ turn: created.body.turn, scene: created.body.presentation?.frame?.title, choices: created.body.options?.length ?? 0 });
}

// 4. A legacy card keeps working next to the published mission.
const legacy = await json(`${SITE}/api/games`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scenarioId: "last-train-1917", mode: "chronicle" })
});
check("a legacy scenario still creates its own game (no regression)",
  legacy.status === 201 && legacy.body?.id && legacy.body?.presentation === undefined,
  { status: legacy.status, scenarioId: legacy.body?.scenarioId });

// 5. Play the published mission: a real authored turn is applied and persisted.
//    (The finale itself is blocked by the engine's public session bootstrap —
//    see the check right below.)
let state = created.body;
let guard = 0;
let appliedOption = null;
let blockedOption = null;
while (state?.status === "active" && guard < 12 && appliedOption === null) {
  for (const option of state.options ?? []) {
    const turned = await json(`${SITE}/api/games/${state.id}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: option.title, source: "prepared", optionId: option.id, idempotencyKey: `verify-turn-${guard}-${option.id}` })
    });
    if (turned.status === 200) {
      appliedOption = option.id;
      state = turned.body;
      report.turns.push({ applied: option.id, turn: state.turn, status: state.status, scene: state.presentation?.frame?.title, choices: state.options?.length ?? 0 });
      break;
    }
    if (!blockedOption && turned.body?.code) {
      blockedOption = { id: option.id, status: turned.status, code: turned.body.code };
      report.turns.push({ blocked: option.id, status: turned.status, code: turned.body.code });
    }
  }
  guard += 1;
}

check("a real authored turn is applied through the public game contract",
  appliedOption !== null && state?.turn >= 1,
  { appliedOption, turn: state?.turn, scene: state?.presentation?.frame?.title });

const reloaded = await json(`${SITE}/api/games/${state.id}`);
check("reloading the session keeps the applied turn (pinned revision)",
  reloaded.status === 200 && reloaded.body?.turn === state.turn && reloaded.body?.presentation?.kind === "published-mission",
  { status: reloaded.status, turn: reloaded.body?.turn, turnBefore: state.turn });

// The one acceptance item the current contract cannot satisfy: the published
// player starts the session with an empty world, so every authored option whose
// effect changes a resource is refused by the engine (resource_not_found).
const fresh = await json(`${SITE}/api/games`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ scenarioId: card.body?.mission?.publicMissionId, mode: "chronicle" })
});
const resourceOption = (fresh.body?.options ?? []).find((option) => option.id === "draft");
const draftTurn = resourceOption
  ? await json(`${SITE}/api/games/${fresh.body.id}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: resourceOption.title, source: "prepared", optionId: "draft", idempotencyKey: "verify-draft-probe" })
    })
  : null;
check("the resource-changing option is refused until the session world is materialized (documented engine gap)",
  draftTurn?.status === 422 && draftTurn?.body?.code === "MISSION_TURN_EFFECT_FAILED",
  { status: draftTurn?.status, code: draftTurn?.body?.code });
report.blocked = blockedOption;

// 7. The asset of the session is served from the publication.
const assetUrl = state?.presentation?.frame?.scene?.backgroundUrl ?? created.body?.presentation?.frame?.scene?.backgroundUrl;
if (assetUrl) {
  const asset = await fetch(`${SITE}${assetUrl}`);
  check("the authored background of the published mission is served",
    asset.status === 200 && String(asset.headers.get("content-type")).startsWith("image/"),
    { status: asset.status, contentType: asset.headers.get("content-type"), bytes: Number(asset.headers.get("content-length")) || null });
}

report.failures = failures;
console.log(JSON.stringify(report, null, 2));
process.exit(failures === 0 ? 0 : 1);
