# Hub (3D town)

## Presentation summary

- What it is: a 3D town landing page on `/` where the player walks Sharlock, a capybara detective, between seven buildings; each building opens a game or the news. This is a navigation feature, not a security lesson, so it needs no course citations.
- How to use it: walk (WASD, arrows or the touch joystick), orbit and zoom (Z / C also rotate), use the minimap or destination list, press Enter at a building to open it (anywhere on the page, unless focus is in a field, a button or link, or a dialog), press E to talk and again to step through or close a conversation, jump (Space or the Jump button), sprint (Shift or the Sprint button: 1.6x speed for 2.5 s, then a 6 s cooldown), or switch to the 2D town. Reset camera and Replay intro live in Settings. The lore intro plays once on first visit; Enter or a click advances a card, and Space or Esc skips the whole intro.
- Technical: Babylon.js 9 with WebGPU falling back to WebGL2; Havok character physics; a procedural capybara rig with a seeded idle state machine; automatic graphics tiers with a 2D fallback; DOM twins of the scene for accessibility.
- Status: see the HUB-01 to HUB-04 records in [TASKS.md](../../../../TASKS.md) (HUB-04 is the Sharlock character pass with idles and jump).
- Known limits: see Known gaps below. Not verified on real phones or low-end hardware.

The default view on `/`: a Babylon.js 3D hub where Sharlock walks between buildings and each building opens a game. The pixel town lives in [legacy-town](../legacy-town/README.md) and is the 2D mode. Task records: HUB-01, HUB-02, HUB-03 and HUB-04 in TASKS.md. Owner: Boey. Integration-sensitive: `client/src/views/Dashboard.vue` (mounts `HubScene` or `TownMap`, never both) and legacy-town.

Players' controls and settings are described in the root README under "Using the app". Update both when they change.

## File map

- `HubScene.vue`, `HubMinimap.vue`, `minimap.js`: the Vue shell, destination list, notices, status line and minimap.
- `NpcDialogue.vue`, `useNpcDialogue.js`: the talk panel and its state (the 2D town uses them too). `ControlsHint.vue`, `controls.js`: the first-visits hint and the key list. `HubAmbience.vue`: the ambience loop. `announce.js`, `discoveries.js`, `glass.js`: live-region text, the finds list and the solid HUD rule. `intro/`: the lore intro. `presence/`: classmates on the wharf.
- `engine.js`: engine and physics start-up (WebGPU else WebGL2, Havok wasm via `?url`), dispose, dev `window.__hub`. It owns the list of cleanup steps the scene adds as it builds, so a build that throws or is left halfway still undoes what it made, and each teardown step runs even if an earlier one throws.
- `deviceCheck.js`, `perfWatch.js`, `graphics.js`: device verdict, runtime fps watch, Graphics setting.
- `scenes/a-wharf.js`: scene assembly. `build` takes `disposers` and `isDisposed`; leaving `/` during the build stops it after the sky bands, the plate probe and the plate loads instead of finishing every texture and mesh.
- `scenes/shared/`: `player`, `orbit`, `camera`, `cameraCollision`, `quality`, `assets`, `doors` and other reusable helpers, including `plates`, `plate-texture` and `chroma` (the skyline pictures), `nodes` (node material graph helpers) and `particles`. The Botnet Tag arena (`client/src/games/botnet-tag/arena/`) imports `camera`, `cameraCollision`, `orbit`, `quality`, `capybara`, `jump`, `sprint` and `wharf/toon`, so check it when changing them.
- `scenes/shared/capybara.js`: procedural capybara rig, used for Sharlock and the dock-worker crowd.
- `scenes/shared/sharlock.js`: Sharlock's build on the capybara rig (deerstalker, monocle, knitted scarf).
- `scenes/shared/idle.js`: idle state machine (blinks, ear wiggle, sniffing, looking at doors, sitting and yawning).
- `scenes/shared/jump.js`: jump and happy-hop state.
- `audio/hubSfx.js`: footstep and gas lamp hiss sound effects (HUB-12), see Audio.
- `scenes/shared/sprint.js`: pure sprint timing (HUB-11), exported `SPRINT` constants matching the botnet tag rules; `player.js` multiplies its base speed by it.
- `scenes/wharf/`: `layout` (destinations), `views` (selection cameras), `backdrop`, `farbank`, `skyline`, `world` and the buildings, props and water modules.
- `__tests__/`: unit tests.

## 3D or 2D

1. `deviceCheck.js` decides: no WebGL2 or a software renderer gives 2D, and so does a phone (coarse pointer and viewport under 768px; reason `phone`, with its own notice, and switching to 3D shows the usual warning); save-data, 2 GB memory or less, or 2 CPU cores or fewer gives the Low tier.
2. An explicit user choice (`sharlock.townMode`) overrides the device verdict.
3. `perfWatch.js` samples fps, steps quality down and finally falls back to 2D, unless the user explicitly chose 3D.

## Storage keys

- localStorage: `sharlock.graphics`, `sharlock.townMode` (explicit choice only, never an automatic fallback), `sharlock.hubPerf`, `sharlock.discoveries` (found discovery ids, JSON list), `sharlock.autoNoticeDismissed`, `sharlock.loreIntroSeen` (`'1'` once the lore intro finishes or is skipped), `sharlock.controlsHintSeen` (hub visits on which the controls hint showed).
- sessionStorage: `sharlock.hubReturn` (building to restore after returning from a game).

## Wharf presence (MP-01 stage B)

Classmates appear as ghost capybaras in the 3D hub; the 2D town draws its own (TOWN-03 stage 3). `createPresence({ mode })` passes `onPeers` only same-mode peers, so the hub ignores 2D peers in rendering and the minimap, while the roster counts everyone. Wire protocol and limits: [presence server README](../../../../server/src/modules/presence/README.md).

- `presence/usePresence.js`: `createPresence` owns one websocket to `/api/presence` (same origin, `ws:` or `wss:` from the page; the Vite `/api` proxy has `ws: true`). It starts once the hub is ready for a signed-in user and stops on unmount. A `move` goes out at most every 100 ms and only when the position, yaw or moving flag changed, plus a keepalive each second. It reconnects with 1 s to 30 s backoff after an abnormal close (gives up after 10 failures in a row) and does not reconnect on 4401 (quiet) or 4408. Staff closed with 4403 do not retry that class but can pick another in the Menu, which connects again. A browser reports a handshake the server refused only as a failed connection, so a socket that never opened asks `checkSession`: if the session is gone, presence stops and `endSessionFromPresence` shows the login notice. That covers a student with no class, whose retry is the only sign an idle tab gets that a newer sign-in took over. A student closed with 4403 (no class yet) retries every 60 s up to 10 times, so an approval made while on the hub joins without a reload. 4409 `superseded` means a newer tab of the same account took over (one presence per account, MP-02): the hub stops for good and the Menu's online section shows "Open in another tab". On 4401 `createPresence` calls its `onSessionEnded` option; `HubScene.vue` then clears the local session and replaces the route with `/login?reason=elsewhere` when the close reason is `replaced`, else `reason=expired` (SESS-01, one active login per account). Staff load their classes from `GET /cohorts/managed`, `join` the selected one first and rejoin when the menu picker changes.
- `presence/roster.js`: shared reactive state (`active`, `peers`, `classes`, `selectedCohortId`) that the site menu reads, so the menu shows "Online in your class: N" (others only) with a collapsible list and, for staff, a Class picker. It is hidden when presence is not running.
- `presence/remotePeers.js`: draws at most 20 peers (nearest first), eased toward each report by `rules.js` `approachPeer` (snaps beyond 8 m). The desktop tier uses `createCapybaraRig` with the peer's `look` mapped through `rigOptionsFor`, walking while `moving`; compact and low tiers use `createCapybaraStatic` (scarf and cap colour only, no hat or monocle). Peers have no physics colliders. Name labels are projected DOM spans in `HubScene.vue`, `aria-hidden`, hidden when behind the camera or off screen, with a "staff" tag; the menu list is the accessible equivalent.
- Dev hook `__hub.debug.peers()` returns `[{ username, x, z }]` of the drawn peers.
- Tests: `__tests__/presenceRules.test.js`, `__tests__/usePresence.test.js` (mock WebSocket), the online list in `features/menu/__tests__/SiteMenu.test.js`, and `tests/e2e/hub-presence.spec.js` (two students in one class see each other and a third in another class sees none; desktop project only, run with `--project=desktop-chromium`).

## Dev-only hooks (`import.meta.env.DEV` only)

- URL: `?hub=force3d`, `?renderer=webgl2`, `?tier=desktop|compact|low`, `?mirror=0|1`.
- localStorage: `sharlock.hubForce3d=1` (force 3D on software rendering), `sharlock.hubWatchManual=1` (runtime watch reacts only to simulated fps).
- `window.__hub`: `state`, `select`, `enter`, `back`, `resetCamera`, `pauseInput`, `debug.{position,peers,doors,walkTo,teleport,clickAt,sfxPaused,simulateFps,jump,airborne,sprint,sprintState}`.
- `?stats` adds a status line with the engine, fps and draw calls (dev server only). It is off by default, so a demo on the dev server stays clean.

## Lore intro

- Plays once on first entry to the 3D hub on `/`: five serif title cards fade in and out on black ("London, 1880." to "The city is counting on you."), then the black fades up on Sharlock at the wharf. About 27 s.
- The overlay covers the whole browser window, including the navbar and hub HUD. It is rendered to `<body>` with `position: fixed`; it does not use the browser Fullscreen API.
- Hold per card is the longer of 1.5 s and 0.32 s per word, with 0.4 s fades. Enter or a click advances one card. Space or Esc skips the whole intro. A faint bottom-right button reads "Press Space to skip" (or "Tap to skip" on touch screens), with accessible name "Skip intro". The hub loads behind it.
- Audio: plays `/audio/lore-intro.mp3` at volume 0.5. A small top-right sound toggle (named `Intro sound`, its state in `aria-pressed`) shares the session-only `sharlock.musicMuted` key with the town and hub music; unmuted is never stored. If the browser blocks autoplay, the intro opens on "Click or press Enter to begin"; that click starts the sound and card 1. The audio fades out (0.8 s on finish, 0.3 s on skip) before the hub ambience starts, so only one sound plays at a time. A missing or failed file runs silent.
- If the scene is not ready at the end, the last card shows "Loading the town…" until it is.
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
- E2E: `tests/e2e/hub.spec.js` and `tests/e2e/hub-auto.spec.js`. `hub.spec.js` covers the jump. Hub specs force 3D with `sharlock.hubForce3d=1` and `sharlock.hubWatchManual=1` (see the `beforeEach` in `hub.spec.js`), because headless Chromium renders in software.
- E2E waits are condition-based (`expect`, `expect.poll`, `waitForFunction`); never use `waitForTimeout`.
- Any other E2E spec that touches the town must force 2D mode:

```js
await page.addInitScript(() => localStorage.setItem('sharlock.townMode', '2d'))
```

See the `beforeEach` in `tests/e2e/portal.spec.js`.

## Destination picks (HUB-05)

- A list or minimap pick auto-walks along the lane graph. Routes start and end only at walkable lane nodes, because the west lane end sits inside a crate collider and used to stall the walk.
- If a route still stalls, the camera hold and the pick stay, so Enter remains usable; steering by hand (keys, joystick) or clicking the ground drops the pick as before.
- Picks made while the enter swoop is running are ignored, so the swoop always finishes and opens the game.
- Picking the building whose door ring you already stand on (for example after Esc) does not walk: the camera turns to the shopfront and the pick stays, so Enter is usable at once.
- A click-to-walk (or tap) that stops on a door ring picks that building, as walking onto it by hand does (FIX-11). `player.js` counts walks that reach their last point (`arrivals()`), so a walk cut short by steering, a stall or a cancel picks nothing; a pick's own route is left to the rules above. Standing on the ring after coming back from a game still does not pick it.

## Keyboard and screen reader (HUB-06)

- Destinations stay toggle buttons (`aria-pressed`), not links.
- Announcements: the `hub-status` live region (`role="status"`, `aria-live="polite"`, visually hidden while empty, cleared after 5 s) carries load and failure text first, then one message per transition, built by `announce.js`: `<Game> selected`, `Arrived at <Game>. Press Enter to go in` (the player is on the picked door's ring, whether by auto-walk or by hand), `Entering <Game>` and `Selection cleared` (a pick dropped while exploring). Nothing is announced per frame. The dev engine/fps line moved to its own `hub-stats` element so it no longer feeds the live region.
- Focus after a pick: a pick from the destination list or the minimap moves focus to the **Enter** button once it renders, only when focus was on that control. When the hub does not take it (the same place picked again, not in explore mode, or Enter disabled), the full-screen map returns focus to the Map button. Escape (or re-picking) with focus on Enter returns focus to that destination's list button. Walking onto a door also moves focus to **Enter** when a button or link outside a dialog holds focus (FIX-11), for example the previous game's list button after coming back or a clicked Sound or Sprint button, because a focused button keeps Return for itself (`holdsReturn` in `HubScene.vue`); focus on the page or the canvas stays where it is, since Return already goes in from there.
- Focus on return: coming back from a game (remount with `sharlock.hubReturn`), focus goes to that destination's list button once the hub is ready, unless something else already holds focus. The newspaper close is restored separately by `Dashboard.vue` (`focusDestination('threat-briefing')`), which `HubScene` exposes.
- Controls hint (UX-01 stage 2, replaces the Keys legend): `ControlsHint.vue` is a translucent glass toast, centred under the floating controls, with `data-testid="controls-hint"` and `role="status"`. Keyboard text: "WASD / arrow keys move · Space jump · Shift sprint · E talk or look · Enter go in · Z/C rotate · R reset camera"; touch devices (`pointer: coarse`) read "Drag to move · tap a place to walk · Jump and Sprint buttons". It appears on the first three hub visits (count in localStorage `sharlock.controlsHintSeen`, written in try/catch), never while the lore intro plays (`HubScene` starts the intro in setup, before its children mount, so the hint and the ambience mount already held; the visit is counted when the intro ends), fades after about 6 s or on any key or click, and is instant under reduced motion. **Settings > Show controls** reopens it (`HubScene` exposes `showControls()`). The key list lives in `controls.js` (`HUB_KEYS`), which the Settings overlay's Controls list also uses.
- Escape is one `window` keydown listener in `HubScene.vue` (added on mount, removed on unmount); it ignores typing targets, handled events, the lore intro and a paused hub (Times open), and the full-screen map stops its own Escape.
- Keys (UX-01 stage 2): E is Interact (`interact()` in `HubScene.vue`, exposed for the parent; today it opens Talk with the nearby townsperson, and NPC-03 discoveries hook in there), Enter goes in from anywhere on the page while the Enter button shows (`onEnterKey` in `HubScene.vue`; `isEnterKey` in `controls.js` skips fields, buttons, links, `summary` and dialogs so native activation and the open Settings or NPC dialog keep Enter), Z / C rotate the camera (`scenes/shared/orbit.js`, was Q / E), R resets. `isInteractKey` in `controls.js` is the pure key test. With a talk open, E advances to the next line and on the last line closes it, like the last button (`advanceTalk` in `useNpcDialogue.js`).
- Key badges (HUD-02): the Talk, Look at and Enter buttons carry a small `<kbd class="hub-key" aria-hidden="true">` (E, E, Enter), hidden on `(hover: none) and (pointer: coarse)`; accessible names are unchanged. The destination rows are the shared `DestinationRow` (`features/menu`, UX-02 S3): catalog icon, one-line `shortName` and a 4px `accent` bar, named for assistive tech by the full game name (`aria-label`); the selected row has a 2px light border, an inset ring and a check mark besides `aria-pressed`.
- Destination list: a compact glass panel with a **Destinations** toggle button (`destinations-toggle`, `aria-expanded`); open by default from 992px wide, collapsed below, and below that width it collapses again after a pick. The `dest-<id>` buttons keep `aria-pressed`.
- Sprint (HUB-11): a glass pill `hub-sprint` (lightning icon, `Shift` badge hidden on touch, cooldown ring that drains for 2.5 s then refills over 6 s). `data-state` is ready, active or cooldown; `aria-label` "Sprint", `aria-disabled` while not ready and a visually hidden "Sprint ready / active / recharging" description. Shift outside fields and dialogs starts a burst (`isSprintKey` in `controls.js`; holding it does not repeat). No camera kick or FOV change, so reduced motion needs no variant. Presence needs no change: `presence/protocol.js` only clamps positions to the wharf bounds and applies no speed check.
- HUD contents now: status line, destination panel, Talk/Enter bar, minimap, and the joystick and Jump button on touch. Reset camera, Replay intro and the Keys button left the HUD (Settings rows and R key instead); the Sound button moved to the floating controls beside the 3D | 2D switch.
- Glass HUD (HUB-08): every HUD panel, the NPC dialogue, the minimap and the `Dashboard.vue` hub row use the shared classes `hub-glass` (panel), `hub-glass-btn` (button on glass) and `hub-glass-btn-primary` (Enter, Go in). Their values are `--hub-glass-*` custom properties on `.hub-scene`, in the unscoped `<style>` block at the end of `HubScene.vue`, so slot content and child components share one source. The panels go opaque through the `hub-solid` class on the low tier (`glass.js` `isSolidHud`: the picked Graphics setting, or on Auto the stepped-down or device tier), without `backdrop-filter` support and under `prefers-reduced-transparency: reduce`; forced-colours mode uses system colours. The lore intro and the destination list buttons keep their own styles. Tests: `__tests__/glass.test.js`.
- Camera clip at the Customs House (SQL Injection Arcade): not reproduced (HUB-12 rechecked). Earlier sampling with the arcade picked and the player on its door ring put the follow camera at radius 19.2 (wanted 22), outside every blocker box; orbiting at the door, 28 samples never put the camera inside a blocker, but 11 pulled the spring arm in to 1 to 2 m (the 1 unit minimum), so the camera hugs the facade. HUB-12 checked the arcade arrival framing at 1440, 1024 and 375 wide and saw no clip. No scene change was made; if a clip is seen again, it is that near-wall pull-in, and raising `minRadius` or the Customs blocker pad in `scenes/shared/cameraCollision.js` and `wharf/buildings.js` is the place to look.

## Arrival and talk framing (HUB-12)

While the Talk/Enter bar or an open talk panel shows, `HubScene.vue` measures how many pixels they cover at the bottom (`syncInset`, every 100 ms) and passes it to `hub.setBottomInset(px)`. In `scenes/a-wharf.js` `liftFor` projects Sharlock's feet (and the nearby npc's) to the screen and raises `camera.targetScreenOffset.y` until their feet sit at 70% of the height above the bar (`LIFT_FRAC`) and at least 32 px (`LIFT_GAP`) above it, so heads stay clear of a tall bar on phones (FIX-09, checked at 1280x800 and 375x812), easing in (instant under reduced motion) and relaxing to nothing when the bar goes away. It only ever raises; the normal framing is untouched when there is room. Checked at 1440 x 900, 1024 x 768 and 375 x 667.

## Townsfolk (NPC-01)

- Who: thirteen capybaras from `scenes/wharf/npcs.js`. Seven game keepers stand beside their doors (customs officer, telegraph clerk, postmaster, police constable, publican, news vendor, the Yard keeper `server-keeper`) and six wanderers are scenery with a one-liner or two: fisherman, lamplighter and gull feeder (the originals), then street sweeper, chimney sweep and flower seller on the main street (HUD-02). Each has a small collider post, kept clear of the pier rails so it never makes a pocket against the walkable edge. Game keepers face the player within 4 m, otherwise their post; a walking wanderer faces its heading until the player is within 1.5 m or a talk starts.
- Patrols (NPC-02): only wanderers move. Each has `route` (2-4 waypoints, the first is its post) and `pause` seconds in `npcs.js`, and walks the loop at 1.4 m/s using the rig's walk cycle on the desktop tier (a glide on static meshes). The stepping is the pure `scenes/wharf/patrol.js`. A wanderer keeps walking until the player is within 1.5 m (it then stops and turns to face them), while a talk with it is open (`setInputPaused` plus `state.nearNpc`), under reduced motion (it stays at its post) and beyond 25 m (frozen, not simulated). Each wanderer owns an animated Havok collider that follows it (`setTargetTransform`); game keepers stay in the static compound. `__hub.debug.npcs()` returns live positions and `__hub.debug.freezeNpcs(true)` halts every patrol so E2E can pin positions. Tests: `__tests__/patrol.test.js` (route walkability, doors, lanes, spawn, stepping, hold rules).
- Tiers: animated rigs (`townsfolk.js`, own idle seed each) on the desktop tier, static meshes on compact and low (`npcRigs` in `quality.js`). `wanderers` in the tier is how many wanderers are cast: 6 on desktop and compact, the original 3 on low.
- Talk rule: `townsfolk.update` returns the nearest npc the player can talk to, written to `state.nearNpc`: within 2.5 m, or for a game keeper also while `state.nearDoor` is that keeper's game. The **Talk to <name>** button (`data-testid="talk"`) shows beside Enter in explore mode only.
- Flow: Talk opens `NpcDialogue.vue` (`role="dialog"`, non-modal, `data-testid="npc-dialogue"`), announces "Talking to <name>", focuses the panel and pauses movement (`useNpcDialogue.js` holds the line state). Next steps through the lines; the last line offers **Go in** (selects the keeper's game if needed, then the same path as Enter) and **Close** for game keepers, or **Bye** for wanderers. Walking away, leaving explore mode or a paused hub closes it. On touch screens under 844px wide and 500px high the panel takes the free space beside the touch controls and hides the Talk/Enter bar while it is open; Menu, Sound and Destinations stay clear of it and still work.
- Escape order: the dialogue, then the destination pick. Closing the dialogue (Escape, Close or Bye) returns focus to Talk or Look at, or to **Enter** when it was the keeper of the picked building, so Return then goes in (FIX-11).
- Lines: scripted text only, all in `npcs.js` (`lines`; game keepers 2-4, wanderers 1-2, 140 characters at most). No model, no rewards.
- Tests: `__tests__/npcs.test.js`, `patrol.test.js`, `useNpcDialogue.test.js`, `NpcDialogue.test.js`; `tests/e2e/hub-npcs.spec.js`.

## Outskirts discoveries (NPC-03)

- Six hidden finds, four objects and two npcs, listed in `scenes/wharf/finds.js` (id, kind, name, x, z, `pocket`, a card scene of one or two lines of 140 characters at most, and `note`, Sharlock's lesson for the log). They are not on the minimap or in the destination list. Positions: sticky-note (-40.5, -14) and tailgater (-34.3, -25.5) in the west back lane; usb-stick (49.5, -43.5) and shoulder-surfer (54.9, -37.1) in the east yard; open-telegraph (6.5, 63.7) and handbill (10.4, 63) on the jetty beside the pier.
- Ground: `pockets` in `layout.js` holds the walkable pocket rectangles, kept apart from `floors` so the minimap never draws them; `walkable` checks both. New lanes in `paths` join the cross street (west, east) and the pier (jetty). Prop footprints are in `obstacles`.
- Scenery and the four objects are built in `scenes/wharf/outskirts.js` into the shared world batches, so they add no draw calls on any tier. The two npcs are static capybaras made by `townsfolk.js` with kind `hidden`: they face the player when close but never become `state.nearNpc` and are left out of `debug.npcs()`.
- Interact: `a-wharf.js` writes the closest find within 2.4 m (`nearestFind`) to `state.nearFind`. `interact()` in `HubScene.vue` opens a nearby find first, else talks to a townsperson. The **Look at <name>** or **Talk to <name>** button (`data-testid="inspect"`) does the same on touch. The card reuses `NpcDialogue.vue` (close button reads "Got it"), pauses movement and closes when the player walks away.
- Store: `discoveries.js` keeps found ids in localStorage `sharlock.discoveries` (JSON list, try/catch, unknown ids dropped; non-sensitive) and exposes `useDiscoveries()`. The site menu shows "Discoveries x/6" (`data-testid="menu-discoveries"`) as a link to the log. Opening a find announces "Discovery n of 6: <name>" the first time.
- Lore rule (LORE-02): cards and keeper lines show a scene in character and never state the lesson. The lesson lives only in the Discoveries log, the `/discoveries` overlay (`menu/overlays/DiscoveriesOverlay.vue`, same in 2D and 3D): a found entry shows its name, card line 1 and "Sharlock's note"; an unfound one shows "???" and "Somewhere in the <pocket>" (west lane, east yard or jetty). Entries keep the `finds.js` order.
- Dev hook: `__hub.debug.finds()` returns each find's id, kind, name and position.
- Tests: `__tests__/discoveries.test.js`, `menu/__tests__/SiteMenu.test.js`, `menu/__tests__/DiscoveriesOverlay.test.js`; `tests/e2e/hub-discoveries.spec.js`.

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

The 3D hub plays its own recorded ambience loop, `/audio/hub-ambience.mp3`, through `HubAmbience.vue` (AUDIO-03, Boey, 28 October 2026). It reuses `client/src/composables/useLandingMusic.js` unchanged: autoplay attempt, one-time `pointerdown`/`keydown`/`touchstart` fallback, volume 0.5, and the shared session-only mute key `sharlock.musicMuted`, so one Sound off covers the hub and the 2D town. The visible **Sound on/off** control (named "Sound on" or "Sound off" to match its hidden text, its state in `aria-pressed`) is a round glass icon button teleported into the floating controls beside the 3D | 2D switch (`soundSlot` in `townControls.js`, which `ImmersiveControls.vue` clears when that slot leaves, so the 2D town's button renders in place after a switch; `HubAmbience.vue` renders it inline when no slot exists). It pauses while the Times (`news` route) is open and resumes on close unless muted; playback and listeners are cleaned up on leave. The 2D town keeps `sharlock-bgm.mp3` ([legacy-town](../legacy-town/README.md#audio)); only one of the two is mounted, so `/` has one sound source at a time.

Sound effects (HUB-12): `audio/hubSfx.js` generates footsteps and an occasional faint gas lamp hiss with WebAudio, with no audio files. It makes one `AudioContext` on the first `pointerdown`/`keydown`/`touchstart` (so nothing sounds before a gesture), reads `sharlock.musicMuted` about four times a second so the one Sound off control silences it, stays quiet while hub input is paused (Times, menu, lore intro or an open talk: `a-wharf.js` passes the input pause), and closes the context on dispose (`a-wharf.js` disposers). Footfalls are distance based: one per 2.3 m walked (`STRIDE`), so the pace follows walk and sprint speed, with none while idle or airborne; speed comes from the per-frame position change. The hiss plays every 7 to 15 s only within 7 m of a lamp (`lamps.spots`), louder when closer. Gains are low (0.07 and 0.03). Reduced motion does not change it, because sound is not motion. Unit: `__tests__/hubSfx.test.js`.

E2E: `tests/e2e/hub.spec.js` (mode-switch test) checks that the hub mounts one `<audio>` with `src` `/audio/hub-ambience.mp3` and a visible hub Sound button, and that switching to 2D mounts `/audio/sharlock-bgm.mp3` with no hub Sound button. Unit: `client/src/features/hub/__tests__/HubAmbience.test.js` covers the file and loop, autostart, session mute, muted-session no-autoplay and the Times suspend/resume.

## Sharlock's wardrobe (SKIN-01)

Cosmetics are colour and accessory swaps only; body and face are unchanged. `client/src/data/wardrobeLook.js` maps each item id to a swatch colour and rig options, and `rigOptionsFor(equipped)` falls back to the default for missing or unknown ids.

Props flow: `Dashboard.vue` passes `auth.user?.wardrobe` to `HubScene` (`wardrobe` prop, read once at build), then `createHub({ wardrobe })`, `scenes/a-wharf.js` `build`, `createSharlock(scene, { wardrobe })` and `createCapybaraRig`. Rig options (all `null` or absent means the stock look): `scarfColor`, `tweedColor` (multiplies the tweed texture, default `[1, 1, 1]`), `monocleColor`, `capColor` with `hat: 'detective-cap'`, and `accessory: 'magnifier'` (one extra mesh on the torso). The town dock workers keep `hat: 'cap'` unchanged. A changed prop does not rebuild a mounted hub; the profile is a separate page, so the next visit picks it up.

Dev only: `__hub.debug.sharlockLook()` returns the applied rig options, and `/?wardrobe=scarf-navy,hat-flat-cap,monocle-silver,accessory-magnifier` previews items without unlocking them (read through the dev-only `params`, never in a production build).

## Menu controls (UX-01 stage 1)

The 2D town toggle, the Graphics select and the player tile left the hub HUD row. The floating Menu button and 3D | 2D switch (`client/src/features/menu/`) replace them; Graphics, Sound, View, Replay intro, Show controls and Reset camera now live in the Settings overlay (`/settings`). `HubScene.vue` marks an Escape it handles with `preventDefault` (so the site menu does not also open) and exposes `showControls()`, `resetCamera()` and `interact()`. The hub HUD and destination list sit 64px from the top to clear the floating controls. Opening the menu or an overlay pauses hub input through the `input-paused` prop. The shared `ImmersiveControls` takes `skin` (`glass` in the hub and game rooms, `pixel` in the 2D town, UX-02). See the [menu README](../menu/README.md).

### Minimap classmate dots (MP-02)

`HubMinimap.vue` takes a `peers` prop (`{ sid, x, z, staff }`) and draws a small unnamed dot per classmate before the player wedge, staff in a second colour. The svg stays `aria-hidden`. `HubScene.vue` feeds it from the presence peer map, sampled about every 300 ms and only when something moved.

## Rendering coverage (what is and is not tested)

- WebGPU is **not** rendered by any automated test: the E2E specs run headless Chromium with software WebGL2, where `navigator.gpu` has no adapter. WebGPU is verified by hand only (HUB records in TASKS.md).
- `__tests__/engineChoice.test.js` drives the renderer choice and the WebGL2 fallback with fake engines (no adapter, `?renderer=webgl2`, failed start on a fresh canvas).
- `__tests__/toonShader.test.js` checks that the toon patch still finds its line in the pinned Babylon WGSL and GLSL shader sources, so a Babylon bump that rewords the line fails here instead of giving a flat world. It reads source text and renders nothing.
- Other shell and logic tests: `HubScene.test.js` (engine mocked: destinations, Enter, Escape, failure, intro and hint order, focus after a map pick, focus to Enter on walking onto a door and after a keeper chat), `doors.test.js` (including the click-to-walk pick), `playerRoutes.test.js`, `chroma.test.js`, `quality.test.js`, `hubRegistry.test.js` (every catalog game has a door, a view and a keeper), `remotePeers.test.js`, `skyPainter.test.js`.

## Loading cost

- The sky paints in four bands with a pause between them, so the loading screen stays alive. The pixels are unchanged (`skyPainter.test.js` holds a checksum, and the code was compared byte for byte with the previous painter at 48x12, 1024x256 and 1536x384).
- Skyline plates decode together and are then placed in ring order. `tier.plateScale` shrinks each picture before its pixel work and upload: full size on desktop, 0.75 on compact, 0.5 on low. That saves about 44% and 75% of plate memory and makes the far skyline slightly softer on those two tiers when looked at closely.
- A crowded class: above 20 same-mode peers `remotePeers.set` picks who to draw at most once a second (or at once when a drawn peer left), and a drawn peer only gives way to one nearer by 3 m, so peers trading places around the cut do not rebuild rigs.
