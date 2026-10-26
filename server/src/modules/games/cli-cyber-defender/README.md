# CLI Cyber Defender — server module

Server half of the `cli-cyber-defender` game (G-CLI). Runs belong to a signed-in player and finished runs are saved as attempts. The server owns the incident pool, the time windows, the command parser and every score. The browser only ever sees the alert that is open right now, until the debrief.

## Files

| File           | Responsibility                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios.js` | Private pool of 16 fictional incidents: alert text, expected `{ verb, target }`, topic and explanation. Addresses are RFC 5737 documentation ranges or internal `10.x` lab space.         |
| `parser.js`    | Teaching grammar: `block ip <ipv4>`, `disable user <name>`, `isolate host <name>`. Keywords are case-insensitive and whitespace is collapsed. Nothing is ever executed.                   |
| `schedule.js`  | `generateWindows()` builds eight integer windows of 10–15 seconds totalling 100. `deriveProgress()` is a pure replay of a run from stored timestamps.                                     |
| `service.js`   | In-memory run store (max 500 runs, 10-minute idle expiry), command submission with idempotent action IDs, completion and debrief.                                                         |
| `policy.js`    | Constants, strict body validation (unknown fields rejected) and `CliError`.                                                                                                               |
| `ruleset.js`   | Attempts registry entry (`cli-2`, server-recorded, competitive): strict compact state, score recomputed from stored outcomes, topic outcomes.                                             |
| `router.js`    | Seven run routes behind session and CSRF checks, per-player request pacing, `Cache-Control: no-store` and the shared error shape `{ error: { code, message, fieldErrors? }, requestId }`. |

## Rules (`rulesetVersion: 'cli-2'`)

- Eight incidents per run, drawn from the pool. Timed mode gives each one a window; resolving an incident (right or wrong) opens the next one immediately with its own full window, so a shift lasts at most 100 seconds.
- A correct command before the deadline adds one to the streak and scores `100 × min(3, streak)`. A wrong action or target, or a missed window, closes the incident and resets the streak. Maximum 2,100.
- Each shift draws 3 easy, 3 medium and 2 hard incidents (scenario `tier`), in that order.
- Alerts include `segments`: each line split into text and tappable names from the scenario's `entities`, decoys included, matched as whole tokens.
- A correct or wrong command response includes `review: { expectedCommand, explanation, concepts }`; the debrief adds `concepts` and `hintUsed` per incident.
- A command the parser cannot read returns `outcome: "syntax"` with a hint and leaves the incident open.
- The receipt time is taken on the server. A command arriving at or after `closesAt` is rejected with `CLI_INCIDENT_CLOSED`.
- Missed windows are derived from the clock whenever the run is read, so `GET` never changes state.
- A timed shift can be paused. While paused, the server's game clock stops, so every deadline moves back by the paused time; commands are refused with `CLI_RUN_PAUSED` and snapshots hide the alert (`alert: null`). Pause and resume are idempotent. Practice cannot be paused.
- Practice mode has no deadlines (`closesAt: null`) and may be ended early; unhandled incidents become `skipped`.

## Endpoints

Every route requires a signed-in session (401 `AUTHENTICATION_REQUIRED` otherwise). State-changing routes also need the origin and CSRF token like the other game routes. A run belongs to the player who started it: another player's run id returns the same `CLI_RUN_NOT_FOUND` (404) as an unknown one.

| Method and path                                                      | Body                                                                                             | Response                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/games/cli-cyber-defender/runs`                            | `{ mode: "timed" \| "practice", context: { kind: "personal" } \| { kind: "cohort", cohortId } }` | Snapshot: `{ gameId, rulesetVersion, runId, mode, status, serverNow, incidentCount, resolvedCount, current, history, score, streak, multiplier, maxScore, saved: false, context }`. |
| `GET /api/games/cli-cyber-defender/runs/:runId`                      | none                                                                                             | Snapshot.                                                                                                                                                                           |
| `POST /api/games/cli-cyber-defender/runs/:runId/hint`                | `{ incidentId }`                                                                                 | Practice only: snapshot plus `hint: { incidentId, lineIndex }`; the incident is marked `hintUsed`. Timed shifts get `CLI_HINT_UNAVAILABLE` (409).                                   |
| `POST /api/games/cli-cyber-defender/runs/:runId/pause` and `/resume` | `{}`                                                                                             | Snapshot with `paused: true` (alert hidden) or `paused: false`.                                                                                                                     |
| `POST /api/games/cli-cyber-defender/runs/:runId/commands`            | `{ actionId, incidentId, command }`                                                              | Snapshot plus `{ outcome: "correct" \| "wrong" \| "syntax", message, command, pointsAwarded }`.                                                                                     |
| `POST /api/games/cli-cyber-defender/runs/:runId/complete`            | `{ actionId }`                                                                                   | `{ gameId, rulesetVersion, runId, mode, status, score, maxScore, saved, attempt, saveError?, result, feedback, topicOutcomes, debrief[] }`.                                         |

`current` is `{ incidentId, index, opensAt, closesAt, windowSeconds, alert: { title, severity, source, lines } }`; times are epoch milliseconds on the server clock and the client corrects for skew with `serverNow`. Expected commands and explanations appear only in `debrief`.

The context is validated at run start (active membership, active class); a foreign, pending or removed class fails with the shared cohort/attempt error (404) and no run is created. Error codes: `CLI_INVALID_BODY` (400), `CLI_RUN_NOT_FOUND` (404), `CLI_INCIDENT_CLOSED`, `CLI_RUN_PAUSED`, `CLI_PAUSE_UNAVAILABLE`, `CLI_HINT_UNAVAILABLE`, `CLI_ACTION_CONFLICT`, `CLI_RUN_FINISHED`, `CLI_RUN_NOT_FINISHED`, `CLI_COMMAND_LIMIT` (409), `CLI_RATE_LIMITED` (429), `CLI_UNAVAILABLE` (503).

Repeating a command with the same `actionId` returns the recorded response; the same ID with a different command fails. Completion is idempotent.

## Saved results (SAVE-CLI)

- Runs stay in server memory (max 500, 10-minute idle expiry, lost on restart); an idle-expired run is never saved. The run stores `playerId` and the resolved context, and both are immutable.
- `/complete` on a finished timed run, or on a practice run (early end allowed), calls the attempts service `recordCompletedAttempt` once with `resultKey` = run id, so a retry returns the same attempt. Success returns `saved: true` and `attempt: { attemptId, score, maxScore, persisted, context }`; read it later with `GET /api/attempts/:attemptId`.
- If saving fails with an attempt or cohort error (for example membership removed mid-run), the response still carries the score and debrief with `saved: false` and `saveError: { code, message }`. Calling `/complete` again retries the save.
- Stored state is only `{ mode, incidents: [{ scenarioId, outcome, hintUsed }] }` (8 incidents). `ruleset.js` recomputes the score from those outcomes with the streak rule (`100 × min(3, streak)`), never from a stored total. No commands, alert text or answers are stored.
- Timed runs save as mode `standard` and are `competitive`: a student's timed class run appears on the class leaderboard Best tab. Practice saves as mode `practice`, is excluded from Best and counts on the all-time view. Personal runs never rank.
- The public `POST /api/games/cli-cyber-defender/attempts` route answers `409 ATTEMPT_SERVER_RECORDED`.
