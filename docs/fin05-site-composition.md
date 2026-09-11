# FIN-05 site half — the published player renders the authored composition

Status: **implemented locally on `feat/fin03-site-session-assets`, verified by unit/render tests and a production build; no browser pass against the live engine.**

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

## Verification

- `npx vitest run` — **21 files / 109 tests** (was 20 / 100).
  - `screen-composition.test.ts` (5 tests, RED before the module existed):
    preset normalisation and mapping, reduced-motion/pause suppression, own/
    inherited/none background, music states.
  - `frame-build.test.ts`: the authored preset reaches every layer; own vs
    inherited vs none background; the authored music resolves to a session-pinned
    asset URL.
  - `published-mission-stage.test.tsx`: the published player renders the preset
    class, the background source and the music element with a real mute control.
- `npx tsc -b` — exit 0 (the shared module also type-checks in the worker project,
  which has no DOM lib; the audio element is bound through a callback ref).
- `npm run build` and `npm run build:preview` — both exit 0.

## Not verified / out of scope here

- **No live browser pass.** The checks are React `renderToString` + unit tests +
  the production build; autoplay behaviour and actual audio output were not
  exercised against a running engine.
- **`fit` / focal point / crop** are still fixed to `cover` (centred): the
  canonical `MissionSceneScreen` carries no fit/focal field, so nothing is read
  and nothing is invented. If the contract gains one, `fitScreenAsset` from the
  Studio module is the natural source.
- **Dialogue lines and multi-intro paging** ("вступления с «Далее/Начать»",
  "перелистывание вступлений не тратит ход") belong to the story-screen slice,
  not this composition slice; the published frame still renders a single intro
  and does not surface `scene.dialogue`. The engine worklog lists them as a
  separate remaining item.
- **The real asset library** (upload, MIME, dimensions across browsers/restart)
  is not part of this slice.
