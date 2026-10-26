# Connecting an existing game to saved accounts and results

This guide helps a game owner and their teammate or agent plan one real game's connection to Sharlock Hub's shared saved-attempt foundation. It is a start-here guide and planning worksheet; it is not an approval to migrate a game, register a production adapter, or change shared infrastructure.

## Historical readiness as of 16 October 2026

| Piece                                                                | Current state                         | What this means for a game owner                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Accounts, classes and server permissions                             | Published; task records remain Review | Read the current task board before relying on this snapshot                                                           |
| GAME-01-A server attempt/result foundation                           | Implemented; Review                   | Verify the current live branch/checkout and task board for integration/publication status                             |
| PRO-01 profile editing                                               | Implemented; Review                   | Verify the current live branch/checkout and task board; profile editing adds no game persistence or shared game UI    |
| Scored game adapters                                                 | Normal startup registers none         | Phishing Post-Mortem, CLI Cyber Defender and Social Engineering Simulator retain their existing interim unsaved flows |
| Shared client attempt wrapper, context chooser and saved-result view | Not implemented                       | Missing shared pieces need a separately approved prerequisite plan                                                    |
| Server context resolution                                            | Implemented                           | It validates requested personal or cohort context; it does not provide the missing browser flow                       |

These are separate readiness facts. A completed server foundation does not make a game saved, and a playable game does not imply that its owner approved a migration. Check [TASKS.md](../TASKS.md) for current branch, publication, task status, approval, and contributor evidence before proposing work.

## Current status (27 October 2026)

All five scored games now save through the shared attempts contract: G-SQL (GAME-01-B), then Clearance Tower, Phishing Post-Mortem, CLI Cyber Defender and Social Engineering Simulator under SAVE-01 (In Progress in [TASKS.md](../TASKS.md)). Clearance and Phishing use the normal start/action/complete routes. CLI and Social keep live engine state in server memory and are server-recorded: the server records the finished result once and the public start and action routes return 409 `ATTEMPT_SERVER_RECORDED`; see [Server-recorded path](#server-recorded-path-save-00) and the [attempts README](../server/src/modules/attempts/README.md#server-recorded-games-save-00). The readiness table above and the sections below are the historical baseline.

## Current G-SQL continuation

The approved GAME-01-B / G-SQL work supplies `client/src/features/attempts/` request/context/result components, authenticated context discovery, and one production `sql-1` practice adapter. G-SQL uses the canonical saved-attempt routes. The table above preserves the earlier baseline; other games still require their own owner-agreed integration plans. Follow the current TASKS record and the shared browser/server module READMEs instead of treating that historical missing-prerequisite snapshot as current availability.

## Begin with the existing contracts

1. Read the [team kickoff prompt](../README.md#1-teammate-agent-kickoff-prompt), [engineering guardrails](../agents.md), [shared game blueprint](../README.md#shared-implementation-blueprint), and the relevant game task in [TASKS.md](../TASKS.md). Follow the feature-selection and explicit-approval workflow there.
2. Read the [saved-attempt contract](../server/src/modules/attempts/README.md). It owns the route payloads, authorization behavior, adapter callbacks, request limits, and saved snapshot shape. This guide intentionally does not copy that contract.
3. Read the chosen game's existing module notes and ask its actual owner to confirm the starting behavior and desired changes. Existing notes include [Phishing migration](../server/src/modules/games/phishing-post-mortem/README.md), [CLI migration](../server/src/modules/games/cli-cyber-defender/README.md), and [Social migration](../server/src/modules/games/social-engineering-simulator/README.md).
4. Search the task board, local files, branches, available worktrees, and pull requests for collisions and active claims before planning a new scope. Report what was unavailable; a clean local checkout cannot prove that no teammate has unpublished work.

The existing per-game notes are useful migration context, not current approval. Preserve their owners' changes and follow the collision stop rule in `agents.md` if any matching feature work or claim exists.

## What the shared foundation provides

The attempt service owns a saved play from start through its final read. Its four routes, exact fields, and errors are defined in the [attempt contract](../server/src/modules/attempts/README.md#endpoints). A future client should use the existing credentialed Axios instance and pass API-relative paths; its base URL already ends in `/api`.

The shared boundary is:

1. An authenticated player requests an attempt for one stable game ID and an allowed personal or cohort context.
2. The server checks the current actor and context, chooses the registered server ruleset and mode, initializes private game state, and returns a public snapshot.
3. The client sends a game action with its action ID, expected revision, action type, and bounded payload. The server validates and applies it, calculates score, records the canonical response, and returns the next public outcome.
4. When the ruleset's finish condition is met, the client requests completion. The server creates the immutable completed result once and returns its public summary.
5. The player can read the current attempt or completed snapshot through the owner-scoped read route. The snapshot is the canonical result; it is not a profile field or a second score store.

Use the exact route and response contract in the attempt README when a game has its own approved integration plan. Do not create another attempts endpoint, persistence collection, result service, client wrapper, or catalog registry to work around a missing shared contract.

## Responsibility and safety boundaries

- **Browser identity:** use the existing cookie-backed session and Axios client. Every state-changing attempt request uses the app's established exact-origin and synchronizer-CSRF protections. A route guard improves navigation but is never server authorization.
- **Actor and context:** the session determines the actor. The server resolves and checks personal/cohort context and freezes it at attempt creation. The browser cannot claim another player, role, cohort membership, eligibility, or teaching permission.
- **Rules and score:** a registered server ruleset validates action types and payloads, changes state, determines completion, and calculates the score. Never accept a browser-supplied score, result, award, ruleset, deadline, or completion flag.
- **Private and public state:** the adapter owns private answers and internal state. Its public-state serializer must explicitly construct the fields the player may see; never serialize the private state wholesale.
- **Retries and concurrency:** each mutation uses an action ID and expected revision. Reuse the same ID and exact request when retrying a lost response. Do not invent a second result when the server already recorded that action or completion.
- **Time:** the server owns start and deadline timestamps. A GET is read-only. Timed, paused-clock, background-tab, and untimed-practice behavior must be decided for that game and implemented in its ruleset/UI plan.
- **Class access:** active or abandoned cohort attempts require current access for reads and further mutations. An active account can still read its own completed cohort result after losing class access; it cannot continue changing that attempt. Expired, disabled, or version-stale accounts still fail authentication.
- **Staff access:** the owner endpoint never lets an instructor or administrator read another player's attempt. INST-01 adds scoped instructor/admin class reads via `server/src/modules/class-results/` (see its [module README](../server/src/modules/class-results/README.md)); the owner endpoint is unchanged.
- **Async work:** registry hooks are bounded, synchronous, and free of external effects. An LLM or other asynchronous operation needs a separately approved reservation/retry design; do not put upstream work inside a callback that may lose a database update race.
- **Learning claims:** recorded scores and topic outcomes are performance evidence, not validated mastery. Do not invent learning objectives, course claims, scoring criteria, feedback, or curriculum alignment. Use the current course-reference process in TASKS for any course-derived claim.

Keep other security, data, scoring, design, and verification requirements in [agents.md](../agents.md), [DESIGN.md](../DESIGN.md), [TASKS.md](../TASKS.md), and the canonical attempt contract instead of copying policy text here.

## Server-recorded path (SAVE-00)

When a game's live state stays in its own server engine (timers, LLM calls, per-session memory), do not force it through the shared action hooks. Register a ruleset with `serverRecorded: true` (only `stateSchema`, `summarize` and `serializePublicState` required), validate the requested class at run start with `resolveRunContext(actor, context)`, then call `recordCompletedAttempt(actor, gameId, { context, mode, startedAt, state, resultKey })` once when the run ends, with a per-run `resultKey` so retries are idempotent. The result is scored on the server from the final state, appears in progress, class results and leaderboards like any other attempt, and the public start/action routes refuse the game with `ATTEMPT_SERVER_RECORDED`. Details: [attempts README](../server/src/modules/attempts/README.md#server-recorded-games-save-00).

## Typical integration stages

Treat these as planning checkpoints, not a pre-approved implementation sequence. A missing prerequisite or owner decision can stop one stage without authorizing a workaround.

1. **Confirm readiness.** Check the current GAME-01-A task status, its publication state, the actual app registration, the selected game's task and contributor record, and any changes since the last collision check. Do not rely on this guide's dated snapshot alone.
2. **Agree the game plan.** The game owner and Boey settle the learner flow, context/mode choices, state and result fields, deadlines, async work, dependencies, touched paths, and acceptance evidence. Record a separate task and wait for explicit scope approval.
3. **Plan the server adapter.** Map the game's existing rules into one stable server registry entry and its strict schema/callback contract. Keep private state server-side, preserve the existing game identity, and decide how old interim sessions end without inventing saved history.
4. **Plan shared-client prerequisites.** Identify the approved reusable attempt request wrapper, context chooser, and result display needed by the browser flow. If a shared component is not yet approved or implemented, agree that prerequisite explicitly; do not embed a second version inside a game.
5. **Plan the game UI connection.** Reuse the existing catalog route and feature module. Decide when a play becomes persisted, how the UI renders server snapshots, and what the learner sees for pending, rejected, abandoned, completed, or unavailable attempts.
6. **Plan verification.** Derive focused unit/API/client tests from the worksheet and the canonical contract. Use synthetic accounts and game data in the guarded disposable test environment only; do not create demo data in the normal database.
7. **Review the completed scope.** Before changing a task to Review, record the exact files and commands run, outcomes and limits, resulting branch/publication state, and any follow-up dependencies. Acceptance and publication remain separate decisions.

The historical empty registry was intentional; the separately approved G-SQL continuation now registers its own practice adapter. Making a real game playable against saved results requires an owner-approved adapter and the corresponding shared/browser integration; a successful route guard, foundation API, mock adapter, or UI label alone does not establish that the learner's result was saved.

## Saved-status messages

Keep wording aligned with the server's actual attempt state:

- Existing interim runs remain unsaved even if their response includes a score or debrief. Do not describe those outcomes as saved history.
- A new attempt is server-backed only after its start request returns a successful public snapshot with `persisted: true`.
- An active saved attempt is not a completed result. Explain any interruption, abandonment, or remaining action if the player leaves early.
- Say a result is saved only after the server returns the completed immutable snapshot. Do not infer completion from a local timer, score animation, button press, or lost response.
- If an action response is lost, retry the same action ID and request. Do not optimistically award a score or start a replacement attempt while the outcome is uncertain.
- If the API is unavailable or rejects the action, show safe feedback and preserve the existing server/client contract; do not silently fall back to local scoring and then claim persistence.

The task-specific plan still decides the exact copy, local draft/recovery behavior, and what may be replayed after failure. This section sets a truthful status boundary, not a shared component or new recovery feature.

## Stop signs before implementation

Pause and return to the owner or main agent when any of these conditions applies:

- The game is already implemented, partly migrated, claimed, or being changed in a branch/worktree/PR that you cannot safely inspect.
- The named owner has not agreed to continue their existing game, or the approved path list would overwrite their work.
- The requested behavior depends on an unapproved context selector, mode contract, scoring rule, course-derived learning objective, result field, async provider call, leaderboard, or staff endpoint.
- The shared client wrapper/result UI is missing and the plan tries to invent a game-local replacement.
- A real account, normal database record, administrator credential, demo seed, private configuration, or live provider would be needed to prove a local synthetic test.
- The proposal assumes a historical interim run can be reconstructed as a saved attempt, or that an instructor can use the student-owner endpoint to view it.

When stopped, report the concrete collision, absent prerequisite, or decision needed. Keep independent already-approved work within its own exact boundary; do not solve uncertainty by expanding the game task.

## Planning handoff format

Give the owner a short, reviewable packet in this order:

1. **Current evidence:** game/task status, current foundation publication state, available local/remote surfaces, collisions and anything unavailable.
2. **Proposed journey:** when the player chooses context/mode, starts, acts, retries, finishes, reads the result, and returns or replays.
3. **Data and authorization:** actor/context resolution, immutable attempt fields, private versus public state, server scoring, eligibility and membership-change behavior.
4. **Implementation boundary:** exact new/existing files by game/client/server/tests/docs, additive shared registrations, explicit non-goals, and any prerequisite task.
5. **Acceptance:** observable player behavior, permission cases, retry/deadline/concurrency cases, safe data boundary, focused commands, database target and verification limits.
6. **Open decisions:** ask only questions whose answers can materially change behavior, security, data, architecture, dependency, or acceptance. Mark the rest as out of scope.

Do not describe a plan as accepted because a task is listed as proposed, a foundation exists, a game owner is absent, or an earlier task had a different approval. Wait for the current user's explicit approval of the complete bounded plan before implementation.

## Planning worksheet: one game at a time

Complete this worksheet with the actual game owner before requesting implementation approval. Do not fill unknown answers with assumptions.

### Identity, ownership, and scope

- Game/task ID, display name, route, current catalog entry, ruleset ID/version:
- Actual contributor/owner and their explicit agreement to this continuation:
- Existing branch/worktree/PR or active claim; collision-search evidence and unavailable sources:
- Player-visible outcome the approved slice should deliver:
- Exact client, server, test, and documentation paths to add or edit:
- Dependencies and the smallest separately approved prerequisite if one is missing:
- Explicit exclusions, especially other games, shared infrastructure, profile/progress, rankings, and instructor tools:

### Play flow and data mapping

- New attempt entry point and personal/cohort choice; where will that choice be presented and validated?
- Allowed modes, including practice eligibility, timed behavior, pause/resume, and replay behavior:
- Exact game action types and bounded payloads; which UI event sends each one?
- Private ruleset state and strict schema; which answer keys or prompts must remain server-only?
- Public state, outcome feedback, topic outcomes, and completed-result fields the player needs:
- Server-side validation, scoring, completion condition, action limits, and deadline behavior:
- Idempotency, concurrent actions, lost-response retries, cancellation, and any asynchronous reservation needs:
- How current unsaved/interim runs end; confirm there is no fabricated historical attempt or score migration:
- Copy for saved, practice, abandoned, failed, and unavailable states:

### Dependencies and acceptance

- Confirm existing auth, current permission/context services, and attempt routes meet the specific flow:
- Identify missing shared browser wrapper/context/result UI. Agree a prerequisite task if needed; do not clone these inside the game:
- Unit coverage for ruleset schemas, validation, scoring, serialization, and completion:
- Guarded API coverage for sign-in, CSRF, ownership, context/membership changes, invalid IDs, retries, concurrency, and deadlines:
- Client journey coverage for context/mode selection, action feedback, completion/read, errors, keyboard/touch access, and truthful saved status:
- Exact disposable `_test` database command and any required replica-set condition; confirm no normal-data cleanup:
- Acceptance reviewer and evidence required before changing the task to Review or Done:

An unanswered material item goes back to the owner for a decision. Narrow the approved scope to the choices that are settled; do not fill the rest by implementing a parallel contract.

## Copyable planning kickoff for a teammate agent

Replace the bracketed fields before sending. This prompt requests read-only planning only; it does not authorize code, adapter registration, tests against a normal database, or changes to another contributor's game.

```text
Help plan one owner-approved saved-game connection for [GAME ID / NAME].
The actual game owner is [NAME, or ask me if unknown]. Begin read-only.

1. Read TASKS.md, README.md, DESIGN.md, lowercase agents.md, and CODE_STYLE.md
   in the required order. Check the current task status and authorization.
2. Read docs/saved-game-integration.md, the canonical
   server/src/modules/attempts/README.md, and this game's existing module notes.
3. Search the game ID, concept, routes, shared contract, tests, claims, branches,
   worktrees, and available PRs for collisions. Report unavailable sources too.
4. Do not touch matching existing work or treat a preview, empty folder, task
   status, or previous foundation approval as game-migration approval.
5. Ask the owner only for unresolved choices that materially affect behavior,
   security, data, architecture, dependencies, or acceptance. Record the settled
   play flow, exact payload/state boundaries, dependencies, files, and checks
   using the worksheet in docs/saved-game-integration.md.
6. Return a concise implementation plan and wait for explicit approval before
    writing code, creating scaffolding, claiming work, registering an adapter,
    adding dependencies, changing configuration, running setup, seeds, or tests.
    Any later test cleanup must use an explicitly guarded disposable database.

Preserve all contributor ownership. Do not add another attempt/result store,
API wrapper, context chooser, catalog entry, or result system. Keep the current
game unsaved until its own approved implementation actually persists results.
```

## Safe verification and what this guide does not authorize

The contract's synthetic adapter is a test fixture, not an example production game. It lives in [attempt integration helpers](../server/tests/integration/attempts/helpers.js) and is exercised by the [attempt integration tests](../server/tests/integration/attempts/attempts.test.js). Production startup now registers only the separately approved real G-SQL practice adapter. Never register, import, copy, or relabel that fixture as a real game adapter.

For an approved server integration, add focused registry/ruleset tests and authenticated API tests to the owning game/foundation tests. Use only the established guarded disposable `_test` database runner; confirm the runner's safety checks and replica-set need before execution. Test direct access to another player's and cohort's IDs, changed membership, invalid or repeated actions, lost responses, concurrent mutations, incomplete completion, and private-state serialization. Add client tests for the actual player journey after a shared client contract exists.

Do not create or reset a normal administrator, bootstrap accounts, seed demo users/classes/results, inspect normal records for orientation, request credentials, expose secrets, or copy private handover/recovery material into this guide. No new dependencies, configuration, paid service, live provider, or normal database operation follows from this guide. The cancelled Capybara Cyber Dash and its `runner_question_templates` data remain excluded; do not restore or recreate either.

This guide covers only planning a saved-results connection for one existing game after the foundation. A comprehensive guide to all remaining account, learning, profile, leaderboard, instructor, administration, recovery, audit, and setup features remains deferred. The foundation's publication, acceptance, and review status must be checked in TASKS before any new scope is proposed.
