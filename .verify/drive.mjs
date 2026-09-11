/**
 * Minimal CDP driver: opens the publication link in a dedicated Chrome profile,
 * records console/page errors and captures screenshots.
 *
 * Usage: node drive.mjs <identifier-to-open>
 */
import { writeFile, mkdir } from "node:fs/promises";

const CHROME_PORT = Number(process.env.CDP_PORT ?? 9371);
const SITE = process.env.SITE ?? "http://127.0.0.1:8791";
const shotsDir = process.env.SHOTS_DIR ?? "C:/Users/kato55/lhc-publish-verify/shots";
const shotPrefix = process.env.SHOT_PREFIX ?? "";
const identifier = process.argv[2] ?? "";
await mkdir(shotsDir, { recursive: true });

const version = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });

let nextId = 1;
const pending = new Map();
const events = [];
let sessionId = null;

socket.onmessage = (message) => {
  const payload = JSON.parse(message.data);
  if (payload.id && pending.has(payload.id)) {
    const { resolve, reject } = pending.get(payload.id);
    pending.delete(payload.id);
    payload.error ? reject(new Error(JSON.stringify(payload.error))) : resolve(payload.result);
    return;
  }
  if (payload.method) events.push(payload);
};

function send(method, params = {}, useSession = true) {
  const id = nextId++;
  const message = { id, method, params };
  if (sessionId && useSession) message.sessionId = sessionId;
  socket.send(JSON.stringify(message));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const created = await send("Target.createTarget", { url: "about:blank" }, false);
const attached = await send("Target.attachToTarget", { targetId: created.targetId, flatten: true }, false);
sessionId = attached.sessionId;

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const consoleErrors = [];
const record = (payload) => {
  if (payload.method === "Runtime.exceptionThrown") {
    consoleErrors.push({ kind: "exception", text: payload.params?.exceptionDetails?.exception?.description ?? payload.params?.exceptionDetails?.text });
  }
  if (payload.method === "Runtime.consoleAPICalled" && payload.params?.type === "error") {
    consoleErrors.push({ kind: "console.error", text: (payload.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ") });
  }
  if (payload.method === "Log.entryAdded" && payload.params?.entry?.level === "error") {
    const entry = payload.params.entry;
    // The site requests a Google Fonts stylesheet; an offline lab has no route
    // to it. That is recorded, but it is not a page error.
    consoleErrors.push({ kind: "log", text: entry.text, url: entry.url ?? null, offlineAsset: /fonts\.googleapis\.com/.test(entry.url ?? "") });
  }
};

async function settle(ms = 3500) {
  const start = events.length;
  await new Promise((r) => setTimeout(r, ms));
  for (const payload of events.slice(start).filter((p) => !p.sessionId || p.sessionId === sessionId)) record(payload);
}

async function navigate(url) {
  await send("Page.navigate", { url });
  await settle(4500);
  // A navigation that raced with the previous one can leave an empty document;
  // reload once instead of screenshotting a blank page.
  const text = await evaluate("document.body ? document.body.innerText : ''");
  if (!text) {
    await send("Page.reload", { ignoreCache: false });
    await settle(4500);
  }
}

async function shot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = `${shotsDir}/${shotPrefix}${name}.png`;
  await writeFile(path, Buffer.from(result.data, "base64"));
  return path;
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

const report = { url: `${SITE}/p/${identifier}/`, consoleErrors, screenshots: [], observations: {} };

if (process.env.RESET === "1") {
  // A clean browser state: the link must be able to start a fresh session.
  await navigate(`${SITE}/`);
  await evaluate("localStorage.clear()");
}

await navigate(`${SITE}/p/${identifier}/`);
report.observations.pageTitle = await evaluate("document.title");
report.observations.bodyText = (await evaluate("document.body.innerText")).slice(0, 1200);
report.observations.href = await evaluate("location.href");
report.screenshots.push(await shot("after-publish-opening"));

// Play one authored turn through the page itself: the option that the engine
// accepts today (the effect-free one) is the last card in the opening scene.
const clickResult = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll(".mp-choice, .mp-choices button")];
  const target = buttons.find((b) => /Оставить|двер/i.test(b.textContent ?? '')) ?? buttons[buttons.length - 1];
  if (!target) return { clicked: false, count: buttons.length };
  target.click();
  return { clicked: true, count: buttons.length, label: target.textContent.trim().slice(0, 80) };
})()`);
report.observations.click = clickResult;
await settle(5000);
report.observations.afterTurnText = (await evaluate("document.body.innerText")).slice(0, 1200);
report.screenshots.push(await shot("playing-turn-applied"));

report.observations.sessionStoredInBrowser = await evaluate("localStorage.getItem('living-history-session')");
report.consoleErrors = consoleErrors;
await send("Target.closeTarget", { targetId: created.targetId }, false);
socket.close();
console.log(JSON.stringify(report, null, 2));
