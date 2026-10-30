# Hub (3D Thames Wharf)

## Presentation summary

- What it is: a 3D Thames Wharf landing page on `/` where the player walks Sharlock, a capybara detective, between six buildings; each building opens a game or the news. This is a navigation feature, not a security lesson, so it needs no course citations.
- How to use it: walk (WASD, arrows or the touch joystick), orbit and zoom (Z / C also rotate), use the minimap or destination list, press Enter at a building to open it, press E to talk, jump (Space or the Jump button), or switch to the 2D map. Reset camera and Replay intro live in Settings. The lore intro plays once on first visit; Enter or a click advances a card, and Space or Esc skips the whole intro.
- Technical: Babylon.js 9 with WebGPU falling back to WebGL2; Havok character physics; a procedural capybara rig with a seeded idle state machine; automatic graphics tiers with a 2D fallback; DOM twins of the scene for accessibility.
- Status: Review, see the HUB-01 to HUB-04 records in [TASKS.md](../../../../TASKS.md) (HUB-04 is the Sharlock character pass with idles and jump).
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

1. `deviceCheck.js` decides: no WebGL2 or a software renderer gives 2D, and so does a phone (coarse pointer and viewport under 768px; reason `phone`, with its own notice, and switching to 3D shows the usual warning); save-data, 2 GB memory or less, or 2 CPU cores or fewer gives the Low tier.
2. An explicit user choice (`sharlock.townMode`) overrides the device verdict.
3. `perfWatch.js` samples fps, steps quality down and finally falls back to 2D, unless the user explicitly chose 3D.

## Storage keys

- localStorage: `sharlock.graphics`, `sharlock.townMode` (explicit choice only, never an automatic fallback), `sharlock.hubPerf`, `sharlock.discoveries` (found discovery ids, JSON list), `sharlock.autoNoticeDismissed`, `sharlock.loreIntroSeen` (`'1'` once the lore intro finishes or is skipped).
- sessionStorage: `sharlock.hubReturn` (building to restore after returning from a game).

## Wharf presence (MP-01 stage B)

Classmates appear as ghost capybaras in the 3D hub only; the 2D town shows nothing (known limitation). Wire protocol and limits: [presence server README](../../../../server/src/modules/presence/README.md).

- `presence/usePresence.js`: `createPresence` owns one websocket to `/api/presence` (same origin, `ws:` or `wss:` from the page; the Vite `/api` proxy has `ws: true`). It starts once the hub is ready for a signed-in user and stops on unmount. A `move` goes out at most every 100 ms and only when the position, yaw or moving flag changed, plus a keepalive each second. It reconnects with 1 s to 30 s backoff after an abnormal close (gives up after 10 failures in a row) and does not reconnect on 4401 (quiet), 4408 or, for staff, 4403. A student closed with 4403 (no class yet) retries every 60 s up to 10 times, so an approval made while on the hub joins without a reload. 4409 `superseded` means a newer tab of the same account took over (one presence per account, MP-02): the hub stops for good and the Menu's online section shows "Open in another tab". On 4401 `createPresence` calls its `onSessionEnded` option; `HubScene.vue` then clears the local session and replaces the route with `/login?reason=elsewhere` when the close reason is `replaced`, else `reason=expired` (SESS-01, one active login per account). Staff load their classes from `GET /cohorts/managed`, `join` the selected one first and rejoin when the menu picker changes.
- `presence/roster.js`: shared reactive state (`active`, `peers`, `classes`, `selectedCohortId`) that the site menu reads, so the menu shows "Online in your class: N" (others only) with a collapsible list and, for staff, a Class picker. It is hidden when presence is not running.
- `presence/remotePeers.js`: draws at most 20 peers (nearest first), eased toward each report by `rules.js` `approachPeer` (snaps beyond 8 m). The desktop tier uses `createCapybaraRig` with the peer's `look` mapped through `rigOptionsFor`, walking while `moving`; compact and low tiers use `createCapybaraStatic` (scarf and cap colour only, no hat or monocle). Peers have no physics colliders. Name labels are projected DOM spans in `HubScene.vue`, `aria-hidden`, hidden when behind the camera or off screen, with a "staff" tag; the menu list is the accessible equivalent.
- Dev hook `__hub.debug.peers()` returns `[{ username, x, z }]` of the drawn peers.
- Tests: `__tests__/presenceRules.test.js`, `__tests__/usePresence.test.js` (mock WebSocket), the online list in `features/menu/__tests__/SiteMenu.test.js`, and `tests/e2e/hub-presence.spec.js` (two students in one class see each other and a third in another class sees none; desktop project only, run with `--project=desktop-chromium`).

## Dev-only hooks (`import.meta.env.DEV` only)

- URL: `?hub=force3d`, `?renderer=webgl2`, `?tier=desktop|compact|low`, `?mirror=0|1`.
- localStorage: `sharlock.hubForce3d=1` (force 3D on software rendering), `sharlock.hubWatchManual=1` (runtime watch reacts only to simulated fps).
- `window.__hub`: `state`, `select`, `enter`, `back`, `resetCamera`, `pauseInput`, `debug.{position,peers,doors,walkTo,simulateFps,jump,airborne}`.
- A status line shows engine, fps and draw calls.

## Lore intro

- Plays once on first entry to the 3D hub on `/`: five serif title cards fade in and out on black ("London, 1880." to "The city is counting on you."), then the black fades up on Sharlock at the wharf. About 27 s.
- The overlay covers the whole browser window, including the navbar and hub HUD. It is rendered to `<body>` with `position: fixed`; it does not use the browser Fullscreen API.
- Hold per card is the longer of 1.5 s and 0.32 s per word, with 0.4 s fades. Enter or a click advances one card. Space or Esc skips the whole intro. A faint bottom-right button reads "Press Space to skip" (or "Tap to skip" on touch screens), with accessible name "Skip intro". The hub loads behind it.
- Audio: plays `/audio/lore-intro.mp3` at volume 0.5. A small top-right sound toggle ("Mute intro sound" / "Turn on intro sound") shares the session-only `sharlock.musicMuted` key with the town and hub music; unmuted is never stored. If the browser blocks autoplay, the intro opens on "Click or press Enter to begin"; that click starts the sound and card 1. The audio fades out (0.8 s on finish, 0.3 s on skip) before the hub ambience starts, so only one sound plays at a time. A missing or failed file runs silent.
- If the scene is not ready at the end, the last card shows "Loading the wharf…" until it is.
- Reduced motion: no fades and no auto-advance. Plain cards with Continue; Space still skips.
- Seen state: localStorage `sharlock.loreIntroSeen` = `'1'`, per browser, set on finish or skip. **Replay intro** is a row in the Settings overlay (`settings-replay-intro`); the HUD no longer has a button for it.
- Hub input and the hub ambience (`HubAmbience.vue`) stay paused while it plays. The ambience starts when the intro audio has faded out, unless muted.
- 2D mode and the no-WebGL fallback never show it.
- Accessibility: `role="dialog"`, `aria-modal`, card text in an `aria-live` region, focus trapped and returned to the hub. Card text is white `#fff` on black `#000` (21:1). The name "Sharlock Holmes" on card 4 is warm gold `#E8C468` (about 12:1 on black), in the same font and size.
- Font: Libre Baskerville 400 via `@fontsource/libre-baskerville` 5.3.0 (SIL OFL 1.1), pinned exact. It is imported only by `intro/LoreIntro.vue`, a deliberate exception to the shared pixel fonts, confined to the intro.
- Files: `client/src/features/hub/intro/` (`loreCards.js`: card text and hold timing; `useLoreIntro.js`: seen state and playing flag; `LoreIntro.vue`: the overlay). `HubScene.vue` mounts it; `HubAmbience.vue` holds the audio pause.

## Testing

- Unit: `client/src/features/hub/__tests__/`, including `idle.test.js`, `jump.test.js`, `announce.test.js`, `ControlsHint.test.js` and the lore tests (`loreCards.test.js`, `useLoreIntro.test.js`, `LoreIntro.test.js`).
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
- Picking the building whose door ring you already stand on (for example after Esc) does not walk: the camera turns to the shopfront and the pick stays, so Enter is usable at once.

## Keyboard and screen reader (HUB-06)

- Destinations stay toggle buttons (`aria-pressed`), not links.
- Announcements: the `hub-status` live region (`role="status"`, `aria-live="polite"`, visually hidden while empty, cleared after 5 s) carries load and failure text first, then one message per transition, built by `announce.js`: `<Game> selected`, `Arrived at <Game>. Press Enter to go in` (the player is on the picked door's ring, whether by auto-walk or by hand), `Entering <Game>` and `Selection cleared` (a pick dropped while exploring). Nothing is announced per frame. The dev engine/fps line moved to its own `hub-stats` element so it no longer feeds the live region.
- Focus after a pick: a pick from the destination list or the minimap moves focus to the **Enter** button once it renders, only when focus was on that control. Escape (or re-picking) with focus on Enter returns focus to that destination's list button.
- Focus on return: coming back from a game (remount with `sharlock.hubReturn`), focus goes to that destination's list button once the hub is ready, unless something else already holds focus. The newspaper close is restored separately by `Dashboard.vue` (`focusDestination('threat-briefing')`), which `HubScene` exposes.
- Controls hint (UX-01 stage 2, replaces the Keys legend): `ControlsHint.vue` is a translucent glass toast, centred under the floating controls, with `data-testid="controls-hint"` and `role="status"`. Keyboard text: "WASD / arrow keys move · Space jump · E talk · Enter go in · Z/C rotate · R reset camera"; touch devices (`pointer: coarse`) read "Drag to move · tap a place to walk · Jump button". It appears on the first three hub visits (count in localStorage `sharlock.controlsHintSeen`, written in try/catch), never while the lore intro plays (it waits for the intro to end), fades after about 6 s or on any key or click, and is instant under reduced motion. **Settings > Show controls** reopens it (`HubScene` exposes `showControls()`). The key list lives in `controls.js` (`HUB_KEYS`), which the Settings overlay's Controls list also uses.
- Escape is one `window` keydown listener in `HubScene.vue` (added on mount, removed on unmount); it ignores typing targets, handled events, the lore intro and a paused hub (Times open), and the full-screen map stops its own Escape.
- Keys (UX-01 stage 2): E is Interact (`interact()` in `HubScene.vue`, exposed for the parent; today it opens Talk with the nearby townsperson, and NPC-03 discoveries hook in there), Enter still goes in, Z / C rotate the camera (`scenes/shared/orbit.js`, was Q / E), R resets. `isInteractKey` in `controls.js` is the pure key test.
- Destination list: a compact glass panel with a **Destinations** toggle button (`destinations-toggle`, `aria-expanded`); open by default from 992px wide, collapsed below, and below that width it collapses again after a pick. The `dest-<id>` buttons keep `aria-pressed`.
- HUD contents now: status line, destination panel, Talk/Enter bar, minimap, and the joystick and Jump button on touch. Reset camera, Replay intro and the Keys button left the HUD (Settings rows and R key instead); the Sound button moved to the floating controls beside the 3D | 2D switch.
- Glass HUD (HUB-08): every HUD panel, the NPC dialogue, the minimap and the `Dashboard.vue` hub row use the shared classes `hub-glass` (panel), `hub-glass-btn` (button on glass) and `hub-glass-btn-primary` (Enter, Go in). Their values are `--hub-glass-*` custom properties on `.hub-scene`, in the unscoped `<style>` block at the end of `HubScene.vue`, so slot content and child components share one source. The panels go opaque through the `hub-solid` class on the low tier (`glass.js` `isSolidHud`: the picked Graphics setting, or on Auto the stepped-down or device tier), without `backdrop-filter` support and under `prefers-reduced-transparency: reduce`; forced-colours mode uses system colours. The lore intro and the destination list buttons keep their own styles. Tests: `__tests__/glass.test.js`.
- Camera clip at the Customs House (SQL Injection Arcade): not reproduced. With the arcade picked and the player on its door ring, the follow camera sat at radius 19.2 (wanted 22) and outside every blocker box. Orbiting with Q and E while standing at the door, 28 samples never put the camera inside a blocker, but 11 pulled the spring arm in to a radius of 1 to 2 (the 1 unit minimum), so the camera hugs the facade right behind Sharlock. No scene change was made; if a clip is seen again, it is that near-wall pull-in, and raising `minRadius` or the Customs blocker pad in `scenes/shared/cameraCollision.js` and `wharf/buildings.js` is the place to look.

## Townsfolk (NPC-01)

- Who: nine capybaras from `scenes/wharf/npcs.js`. Six game keepers stand beside their doors (customs officer, telegraph clerk, postmaster, police constable, publican, news vendor) and three wanderers (fisherman, lamplighter, gull feeder) are scenery with a one-liner. Each has a small collider post, kept clear of the pier rails so it never makes a pocket against the walkable edge. They face the player within 4 m, otherwise their post.
- Patrols (NPC-02): only wanderers move. Each has `route` (2-4 waypoints, the first is its post) and `pause` seconds in `npcs.js`, and walks the loop at 1.4 m/s using the rig's walk cycle on the desktop tier (a glide on static meshes). The stepping is the pure `scenes/wharf/patrol.js`. A wanderer stands still while the player is within 4 m, while a talk with it is open (`setInputPaused` plus `state.nearNpc`), under reduced motion (it stays at its post) and beyond 25 m (frozen, not simulated). Each wanderer owns an animated Havok collider that follows it (`setTargetTransform`); game keepers stay in the static compound. `__hub.debug.npcs()` returns live positions and `__hub.debug.freezeNpcs(true)` halts every patrol so E2E can pin positions. Tests: `__tests__/patrol.test.js` (route walkability, doors, lanes, spawn, stepping, hold rules).
- Tiers: animated rigs (`townsfolk.js`, own idle seed each) on the desktop tier, static meshes on compact and low (`npcRigs` in `quality.js`).
- Talk rule: `townsfolk.update` returns the nearest npc the player can talk to, written to `state.nearNpc`: within 2.5 m, or for a game keeper also while `state.nearDoor` is that keeper's game. The **Talk to <name>** button (`data-testid="talk"`) shows beside Enter in explore mode only.
- Flow: Talk opens `NpcDialogue.vue` (`role="dialog"`, non-modal, `data-testid="npc-dialogue"`), announces "Talking to <name>", focuses the panel and pauses movement (`useNpcDialogue.js` holds the line state). Next steps through the lines; the last line offers **Go in** (selects the keeper's game if needed, then the same path as Enter) and **Close** for game keepers, or **Bye** for wanderers. Walking away, leaving explore mode or a paused hub closes it.
- Escape order: the dialogue (focus returns to Talk), then the destination pick.
- Lines: scripted text only, all in `npcs.js` (`lines`; game keepers 2-4, wanderers 1-2, 140 characters at most). No model, no rewards.
- Tests: `__tests__/npcs.test.js`, `patrol.test.js`, `useNpcDialogue.test.js`, `NpcDialogue.test.js`; `tests/e2e/hub-npcs.spec.js`.

## Outskirts discoveries (NPC-03)

- Six hidden finds, four objects and two npcs, listed in `scenes/wharf/finds.js` (id, kind, name, x, z, one or two lines of 140 characters at most). They are not on the minimap or in the destination list. Positions: sticky-note (-40.5, -14) and tailgater (-34.3, -25.5) in the west back lane; usb-stick (49.5, -43.5) and shoulder-surfer (54.9, -37.1) in the east yard; open-telegraph (6.5, 63.7) and handbill (10.4, 63) on the jetty beside the pier.
- Ground: `pockets` in `layout.js` holds the walkable pocket rectangles, kept apart from `floors` so the minimap never draws them; `walkable` checks both. New lanes in `paths` join the cross street (west, east) and the pier (jetty). Prop footprints are in `obstacles`.
- Scenery and the four objects are built in `scenes/wharf/outskirts.js` into the shared world batches, so they add no draw calls on any tier. The two npcs are static capybaras made by `townsfolk.js` with kind `hidden`: they face the player when close but never become `state.nearNpc` and are left out of `debug.npcs()`.
- Interact: `a-wharf.js` writes the closest find within 2.4 m (`nearestFind`) to `state.nearFind`. `interact()` in `HubScene.vue` opens a nearby find first, else talks to a townsperson. The **Look at <name>** or **Talk to <name>** button (`data-testid="inspect"`) does the same on touch. The card reuses `NpcDialogue.vue` (close button reads "Got it"), pauses movement and closes when the player walks away.
- Store: `discoveries.js` keeps found ids in localStorage `sharlock.discoveries` (JSON list, try/catch, unknown ids dropped; non-sensitive) and exposes `useDiscoveries()`. The site menu shows "Discoveries x/6" (`data-testid="menu-discoveries"`). Opening a find announces "Discovery n of 6: <name>" the first time.
- Dev hook: `__hub.debug.finds()` returns each find's id, kind, name and position.
- Tests: `__tests__/discoveries.test.js`, `menu/__tests__/SiteMenu.test.js`; `tests/e2e/hub-discoveries.spec.js`.

## Assets and adding a building

- Skyline plates: `client/public/hub/plates/` (`thames-far-1..8`, `thames-mid-1..4` `.webp`); the list is in `scenes/shared/assets.js` (far 7 and 8 are probed, not assumed).
- A building needs: an entry in `client/src/data/gameCatalog.js`, a destination in `scenes/wharf/layout.js` (id, title, position, facing, reach, building), a selection view in `scenes/wharf/views.js`, and the building geometry in the wharf scene modules. Catalog and router changes are integration-sensitive and need Boey's approval.

## Known gaps

- Crates, chimneys and signs have no camera collision (the crane tower has one; the jib does not).
- The desktop destination list covers the right edge of selection views.
- The Clearance Tower view (`views.js`) looks up the street from the south (`alphaOffset` -1.0, `beta` 1.34, radius 34, `focusY` 13) so the door, signboard, clock and spire all fit. A straight on view is pulled in by the houses opposite and crops the tower.
- Minimap context blocks are approximate.
- Not verified on real phones or low-end hardware.

## Audio

The 3D hub plays its own recorded ambience loop, `/audio/hub-ambience.mp3`, through `HubAmbience.vue` (AUDIO-03, Boey, 28 October 2026). It reuses `client/src/composables/useLandingMusic.js` unchanged: autoplay attempt, one-time `pointerdown`/`keydown`/`touchstart` fallback, volume 0.5, and the shared session-only mute key `sharlock.musicMuted`, so one Sound off covers the hub and the 2D town. The visible **Sound on/off** control (`Mute hub sound` / `Turn on hub sound`) is a round glass icon button teleported into the floating controls beside the 3D | 2D switch (`soundSlot` in `townControls.js`; `HubAmbience.vue` renders it inline when no slot exists). It pauses while the Times (`news` route) is open and resumes on close unless muted; playback and listeners are cleaned up on leave. The 2D town keeps `sharlock-bgm.mp3` ([legacy-town](../legacy-town/README.md#audio)); only one of the two is mounted, so `/` has one sound source at a time.

E2E: `tests/e2e/hub.spec.js` (mode-switch test) checks that the hub mounts one `<audio>` with `src` `/audio/hub-ambience.mp3` and a visible hub Sound button, and that switching to 2D mounts `/audio/sharlock-bgm.mp3` with no hub Sound button. Unit: `client/src/features/hub/__tests__/HubAmbience.test.js` covers the file and loop, autostart, session mute, muted-session no-autoplay and the Times suspend/resume.

## Sharlock's wardrobe (SKIN-01)

Cosmetics are colour and accessory swaps only; body and face are unchanged. `client/src/data/wardrobeLook.js` maps each item id to a swatch colour and rig options, and `rigOptionsFor(equipped)` falls back to the default for missing or unknown ids.

Props flow: `Dashboard.vue` passes `auth.user?.wardrobe` to `HubScene` (`wardrobe` prop, read once at build), then `createHub({ wardrobe })`, `scenes/a-wharf.js` `build`, `createSharlock(scene, { wardrobe })` and `createCapybaraRig`. Rig options (all `null` or absent means the stock look): `scarfColor`, `tweedColor` (multiplies the tweed texture, default `[1, 1, 1]`), `monocleColor`, `capColor` with `hat: 'detective-cap'`, and `accessory: 'magnifier'` (one extra mesh on the torso). The town dock workers keep `hat: 'cap'` unchanged. A changed prop does not rebuild a mounted hub; the profile is a separate page, so the next visit picks it up.

Dev only: `__hub.debug.sharlockLook()` returns the applied rig options, and `/?wardrobe=scarf-navy,hat-flat-cap,monocle-silver,accessory-magnifier` previews items without unlocking them (read through the dev-only `params`, never in a production build).

## Menu controls (UX-01 stage 1)

The 2D map toggle, the Graphics select and the player tile left the hub HUD row. The floating Menu button and 3D | 2D switch (`client/src/features/menu/`) replace them; Graphics, Sound, View, Replay intro, Show controls and Reset camera now live in the Settings overlay (`/settings`). `HubScene.vue` marks an Escape it handles with `preventDefault` (so the site menu does not also open) and exposes `showControls()`, `resetCamera()` and `interact()`. The hub HUD and destination list sit 64px from the top to clear the floating controls. Opening the menu or an overlay pauses hub input through the `input-paused` prop. See the [menu README](../menu/README.md).

### Minimap classmate dots (MP-02)

`HubMinimap.vue` takes a `peers` prop (`{ sid, x, z, staff }`) and draws a small unnamed dot per classmate before the player wedge, staff in a second colour. The svg stays `aria-hidden`. `HubScene.vue` feeds it from the presence peer map, sampled about every 300 ms and only when something moved.
