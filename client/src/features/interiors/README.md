# Game interiors (INT-01)

## Presentation summary

- What it is: a small 3D room behind each game route, the inside of that game's building on the 1880 Thames wharf, with the game framed as the room's working desk. This is atmosphere, not a security lesson, so it needs no course citations.
- How to use it: nothing to operate. Open a game from the hub or town; the room drifts slowly behind the panel. In 2D mode, without WebGL, on a slow device, on Low graphics or under reduced motion it is a still image or a single frame.
- Technical: `InteriorLayout.vue` is the parent route of the five game routes (`client/src/router/index.js`, `meta.interior` is the room id). `useInteriorEngine.js` starts a WebGL2 Babylon engine for one room; `renderMode.js` decides loop, single frame or still; `rooms/` holds one builder per room.
- Data: none stored; reads the Graphics setting, the stored town mode and the device check from the hub.
- Status: stages A and B (infrastructure and all five rooms), see the INT-01 record in [TASKS.md](../../../../TASKS.md). The WebP stills do not exist yet, so 2D mode shows the palette gradient.
- Known limits: no shadows; WebGPU is not used; the room is not interactive; not verified on real phones or low-end hardware.

Owner: Boey. Integration-sensitive: the router (five game routes are children of the layout) and `--shell-chrome`, which the layout redefines on the desk panel only. Game modules are never edited.

## File map

- `InteriorLayout.vue`: stage (canvas, still or gradient) plus the `<RouterView />` desk panel. Chooses the render mode from `useTownMode` rules, the hub tier, reduced motion and a perf watch.
- `renderMode.js`: pure helpers `decideRender`, `roomBudget`, `stillUrl`, `fallbackGradient`.
- `useInteriorEngine.js`: `createInterior({ canvas, roomId, tier, renderMode })`; camera drift, render loop or single frame, full disposal. Dev only: `window.__interior` with `state.drawCalls`, `state.activeMeshes`, `mounts` and `disposals`.
- `rooms/index.js`: registry keyed by game id (`id`, `label`, `palette` of top, bottom and accent colours, lazy `load`).
- `rooms/index.js` entries and builders (each room is x right, y up, z away from the camera at the front wall):
  - `cli-cyber-defender`: `rooms/cli.js`, Telegraph Office instrument room (switchboard, wire map, relay rack, sounders, clerk).
  - `phishing-post-mortem`: `rooms/phishing.js`, Royal Mail Post Office sorting room (pigeonhole frame, counter with brass grille, scales, Dead Letter shelf, pillar box, dust motes, postmaster).
  - `sql-injection-arcade`: `rooms/sql.js`, H.M. Customs House bonded registry (ledger shelves, A-Z card cabinets with a sliding drawer, gate and badge booth, stencilled crates, swinging lamp, customs officer).
  - `social-engineering-simulator`: `rooms/social.js`, The Capybara & Crown snug (fireplace, booths, beer pumps, chalkboard, Private door, patron, publican).
  - `clearance-tower`: `rooms/clearance.js`, river-police records room (clearance-tab cabinets, document cage, role key board, four named desks, turning gears, pulsing lantern, policeman).
- `rooms/kit.js`: shared room pieces: `shell`, `hemi`, `lamp`, `labelAtlas` (one painted canvas of signs, uv per cell, no image files) and `resident` (hub capybara rig on desktop, static pose on compact and low).
- `__tests__/`: unit and mount tests.

## Budgets and tiers

Desktop: loop, resident NPC rig, at most 150 draw calls. Compact: loop, static NPC, at most 100. Low, or reduced motion: one frame, then the render loop stops (60 draw calls on Low). No shadows on any tier. The five rooms measure about 16 to 20 active meshes on desktop and 7 to 8 on compact and low.

## Adding a room

1. Create `rooms/<name>.js` exporting `(ctx) => { camera: { pos, target, fov, drift: [x, y, periodSec] }, update(dt, time), dispose() }`. `ctx` has `scene`, `engine`, `tier`, `budget` and `reduced()`. Reuse `rooms/kit.js` and build from `Batch` (hub `scenes/shared/geometry.js`), `toonMaterial` and `glowMaterial` (hub `scenes/wharf/toon.js`); merge static meshes and keep animated parts as small separate meshes.
2. Point the registry entry in `rooms/index.js` at it (`load: () => import('./<name>.js').then((m) => m.<builder>)`).
3. Add `client/public/interiors/<id>.webp` (a capture of the same room) for 2D mode; without it the palette gradient is shown.
4. Add the room to the tests in `__tests__/renderMode.test.js` if it changes the registry shape.
