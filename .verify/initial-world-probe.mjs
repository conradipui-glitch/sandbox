/**
 * Root-cause probe: the public mission API (the one the site calls) takes the
 * session's initial world from the caller, while the mission's authored options
 * change resources. This probe starts the same published session twice — once
 * with the site's empty world and once with the world the release pin declares —
 * and reports which options can be applied.
 */
import { DatabaseSync } from "node:sqlite";

const CONTROL = "http://127.0.0.1:8921";
const PUBLIC_MISSION_ID = "mission:florence:florence-workshop";
const releaseId = process.argv[2];
const dbPath = process.argv[3] ?? "data/control.sqlite";

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT compiled_artifact_json FROM control_releases WHERE release_id = ?").get(releaseId);
const artifact = JSON.parse(String(row.compiled_artifact_json));
const pinnedWorld = {
  schemaVersion: "1.0",
  revision: 0,
  clock: { elapsedSeconds: 0 },
  locations: artifact.blocks.filter((b) => b.kind === "core.location").map((b) => ({ id: b.id })),
  entities: artifact.blocks.filter((b) => b.kind === "core.character").map((b) => ({ id: b.id, type: "character", status: b.data.initialStatus, locationId: b.data.initialLocationId })),
  resources: artifact.blocks.filter((b) => b.kind === "core.resource").map((b) => ({ id: b.id, unit: b.data.unit, value: b.data.initialValue, min: b.data.min, max: b.data.max })),
  items: [],
  terminal: null
};
const emptyWorld = { schemaVersion: "1.0", revision: 0, clock: { elapsedSeconds: 0 }, locations: [], entities: [], resources: [], items: [], terminal: null };

const json = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json().catch(() => null) };
};

async function start(world, label) {
  const created = await json(`${CONTROL}/public/v1/missions/${encodeURIComponent(PUBLIC_MISSION_ID)}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": `probe-${label}` },
    body: JSON.stringify({ sessionId: `probe-${label}-${Date.now().toString(36)}`, initialWorld: world })
  });
  return created;
}

const report = { resources: pinnedWorld.resources, runs: {} };

for (const [label, world] of [["empty-world", emptyWorld], ["release-pinned-world", pinnedWorld]]) {
  const created = await start(world, label);
  const run = { createStatus: created.status, credential: typeof created.body?.credential === "string", options: (created.body?.session?.currentSceneId ? [] : []), turns: [] };
  if (created.status !== 201) { report.runs[label] = run; continue; }
  const credential = created.body.credential;
  const session = created.body.session;
  const choices = (created.body.mission.story.scenes.find((s) => s.id === session.currentSceneId)?.choices ?? []).map((c) => c.id);
  run.options = choices;
  // Try every authored option at the opening scene.
  for (const choiceId of choices) {
    const turned = await json(`${CONTROL}/public/v1/missions/${encodeURIComponent(PUBLIC_MISSION_ID)}/sessions/${session.sessionId}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${credential}`, "idempotency-key": `probe-${label}-${choiceId}` },
      body: JSON.stringify({ baseTurn: 0, choiceId })
    });
    run.turns.push({ choiceId, status: turned.status, code: turned.body?.error?.code ?? null });
  }
  // With a pinned world, follow the canonical route to an ending.
  if (label === "release-pinned-world") {
    const route = ["draft", "ledger", "counter", "pigment", "public", "deliver"];
    let current = await json(`${CONTROL}/public/v1/missions/${encodeURIComponent(PUBLIC_MISSION_ID)}/sessions/${session.sessionId}`, { headers: { authorization: `Bearer ${credential}` } });
    let turn = 0;
    run.canonical = [];
    for (const choiceId of route) {
      const turned = await json(`${CONTROL}/public/v1/missions/${encodeURIComponent(PUBLIC_MISSION_ID)}/sessions/${session.sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${credential}`, "idempotency-key": `probe-route-${turn}` },
        body: JSON.stringify({ baseTurn: turn, choiceId })
      });
      run.canonical.push({ choiceId, status: turned.status, code: turned.body?.error?.code ?? null, target: turned.body?.target ?? null, scene: turned.body?.session?.currentSceneId ?? null });
      if (turned.status !== 200) break;
      turn += 1;
      if (turned.body?.target?.kind === "ending") break;
    }
    run.finalTurn = turn;
  }
  report.runs[label] = run;
}

console.log(JSON.stringify(report, null, 2));
