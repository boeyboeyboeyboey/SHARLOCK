# Legacy town (2D mode)

The pre-HUB-01 Panzoom pixel town. Since HUB-01 it is the **2D mode** on `/` and the automatic fallback when WebGL2 is missing or the 3D hub fails to start.

1. `Dashboard.vue` mounts either `HubScene` or `TownMap` (`v-if`), never both. `useTownMode.js` picks the mode.
2. The explicit 2D/3D choice is stored in `localStorage` key `sharlock.townMode`. A forced or automatic fallback is never stored; Graphics is stored in `sharlock.graphics` and device checks live in `features/hub/deviceCheck.js`.
3. Styles stay in the global `client/src/assets/styles/town.css`; its shell and dashboard rules are shared with the 3D landing.
4. `PixelIcon.vue` is shared and stays in `client/src/components/town/`.

Rollback:

1. Quick: in `Dashboard.vue`, make `resolveMode` in `useTownMode.js` return `'2d'` in its final default case (`return { mode: '3d', ... }`, line 44).
2. Full: check out git tag `legacy-town-2026-10` (commit `f5f8995`) to restore the original town and Dashboard.

Owned files: `TownMap.vue`, `TownScenery.vue`, `TownAudio.vue`, `GameInfoCard.vue`, `useTownMode.js`, `__tests__/`.

## Audio

`TownAudio.vue` wraps `client/src/composables/useLandingMusic.js` and is mounted by `TownMap.vue` (2D) and by `Dashboard.vue`'s HUD row (3D hub), so exactly one player exists on `/`. It tries to start `/audio/sharlock-bgm.mp3` on arrival; if `play()` is rejected it arms one-time `pointerdown`/`keydown`/`touchstart` listeners on the document and starts on the first one. A mute is stored in `sessionStorage` (`sharlock.musicMuted`) for the session only and stops auto-start until unmuted; an unmuted preference is never stored. `suspended` (the Times is open) pauses it and resumes unless muted. Leaving `/` pauses it and removes the listeners. Team consent: Boey, 28 October 2026.
