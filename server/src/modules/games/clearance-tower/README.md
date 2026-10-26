# Clearance Tower — server module

Server half of the `clearance-tower` game (G-CLEAR). The player designs an access-control policy for a fictional intelligence agency, predicts how a few requests will be decided, then watches a scripted day play out against that policy. One saved attempt is one climb over all six levels. The server owns the day's script, the prediction answers, the simulation and every score; the browser only sends a policy and its predictions per level.

Learning content follows CS440 `07-access-control.pptx`: discretionary control and ACLs/capabilities (slides 13–25), Bell–LaPadula labels (26–32) and role-based control (34–38).

## Files

| File          | Responsibility                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `levels.js`   | Six levels as plain data: agents, files, the day's events, prediction answers and takeaways. `publicLevel()` strips everything the player must not see before submitting. |
| `models.js`   | Pure rule checks: `checkStep()` for discretionary grants, Bell–LaPadula labels (`dominates()`) and roles, plus `findDutyConflicts()` for separation of duties.            |
| `simulate.js` | `simulateDay()` replays the scripted day against a policy. Same input, same day.                                                                                          |
| `scoring.js`  | Four score rows, stars, prediction review and the role-versus-matrix edit comparison.                                                                                     |
| `policy.js`   | Constants, strict submission validation (unknown fields rejected) and `ClearanceError`.                                                                                   |
| `ruleset.js`  | Registry entry for the shared attempt service: state schema, `submit-level` action, public state and summary. Registered in `attempts/production-registry.js`.            |
| `service.js`  | Level summaries for `GET /levels` only.                                                                                                                                   |
| `router.js`   | The levels route, courtesy request pacing, `Cache-Control: no-store` and the shared error shape.                                                                          |

## Saved attempts (`rulesetVersion: 'clear-2'`)

Play uses the shared attempt API (see `server/src/modules/attempts/README.md`): `POST /api/games/clearance-tower/attempts` with a personal or cohort context, `POST /api/attempts/:id/actions`, `POST /api/attempts/:id/complete`.

- Mode `practice`, not competitive, `maxScore` 600 (six levels at 100 each), `maxActions` 8.
- Action `submit-level`, payload `{ levelId, policy, predictions }`. Policy shapes are listed below; predictions are `[{ id, verdict: 'allow' | 'deny' }]`, one per prompt. Unknown fields are rejected, so a browser score is never accepted.
- Each level can be submitted once (`CLEAR_LEVEL_SUBMITTED`, 409). Completion needs at least one submitted level ("Finish climb"); unplayed levels score 0.
- Score is the sum of the per-level scores, recomputed on the server from the stored policy and predictions. Topic outcomes (`discretionary-access-control`, `bell-lapadula`, `role-based-access-control`) are achieved when both levels of that model score 75 or more.
- Stored state: per submitted level, `{ levelId, policyJson, predictions }` only. Day events, scores and answers are derived when the public state is built.
- Public state: `{ totalLevels, submittedCount, readyToComplete, levels }`. Each of the six `levels` holds `publicLevel()` data plus `submitted`. Only submitted levels add `result` (`score`, `maxScore`, `stars`, `breakdown`, `meters`, `predictionReview`, `edits?`, `policy`, `events`, `takeaways`). The day script and answers of an unsubmitted level never leave the server.

## Rules

- Each event in a day is `work` (should succeed), `attack` (should be stopped) or `integrity` (Bell–LaPadula allows it on purpose, to show it ignores integrity). An event passes only if every step is allowed.
- Score out of 100 per level:
  - **No leaks** 40, minus 20 per attack that got through.
  - **Work completed** 30, in proportion to work events that succeeded.
  - **Least privilege** 15, minus 5 per right the work did not need and per separation-of-duties conflict. Bell–LaPadula levels skip this row, because labels fix every flow, and score predictions out of 30 instead.
  - **Predictions** 15, in proportion to correct allow/deny calls.
- Stars: 95+ is three, 75+ two, 50+ one. "The Gift" is capped at 91 on purpose: under discretionary control every fix for the Trojan horse also blocks real work.
- The "Reshuffle" result adds `edits: { badgeEdits, matrixEdits }` to compare role edits with the matrix cells that changed underneath.

## Endpoint

| Method and path                         | Response                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /api/games/clearance-tower/levels` | `{ gameId, rulesetVersion, levels: [{ id, act, actTitle, model, title }] }` (open) |

Policy shapes: discretionary `{ grants: [{ subject, object, rights: ['r','w'] }] }` (up to 64); Bell–LaPadula `{ objectLabels: { [fileId]: { level, categories } } }` (one per file); role-based `{ roles: [{ id, name, permissions }], assignments: [{ agent, roleIds }] }` (up to 8 roles).

Error codes: `CLEAR_INVALID_ACTION` (400), `CLEAR_LEVEL_SUBMITTED` (409), `CLEAR_RATE_LIMITED` (429) on the levels route, plus the shared `ATTEMPT_*` codes.

## Tests

Unit: `server/tests/unit/clearance-tower/` (rules, scoring, validation, `ruleset.js`). Integration: `server/tests/integration/clearance-tower/` (saved journey, access control, leaderboard row).
