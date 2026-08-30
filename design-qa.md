# Design QA — animated mode selection

## Checkpoint

- Live build: https://living-history-sandbox.conradipui.workers.dev/?v=0e0e4b5
- Source visual truth: `/workspace/scratch/01-current-mode-selection-20260830.jpg`
- Implementation capture: `/workspace/scratch/02-animated-mode-selection-20260830.jpg`
- Full comparison: `/workspace/scratch/mode-selection-before-after-20260830.jpg`
- Focused comparison: `/workspace/scratch/mode-selection-focus-comparison-20260830.jpg`
- Observed browser viewport: approximately 1363 x 936 CSS pixels; full-page captures are 1348 x 1516 pixels.
- Tested state: main story picker, campaign selected.

## Visual comparison

| Area | Result | Notes |
| --- | --- | --- |
| Layout and spacing | Pass | Existing grid and section rhythm are unchanged. The selected mode receives an intentional 3 px lift. |
| Typography | Pass | Fonts, sizes, hierarchy, and line lengths are unchanged. |
| Colour | Pass | Existing palette is preserved. Particles add only restrained brick-red, antique-gold, and warm-paper highlights. |
| Image quality | Pass | Transparent 900 x 900 PNG is sharp at display size and optimized to about 34 KB. |
| Copy and information | Pass | No labels, descriptions, or choices were removed or rewritten. |
| Motion | Pass | Slow two-layer drift, restrained flicker, pointer parallax, card hover, and selected-card breathing are visible without obscuring text. |
| Reduced motion | Pass in code | `prefers-reduced-motion` removes particle and card animations and leaves a calm static texture. The OS preference was not toggled in this browser session. |

## Interaction and runtime checks

1. Loaded the production build and confirmed both transparent particle layers completed at their natural 900 x 900 resolution.
2. Moved the pointer across the mode selector and confirmed the parallax CSS variables changed.
3. Switched from Campaign to Chronicle and confirmed the selected state and copy updated correctly.
4. Confirmed the generated asset is served from the production bundle.
5. No application-origin console errors were observed. The only console noise came from unrelated browser-extension metadata requests.

## Evidence limits

- Desktop production state was visually checked; a separate mobile browser capture was not made in this pass.
- Reduced-motion behaviour was verified in the stylesheet, not through a live OS setting toggle.
- This is a focused visual and interaction QA pass, not a full WCAG audit or screen-reader test.

## Issue summary

- P0: none.
- P1: none.
- P2: none.
- P3: capture the mode selector on a narrow mobile viewport during the next broader responsive QA pass.

Final result: passed.

## Checkpoint — intro deck and world-state scenes

- Live build: https://living-history-sandbox.conradipui.workers.dev/?v=a367d3a
- Commit: https://github.com/conradipui-glitch/sandbox/commit/a367d3a3901184631135556945d796597b7d6573
- Tested states: five-slide campaign intro; first turn of «Последний поезд из Петрограда»; campaign turn with a factory negotiation; campaign turn with a telegraph dispatch.

| Area | Result | Notes |
| --- | --- | --- |
| Intro scrolling | Pass | Five vertical snap slides, progress indicator, arrows, keyboard navigation, skip and begin actions all remain visible and readable. |
| Short chronicle scene | Pass | The train chronicle renders Belyaev, the freight train, a station background and state-selected prop labels. |
| Campaign scene switching | Pass | The factory branch renders Anna Novikova on `factory-yard`; the telegraph branch renders Lidia Vetrova and changes the prop set. |
| Character variety | Pass | The renderer consumes up to two known `activeCharacterIds`; minister, officer, journalist, dispatcher, worker and industrialist have distinct assets and positions. |
| State-driven background | Pass | `scene.locationId` maps to distinct cabinet, station, telegraph, carriage and factory treatments; no copy-only location swap. |
| Readability and controls | Pass | Mute and text-scale controls persist in intro and game; scene prop labels stay secondary to the briefing and outcome. |

## Evidence limits

- The scene checks were made in the cloud browser at desktop width; no separate narrow-mobile capture was made for this checkpoint.
- DeepSeek and Cloudflare AI responses are nondeterministic; the tested screenshots prove the rendering contract and two concrete production branches, not every possible future scene selection.
- `prefers-reduced-motion` is covered by CSS and existing QA; it was not toggled live in this browser session.

Final result: passed; no P0, P1 or P2 issues found.
