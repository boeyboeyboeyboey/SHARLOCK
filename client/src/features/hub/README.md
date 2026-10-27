# Hub (3D Thames Wharf)

## Presentation summary

- What it is: a 3D Thames Wharf landing page on `/` where the player walks Sharlock, a capybara detective, between six buildings; each building opens a game or the news. This is a navigation feature, not a security lesson, so it needs no course citations.
- How to use it: walk (WASD, arrows or the touch joystick), orbit and zoom, use the minimap or destination list, press Enter at a building to open it, jump (Space or the Jump button), or switch to the 2D map.
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

- localStorage: `sharlock.graphics`, `sharlock.townMode` (explicit choice only, never an automatic fallback), `sharlock.hubPerf`, `sharlock.autoNoticeDismissed`.
- sessionStorage: `sharlock.hubReturn` (building to restore after returning from a game).

## Dev-only hooks (`import.meta.env.DEV` only)

- URL: `?hub=force3d`, `?renderer=webgl2`, `?tier=desktop|compact|low`, `?mirror=0|1`.
- localStorage: `sharlock.hubForce3d=1` (force 3D on software rendering), `sharlock.hubWatchManual=1` (runtime watch reacts only to simulated fps).
- `window.__hub`: `state`, `select`, `enter`, `back`, `resetCamera`, `pauseInput`, `debug.{position,doors,walkTo,simulateFps,jump,airborne}`.
- A status line shows engine, fps and draw calls.

## Testing

- Unit: `client/src/features/hub/__tests__/`, including `idle.test.js` and `jump.test.js`.
- E2E: `tests/e2e/hub.spec.js` and `tests/e2e/hub-auto.spec.js`. `hub.spec.js` covers the jump. Hub specs force 3D with `sharlock.hubForce3d=1` and `sharlock.hubWatchManual=1` (see `hub.spec.js` near line 44), because headless Chromium renders in software.
- E2E waits are condition-based (`expect`, `expect.poll`, `waitForFunction`); never use `waitForTimeout`.
- Any other E2E spec that touches the town must force 2D mode:

```js
await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
```

See `tests/e2e/portal.spec.js:6`.

## Assets and adding a building

- Skyline plates: `client/public/hub/plates/` (`thames-far-1..8`, `thames-mid-1..4` `.webp`); the list is in `scenes/shared/assets.js` (far 7 and 8 are probed, not assumed).
- A building needs: an entry in `client/src/data/gameCatalog.js`, a destination in `scenes/wharf/layout.js` (id, title, position, facing, reach, building), a selection view in `scenes/wharf/views.js`, and the building geometry in the wharf scene modules. Catalog and router changes are integration-sensitive and need Boey's approval.

## Known gaps

- Crates, chimneys, signs and the crane jib have no camera collision.
- The desktop destination list covers the right edge of selection views.
- Minimap context blocks are approximate.
- Not verified on real phones or low-end hardware.

## Audio

The hub has no audio code of its own. `Dashboard.vue` mounts `legacy-town/TownAudio.vue` (the shared landing-music control, `useLandingMusic.js`) in the HUD row slot. Music auto-starts with a first-interaction fallback, a mute lasts for the session only, and it is paused while the Times is open and disposed on leave. Reduced motion does not affect audio. See [legacy-town](../legacy-town/README.md#audio).
