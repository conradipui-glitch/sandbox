import { describe, expect, it } from "vitest";
import worker from "./b11-entry";
import {
  createPublishedMissionSession,
  fetchPublishedMissionAsset,
  publishedMissionAssetUrl,
  publishedMissionGameState,
  type PublishedMissionBinding
} from "./public-mission-bff";

/**
 * FIN-05 site half: the material layer is checked against a REAL image, not an
 * 8-byte stub. The fixture is a valid 12x8 RGBA PNG (colour type 6, alpha
 * channel), built in-test so the served bytes can be verified field by field:
 * byte identity (hash/alpha/transparency survive the BFF), trusted MIME,
 * parseable dimensions, and a session-pinned URL that survives a reload.
 */

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(body));
  const out = new Uint8Array(4 + body.length + 4);
  out.set(length, 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * A valid zlib stream made of DEFLATE *stored* blocks. The worker project has no
 * node:zlib, and an uncompressed stream keeps the fixture obviously real: the
 * bytes are a genuine PNG any decoder accepts, with no compression dependency.
 */
function zlibStored(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const step = 65535;
  for (let offset = 0; offset <= data.length; offset += step) {
    const part = data.subarray(offset, Math.min(offset + step, data.length));
    const final = offset + step >= data.length;
    const head = new Uint8Array(5);
    head[0] = final ? 1 : 0;
    new DataView(head.buffer).setUint16(1, part.length, true);
    new DataView(head.buffer).setUint16(3, part.length ^ 0xffff, true);
    blocks.push(head, part);
    if (final) break;
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, adler32(data));
  blocks.push(adler);
  return concat(blocks);
}

/** A real PNG: 12x8, 8-bit RGBA, one fully transparent pixel. */
function rgbaPng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  // One filter byte (0) + width * 4 RGBA bytes per scanline.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const base = row * (1 + width * 4);
    raw[base] = 0;
    for (let column = 0; column < width; column += 1) {
      const at = base + 1 + column * 4;
      raw[at] = (column * 17) % 256;
      raw[at + 1] = (row * 31) % 256;
      raw[at + 2] = 120;
      raw[at + 3] = row === 0 && column === 0 ? 0 : 255; // transparent pixel
    }
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([signature, chunk("IHDR", ihdr), chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array(0))]);
}

interface PngInfo {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
}

/** Reads the real IHDR of the served bytes: proof the material survives intact. */
function readPngInfo(bytes: Uint8Array): PngInfo {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  signature.forEach((byte, index) => expect(bytes[index]).toBe(byte));
  expect(new TextDecoder().decode(bytes.slice(12, 16))).toBe("IHDR");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20), bitDepth: bytes[24], colorType: bytes[25] };
}

function pngChunk(bytes: Uint8Array, type: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (new TextDecoder().decode(bytes.slice(offset + 4, offset + 8)) === type) {
      return bytes.slice(offset + 8, offset + 8 + length);
    }
    offset += 12 + length;
  }
  throw new Error(`no ${type} chunk`);
}

/**
 * Independent decoding: Node's zlib inflates the served IDAT stream, so the test
 * proves the fixture is a genuinely decodable PNG (dimensions, alpha channel and
 * all), not a stub that merely looks like one.
 */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const specifier = ["node", "zlib"].join(":");
  const zlib = (await import(/* @vite-ignore */ specifier)) as { inflateSync(input: Uint8Array): Uint8Array };
  return new Uint8Array(zlib.inflateSync(bytes));
}

const doc = {
  contentRevision: 7,
  contentHash: "c".repeat(64),
  story: {
    entrySceneId: "start",
    scenes: [{ id: "start", title: "Смена", text: "Гудит реактор.", choices: [{ id: "seal", label: "Герметизировать" }] }],
    endings: [{ id: "done", title: "Тихий контур", text: "Никто не пришёл." }]
  },
  screens: {
    intros: [],
    scenes: {
      start: {
        background: { assetId: "bunker-bg", hash: "d".repeat(64) },
        music: null,
        layers: [{ id: "reactor", kind: "item", name: "Реактор", asset: { assetId: "reactor", hash: "e".repeat(64) }, x: 0.5, y: 0.5, scale: 1, rotation: 0, flipH: false, flipV: false, opacity: 1, z: 1, visible: true, locked: false }]
      }
    },
    endings: {}
  },
  defaults: null
};
const listing = { title: "Смена", period: "1986", role: "Инженер", hook: "Не дать контуру разойтись." };
const BINDING_CREDENTIAL = "session-credential-value";
const bytes = rgbaPng(12, 8);

async function started(): Promise<PublishedMissionBinding> {
  const created = await createPublishedMissionSession({
    engineBaseUrl: "https://engine.example",
    publicMissionId: "mission:chernobyl:shift",
    publicSessionId: "browser-session",
    mode: "chronicle",
    listing,
    newSessionId: () => "engine-session",
    fetchImpl: async () => new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: BINDING_CREDENTIAL }), { status: 201 })
  });
  if (!created.ok) throw new Error("setup failed");
  return created.binding;
}

function byteList(buffer: ArrayBufferLike): number[] {
  return Array.from(new Uint8Array(buffer));
}

describe("FIN-05 site half: the material layer serves the real library asset untouched", () => {
  it("keeps real PNG bytes identical, so hash, dimensions and the alpha channel survive", async () => {
    const binding = await started();
    const response = await fetchPublishedMissionAsset({
      binding,
      assetId: "bunker-bg",
      fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-type": "image/png" } })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const served = new Uint8Array(await response.arrayBuffer());
    // Byte identity is what proves the transparency/dimensions were not re-encoded,
    // padded or re-normalised anywhere on the site side.
    expect(byteList(served.buffer)).toEqual(byteList(bytes.buffer));
    const info = readPngInfo(served);
    expect(info).toEqual({ width: 12, height: 8, bitDepth: 8, colorType: 6 });
    // Independent decode: the IDAT stream really inflates to 8 scanlines of
    // 12 RGBA pixels, and the deliberately transparent pixel keeps alpha 0.
    const raw = await inflate(pngChunk(served, "IDAT"));
    expect(raw.length).toBe(8 * (1 + 12 * 4));
    expect(raw[0]).toBe(0);
    expect(raw[4]).toBe(0);
    expect(raw[8]).toBe(255);
    // The served identity is the pinned revision hash plus the asset id.
    const etag = response.headers.get("etag") ?? "";
    expect(etag).toContain(doc.contentHash.slice(0, 32));
    expect(etag).toContain("bunker-bg");
    expect(response.headers.get("x-mission-revision")).toBe("7");
  });

  it("resolve the same asset URL from the pinned binding, so a reload keeps the picture", async () => {
    const binding = await started();
    const view = { sceneId: "start", title: "Смена", text: "Гудит.", choices: [], turn: 0, contentRevision: 7, contentHash: doc.contentHash };
    const before = publishedMissionGameState(binding, view, "chronicle");
    // A reload re-reads the stored binding and rebuilds the same frame.
    const after = publishedMissionGameState({ ...binding }, view, "chronicle");
    const beforeUrl = before.presentation!.frame.scene.backgroundUrl;
    const afterUrl = after.presentation!.frame.scene.backgroundUrl;
    expect(afterUrl).toBe(beforeUrl);
    expect(afterUrl).toBe(publishedMissionAssetUrl(binding, "bunker-bg"));

    const fetches: string[] = [];
    const first = await fetchPublishedMissionAsset({ binding, assetId: "bunker-bg", fetchImpl: async (input) => { fetches.push(String(input)); return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }); } });
    const second = await fetchPublishedMissionAsset({ binding: { ...binding }, assetId: "bunker-bg", fetchImpl: async (input) => { fetches.push(String(input)); return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }); } });
    expect(fetches[0]).toBe(fetches[1]);
    expect(fetches[0]).toContain("/sessions/engine-session/assets/bunker-bg");
    const firstBytes = new Uint8Array(await first.arrayBuffer());
    const secondBytes = new Uint8Array(await second.arrayBuffer());
    expect(byteList(firstBytes.buffer)).toEqual(byteList(secondBytes.buffer));
    expect(byteList(secondBytes.buffer)).toEqual(byteList(bytes.buffer));
  });

  it("serves the real bytes through the worker route after a reload, with trusted MIME", async () => {
    class FakeNamespace {
      readonly records = new Map<string, unknown>();
      idFromName(name: string) { return name; }
      get(id: string) {
        return { fetch: async (_url: string, init?: RequestInit) => {
          if (init?.method === "POST") { this.records.set(id, JSON.parse(String(init.body))); return Response.json({ ok: true }); }
          const value = this.records.get(id);
          return value ? Response.json(value) : new Response(null, { status: 404 });
        } };
      }
    }

    const originalFetch = globalThis.fetch;
    const namespace = new FakeNamespace();
    const assetRequests: Array<{ url: string; authorization: string | null }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://engine/public/v1/missions") {
        return Response.json({ missions: [{ publicMissionId: "mission:chernobyl:shift", slug: "chernobyl-shift", releaseId: "release-1", contentHash: "e".repeat(64), channel: "production", listing: { title: "Смена", summary: "Не дать контуру разойтись.", period: "1986", place: "Блок 4", playerRole: "Инженер", estimatedMinutes: 12, supportedModes: ["choice"] } }] });
      }
      if (url.endsWith("/sessions") && init?.method === "POST") {
        return new Response(JSON.stringify({ mission: doc, session: { currentSceneId: "start", turn: 0, world: null }, credential: BINDING_CREDENTIAL }), { status: 201 });
      }
      if (url.includes("/assets/")) {
        assetRequests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
        return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const env = {
        ENGINE_PUBLIC_CATALOG_URL: "https://engine/public/v1/missions",
        ENGINE_PUBLIC_MISSION_URL: "https://engine",
        PUBLIC_MISSION_ROUTE_SESSIONS: namespace
      } as any;
      const created = await worker.fetch(new Request("https://site.example/api/games", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: "mission:chernobyl:shift", mode: "chronicle" })
      }), env);
      expect(created.status).toBe(201);
      const game = await created.json() as { id: string; presentation: { frame: { scene: { backgroundUrl: string } } } };
      const assetUrl = game.presentation.frame.scene.backgroundUrl;

      // A reload: the same game is read again from the stored binding.
      const reloaded = await worker.fetch(new Request(`https://site.example/api/games/${game.id}`), env);
      expect(reloaded.status).toBe(200);
      const reloadedGame = await reloaded.json() as { presentation: { frame: { scene: { backgroundUrl: string } } } };
      expect(reloadedGame.presentation.frame.scene.backgroundUrl).toBe(assetUrl);

      const asset = await worker.fetch(new Request(`https://site.example${assetUrl}`), env);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/png");
      expect(asset.headers.get("cache-control")).toContain("immutable");
      expect(readPngInfo(new Uint8Array(await asset.arrayBuffer()))).toEqual({ width: 12, height: 8, bitDepth: 8, colorType: 6 });
      expect(assetRequests[0].authorization).toBe(`Bearer ${BINDING_CREDENTIAL}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
