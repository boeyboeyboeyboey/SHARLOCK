# Codebase guide

A map of the Sharlock Hub code for graders and teammates who need to find things and explain them. It describes what exists. Task status, ownership records and approvals live in [TASKS.md](../TASKS.md). The repo rules for contributors are in [agents.md](../agents.md).

## 1. What it is

Sharlock Hub is a gamified cybersecurity learning site (IS216 Group 7). A student signs in, joins a class, and plays short security games from a 3D harbour town (or a 2D pixel town). Games are scored by the server. Results feed progress, class results and leaderboards.

The stack is MEVN:

- Client: Vue 3 (`<script setup>`), Vite, Bootstrap 5.3, Pinia, Vue Router, Axios. The 3D hub uses Babylon.js.
- Server: Node.js, Express, Mongoose, MongoDB. WebSockets use `ws`.
- Tooling: a pnpm workspace with two packages (`client`, `server`) and one root lockfile. Vitest for unit and integration tests, Playwright for end-to-end tests.

## 2. Directory map

| Path                                | What is in it                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [client/](../client/)               | The Vue app. `index.html`, `vite.config.js`, `public/` (audio, hub assets, interior WebP stills)      |
| [server/](../server/)               | The Express API and WebSocket servers                                                                 |
| [tests/e2e/](../tests/e2e/)         | Playwright specs (`*.spec.js`)                                                                        |
| [scripts/](../scripts/)             | Env setup, local MongoDB, test-database runner, admin bootstrap                                       |
| [docs/](../docs/)                   | Guides, plans and specs (this file, saved-game guide, course alignment, submission README)            |
| [documentation/](../documentation/) | Course decks and rubric. Source material only                                                         |
| Root `*.md`                         | `README.md` (setup), `TASKS.md` (task board), `DESIGN.md`, `CODE_STYLE.md`, `CREDITS.md`, `agents.md` |

### client/src

| Path                                                                                       | Purpose                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [main.js](../client/src/main.js), [App.vue](../client/src/App.vue)                         | App start, Pinia, router, route guard install                                                                                                                                                  |
| [router/](../client/src/router/)                                                           | Route table and `beforeEach` hooks                                                                                                                                                             |
| [services/api.js](../client/src/services/api.js)                                           | The one shared Axios client                                                                                                                                                                    |
| [data/gameCatalog.js](../client/src/data/gameCatalog.js)                                   | The single game and building registry                                                                                                                                                          |
| [layouts/](../client/src/layouts/), [components/portal/](../client/src/components/portal/) | Portal shell and navbar                                                                                                                                                                        |
| [views/](../client/src/views/)                                                             | `Dashboard.vue` (the `/` page), `NoAccess.vue`, `NotFound.vue`                                                                                                                                 |
| [features/](../client/src/features/)                                                       | Non-game features: `auth`, `attempts`, `hub`, `legacy-town`, `interiors`, `menu`, `progress`, `leaderboard`, `class-results`, `cohorts`, `admin`, `recovery`, `activation`, `profile`, `about` |
| [games/](../client/src/games/)                                                             | One folder per game (section 6)                                                                                                                                                                |
| [composables/](../client/src/composables/)                                                 | Shared composables: `useLandingMusic`, `useGameAudio`, `useHowToPlay`, `useUiScale`, `playSfx`                                                                                                 |
| [assets/styles/](../client/src/assets/styles/)                                             | `main.css`, `town.css`, `ui-scale.css`                                                                                                                                                         |

Client tests sit beside the code in `__tests__/` folders.

### server/src

| Path                                                       | Purpose                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [server.js](../server/src/server.js)                       | Process start: env, database connection, `createApp`, HTTP listen, WebSocket upgrade routing |
| [app.js](../server/src/app.js)                             | `createApp`: builds Express and mounts every router                                          |
| [config/](../server/src/config/)                           | `env.js`, `database.js`, `database-uri.js` (test-database safety guard)                      |
| [middleware/errors.js](../server/src/middleware/errors.js) | `notFound` and `handleError`                                                                 |
| [models/](../server/src/models/)                           | Core account models: `User`, `Membership`, `Institution`, `Cohort`, `InstructorAssignment`   |
| [services/](../server/src/services/)                       | `context.js` and `permissions.js`: current actor and class permissions                       |
| [routes/health.js](../server/src/routes/health.js)         | `GET /api/health`                                                                            |
| [modules/](../server/src/modules/)                         | One folder per feature (section 7), including `attempts` and `games/<id>`                    |

Most modules follow the same split: `router.js` (HTTP), `service.js` (rules), `storage.js` or `model.js` (database), `policy.js` (constants and validation), and a `README.md`.

## 3. Request flow: one game action

Saved games use one shared flow. This example is a student submitting an action in the SQL Injection Arcade.

```
Vue component (SqlInjectionArcade.vue, AttemptForm.vue)
  -> composable useSqlInjection.js
  -> useAttempt('sql-injection-arcade')            client/src/features/attempts/useAttempt.js
  -> features/attempts/api.js (writeAttempt)       adds X-CSRF-Token
  -> services/api.js (Axios, baseURL /api, cookies)
  ==== HTTP ====
  -> app.js mounts /api  -> attempts/router.js     POST /api/attempts/:attemptId/actions
  -> session + origin + CSRF middleware            auth/session.js, auth/csrf.js
  -> attempts/service.js applyAction
  -> registry.get(gameId, rulesetVersion)          attempts/registry.js
  -> game ruleset (sql-injection-arcade/ruleset.js: validateAction, applyAction)
  -> GameAttempt model (collection game_attempts)  attempts/model.js
  -> public snapshot back to the client
```

Steps in words:

1. The component calls a method on the game composable. The composable calls `useAttempt`, which wraps the shared requests, handles busy state, errors and safe resends.
2. [features/attempts/api.js](../client/src/features/attempts/api.js) fetches a CSRF token if needed and calls the shared Axios client in [services/api.js](../client/src/services/api.js). The base URL already includes `/api`, so paths read `/attempts/...`.
3. [app.js](../server/src/app.js) mounts the attempts router under `/api`. The router in [attempts/router.js](../server/src/modules/attempts/router.js) runs the session and mutation middleware, then calls the service.
4. [attempts/service.js](../server/src/modules/attempts/service.js) loads the caller's attempt, checks ownership, revision and idempotency (`actionId`), and finds the ruleset by `gameId@rulesetVersion` in the registry.
5. The ruleset validates and applies the action to the private state, then returns a public view. The service saves state and score on one `game_attempts` document.
6. The response is a public snapshot. Private state and answers never leave the server.

CLI Cyber Defender, the Social Engineering Simulator and Botnet Tag use their own run endpoints or sockets first, then save a finished run through the same attempt service (section 5).

## 4. Auth, sessions and CSRF

Server code: [modules/auth/](../server/src/modules/auth/) (see its [README](../server/src/modules/auth/README.md)). Client code: [features/auth/](../client/src/features/auth/).

Login, in order:

1. The client fetches a CSRF token with `GET /api/auth/csrf` ([features/auth/api.js](../client/src/features/auth/api.js), `requestCsrfToken`). The token is kept in memory in the Pinia store ([features/auth/store.js](../client/src/features/auth/store.js)). It is never put in browser storage.
2. `POST /api/auth/login` sends the credentials with the `X-CSRF-Token` header. The server checks the CSRF token and the request origin ([csrf.js](../server/src/modules/auth/csrf.js)), then verifies the password hash ([password.js](../server/src/modules/auth/password.js), Argon2id).
3. The server stores a session in MongoDB and sets the cookie `sharlock.sid` ([session.js](../server/src/modules/auth/session.js)): `HttpOnly`, `SameSite=Lax`, with idle and absolute lifetimes.
4. Later requests carry the cookie (`withCredentials`). Protected routers use `requireSession`. State-changing routes also use `requireMutation` (origin plus CSRF).

Other auth routes under `/api/auth`: `POST /register`, `/verify-email`, `/verify-email/resend`, `GET /session`, `GET /me`, `POST /logout`, `/reset-password`, `/class-invitation`, `/class-invitation/clear`. Login and recovery are rate limited ([rate-limits.js](../server/src/modules/auth/rate-limits.js)).

**Single active session.** A new login marks the account's other sessions as replaced (`replacedAt`) and the app disconnects their presence and Botnet Tag sockets (`session-ended` event in `app.js`). The old tab is told it was signed out because of a newer login.

**Roles.** Registration creates only a student. Global roles (student, instructor, administrator) come from the account. Class access comes from `Membership` (pending, active, removed) and `InstructorAssignment`. The server reloads the account and its memberships on each request through [services/permissions.js](../server/src/services/permissions.js). Browser guards are only for navigation.

**Client route guard.** [createAccountGuard](../client/src/features/auth/guards.js) is installed in [main.js](../client/src/main.js) with `router.beforeEach`. It reads route `meta`:

- `requiresAccount`: restore the session or redirect to `/login`.
- `authPage`: signed-in users are sent on to their destination.
- `requiredRole` and `allowedRoles`: wrong role goes to `/forbidden`.

The same file installs an Axios response hook that turns a 401 during a signed-in session into a "session ended" notice.

## 5. Attempts and scoring

The shared contract is documented in [server/src/modules/attempts/README.md](../server/src/modules/attempts/README.md). The browser integration steps are in [saved-game-integration.md](saved-game-integration.md).

- **Endpoints** (under `/api`): `GET /attempt-contexts`, `POST /games/:gameId/attempts`, `GET /attempts/:attemptId`, `POST /attempts/:attemptId/actions`, `POST /attempts/:attemptId/complete`.
- **Context.** Every attempt is either `personal` or `cohort` (one class). The server validates it at creation and it cannot change afterwards.
- **Registry.** [registry.js](../server/src/modules/attempts/registry.js) holds rulesets keyed by `gameId@rulesetVersion`, and allows one `current` ruleset per game. [production-registry.js](../server/src/modules/attempts/production-registry.js) lists every ruleset, including older versions kept so saved attempts still read.
- **Ruleset.** An entry supplies `learningObjective`, `topicTags`, `maxScore`, and hooks: `createState`, `validateAction`, `applyAction`, `canComplete`, `serializePublicState`, `summarize`. The browser never sends a score.
- **Current rulesets:** `sql-3`, `clear-4`, `phish-4`, `cli-3`, Botnet Tag `2`, and date-versioned Social Engineering rulesets (`2026-10-27` chat, `2026-10-31` shift).
- **Server-recorded games.** CLI, Social Engineering and Botnet Tag run on their own state, then call `recordCompletedAttempt` on the same attempt service.
- **Storage.** [attempts/model.js](../server/src/modules/attempts/model.js) defines `GameAttempt` (collection `game_attempts`).

Where results go. These modules only read saved attempts:

| Output        | Server module                                          | Routes (under `/api`)                                                                   |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Progress      | [progress/](../server/src/modules/progress/)           | `GET /me/progress`, `GET /me/attempts` (points and achievements)                        |
| Leaderboards  | [leaderboards/](../server/src/modules/leaderboards/)   | `GET /cohorts/:cohortId/leaderboard/games`, `GET /cohorts/:cohortId/leaderboard`        |
| Class results | [class-results/](../server/src/modules/class-results/) | `GET /cohorts/:cohortId/results`, `GET /cohorts/:cohortId/students/:studentId/attempts` |

Client pages: [features/progress/](../client/src/features/progress/), [features/leaderboard/](../client/src/features/leaderboard/), [features/class-results/](../client/src/features/class-results/).

## 6. Games

Client folders are `client/src/games/<id>/`. Server folders are `server/src/modules/games/<id>/`. Each has a `README.md` that starts with a presentation summary.

| Game (id)                                                         | Owner    | Route                                 | Client entry                                                                                                                                           | Server folder                                                                              | Saving and scoring                                               |
| ----------------------------------------------------------------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| SQL Injection Arcade (`sql-injection-arcade`)                     | Keane    | `/games/sql-injection-arcade`         | [SqlInjectionArcade.vue](../client/src/games/sql-injection-arcade/SqlInjectionArcade.vue)                                                              | [sql-injection-arcade/](../server/src/modules/games/sql-injection-arcade/)                 | Shared attempts via `useAttempt`. Ruleset `sql-3`                |
| Clearance Tower (`clearance-tower`)                               | Russell  | `/games/clearance-tower`              | [ClearanceTowerGame.vue](../client/src/games/clearance-tower/ClearanceTowerGame.vue)                                                                   | [clearance-tower/](../server/src/modules/games/clearance-tower/)                           | Shared attempts via `useAttempt`. Ruleset `clear-4`              |
| The Phishing Post-Mortem (`phishing-post-mortem`)                 | Athithya | `/games/phishing-post-mortem`         | [PhishingPostMortem.vue](../client/src/games/phishing-post-mortem/PhishingPostMortem.vue)                                                              | [phishing-post-mortem/](../server/src/modules/games/phishing-post-mortem/)                 | Shared attempts via `useAttempt`. Ruleset `phish-4`              |
| CLI Cyber Defender (`cli-cyber-defender`)                         | Xin Lei  | `/games/cli-cyber-defender`           | [CliDefenderGame.vue](../client/src/games/cli-cyber-defender/CliDefenderGame.vue)                                                                      | [cli-cyber-defender/](../server/src/modules/games/cli-cyber-defender/)                     | Own run endpoints, then server-recorded attempt. Ruleset `cli-3` |
| LLM Social Engineering Simulator (`social-engineering-simulator`) | Eric     | `/games/social-engineering-simulator` | [SocialEngineeringSimulator.vue](../client/src/games/social-engineering-simulator/SocialEngineeringSimulator.vue)                                      | [social-engineering-simulator/](../server/src/modules/games/social-engineering-simulator/) | Own session and shift endpoints, then server-recorded attempt    |
| Botnet Tag (`botnet-tag`)                                         | Boey     | `/games/botnet-tag`                   | [BotnetTagGame.vue](../client/src/games/botnet-tag/BotnetTagGame.vue)                                                                                  | [botnet-tag/](../server/src/modules/games/botnet-tag/)                                     | WebSocket rounds, server-recorded attempt. Ruleset `2`           |
| The daily briefing / Sharlock Times (`threat-briefing`)           | Boey     | `/games/threat-briefing`              | [CyberNewsCentral.vue](../client/src/games/threat-briefing/CyberNewsCentral.vue), [NewsDialog.vue](../client/src/games/threat-briefing/NewsDialog.vue) | [news/](../server/src/modules/news/)                                                       | Reading only. Nothing is scored or saved                         |

Owners are as recorded in [TASKS.md](../TASKS.md). Check it before editing another contributor's module.

Where to start reading each game:

- **SQL Injection Arcade.** Start at `useSqlInjection.js`, then the components in `components/` (case panel, attempt form, blind answer, repair selector, hints, result). On the server read `ruleset.js`, then `engine.js` and `parser.js`. The engine is a bounded teaching parser. It never runs SQL.
- **Clearance Tower.** Start at `composables/useClearanceTower.js` (wraps `useAttempt`). Server rules are in `simulate.js`, `policy.js`, `hints.js`, `levels.js`, `scoring.js` and `ruleset.js`.
- **Phishing Post-Mortem.** Start at `useTriageRun.js`. Server code is under `triage/` (`generator/`, `ruleset.js`, `scoring.js`, `hints.js`). Each round is generated from a private seed. Emails are inert text.
- **CLI Cyber Defender.** Start at `composables/useCliDefender.js` and `cliDefender.js`. The server router ([router.js](../server/src/modules/games/cli-cyber-defender/router.js)) serves `/api/games/cli-cyber-defender/runs...`. Commands act on fictional state only (`parser.js`, `scenarios.js`, `service.js`). A finished run is saved through the attempt service.
- **Social Engineering Simulator.** Start at `composables/useHelpDeskShift.js` and `simulator.js`. The server [router.js](../server/src/modules/games/social-engineering-simulator/router.js) has chat endpoints and `shift/*` endpoints. Shift rules are in `shiftService.js`, `shiftScoring.js` and `shiftRuleset.js`. The `llm/` folder is the chat engine (providers, session runner). It is separately owned, so read it only to understand the flow.
- **Botnet Tag.** Start at `useTagSocket.js` and `BotnetTagGame.vue`. The server side is `socket.js` (WebSocket), `rounds.js`, `arena.js`, `bots.js`, `puzzles.js` and `rules.js`. The server decides tags and puzzle results.
- **Sharlock Times.** Start at `composables/useCyberNews.js`. The server serves `GET /api/news` from [news/router.js](../server/src/modules/news/router.js), with an allowlisted upstream in `providers/guardian.js`, a cache and quota (`models.js`, `store.js`) and bundled sample data (`sample.js`).

## 7. Platform features

Server paths are under `server/src/modules/`. Routes are under `/api`. Each module's README has the full list.

| Feature  | Server folder                                      | Client folder                                                                                                      | Main routes                                                                                     |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Auth     | [auth/](../server/src/modules/auth/)               | [features/auth/](../client/src/features/auth/)                                                                     | `/auth/*` (section 4)                                                                           |
| Cohorts  | [cohorts/](../server/src/modules/cohorts/)         | [features/cohorts/](../client/src/features/cohorts/)                                                               | Memberships, enrollment codes, join requests. Client pages `/join-class`, `/instructor`         |
| Admin    | [admin/](../server/src/modules/admin/)             | [features/admin/](../client/src/features/admin/)                                                                   | Users, institutions, cohorts, instructors, administrator activation links. Client page `/admin` |
| Recovery | [recovery/](../server/src/modules/recovery/)       | [features/recovery/](../client/src/features/recovery/), [features/activation/](../client/src/features/activation/) | `POST /activate-account`, staff-issued recovery links. Client page `/activate-account`          |
| Profile  | [profile/](../server/src/modules/profile/)         | [features/profile/](../client/src/features/profile/)                                                               | `GET` and `PATCH /me/profile`, `PUT /me/how-to-play/:gameId`                                    |
| Wardrobe | [wardrobe/](../server/src/modules/wardrobe/)       | profile overlay                                                                                                    | `GET /me/wardrobe`, `PUT /me/wardrobe/:slot`                                                    |
| Audit    | [audit/](../server/src/modules/audit/)             | admin pages                                                                                                        | `GET /admin/audit-events`                                                                       |
| Presence | [presence/](../server/src/modules/presence/)       | [features/hub/presence/](../client/src/features/hub/presence/)                                                     | WebSocket `/api/presence` (section 9)                                                           |
| News     | [news/](../server/src/modules/news/)               | [games/threat-briefing/](../client/src/games/threat-briefing/)                                                     | `GET /news`                                                                                     |
| Health   | [routes/health.js](../server/src/routes/health.js) | none                                                                                                               | `GET /health`                                                                                   |

Cohort and admin routes are numerous. Read [cohorts/README.md](../server/src/modules/cohorts/README.md) and [admin/README.md](../server/src/modules/admin/README.md) for the exact list.

## 8. Front-end shell

**One page, two modes.** `/` renders [views/Dashboard.vue](../client/src/views/Dashboard.vue). It mounts either the 3D hub or the 2D town, never both.

- **3D hub** ([features/hub/](../client/src/features/hub/)): [HubScene.vue](../client/src/features/hub/HubScene.vue) owns the Babylon.js engine ([engine.js](../client/src/features/hub/engine.js)). The wharf scene is [scenes/a-wharf.js](../client/src/features/hub/scenes/a-wharf.js) with parts in `scenes/wharf/` (buildings in `buildings.js`, door and destination layout in `layout.js`). `scenes/shared/` holds the follow camera, player and helpers. The hub is fully disposed on leave. Plain DOM links ("destination twins" in the menu) mirror every 3D destination for keyboard and test access. Audio: [HubAmbience.vue](../client/src/features/hub/HubAmbience.vue) and the lore intro in `intro/`.
- **2D town** ([features/legacy-town/](../client/src/features/legacy-town/)): [TownMap.vue](../client/src/features/legacy-town/TownMap.vue) draws the 1120 by 800 pixel town inside one `@panzoom/panzoom` instance (`townZoom.js`). Arrow keys and WASD walk Sharlock (`useTownWalker.js`). Music is `TownAudio.vue`.
- **Mode switch.** [useTownMode.js](../client/src/features/legacy-town/useTownMode.js) decides the mode. Missing WebGL2 or a failed 3D start always gives 2D. Otherwise an explicit choice stored under `sharlock.townMode` wins, and without one a device check ([hub/deviceCheck.js](../client/src/features/hub/deviceCheck.js)) and a performance watcher pick 2D on slow devices. See the [hub README](../client/src/features/hub/README.md).
- **Menu.** [features/menu/](../client/src/features/menu/) holds the site menu and overlays (profile, classes, leaderboard, settings, discoveries, about). They open as child routes over the town.
- **Interiors.** The five scored game routes (not Botnet Tag) sit under [InteriorLayout.vue](../client/src/features/interiors/InteriorLayout.vue). It shows a WebP still of the room from `client/public/interiors/<game-id>.webp` behind the game. Game routes mount no Babylon engine. Botnet Tag has its own route and needs WebGL.

**Catalog.** [data/gameCatalog.js](../client/src/data/gameCatalog.js) is the only registry of games and buildings. `defineGameCatalog` rejects bad entries. Fields: `id` (unique, kebab-case), `name`, `shortName`, `description`, `difficulty` (integer 1 to 3), `backgroundKnowledge`, `route`, `isPreview`, `duration`, `icon`, `accent`, `building` (`type`, `x`, `y`) and `needs3d`. Both town modes read it. Do not add a second registry.

**Router.** [router/index.js](../client/src/router/index.js) routes:

- `/` (town) with children `/games/threat-briefing`, `/profile`, `/leaderboard`, `/classes`, `/settings`, `/discoveries`, `/about`.
- Public or auth pages: `/login`, `/register`, `/activate-account`, the reset-password route, `/join-class`.
- Staff pages: `/instructor`, `/admin`.
- Games: five routes under `/games` (interior layout), plus `/games/botnet-tag`.
- Fallbacks: `/forbidden` and a catch-all not-found route. Some old paths redirect.

**Shared styles.** [assets/styles/main.css](../client/src/assets/styles/main.css) (global tokens and components), [town.css](../client/src/assets/styles/town.css) (town) and `ui-scale.css`. Game CSS stays inside its own game folder with local `--game-*` variables. Shell files are [layouts/PortalLayout.vue](../client/src/layouts/PortalLayout.vue) and [components/portal/Navbar.vue](../client/src/components/portal/Navbar.vue). Visual rules are in [DESIGN.md](../DESIGN.md).

## 9. Real-time

Both servers use `ws` with `noServer`. [server.js](../server/src/server.js) listens for the HTTP `upgrade` event and routes by path.

| Socket     | Path              | Server code                                                                                          | Client code                                                                                         |
| ---------- | ----------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Presence   | `/api/presence`   | [presence/service.js](../server/src/modules/presence/service.js), `protocol.js`, `rooms.js`          | [usePresence.js](../client/src/features/hub/presence/usePresence.js), `roster.js`, `remotePeers.js` |
| Botnet Tag | `/api/botnet-tag` | [botnet-tag/socket.js](../server/src/modules/games/botnet-tag/socket.js), `protocol.js`, `rounds.js` | [useTagSocket.js](../client/src/games/botnet-tag/useTagSocket.js)                                   |

- Both check the session cookie and the request origin on upgrade, and recheck the session and membership while connected. The `session-ended` event in `app.js` closes sockets on sign-out or when a newer login replaces the session.
- **Presence** shows only the viewer's class. It sends username, preset avatar, outfit and position under a per-connection id. It sends no emails or user IDs. The 3D hub and the 2D town share it (each draws its own peers).
- **Botnet Tag** keeps all state on the server: tags, positions and puzzle answers. A snapshot carries only the caller's own puzzle. A finished round is saved through the shared attempt service.
- Test-only controls for Botnet Tag exist only when `NODE_ENV=test`.

## 10. Data models

All models are created from the shared Mongoose connection in `server/src/`. Collection names are set in each model file.

| Model                    | Collection                 | File                                                                                       |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| `User`                   | `users`                    | [models/User.js](../server/src/models/User.js)                                             |
| `Membership`             | `memberships`              | [models/Membership.js](../server/src/models/Membership.js)                                 |
| `Institution`            | `institutions`             | [models/Institution.js](../server/src/models/Institution.js)                               |
| `Cohort`                 | `cohorts`                  | [models/Cohort.js](../server/src/models/Cohort.js)                                         |
| `InstructorAssignment`   | `instructor_assignments`   | [models/InstructorAssignment.js](../server/src/models/InstructorAssignment.js)             |
| `EnrollmentCode`         | `enrollment_codes`         | [cohorts/enrollment-code-model.js](../server/src/modules/cohorts/enrollment-code-model.js) |
| `GameAttempt`            | `game_attempts`            | [attempts/model.js](../server/src/modules/attempts/model.js)                               |
| `PasswordReset`          | `password_resets`          | [recovery/model.js](../server/src/modules/recovery/model.js)                               |
| `AuditEvent`             | `audit_events`             | [audit/model.js](../server/src/modules/audit/model.js)                                     |
| `BootstrapState`         | `admin_bootstrap_state`    | [admin/model.js](../server/src/modules/admin/model.js)                                     |
| `NewsCache`, `NewsQuota` | `news_cache`, `news_quota` | [news/models.js](../server/src/modules/news/models.js)                                     |

Sessions are stored in MongoDB by the session store in [auth/session.js](../server/src/modules/auth/session.js).

## 11. Tests

Layout:

- Client unit and component tests: `client/src/**/__tests__/*.test.js` (Vitest, Vue Test Utils).
- Server unit tests: [server/tests/unit/](../server/tests/unit/), one folder per module.
- Server integration tests: [server/tests/integration/](../server/tests/integration/), API tests against a disposable MongoDB.
- End-to-end: [tests/e2e/](../tests/e2e/) (`*.spec.js`, Playwright). Specs that touch the town force 2D mode.

Commands (repo root, from [README.md](../README.md) and [CLAUDE.md](../CLAUDE.md)):

```bash
pnpm install --frozen-lockfile
pnpm setup:env                          # creates local env files; never print them
pnpm db:local                           # local development MongoDB
pnpm dev                                # client :5173 + API :3000
pnpm build
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:integration
pnpm exec playwright install chromium   # required before reporting any E2E result
pnpm test:e2e
```

**Test-database runner.** `test:integration` and `test:e2e` go through [scripts/run-with-test-db.mjs](../scripts/run-with-test-db.mjs). It starts a throwaway MongoDB with a random database name `sharlock_<hex>_test`, runs the suite with `NODE_ENV=test`, `TEST_MONGODB_URI` and a random `SESSION_SECRET`, then stops it. `--replica-set` starts a replica set for specs that need transactions.

**Safety guard.** [assertSafeTestDatabaseUri](../server/src/config/database-uri.js) refuses any test URI whose database name does not end in `_test`, and refuses a name equal to the development database. Tests never fall back to the development database.

Test counts and the latest full run are in the README for markers in the submission zip. Course alignment for testing is in [course-alignment.md](course-alignment.md).

## 12. Where to read next

- [README.md](../README.md): kickoff prompt, setup, "Using the app" destinations table.
- [DESIGN.md](../DESIGN.md): visual and accessibility rules, how to add a game to the town.
- [CODE_STYLE.md](../CODE_STYLE.md): readability standards.
- [TASKS.md](../TASKS.md): task records, ownership, verification. Search it with `rg` for a task ID.
- [saved-game-integration.md](saved-game-integration.md) and [attempts/README.md](../server/src/modules/attempts/README.md): the saved-play contract.
- [hub README](../client/src/features/hub/README.md), [interiors README](../client/src/features/interiors/README.md), [attempts client README](../client/src/features/attempts/README.md), [auth client README](../client/src/features/auth/README.md).
- Server module READMEs: [auth](../server/src/modules/auth/README.md), [cohorts](../server/src/modules/cohorts/README.md), [progress](../server/src/modules/progress/README.md), [leaderboards](../server/src/modules/leaderboards/README.md), [presence](../server/src/modules/presence/README.md), [news](../server/src/modules/news/README.md).
- Game READMEs: each `client/src/games/<id>/README.md` opens with a presentation summary.
