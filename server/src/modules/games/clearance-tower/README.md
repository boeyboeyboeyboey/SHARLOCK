# Clearance Tower — server module

Server half of the `clearance-tower` game (G-CLEAR). The player designs an access-control policy for a fictional intelligence agency, predicts how a few requests will be decided, then watches a scripted day play out against that policy. One saved attempt is one climb over all six levels. The server owns the day's script, the prediction answers, the simulation and every score; the browser only sends a policy and its predictions per level.

Learning content follows CS440 `07-access-control.pptx`: authentication versus access control (slides 4–7, stated in the first dossier), discretionary control and ACLs/capabilities (slides 13–25), Bell–LaPadula labels (26–32) and role-based control (34–38). Two calls in "The Matrix" use the UNIX mode bits on slides 18–19, which the deck marks non-examinable, so those prompts say so and state every bit they need. Separation of duties is a team design built on the three roles on slide 36; the deck never uses the term.

## Files

| File          | Responsibility                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `levels.js`   | Six levels as plain data: agents, files, the day's events, prediction answers and takeaways. `publicLevel()` strips everything the player must not see before submitting.          |
| `models.js`   | Pure rule checks: `checkStep()` for discretionary grants, Bell–LaPadula labels (`dominates()`) and roles, plus `findDutyConflicts()` for separation of duties.                     |
| `simulate.js` | `simulateDay()` replays the scripted day against a policy. Same input, same day.                                                                                                   |
| `scoring.js`  | Four score rows, stars, prediction review, the role-versus-matrix edit comparison, and the scoring rules for current and older rulesets (`SCORING_RULES`, `LEGACY_SCORING_RULES`). |
| `policy.js`   | Constants, strict submission validation (unknown fields rejected) and `ClearanceError`.                                                                                            |
| `hints.js`    | Two hint texts per level (principle to check, then the idea applied to the case), `HINT_COST` 10 and `MAX_HINTS` 2.                                                                |
| `legacy.js`   | `clear-2` (before hints) and `clear-3` (before the clear-4 scoring) built from the same factory, registered but not current, so saved climbs still score and read.                 |
| `ruleset.js`  | Registry entry for the shared attempt service: state schema, `submit-level` and `request-hint` actions, public state and summary. Registered in `attempts/production-registry.js`. |

## Saved attempts (`rulesetVersion: 'clear-4'`)

Play uses the shared attempt API (see `server/src/modules/attempts/README.md`): `POST /api/games/clearance-tower/attempts` with a personal or cohort context, `POST /api/attempts/:id/actions`, `POST /api/attempts/:id/complete`.

- Mode `practice`, not competitive, `maxScore` 600 (six levels at 100 each, and every level can reach 100), `maxActions` 24 (six submissions and up to twelve hints).
- Action `submit-level`, payload `{ levelId, policy, predictions }`. Policy shapes are listed below; predictions are `[{ id, verdict: 'allow' | 'deny' }]`, one per prompt. Unknown fields are rejected, so a browser score is never accepted.
- Action `request-hint`, payload `{ levelId }` and nothing else. The server picks the tier: the first request is tier 1 (which principle to check), the second tier 2 (the idea applied to the case, never matrix cells, labels or roles). A third request is refused with `CLEAR_HINTS_EXHAUSTED` (409), and a hint for a level that already ran is refused with `CLEAR_LEVEL_SUBMITTED`. State keeps `hints: [{ levelId, count }]`, at most 2 per level.
- Hint cost: 10 points per hint taken on a level, subtracted from that level's score and floored at 0 (`hintPenaltyFor()`), so `maxScore` stays 600. Public state adds `hints: { used, max, cost, texts }` to every level, and a submitted level's `result` adds `hintsUsed` and `hintPenalty` (the points actually lost). Stars and topic outcomes use the score after the cost.
- Ruleset history: `clear-2` had no hints; `clear-3` added them. Both stay registered as non-current rulesets (`legacy.js`) with `LEGACY_SCORING_RULES`, so a saved climb keeps scoring and reading under the rules it started on, including an active one finished later. New climbs start on `clear-4`. Class leaderboards rank one ruleset at a time, so the versions never mix.
- Each level can be submitted once (`CLEAR_LEVEL_SUBMITTED`, 409). Completion needs at least one submitted level ("Finish climb"); unplayed levels score 0.
- Score is the sum of the per-level scores, recomputed on the server from the stored policy and predictions. Topic outcomes (`discretionary-access-control`, `bell-lapadula`, `role-based-access-control`) are achieved when both levels of that model score 75 or more with no leaks (`levelMastered()`); a leak means the topic is not achieved, whatever the score. Older rulesets keep the score-only rule.
- Stored state: per submitted level, `{ levelId, policyJson, predictions }` only. Day events, scores and answers are derived when the public state is built.
- Public state: `{ totalLevels, submittedCount, readyToComplete, levels }`. Each of the six `levels` holds `publicLevel()` data plus `submitted`. Only submitted levels add `result` (`score`, `maxScore`, `stars`, `breakdown`, `meters`, `predictionReview`, `edits?`, `policy`, `events`, `takeaways`). The day script and answers of an unsubmitted level never leave the server.

## Rules

- Each event in a day is `work` (should succeed), `attack` (should be stopped) or `integrity` (Bell–LaPadula allows it on purpose, to show it ignores integrity). An event passes only if every step is allowed. A chain stops at its first blocked step: later steps report `allowed: null` and render as "not reached".
- Score out of 100 per level:
  - **No leaks** 40, all lost if any attack gets through.
  - **Work completed** 30, in proportion to work events that succeeded. A level may set `unavoidableWorkLoss`, the tasks every leak-free policy must block. "The Gift" sets 3: under discretionary control every fix for the Trojan horse also blocks real work, so 7 of 10 tasks earns the full row.
  - **Least privilege** 15, minus 5 per right the work did not need and per separation-of-duties conflict. Bell–LaPadula levels skip this row, because labels fix every flow, and score predictions out of 30 instead.
  - **Predictions** 15, in proportion to correct allow/deny calls.
- No free security: below three quarters of the work, **No leaks** and **Least privilege** shrink with the work share, because a policy that denies everything keeps nothing safe and gets nothing done. At three quarters or more they are not scaled.
- Stars: 95+ is three, 75+ two, 50+ one.
- Balance, by exhaustive search over each level's policies with correct predictions (see TASKS.md REVFIX-01 stage 5): every level's best is 100; the unchanged Gift scores 60 and one star, the fixed Gift 100; an empty policy scores 15 on the discretionary and role-based levels; no leaking policy reaches 75.
- `clear-2` and `clear-3` keep the earlier rules: 20 per leak, no allowance, no scaling, so their Gift tops out at 91 of an advertised 100.
- The "Reshuffle" result adds `edits: { badgeEdits, matrixEdits }` to compare role edits with the matrix cells that changed underneath.

## Endpoint

| Method and path                                                    | Response                                           |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| None (`GET /api/games/clearance-tower/levels` removed in CLEAR-01) | Play and saving use the shared attempts API above. |

Policy shapes: discretionary `{ grants: [{ subject, object, rights: ['r','w'] }] }` (up to 64); Bell–LaPadula `{ objectLabels: { [fileId]: { level, categories } } }` (one per file); role-based `{ roles: [{ id, name, permissions }], assignments: [{ agent, roleIds }] }` (up to 8 roles).

Error codes: `CLEAR_INVALID_ACTION` (400), `CLEAR_LEVEL_SUBMITTED` (409), `CLEAR_HINTS_EXHAUSTED` (409), plus the shared `ATTEMPT_*` codes.

## Tests

Unit: `server/tests/unit/clearance-tower/` (rules, scoring and balance including every Gift policy, older rulesets, validation, `ruleset.js`). Integration: `server/tests/integration/clearance-tower/` (saved journey, access control, leaderboard row).
