// Fresh look at the live published mission: clears the stored session, walks the
// intro, then captures the played scene as the player sees it.
import { writeFileSync, mkdirSync } from "node:fs";

const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const SITE = process.env.SITE_URL ?? "https://living-history-florence-preview.conradipui.workers.dev/p/florence-workshop/";
const OUT = process.env.OUT_DIR ?? "artifacts/site-acceptance";

let nextId = 1;
const pending = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ws = await connect();
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send(ws, "Target.attachToTarget", { targetId, flatten: true });
  await send(ws, "Page.enable", {}, sessionId);
  await send(ws, "Runtime.enable", {}, sessionId);
  await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

  const evaluate = async (expression) => (await send(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)).result.value;
  const shot = async (name) => {
    const { data } = await send(ws, "Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  };

  await send(ws, "Page.navigate", { url: SITE }, sessionId);
  await sleep(2500);
  await evaluate(`localStorage.clear()`);
  await send(ws, "Page.navigate", { url: SITE }, sessionId);
  await sleep(3500);

  await shot("acceptance-intro-1");
  for (let i = 0; i < 6; i += 1) {
    const done = await evaluate(`(() => {
      const next = document.querySelector('.mp-intro-next');
      if (next) { next.click(); return false; }
      const begin = document.querySelector('.mp-intro-begin');
      if (begin) { begin.click(); return true; }
      return true;
    })()`);
    await sleep(600);
    if (done) break;
  }
  await sleep(1600);
  await shot("acceptance-scene");

  const state = await evaluate(`(() => ({
    title: document.querySelector('.mp-published-body h1')?.textContent ?? null,
    turn: document.querySelector('.mp-published-turn')?.textContent ?? null,
    choices: [...document.querySelectorAll('.mp-choice')].map((b) => b.textContent),
    freeform: !!document.querySelector('#mp-player-action'),
    musicToggle: document.querySelector('.mp-music-toggle')?.getAttribute('data-music-state') ?? null,
    resources: [...document.querySelectorAll('.mp-runtime-resource strong')].map((n) => n.textContent),
    participants: [...document.querySelectorAll('.mp-runtime-participants strong')].map((n) => n.textContent)
  }))()`);
  console.log(JSON.stringify(state, null, 2));
  ws.close();
}

main().catch((error) => { console.error("CAPTURE_FAILED", error); process.exit(1); });
