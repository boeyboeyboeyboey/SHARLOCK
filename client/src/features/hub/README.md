# Hub (3D Thames Wharf)

## Presentation summary

- What it is: a 3D Thames Wharf landing page on `/` where the player walks Sharlock, a capybara detective, between six buildings; each building opens a game or the news. This is a navigation feature, not a security lesson, so it needs no course citations.
- How to use it: walk (WASD, arrows or the touch joystick), orbit and zoom, use the minimap or destination list, press Enter at a building to open it, jump (Space or the Jump button), replay the lore intro, or switch to the 2D map. The lore intro plays once on first visit; Enter or a click advances a card, and Space or Esc skips the whole intro.
- Technical: Babylon.js 9 with WebGPU falling back to WebGL2; Havok character physics; a procedural capybara rig with a seeded idle state machine; automatic graphics tiers with a 2D fallback; DOM twins of the scene for accessibility.
- Status: Review for see the HUB-01 to HUB-04 records in [TASKS.md](../../../../TASKS.md) (HUB-04 is the Sharlock character pass with idles and jump).
- Known limits: see Known gaps below. Not verified on real phones or low-end hardware.

The default view on `/`: a Babylon.js 3D hub where Sharlock walks between buildings and each building opens a game. The pixel town lives in [legacy-town](../legacy-town/README.md) and is the 2D mode. Task records: HUB-01, HUB-02, HUB-03 and HUB-04 in TASKS.md. Owner: Boey. Integration-sensitive: `client/src/views/Dashboard.vue` (mounts `HubScene` or `TownMap`, never both) and legacy-town.

Players' controls and settings are described in the root README under "Using the app". Update both when they change.

## File map

- `HubScene.vue`, `HubMinimap.vue`, `minimap.js`: the Vue shell, destination list, notices, status line and minimap.
- `engine.js`: engine and physics start-up (WebGPU else WebGL2, Havok wasm via `?url`), dispose, dev `window.__hub`.
- `deviceCheck.js`, `perfWatch.js`, `graphics.js`: device verdict, runtime fps watch, Graphics setting.
- `scenes/a-wharf.js`: scene assembly.
- `scenes/shared/`: `player`, `orbit`, `camera`, `cameraCollision`, `quality`, `assets`, `doors` and other reusable helpers.
- `scenes/shared/capybara.js`: procedural capybara rig, used for Sharlock and the dock-worker crowd.
- `scenes/shared/sharlock.js`: Sharlock's build on the capybara rig (deerstalker, monocle, knitted scarf).
- `scenes/shared/idle.js`: idle state machine (blinks, ear wiggle, sniffing, looking at doors, sitting and yawning).
- `scenes/shared/jump.js`: jump and happy-hop state.
- `scenes/wharf/`: `layout` (destinations), `views` (selection cameras), `backdrop`, `farbank`, `skyline`, `world` and the buildings, props and water modules.
- `__tests__/`: unit tests.

## 3D or 2D

1. `deviceCheck.js` decides: no WebGL2 or a software renderer gives 2D; save-data, 2 GB memory or less, or 2 CPU cores or fewer gives the Low tier.
2. An explicit user choice (`sharlock.townMode`) overrides the device verdict.
3. `perfWatch.js` samples fps, steps quality down and finally falls back to 2D, unless the user explicitly chose 3D.

## Storage keys

- localStorage: `sharlock.graphics`, `sharlock.townMode` (explicit choice only, never an automatic fallback), `sharlock.hubPerf`, `sharlock.autoNoticeDismissed`, `sharlock.loreIntroSeen` (`'1'` once the lore intro finishes or is skipped).
- sessionStorage: `sharlock.hubReturn` (building to restore after returning from a game).

## Dev-only hooks (`import.meta.env.DEV` only)

- URL: `?hub=force3d`, `?renderer=webgl2`, `?tier=desktop|compact|low`, `?mirror=0|1`.
- localStorage: `sharlock.hubForce3d=1` (force 3D on software rendering), `sharlock.hubWatchManual=1` (runtime watch reacts only to simulated fps).
- `window.__hub`: `state`, `select`, `enter`, `back`, `resetCamera`, `pauseInput`, `debug.{position,doors,walkTo,simulateFps,jump,airborne}`.
- A status line shows engine, fps and draw calls.

## Lore intro

- Plays once on first entry to the 3D hub on `/`: five serif title cards fade in and out on black ("London, 1880." to "The city is counting on you."), then the black fades up on Sharlock at the wharf. About 27 s.
- The overlay covers the whole browser window, including the navbar and hub HUD. It is rendered to `<body>` with `position: fixed`; it does not use the browser Fullscreen API.
- Hold per card is the longer of 1.5 s and 0.32 s per word, with 0.4 s fades. Enter or a click advances one card. Space or Esc skips the whole intro. A faint bottom-right button reads "Press Space to skip" (or "Tap to skip" on touch screens), with accessible name "Skip intro". The hub loads behind it.
- Audio: plays `/audio/lore-intro.mp3` at volume 0.5. A small top-right sound toggle ("Mute intro sound" / "Turn on intro sound") shares the session-only `sharlock.musicMuted` key with the town and hub music; unmuted is never stored. If the browser blocks autoplay, the intro opens on "Click or press Enter to begin"; that click starts the sound and card 1. The audio fades out (0.8 s on finish, 0.3 s on skip) before the hub ambience starts, so only one sound plays at a time. A missing or failed file runs silent.
- If the scene is not ready at the end, the last card shows "Loading the wharf…" until it is.
- Reduced motion: no fades and no auto-advance. Plain cards with Continue; Space still skips.
- Seen state: localStorage `sharlock.loreIntroSeen` = `'1'`, per browser, set on finish or skip. The **Replay intro** button is a small icon-only button (Phosphor film-slate icon from `@phosphor-icons/vue`), with accessible name and tooltip "Replay intro", beside **Reset camera** in the hub HUD.
- Hub input and the hub ambience (`HubAmbience.vue`) stay paused while it plays. The ambience starts when the intro audio has faded out, unless muted.
- 2D mode and the no-WebGL fallback never show it.
- Accessibility: `role="dialog"`, `aria-modal`, card text in an `aria-live` region, focus trapped and returned to the hub. Card text is white `#fff` on black `#000` (21:1). The name "Sharlock Holmes" on card 4 is warm gold `#E8C468` (about 12:1 on black), in the same font and size.
- Font: Libre Baskerville 400 via `@fontsource/libre-baskerville` 5.3.0 (SIL OFL 1.1), pinned exact. It is imported only by `intro/LoreIntro.vue`, a deliberate exception to the shared pixel fonts, confined to the intro.
- Files: `client/src/features/hub/intro/` (`loreCards.js`: card text and hold timing; `useLoreIntro.js`: seen state and playing flag; `LoreIntro.vue`: the overlay). `HubScene.vue` mounts it; `HubAmbience.vue` holds the audio pause.

## Testing

- Unit: `client/src/features/hub/__tests__/`, including `idle.test.js`, `jump.test.js` and the lore tests (`loreCards.test.js`, `useLoreIntro.test.js`, `LoreIntro.test.js`).
- Lore intro: every hub E2E spec must pre-set `sharlock.loreIntroSeen` to `'1'` in its init script, or the intro blocks the hub. `tests/e2e/lore-intro.spec.js` covers the intro journey.
- E2E: `tests/e2e/hub.spec.js` and `tests/e2e/hub-auto.spec.js`. `hub.spec.js` covers the jump. Hub specs force 3D with `sharlock.hubForce3d=1` and `sharlock.hubWatchManual=1` (see the `beforeEach` in `hub.spec.js`, about lines 42-49), because headless Chromium renders in software.
- E2E waits are condition-based (`expect`, `expect.poll`, `waitForFunction`); never use `waitForTimeout`.
- Any other E2E spec that touches the town must force 2D mode:

```js
await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
```

See `tests/e2e/portal.spec.js:6`.

## Destination picks (HUB-05)

- A list or minimap pick auto-walks along the lane graph. Routes start and end only at walkable lane nodes, because the west lane end sits inside a crate collider and used to stall the walk.
- If a route still stalls, the camera hold and the pick stay, so Enter remains usable; steering by hand (keys, joystick) or clicking the ground drops the pick as before.
- Picks made while the enter swoop is running are ignored, so the swoop always finishes and opens the game.

## Assets and adding a building

- Skyline plates: `client/public/hub/plates/` (`thames-far-1..8`, `thames-mid-1..4` `.webp`); the list is in `scenes/shared/assets.js` (far 7 and 8 are probed, not assumed).
- A building needs: an entry in `client/src/data/gameCatalog.js`, a destination in `scenes/wharf/layout.js` (id, title, position, facing, reach, building), a selection view in `scenes/wharf/views.js`, and the building geometry in the wharf scene modules. Catalog and router changes are integration-sensitive and need Boey's approval.

## Known gaps

- Crates, chimneys and signs have no camera collision (the crane tower has one; the jib does not).
- The desktop destination list covers the right edge of selection views.
- Minimap context blocks are approximate.
- Not verified on real phones or low-end hardware.

## Audio

The 3D hub plays its own recorded ambience loop, `/audio/hub-ambience.mp3`, through `HubAmbience.vue` (AUDIO-03, Boey, 28 October 2026). It reuses `client/src/composables/useLandingMusic.js` unchanged: autoplay attempt, one-time `pointerdown`/`keydown`/`touchstart` fallback, volume 0.5, and the shared session-only mute key `sharlock.musicMuted`, so one Sound off covers the hub and the 2D town. The visible **Sound on/off** control (`Mute hub sound` / `Turn on hub sound`) sits in the HUD row between Graphics and the profile link in `Dashboard.vue`. It pauses while the Times (`news` route) is open and resumes on close unless muted; playback and listeners are cleaned up on leave. The 2D town keeps `sharlock-bgm.mp3` ([legacy-town](../legacy-town/README.md#audio)); only one of the two is mounted, so `/` has one sound source at a time.

E2E: `tests/e2e/hub.spec.js` (mode-switch test) checks that the hub mounts one `<audio>` with `src` `/audio/hub-ambience.mp3` and a visible hub Sound button, and that switching to 2D mounts `/audio/sharlock-bgm.mp3` with no hub Sound button. Unit: `client/src/features/hub/__tests__/HubAmbience.test.js` covers the file and loop, autostart, session mute, muted-session no-autoplay and the Times suspend/resume.
