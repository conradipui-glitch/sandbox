# FIN-05 site slice — dialogue lines and multi-intro paging

Status: **implemented on `feat/fin05-site-dialogue`, verified by unit/render
tests and the production build; no browser pass against the live VPS.**

The previous site slice rendered the authored screen composition (background,
layers, animation preset, music) and explicitly left two things open: it did not
surface `scene.dialogue`, and it rendered a single intro. This slice closes both
on the site side. Nothing in the engine repository was touched.

## What the contract already carries (no new mission field)

| Authored field (mission revision) | Used as |
|---|---|
| `MissionScene.dialogue[]` = `{ id, speakerId: string \| null, text }` | the scene's authored lines, in author order |
| `MissionIntroScreen[]` (`screens.intros`) = `{ id, title, body, background }` | the ordered intro pages |

`FrameDocShape` / `MissionDocShape` mirror those two fields exactly; the frame
view gains `dialogue?: PreviewDialogueLineView[]` and
`introPage?: { index, count, hasNext }`, which are the renderer's own vocabulary
(like `musicUrl` / `animationPreset` before them), not mission-contract fields.

## Player semantics (`src/shared/mission-presentation/story-screen.ts`)

Pure, data-driven, no scenario ids:

- **`dialogueKeyAction(event)`** — Enter / Space / ArrowRight / ArrowDown /
  PageDown advance; Ctrl/Meta/Alt combinations are never captured (the same
  strict-modifier rule as the Studio's `screenKeyAction`). A key raised by a
  control that activates itself (the focused «Далее» button) is left to that
  control, so one key press cannot advance two lines.
- **`SequenceProgress` + `reconcileSequenceProgress` / `advanceSequenceProgress`**
  — the player's position in one authored sequence. The sequence is identified by
  the authored *content* (`contentHash` + kind + title + the lines themselves),
  so a frame that is rebuilt on re-render keeps the position, while a different
  scene starts from the beginning. The same input event is consumed at most once
  (the identity of the native event is the guard), and the sequence stops at the
  end instead of wrapping.
- **`dialogueSequenceKey` / `activeDialogueLine` / `advanceDialogueOnInput`** —
  dialogue over the same rules.
- **`introSequenceKey` / `activeIntroFrame` / `advanceIntroOnInput`** — the same
  rules for paging the authored intros.

## Rendering

- `MissionDialogue` (used by `MissionSceneStage`) shows one line at a time with
  its authored `speakerId` as `data-speaker-id` (see the gap below), the
  `index+1 / count` progress and one control: **«Далее»**, or **«Начать»** on the
  last line. Click/tap the line, the advance key, or the control advance it.
  `disabled` while the stage is paused — a busy turn in the published player or
  the authoring preview — so pause truly freezes advancing; reduced motion only
  affects the inner animations, never advancing.
- `MissionIntroScreen` renders «Далее» while `introPage.hasNext` **and** the host
  can page on, otherwise «Начать»; `MissionIntroPager` owns the page index with
  the same sequence rules.
- `PublishedMissionStage` pages the authored intros in
  `presentation.intros` before the mission's first turn (`frame.turn === 0`) and
  reveals the opening scene on «Начать». Paging and «Начать» are local to the
  player: the frame stays the scene and no turn is submitted, so paging an intro
  does not spend a turn (matching `docs/PLAN-FIN-RU.md`).
- `publishedMissionGameState` (worker) attaches the paged intro frames built
  from the pinned revision next to the current scene frame.

## Verification

- `npm test` — **23 files / 129 tests** (was 21 / 109).
  - `story-screen.test.ts` (7 tests, RED before the module existed): key
    mapping + strict modifiers, keys from self-activating controls, the sequence
    identified by authored content (survives a re-render, resets on another
    scene), one event → one step, stop at the last line, speaker id passthrough
    with no invented speaker name, intro paging.
  - `frame-build.test.ts`: the authored dialogue reaches the frame in order and
    a malformed line is dropped; `buildMissionIntroFrames` returns every page
    with `{ index, count, hasNext }`; `buildMissionIntroFrame` selects by index or
    id and refuses an index off the end.
  - `story-screen-components.test.tsx`: the first line renders with its control,
    a paused stage disables advancing, the last line offers «Начать», the pager
    shows «Далее» then «Начать».
  - `published-mission-stage.test.tsx`: the scene's dialogue renders; the intros
    page before the first turn without offering scene choices; they do not
    reappear once the mission has moved on.
  - `public-mission-bff.test.ts`: the published state carries the dialogue and
    the paged intros while the frame stays the scene at turn 0.
- `npm run check` (`tsc -b`) — exit 0. The shared module is still type-checked by
  the worker project, which has no DOM lib: the React event handling is typed
  structurally (`PointerInputEvent` / `KeyInputEvent`) instead of importing DOM
  types.
- `npm run build` — exit 0.
- Runtime: Node 24.19.0 (pinned), `npm ci` from the committed lockfile; the
  lockfile is unchanged.

## Gaps / not done here

- **No speaker display name.** The contract carries only `speakerId` on a
  dialogue line (`MissionDialogueLine`, and `SceneDialogueLineV2` likewise); the
  mission revision has no cast/speaker-name map. The id is carried through to
  `data-speaker-id` and is not shown to the player as a name — inventing one (or
  guessing it from an actor layer's `name`) would be a new contract field, so the
  lines render as text only. A speaker name needs an authored field first.
- **No browser pass.** No live VPS/nginx/gate verification: the advance keys,
  tap targets, autoplay and the real intro frames were exercised through unit
  tests and `renderToString` only.
- **The intro is shown while the mission is at turn 0.** There is no server-side
  "intro seen" flag in the revision, so a reload before the first turn shows the
  authored intro again. That is honest (the game has not started) but it is a
  product decision, not a contract one.
- **`frame.kind === "intro"` hosts** (a single intro frame handed in by a host)
  keep their existing «Начать» behaviour; paging needs the host to pass the intro
  list, which the published worker now does.
