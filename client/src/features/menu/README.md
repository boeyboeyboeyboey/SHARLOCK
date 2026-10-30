# Site menu and overlays

## Presentation summary

- What: the site's one menu (UX-01, UX-02 S2). A floating glass **Menu** button, a **3D | 2D** switch and a slide-in site menu replace the navbar and sidebar on `/`; every other page gets a slim top bar whose Menu button opens the same drawer.
- Concept taught: none; this is shared navigation, not a learning activity.
- Use: Menu button or Esc opens the menu; its entries open Profile & progress, Leaderboard, Your classes, Settings and About as panels over the dimmed town. X or Esc closes a panel.
- Components: `ImmersiveControls.vue` (button, switch, Escape), `SiteMenu.vue` (native modal dialog drawer), `OverlayPanel.vue` (route-backed modal), `overlays/*` (one wrapper per route), `townControls.js` (provide/inject for mode, graphics, sound, replay intro, sign out).
- Routes: overlays are child routes of `town` with absolute paths (`/profile`, `/leaderboard`, `/classes`, `/settings`, `/about`); `meta.overlay` marks them and `meta.immersive` (inherited from the town) hides the navbar and sidebar. `/progress` redirects to `/profile?tab=progress`.
- UX-02 S2: `Navbar.vue` (logo plus Menu) renders `ImmersiveControls` with `inline skin="pixel"`, which drops the sound slot and 3D | 2D switch and sits in the bar instead of floating; `PortalLayout.vue` owns `menuOpen`. Reusing the component keeps the Esc rules, focus restore and pixel Menu look identical to the 2D town. `SiteMenu` shows Instructor desk (`instructor` role) and Admin (`admin` role) links, or Sign in and Create account when signed out; Places stays 2D-town only.
- UX-02: `ImmersiveControls` takes `skin` (`glass` in 3D and game rooms, `pixel` in the 2D town); in the 2D town the menu lists Places (the catalog buildings), which call the town's registered `jumpTo`.
- Data: none stored; the sound and graphics choices keep their existing keys.
- Stage 2: the Sound button now lives in `ImmersiveControls.vue` beside the 3D | 2D switch (the 3D hub's sound component teleports its button into `soundSlot`; the 2D town passes `TownAudio` through the `sound` slot), and Settings gains a Controls list and a Reset camera row. See the UX-01 record in TASKS.md for status.

## Behaviour notes

- Escape priority: the Times and overlays are modal dialogs and close themselves; the hub marks an Escape it handled (dialogue, deselect) with `preventDefault`; the menu opens only on an Escape left unhandled, checked one task later, and not while an overlay, the intro or the 3D warning is open.
- Opening the menu or an overlay pauses hub input through the `input-paused` prop in `Dashboard.vue`.
- Overlay panels teleport into `.portal-shell` so page rules keyed on `.portal-main:has(...)` do not shift the town.
- The Settings overlay reaches the on-screen sound (`HubAmbience.vue` or `TownAudio.vue`) through the sound registry in `townControls.js`; one sound source per mode still applies.
- Glass variables live on the component roots in `menu.css`, never on `:root`.

## Tests

`client/src/features/menu/__tests__/` (menu entries, focus, Escape, mode switch) and `client/src/router/overlayRoutes.test.js` (overlay routes and the `/progress` redirect).

- UX-02 S3: `DestinationRow.vue` (+ `destinationRow.css`) is the one row for the 3D Destinations list (`pressed` boolean, `aria-pressed`, check mark) and the 2D Places list (`pressed` unset, plain action). It shows the catalog `icon`, `shortName` and `accent` bar and keeps the full `name` as `aria-label`.
