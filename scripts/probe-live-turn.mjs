// Focused live check: does a typed turn actually reach the engine and come back?
// Captures the network exchange of POST /api/games/<id>/turn and the page state
// until the scene moves on (the mission writer is an AI call, so it can take a
// while).
import { writeFileSync, mkdirSync } from "node:fs";

const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const SITE = process.env.SITE_URL ?? "https://living-history-florence-preview.conradipui.workers.dev/p/florence-workshop/";
const OUT = process.env.OUT_DIR ?? "artifacts/site-acceptance";
const TURN_TEXT = process.env.TURN_TEXT ?? "Тихо подкупаю поставщика пигмента и переношу работу в мастерскую до рассвета.";
const WAIT_MS = Number(process.env.WAIT_MS ?? 240000);

let nextId = 1;
const pending = new Map();
const events = [];

function connect() {
  return fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
    .then((r) => r.json())
    .then((info) => new Promise((resolve, reject) => {
      const ws = new WebSocket(info.webSocketDebuggerUrl);
      ws.onopen = () => resolve(ws);
      ws.onerror = reject;
    }));
}

function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ws = await connect();
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === "Network.requestWillBeSent" && msg.params.request.url.includes("/turn")) {
      events.push({ kind: "request", url: msg.params.request.url, method: msg.params.request.method, body: msg.params.request.postData ?? null, requestId: msg.params.requestId });
    }
    if (msg.method === "Network.responseReceived" && msg.params.response.url.includes("/turn")) {
      events.push({ kind: "response", status: msg.params.response.status, requestId: msg.params.requestId });
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      events.push({ kind: "console", text: msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ") });
    }
    if (msg.method === "Runtime.exceptionThrown") {
      events.push({ kind: "exception", text: msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text });
    }
  };

  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send(ws, "Target.attachToTarget", { targetId, flatten: true });
  await send(ws, "Page.enable", {}, sessionId);
  await send(ws, "Runtime.enable", {}, sessionId);
  await send(ws, "Network.enable", {}, sessionId);
  await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

  const evaluate = async (expression) => {
    const result = await send(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    return result.result.value;
  };
  const shot = async (name) => {
    const { data } = await send(ws, "Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  };

  await send(ws, "Page.navigate", { url: SITE }, sessionId);
  await sleep(3500);

  for (let i = 0; i < 8; i += 1) {
    const done = await evaluate(`(() => {
      const next = document.querySelector('.mp-intro-next');
      if (next) { next.click(); return false; }
      const begin = document.querySelector('.mp-intro-begin');
      if (begin) { begin.click(); return true; }
      return true;
    })()`);
    await sleep(500);
    if (done) break;
  }
  await sleep(1200);

  const before = await evaluate(`(() => ({
    turn: document.querySelector('.mp-published-turn')?.textContent ?? null,
    title: document.querySelector('.mp-published-body h1')?.textContent ?? null
  }))()`);

  const clicked = await evaluate(`(async () => {
    const mode = ${JSON.stringify(process.env.TURN_MODE ?? "freeform")};
    if (mode === "choice") {
      const button = document.querySelector('.mp-choice');
      if (!button) return { ok: false, reason: 'no choice button' };
      const label = button.textContent;
      button.click();
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, mode, label, overlay: !!document.querySelector('.mp-thinking') };
    }
    const field = document.querySelector('#mp-player-action');
    const button = document.querySelector('.mp-play');
    if (!field || !button) return { ok: false, reason: 'no freeform control' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(TURN_TEXT)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const enabled = !button.disabled;
    button.click();
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, mode, enabled, overlay: !!document.querySelector('.mp-thinking'), button: document.querySelector('.mp-play')?.textContent ?? null };
  })()`);
  await shot("turn-1-clicked");

  const deadline = Date.now() + WAIT_MS;
  let final = null;
  while (Date.now() < deadline) {
    await sleep(5000);
    const now = await evaluate(`(() => ({
      overlay: !!document.querySelector('.mp-thinking'),
      turn: document.querySelector('.mp-published-turn')?.textContent ?? null,
      title: document.querySelector('.mp-published-body h1')?.textContent ?? null,
      resolution: document.querySelector('.mp-resolution h2')?.textContent ?? null,
      chronicle: [...document.querySelectorAll('.mp-runtime-chronicle li strong')].map((n) => n.textContent),
      error: document.querySelector('.mp-error, [role="alert"]')?.textContent ?? null
    }))()`);
    final = now;
    if (!now.overlay && (now.turn !== before.turn || now.title !== before.title || now.error)) break;
  }
  await shot("turn-2-settled");

  const result = { before, clicked, after: final, events: events.slice(-12) };
  writeFileSync(`${OUT}/turn-report.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error("PROBE_FAILED", error);
  process.exit(1);
});
