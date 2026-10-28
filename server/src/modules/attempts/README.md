# Shared saved attempts and results

GAME-01-A is the server foundation for saved gameplay. It is not a migration of Phishing, CLI or Social. Normal startup now registers the separately approved G-SQL `sql-1` practice adapter (since SQL-02, `sql-2` is current and `sql-1` stays registered with `current: false`); Phishing, CLI, Social and Clearance retain their unsaved endpoints and labels. The sample game used by integration tests lives only under `server/tests/integration/attempts/`; no HTTP field, environment switch or startup import enables it in the normal app.

## Request and storage flow

Future owner-agreed game UI → existing credentialed Axios client → the four routes below → existing session/origin/CSRF checks → shared current account/context permissions → registered server ruleset → one `game_attempts` document. GAME-01-B supplies a shared browser request wrapper, context chooser and saved-result component for G-SQL. No aggregate points, awards, rankings or teaching dashboard is added.

`app.js` mounts only these handlers using its single auth runtime. `server.js` initializes the named collection and indexes additively, without seeding or rewriting existing records. The service uses the passed Mongoose connection. Writes affect one attempt document, so state, score, revision, action receipt and completed result are atomic without a multi-document transaction or replica-set prerequisite.

## Endpoints

Paths are relative to `/api`. Every route requires an active cookie-backed account and sends `Cache-Control: no-store`. Every POST also uses the existing exact-origin and synchronizer-CSRF checks. Unknown query keys are rejected.

| Method/path                          | Exact input                                                           | Success                                                          |
| ------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST `/games/:gameId/attempts`       | `{context:{kind:'personal'}}` or `{context:{kind:'cohort',cohortId}}` | 201 public snapshot                                              |
| GET `/attempts/:attemptId`           | No body or query options                                              | 200 current public snapshot, or the immutable completed snapshot |
| POST `/attempts/:attemptId/actions`  | `{actionId,expectedRevision,type,payload}`                            | 200 recorded public outcome                                      |
| POST `/attempts/:attemptId/complete` | `{actionId,expectedRevision}`                                         | 200 immutable completed snapshot                                 |

Snapshots contain `attemptId`, `gameId`, `rulesetVersion`, `context`, `mode`, `status`, `revision`, `startedAt`, `deadlineAt`, `completedAt`, `score`, `maxScore`, `persisted:true` and `publicState`. Only completed snapshots add `feedback` and `topicOutcomes`. Internal player IDs, ruleset keys, state, action hashes/receipts, database fields and eligibility flags are not serialized. An adapter must explicitly construct its public state; it must never return its private state wholesale.

The browser cannot supply a player, ruleset, score, award, eligibility flag or timestamp. Mode is currently selected by the server adapter (`standard` or `practice`). The request shape does not yet select CLI timed/practice behavior; that and its UI must be agreed with the owner during migration. Untimed practice cannot have a deadline and never qualifies for rankings.

## Ownership and class access

- The session supplies the actor. The permission service reloads the active account and current roles. Middleware checks session expiry, account status and authVersion; browser route guards are not the API authority.
- Creation resolves the requested context through the existing service. Personal context remains available to active accounts. Class context needs active parents and the actor's current membership, instructor assignment or administrator capability.
- The saved player/context/game/ruleset/start/deadline/mode/eligibility fields do not change later. A new membership never transfers an attempt to another class.
- An active or abandoned class attempt needs current class access when read; further actions or completion also need it. Class removal, inactive parents or a removed teaching assignment deny the next request. A player can start a separate personal attempt once an actual game adapter exists.
- **An active account retains its own completed result after losing class access.** Completed-result reads do not require continued class membership. Disabled/version-stale/expired accounts still fail authentication. There is no staff override on the owner endpoint: instructors/admins cannot use it to read someone else's attempt. Instructor/admin teaching reads exist only in `server/src/modules/class-results/` (scoped by `cohort:teach`, completed class-context attempts only); this owner endpoint is unchanged.
- Server eligibility is fixed at start: only standard play in a class, through a competitive ruleset, by a student without instructor/admin roles can be eligible. Future rankings must additionally check current membership/roles and compare the same game/ruleset; `server/src/modules/leaderboards/` does this at read time. This marker does not create a leaderboard.

## Lifecycle, retries and deadlines

Attempts start `active`, revision zero. Valid game actions update state/score and increment the revision. Shared action `type:'abandon'` with `payload:{}` ends the attempt as `abandoned`; it does not create a completed result. Completion requires the ruleset's finish condition and changes the attempt to `completed` once. Results are immutable.

Each mutation supplies a UUID action ID and expected revision. A receipt stores the canonical request hash and exact public response in the same write as the state change. Object-key order does not change request identity; array order and values do. Revision is excluded from the hash, so retrying a lost response with the original revision finds its receipt before stale-revision rejection. The hash includes the operation/type, so an action ID cannot be reused for different input or for completion.

A conditional update requires the same owner, active status and original revision. Concurrent writers cannot both change that revision. A loser reloads and returns the winning receipt for the same request, the final result for concurrent completion, or a safe conflict requiring refresh. Retrying completion with a fresh action ID after success returns the same result without adding another receipt. Active-state receipts still require current class access; completed receipt/result replays make no new mutation.

Receipt time comes from the server before awaited work. A game action arriving exactly at or after a fixed deadline is refused; completion may resolve a deadline-ended game if its ruleset says it is finished. Abandonment remains available. GET may derive a public view from the server clock but never updates the document, resolves a missed challenge or completes a game. Deadline/paused-clock rules specific to CLI, and reservations/retries for Social generation, remain later owner-agreed integrations.

## Registry and bounds

The registry is server code, separate from the homepage display catalog. Each entry has a stable ID/version, learning objective, topic tags, strict state schema, maximum score, action cap, current/competitive flags and six callbacks: `createState`, `validateAction`, `applyAction`, `canComplete`, `serializePublicState`, `summarize`. Older registered versions can remain available without being selected for new starts. Completed snapshots can still be read without their old adapter.

State schemas use strict Mongoose discriminators keyed by the internal game/version pair. Root and nested state schemas disable generated IDs and use JSON-compatible fields. Unknown state fields, Mixed paths, maps and non-JSON schema types are rejected. Hooks receive copies of JSON state and server metadata. They must be bounded, synchronous and free of external effects; returned promises fail safely. Async provider work needs a separately approved reservation protocol. It must not be placed inside a callback that may lose an atomic-update race.

Requests are capped at the app's existing 16 KiB body limit and strict validation limits of 12 levels/2,000 JSON nodes. Keys containing operators, dots or prototype names reject. State is capped at 256 KiB, each public response/receipt at 128 KiB, and the total candidate document at 4 MiB. Active writes reserve 1 MiB for the eventual terminal receipt, frozen result and feedback. Registry action limits are 1–255; one additional receipt is reserved for completion/abandonment, with a hard ceiling of 256. Receipts are not evicted, so an accepted action remains retryable. A bound or adapter failure leaves the earlier persisted version intact.

The router owns and disposes its process-local limiter stores: creation 30/user and 300/IP per 15 minutes (SAVE-04: a class behind one school address shares the IP budget); actions/completion share 120/user and 240/IP per minute; reads 240/user and 480/IP per minute. `createAttemptRouter(..., { limits })` overrides any of `DEFAULT_ATTEMPT_LIMITS`; only `server/src/server.js` passes higher limits, and only when `NODE_ENV` is `test`, because every Playwright request arrives from one loopback address. No distributed-limit claim is made. Known failures use safe 400/401/403/404/409/429 responses; unknown adapter/storage failures return fixed 503 guidance without bodies, secrets, configuration or stack traces. No broader game audit caller is added; the canonical attempt/receipt is the saved result record.

## Server-recorded games (SAVE-00)

Some engines keep live state in their own server memory (timers, LLM calls, bespoke sessions) and cannot run through the synchronous action hooks. They set `serverRecorded: true` on their registry entry and record the server-computed result once, when the run ends. For such entries `createState`, `validateAction`, `applyAction` and `canComplete` may be omitted (if present they must still be functions); `stateSchema`, `summarize` and `serializePublicState` stay required.

- `service.recordCompletedAttempt(actor, gameId, { context, mode, startedAt, state, resultKey })` is internal only; no HTTP route calls it. It rechecks the actor and context exactly like `startAttempt` (active membership, active parents), validates `state` against the strict schema and size limits, scores through `summarize(state)` and inserts one `completed` attempt (revision 0, no deadline, `completedAt` is the server clock, `startedAt` is capped at that clock, `competitiveEligible` uses the same rule as start). It returns the completed public snapshot, identical in shape to `completeAttempt`. Unknown or non-`serverRecorded` games, bad modes or keys, and invalid state fail with 4xx `AttemptError`s.
- Idempotency: `resultKey` is a string of 8-64 `[A-Za-z0-9-]`. A partial unique index on `(playerId, gameId, resultKey)` plus a lookup means a repeat (or a lost race) returns the existing snapshot and never a second row. The game router should generate the key once per run.
- `service.resolveRunContext(actor, requestedContext)` lets a game router fail early at run start: it returns the resolved context or throws the usual `AttemptError`/`CohortError`. It stores nothing.
- The public start, action and complete routes reject these games with 409 `ATTEMPT_SERVER_RECORDED` (checked in the service). `GET /attempts/:id`, progress, class results and leaderboards read the recorded attempts unchanged.

## Files and verification

- `policy.js`: exact inputs, IDs/revisions, canonical JSON/hashes and budgets
- `registry.js`: server ruleset registration and callback/schema contracts
- `model.js` / `storage.js`: shared strict document, per-ruleset state, indexes and additive initialization; INST-01 adds `{ 'context.cohortId': 1, status: 1, completedAt: -1 }` for class results
- `service.js`: ownership/context, server time/scoring, atomic lifecycle and saved responses; also `listCompletedAttempts(playerId, { gameId, skip, limit })`, a read-only helper for the progress module that returns `{ attempts, total }` for the player's completed attempts (newest `completedAt` first, explicit projection, no membership check so retained class results stay listed)
- `router.js`: the four handlers, shared protection, owned limits and safe errors
- `server/tests/unit/attempts/`: input, registry and model contracts
- `server/tests/integration/attempts/`: injected synthetic adapter and real authenticated persistence/permission/retry/concurrency checks

Verification commands and actual results are recorded in TASKS.md. Tests use only the established guarded disposable `_test` runner. This server-only slice needs no browser screenshot pass and performs no normal database/provider check, administrator recreation, fixture seeding or import of old unsaved runs.

## Browser context discovery and G-SQL registration

`GET /api/attempt-contexts?page=1&limit=20` requires a live session, uses the existing attempt read limits and returns `Cache-Control: no-store`. Exact optional pagination accepts positive decimal strings, pages 1–10000 and limits 1–50; unknown/repeated/structured parameters reject. It delegates to `createContextService.listEligibleContexts`, returning `{personal,cohorts,page,total}` for the current actor only. Rows contain cohort/institution names and IDs, never rosters or user IDs. Attempt creation still rechecks current access.

`production-registry.js` registers only the real SQL Injection Arcade ruleset. App routing and startup storage initialization use the same production registration; injected test registries remain supported. The synthetic adapter remains test-only. Browser components live in `client/src/features/attempts/`; the G-SQL module documents its untimed noncompetitive rules and strict state. The original proposed `/sqli-test` endpoint is superseded by the canonical action route.
