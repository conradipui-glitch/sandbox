// Live check of the published mission page: the authored scene, its animations,
// the header music control and the free-text turn. Read-only: it plays the
// mission in a throwaway Chrome profile.
import { writeFileSync, mkdirSync } from "node:fs";

const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const SITE = process.env.SITE_URL ?? "https://living-history-florence-preview.conradipui.workers.dev/p/florence-workshop/";
const OUT = process.env.OUT_DIR ?? "artifacts/site-acceptance";

let nextId = 1;
const pending = new Map();

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
    }
  };

  const { targetId } = await send(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send(ws, "Target.attachToTarget", { targetId, flatten: true });
  await send(ws, "Page.enable", {}, sessionId);
  await send(ws, "Runtime.enable", {}, sessionId);
  await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

  const evaluate = async (expression) => {
    const result = await send(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    return result.result.value;
  };

  await send(ws, "Page.navigate", { url: SITE }, sessionId);
  await sleep(3500);

  const report = { url: SITE };

  report.intro = await evaluate(`(() => {
    const pager = document.querySelector('.mp-intro');
    return {
      visible: !!pager,
      title: document.querySelector('.mp-intro-body h1')?.textContent ?? null,
      progress: document.querySelector('.mp-intro-progress')?.textContent ?? null,
      musicToggle: !!document.querySelector('.mp-published-header .mp-music-toggle'),
      overlayCaptionOnArtwork: !!document.querySelector('.mp-music')
    };
  })()`);

  // Page to the end of the intro.
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
  await sleep(1500);

  report.scene = await evaluate(`(() => {
    const stage = document.querySelector('.mp-stage');
    const layers = [...document.querySelectorAll('.mp-layer')].map((outer) => {
      const inner = outer.firstElementChild;
      const img = outer.querySelector('img');
      const style = inner ? getComputedStyle(inner) : null;
      return {
        id: outer.getAttribute('data-layer-id'),
        cls: inner?.className ?? null,
        animationName: style?.animationName ?? null,
        animationDuration: style?.animationDuration ?? null,
        imageLoaded: img ? (img.naturalWidth > 0) : null,
        imageSize: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
        rect: (() => { const r = outer.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })()
      };
    });
    const toggle = document.querySelector('.mp-published-header .mp-music-toggle');
    return {
      preset: stage?.getAttribute('data-animation-preset') ?? null,
      background: !!document.querySelector('.mp-stage .mp-background:not(.mp-background-empty)'),
      backgroundSource: document.querySelector('.mp-stage .mp-background')?.getAttribute('data-background-source') ?? null,
      layerCount: layers.length,
      layers,
      musicToggle: toggle ? { state: toggle.getAttribute('data-music-state'), label: toggle.getAttribute('aria-label') } : null,
      musicCaptionOnArtwork: document.querySelector('.mp-stage .mp-music')?.textContent ?? null,
      freeform: !!document.querySelector('#mp-player-action'),
      playButton: document.querySelector('.mp-play')?.textContent ?? null,
      choices: [...document.querySelectorAll('.mp-choice')].map((b) => b.textContent)
    };
  })()`);

  const shot = async (name) => {
    const { data } = await send(ws, "Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  };
  await shot("live-scene");

  // A free-text turn, exactly what the player types.
  report.freeformTurn = await evaluate(`(async () => {
    const field = document.querySelector('#mp-player-action');
    const button = document.querySelector('.mp-play');
    if (!field || !button) return { ok: false, reason: 'no freeform control' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, 'Тихо подкупаю поставщика пигмента и переношу работу в мастерскую до рассвета.');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const enabled = !button.disabled;
    button.click();
    await new Promise((r) => setTimeout(r, 900));
    return { ok: true, enabled, thinking: !!document.querySelector('.mp-thinking'), pending: button.textContent };
  })()`);
  await sleep(2500);
  await shot("live-freeform-turn");

  report.afterTurn = await evaluate(`(() => ({
    thinking: !!document.querySelector('.mp-thinking'),
    resolution: document.querySelector('.mp-resolution h2')?.textContent ?? null,
    chronicle: [...document.querySelectorAll('.mp-runtime-chronicle li strong')].map((n) => n.textContent),
    turn: document.querySelector('.mp-published-turn')?.textContent ?? null,
    choices: [...document.querySelectorAll('.mp-choice')].map((b) => b.textContent),
    deltas: [...document.querySelectorAll('.mp-resolution-deltas li')].map((n) => n.textContent)
  }))()`);

  // Layout hygiene on the live page.
  report.layout = await evaluate(`(() => {
    const overflow = [...document.querySelectorAll('.mp-published *')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => el.className).slice(0, 8);
    const broken = [...document.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute('src'));
    const clipped = [...document.querySelectorAll('.mp-published *')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') && el.textContent.trim().length > 0;
    }).map((el) => el.className).slice(0, 8);
    return { horizontalOverflow: overflow, brokenImages: broken, clippedText: clipped, bodyOverflow: document.body.scrollWidth > window.innerWidth + 2 };
  })()`);

  await shot("live-after-turn");
  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error("PROBE_FAILED", error);
  process.exit(1);
});
