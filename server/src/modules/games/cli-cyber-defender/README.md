# CLI Cyber Defender — server module

Server half of the `cli-cyber-defender` game (G-CLI). Runs belong to a signed-in player and finished runs are saved as attempts. The server owns the incident pool, the time windows, the command parser and every score. The browser only ever sees the alert that is open right now, until the debrief.

## Files

| File           | Responsibility                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenarios.js` | Private pool of 16 fictional incidents (5 decoys, 4 two-step): alert text, ordered `steps`, scripted `lookups`, topic and explanation. Addresses are RFC 5737 ranges or internal `10.x` space.  |
| `parser.js`    | Teaching grammar: containment `block ip <ipv4>`, `disable user <name>`, `isolate host <name>`; `dismiss`; lookups `logs <host>` and `whois <ipv4>`. Case-insensitive; nothing is ever executed. |
| `schedule.js`  | `generateWindows()` builds eight integer windows of 20–30 seconds totalling 200. `deriveProgress()` is a pure replay of a run from stored events and timestamps, including time penalties.      |
| `service.js`   | In-memory run store (max 500 runs, 10-minute idle expiry), command submission with idempotent action IDs, completion and debrief.                                                               |
| `policy.js`    | Constants, strict body validation (unknown fields rejected) and `CliError`.                                                                                                                     |
| `ruleset.js`   | Attempts registry entry (`cli-3`, current, server-recorded, competitive): strict compact state, score recomputed from the stored step trail, topic outcomes.                                    |
| `legacy.js`    | The earlier `cli-2` entry (`current: false`) so saved results still read. It needs its own line in `attempts/production-registry.js` next to `cliRuleset`.                                      |
| `router.js`    | Seven run routes behind session and CSRF checks, per-player request pacing, `Cache-Control: no-store` and the shared error shape `{ error: { code, message, fieldErrors? }, requestId }`.       |

## Rules (`rulesetVersion: 'cli-3'`)

- Eight incidents per run, in difficulty order: 3 easy, 3 medium, 2 hard. Two of the six easy and medium incidents are decoys (one per tier); both hard incidents need two ordered containment steps.
- Alerts describe the behaviour and list several candidate hosts, users or IPs but never name the culprit. Investigate with `logs <host>` and `whois <ipv4>`: scripted, fictional lookups that reveal the culprit (or the benign cause). At most 6 per incident (the 7th returns `outcome: "lookup-limit"`); they never score, never change the streak and never touch a real host or shell.
- A decoy is answered with `dismiss`. Any containment action on a decoy is a mistake, and so is `dismiss` on a real incident.
- A two-step incident needs its steps in order (for example `isolate host` then `disable user`). Each correct step scores. A wrong or out-of-order step is a mistake that leaves the incident open; the third mistake closes it. A single-step or decoy mistake closes the incident at once. The window closing ends it as `missed`, keeping points for steps already done.
- Scoring: each correct step adds one to the streak and scores `100 × min(3, streak)`; a mistake, a missed window or a skipped incident resets the streak. Ten scoring steps per run, so the maximum is 2,700. A two-step incident finished after a mistake shows as `wrong` in history but keeps its step points.
- Timed windows are per incident, 20–30 seconds each (base 20, 40 spare seconds spread at random, 200 in total), and the next window opens as soon as an incident resolves. A mistake in timed mode cuts 5 seconds: from the open window when the incident stays open, otherwise from the next incident's window (a window never drops below 5 seconds). The deadline stays server-held, so the penalty is derived from stored events. Practice has no deadlines and no time effect.
- Alerts include `segments`: each line split into text and tappable names from the scenario's `entities`, matched as whole tokens.
- A closing command returns `review: { expectedCommand, expectedCommands, decoy, explanation, concepts }`; the debrief adds `yourCommands`, `lookupsUsed`, `decoy`, `concepts` and `hintUsed` per incident. Answers, the decoy flag and the expected steps stay server-side until the incident closes.
- A command the parser cannot read returns `outcome: "syntax"` with a hint and leaves the incident open. Lookups, syntax errors and steps all count toward the 120-command run cap.
- The receipt time is taken on the server. A command arriving at or after `closesAt` is rejected with `CLI_INCIDENT_CLOSED`.
- Missed windows are derived from the clock whenever the run is read, so `GET` never changes state.
- A timed shift can be paused. While paused, the server's game clock stops, so every deadline moves back by the paused time; commands are refused with `CLI_RUN_PAUSED` and snapshots hide the alert (`alert: null`). Pause and resume are idempotent. Practice cannot be paused.
- Practice mode has no deadlines (`closesAt: null`), may be ended early (unhandled incidents become `skipped`; the debrief then covers only the settled incidents plus the one on screen, so unreached incidents' answers never leave the server, while the saved attempt still records all eight outcomes) and offers hints that name a lookup to run.

## Endpoints

Every route requires a signed-in session (401 `AUTHENTICATION_REQUIRED` otherwise). State-changing routes also need the origin and CSRF token like the other game routes. A run belongs to the player who started it: another player's run id returns the same `CLI_RUN_NOT_FOUND` (404) as an unknown one.

| Method and path                                                      | Body                                                                                             | Response                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/games/cli-cyber-defender/runs`                            | `{ mode: "timed" \| "practice", context: { kind: "personal" } \| { kind: "cohort", cohortId } }` | Snapshot: `{ gameId, rulesetVersion, runId, mode, status, serverNow, incidentCount, resolvedCount, current, history, score, streak, multiplier, maxScore, saved: false, context }`.                          |
| `GET /api/games/cli-cyber-defender/runs/:runId`                      | none                                                                                             | Snapshot.                                                                                                                                                                                                    |
| `POST /api/games/cli-cyber-defender/runs/:runId/hint`                | `{ incidentId }`                                                                                 | Practice only: snapshot plus `hint: { incidentId, lineIndex, lookup }` (`lookup` is a command such as `whois 192.0.2.50`); the incident is marked `hintUsed`. Timed shifts get `CLI_HINT_UNAVAILABLE` (409). |
| `POST /api/games/cli-cyber-defender/runs/:runId/pause` and `/resume` | `{}`                                                                                             | Snapshot with `paused: true` (alert hidden) or `paused: false`.                                                                                                                                              |
| `POST /api/games/cli-cyber-defender/runs/:runId/commands`            | `{ actionId, incidentId, command }`                                                              | Snapshot plus `{ outcome: "correct" \| "step" \| "wrong" \| "lookup" \| "lookup-limit" \| "syntax", message, command, pointsAwarded, incidentClosed, timePenaltySeconds }`.                                  |
| `POST /api/games/cli-cyber-defender/runs/:runId/complete`            | `{ actionId }`                                                                                   | `{ gameId, rulesetVersion, runId, mode, status, score, maxScore, saved, attempt, saveError?, result, feedback, topicOutcomes, debrief[] }`.                                                                  |

`current` is `{ incidentId, index, opensAt, closesAt, windowSeconds, penaltySeconds, stepsDone, mistakes, lookups: { used, limit, results: [{ command, lines }] }, hintLine, hintLookup, alert: { title, severity, source, lines, segments } }`; times are epoch milliseconds on the server clock and the client corrects for skew with `serverNow`. Expected commands and explanations appear only in `debrief`.

The context is validated at run start (active membership, active class); a foreign, pending or removed class fails with the shared cohort/attempt error (404) and no run is created. Error codes: `CLI_INVALID_BODY` (400), `CLI_RUN_NOT_FOUND` (404), `CLI_INCIDENT_CLOSED`, `CLI_RUN_PAUSED`, `CLI_PAUSE_UNAVAILABLE`, `CLI_HINT_UNAVAILABLE`, `CLI_ACTION_CONFLICT`, `CLI_RUN_FINISHED`, `CLI_RUN_NOT_FINISHED`, `CLI_COMMAND_LIMIT` (409), `CLI_RATE_LIMITED` (429), `CLI_UNAVAILABLE` (503).

Repeating a command with the same `actionId` returns the recorded response; the same ID with a different command fails. Completion is idempotent.

## Saved results (SAVE-CLI)

- Runs stay in server memory (max 500, 10-minute idle expiry, lost on restart); an idle-expired run is never saved. The run stores `playerId` and the resolved context, and both are immutable.
- `/complete` on a finished timed run, or on a practice run (early end allowed), calls the attempts service `recordCompletedAttempt` once with `resultKey` = run id, so a retry returns the same attempt. Success returns `saved: true` and `attempt: { attemptId, score, maxScore, persisted, context }`; read it later with `GET /api/attempts/:attemptId`.
- If saving fails with an attempt or cohort error (for example membership removed mid-run), the response still carries the score and debrief with `saved: false` and `saveError: { code, message }`. Calling `/complete` again retries the save.
- Stored state is only `{ mode, incidents: [{ scenarioId, outcome, hintUsed, trail }] }` (8 incidents; `trail` is the ordered `ok`/`bad` result of each containment step, at most 5). `ruleset.js` recomputes the score from the trails with the streak rule (`100 × min(3, streak)`), never from a stored total. No commands, lookups, alert text or answers are stored. Results saved under `cli-2` (`legacy.js`) keep their own 2,100-point schema.
- Timed runs save as mode `standard` and are `competitive`: a student's timed class run appears on the class leaderboard Best tab. Practice saves as mode `practice`, is excluded from Best and counts on the all-time view. Personal runs never rank.
- The public `POST /api/games/cli-cyber-defender/attempts` route answers `409 ATTEMPT_SERVER_RECORDED`.
