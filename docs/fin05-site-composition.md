# FIN-05 site half — the published player renders the authored composition

Status: **implemented locally on `feat/fin05-site-fit`, verified by unit/render tests and a production build; no browser pass against the live engine.**

The Studio half of FIN-05 (FIN-05B, engine repo) composes a screen with the
canonical `MissionDraft.screens`: a background (own / inherited / none), PNG
layers with placement transforms, an animation preset, and music. Its worklog
records the remaining gap exactly: the composed scene "is not connected to the
Player/site/runtime/BFF". This is that site half.

## What the published player now consumes

The immutable published revision already carries the composition; the site just
had to render it. `builtMissionFrame` (`src/shared/mission-presentation/frame-build.ts`)
now maps it into the shared frame that the published player and the Studio
preview both render:

| Authored field (mission revision) | Rendered as |
|---|---|
| `screens.scenes/endings[id].background` + `inheritBackground` + `defaults.background` | the stage background, tagged `data-background-source="own" \| "inherited" \| "none"` |
| `screens.*.layers[]` (`x/y/scale/rotation/flipH/flipV/opacity/z/visible`) | outer placement transform + z-order (`layerOuterStyle`), unchanged contract |
| `defaults.animationPreset` (`none`/`fade`/`rise`/`breath`) | inner ambient/entrance class (`mp-anim-none`/`mp-anim-fade`/`mp-anim-rise`/`mp-anim-breathe`) |
| `screens.*.music` | a same-origin `<audio>` element with real mute/play, plus an explicit "autoplay blocked" state |
| `screens.*.background` fit/focal (forward-compatible) + library dimensions | the background's contain/cover geometry, the authored focal point and the resulting crop (see below) |
| `defaults.theme` | not rendered yet (no theme tokens in the shared view-model) |

The pure resolvers live in `src/shared/mission-presentation/screen-composition.ts`
and mirror the Studio's `screen-composition.ts` semantics without copying its
editor concerns:

- `resolveScreenBackground` — own / inherited / none, inheriting by default when
  `inheritBackground` is absent (the Studio's default screen);
- `normalizeAnimationPreset` + `resolveScreenAnimation` + `presetToLayerAnimation`
  — the preset stays known while the inner transform is suppressed by
  `prefers-reduced-motion` or a paused stage (the CSS already freezes the
  animations; the resolver is the tested contract);
- `resolveScreenMusic` — `none` / `playing` / `muted` / `blocked`, so a browser
  autoplay refusal is shown as "Нажмите «Играть»" instead of a silent track.

No new mission-contract field was introduced: the composition is the Studio's
canonical `MissionSceneScreen` / `MissionScreenLayer`, so `contentHash` still
changes exactly when the author edits the visible/executable content.

## Background geometry: contain/cover, focal point, crop

`screen-composition.ts` now carries the Studio's own fit model verbatim, so the
published player can render the composition the author composed:

- `fitScreenAsset(assetAspect, frameAspect, mode, focal)` — the same arithmetic
  as the Studio: the frame is normalized by height, `contain` fits the whole
  asset (`min`), `cover` fills the frame (`max`), and the authored focal point is
  projected into the frame centre, which is what decides the crop
  (`sourceX/Y/W/H` + `crop`);
- `normalizeFitMode` / `normalizeFocalPoint` / `resolveScreenFit` — fail-closed:
  anything that is not `contain` stays `cover`, a non-finite or out-of-range
  focal point stays the frame centre;
- `assetAspectFromRef` — the aspect comes from the real library dimensions when
  the revision serialises them (`widthPx`/`heightPx`, the engine's
  `AssetManifestV2` names), otherwise from the loaded image itself.

The shared stage (`stage-model.ts`) maps that fit onto the DOM without inventing
a second geometry: the background element's natural box is the asset at frame
height (`height: 100%; width: auto`), so `left`/`top` are frame percentages and
`transform: scale(...)` reproduces the Studio projection exactly —
`left = offsetX / frameAspect`, `top = offsetY`, origin top-left, and
`right/bottom: auto` so the `.mp-background { inset: 0 }` default cannot stretch
the box. While the real dimensions are unknown (SSR, before the image loads)
nothing is invented: the style falls back to CSS `object-fit` + a focal-aware
`object-position`, which for the default centred `cover` is exactly the previous
behaviour.

`MissionSceneStage` measures the loaded image (`naturalWidth`/`naturalHeight`)
and re-renders with the exact crop, and exposes `data-fit`, `data-focal`,
`data-crop` and `data-source-rect` so the rendered fit is inspectable.

`frame-build.ts` reads the authored `fit`/`focal` from the screen and the
dimensions from the resolved background ref. The canonical screen carries
neither today, so a published mission keeps the Studio default (cover, centre) —
no behaviour change — and a revision that gains them flows through without
inventing a contract of its own.

## The material layer

The site only ever sees bytes; `src/worker/material-library.test.ts` checks that
it really is a library, not a stub:

- the fixture is a REAL 12x8 RGBA PNG (built in-test with correct CRCs and a
  stored-block zlib stream). The test inflates the served IDAT through Node's
  zlib, so the fixture is proven decodable: 8 scanlines of 12 RGBA pixels with
  the deliberately transparent pixel keeping `alpha = 0`;
- byte identity across the BFF (`arrayBuffer()` re-wrapped in a `Response`) —
  which is what preserves hash, dimensions and transparency (no re-encode, no
  padding, no flavour conversion);
- the trusted MIME from upstream (`image/png` + `nosniff`), the pinned-revision
  ETag (`contentHash` + `assetId`), `x-mission-revision`;
- reload survival: re-reading the stored binding rebuilds the same frame with the
  same session-pinned asset URL, the upstream request is identical, and the bytes
  come back unchanged.

## Verification

- `npm test` (= `npx vitest run`) — **23 files / 123 tests passed** (was 21 / 109).
  - `screen-composition.test.ts`: preset normalisation and mapping,
    reduced-motion/pause suppression, own/inherited/none background, music states.
  - `screen-fit.test.tsx` (11 tests, RED before the model existed: `fitScreenAsset
    is not a function` / `backgroundStyle is not a function`, 11 failed / 112
    passed): cover crops a square asset to the frame height, contain keeps the
    whole asset, the focal point decides the horizontal/vertical crop window,
    NaN-safety, fail-closed mode/focal, the frame-coordinate geometry
    (`scale(1.7778)`, `top: -38.8889%`, `left: offsetX / frameAspect`), the
    object-fit fallback while dimensions are unknown, the `data-*` crop report,
    the frame wiring (authored contain/focal/dimensions, junk → cover/centre,
    inherited background keeps its own focus) and the rendered stage.
  - `material-library.test.ts` (3 tests): real PNG byte identity through the BFF,
    independently inflated IDAT + alpha, trusted MIME/ETag, same URL and bytes
    after a reload.
  - `frame-build.test.ts`, `published-mission-stage.test.tsx`: the authored
    preset/background/music still render, unchanged.
- `npm run check` (= `tsc -b --pretty false`) — **exit 0** (the shared module also
  type-checks in the worker project, which has no DOM lib; the audio element and
  the image measurement are bound through narrow callback interfaces).
- `npm run build` and `npm run build:preview` — both **exit 0**.
- Load-bearing mutations (applied, then reverted; the file hash was verified
  identical after the rollback, so `git diff` carries no trace):
  1. `fitScreenAsset` swapping `min`/`max` for contain/cover → **5 failures**.
  2. dropping the `/ frameAspect` normalization of `left` in `backgroundStyle`
     → initially **survived** (the tests only covered `offsetX = 0` or
     `frameAspect = 1`); a test for a 2:1 asset in a 16:9 frame was added, after
     which the same mutation → **1 failure**.

## Not verified / out of scope here

- **No live browser pass.** The checks are React `renderToString` + unit tests +
  the production build. The CSS geometry was designed to be checked in a browser
  (and the browser session here timed out), so the rendered pixels, the real
  `naturalWidth` measurement path (`onLoad`), autoplay/audio output and the
  engine-backed run were **not** exercised. Everything about the geometry is
  therefore a model-level result, not a screenshot.
- **The fit/focal point is not in the canonical contract yet**: the engine's
  `MissionSceneScreen` carries only `background`/`inheritBackground`/`layers`/
  `music`, and the Studio DOM editor's background is hard-wired to a centred CSS
  `cover` (it calls `fitScreenAsset` with the *frame* aspect, so the transform is
  always the identity). The site therefore reads `fit`/`focal`/`widthPx`/
  `heightPx` as optional, forward-compatible fields and defaults to exactly what
  the Studio renders today. Until the contract grows a field, parity is proven
  against the Studio's *pure model* (`screen-composition.ts`), not against a
  pixel diff.
- **Material library ingestion is the engine's job.** The site only serves bytes:
  upload, MIME sniffing, dimension extraction and dedup by hash live in the
  engine (`B07-02`), so what is verified here is preservation and reload
  behaviour, not the library itself.
- **Layer footprint parity is unchanged and unproven**: the Studio positions a
  layer box at `0.25 * scale` of the frame (`screenLayerBox`), while the shared
  stage renders a `22%`-wide element centred on the authored `x/y` with the image's
  own aspect. Both keep the same centre and z-order, but the footprints differ, so
  a layer is not yet pixel-identical between the Studio model and the site.
- **Dialogue lines and multi-intro paging** ("вступления с «Далее/Начать»",
  "перелистывание вступлений не тратит ход") belong to the story-screen slice
  (`feat/fin05-site-dialogue`, `fea316b`), not this composition slice; the
  published frame still renders a single intro and does not surface
  `scene.dialogue`.

