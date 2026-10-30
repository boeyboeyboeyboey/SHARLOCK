# Legacy town (2D mode)

## Presentation summary

- What it is: the 2D mode of the landing page `/`, a pixel wharf town with six destinations, the newsstand on a pier, a cobbled street to a fountain plaza, and a few generic capybaras and gulls.
- Not a lesson: it is navigation only, so there are no course citations.
- Use it: drag or swipe to pan, pinch or +/- to zoom (fit-to-town up to 200%, steps fit, 50, 75, 90, 100, 125, 150, 175, 200; `townZoom.js`), arrow keys pan, 0 resets, Jump to centres a building (the toolbar row above the map holds Jump to, the zoom buttons and Reset view), hover, focus or tap a building for its card.
- Technical: Vue 3 plus `@panzoom/panzoom` for the one camera; buildings, ground, barges, props and animals are code-drawn SVG from `townArt.js`, positioned from `gameCatalog.js`; animation is CSS only.
- Status: see the TOWN-01 record in TASKS.md. Limits: decorative figures are not interactive and have no names.

The pre-HUB-01 Panzoom pixel town. Since HUB-01 it is the **2D mode** on `/` and the automatic fallback when WebGL2 is missing or the 3D hub fails to start.

1. `Dashboard.vue` mounts either `HubScene` or `TownMap` (`v-if`), never both. `useTownMode.js` picks the mode.
2. The explicit 2D/3D choice is stored in `localStorage` key `sharlock.townMode`. A forced or automatic fallback is never stored; Graphics is stored in `sharlock.graphics` and device checks live in `features/hub/deviceCheck.js`.
3. Styles stay in the global `client/src/assets/styles/town.css`; its shell and dashboard rules are shared with the 3D landing.
4. `PixelIcon.vue` is shared and stays in `client/src/components/town/`.

Rollback:

1. Quick: in `Dashboard.vue`, make `resolveMode` in `useTownMode.js` return `'2d'` in its final default case (`return { mode: '3d', ... }`, line 44).
2. Full: check out git tag `legacy-town-2026-10` (commit `f5f8995`) to restore the original town and Dashboard.

Art and motion:

1. `townArt.js` builds trusted static SVG strings (no user text) on a 4px grid: six buildings keyed by catalog `building.type` (`TYPE_ART`), the ground and unfinished bridge, barges, props, lamps and the capybara and gull markup. `TownBuildingArt.vue` renders one building; `TownScenery.vue` layers ground, barges, props, life, trees/bushes (the `/images/town/` SVGs) and lamps.
2. Catalog `building.x/y` is the top-left of a 192 x 200 footprint whose bottom edge is the ground line; art is centred and bottom-anchored, and the name label hangs below.
3. Townsfolk capybaras come from a small wardrobe in `townArt.js` (TOWN-02): `capyFurs` (six fur pairs), `capyProps` (crate, basket, flat cap, felt hat, bowler, apron, newspaper, neckerchief; back props sit behind the body, front props over it) and `townCapys`, one distinct fur and prop combination per capybara in `lifeMarkup` order. Sharlock's deerstalker, monocle and red scarf are never used. Fill colours for props and the bridge crane stay clearly lighter than the outline ink `#354b3e`; in ink they vanish into outlines and edge lines (the crane is yellow `#d9a441`, the bowler slate `#5f6675`). The crane and everything else on the ground stay at least 8px below the world top, and the second gull flies in open sky between the crane and the scaffold; `__tests__/townArt.test.js` checks both.
4. Animals walk with CSS `transform` keyframes and a two-frame leg swap (no JavaScript timers or listeners). All decorative layers are `aria-hidden` and `pointer-events: none`.
5. Under `prefers-reduced-motion: reduce` every animation is off and walkers are drawn static with four legs; the rules live in `town.css` under `no-preference`.

Zoom: the floor is the scale at which the whole 1120 x 800 world fits the viewport (`fitScale`, recomputed on mount and resize); a custom panzoom `setTransform` clamps the pan with `clampPan` (edge to edge when the world covers the view, centred when it is smaller), replacing panzoom's `contain`. The toolbar follows the interface size (`--ui-scale`, see DESIGN.md).

Owned files: `townZoom.js`, `TownMap.vue`, `TownBuildingArt.vue`, `townArt.js`, `TownScenery.vue`, `TownAudio.vue`, `GameInfoCard.vue`, `useTownMode.js`, `__tests__/`.

## Audio

`TownAudio.vue` wraps `client/src/composables/useLandingMusic.js` and is mounted by `TownMap.vue` (2D) only and teleports its round Sound button into the floating controls beside the 3D | 2D switch (`soundSlot` in `client/src/features/menu/townControls.js`; inline when no slot exists, so there is exactly one visible Sound button); the 3D hub plays its own ambience loop through `HubAmbience.vue` instead ([hub audio](../hub/README.md#audio)), so only one sound source is mounted on `/` at a time. The music is capped at half volume (`MUSIC_VOLUME` 0.5; AUDIO-02, Boey, 28 October 2026). It tries to start `/audio/sharlock-bgm.mp3` on arrival; if `play()` is rejected it arms one-time `pointerdown`/`keydown`/`touchstart` listeners on the document and starts on the first one. A mute is stored in `sessionStorage` (`sharlock.musicMuted`) for the session only and stops auto-start until unmuted; an unmuted preference is never stored. `suspended` (the Times is open) pauses it and resumes unless muted. Leaving `/` pauses it and removes the listeners. Team consent: Boey, 28 October 2026.
