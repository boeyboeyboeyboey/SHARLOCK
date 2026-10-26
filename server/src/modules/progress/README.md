# Personal progress and achievements (server)

LEARN-01 stage 1. Read-only views over the caller's own completed saved attempts. It adds no collection, award record or write route; points and achievements are derived on every read, so refreshing never duplicates a reward.

## Endpoints

Paths are relative to `/api`. Both need an active cookie session (401 otherwise), send `Cache-Control: no-store`, reject unknown query keys with 400 `PROGRESS_INVALID_REQUEST`, and are limited to 120/user and 240/IP per minute. The actor is always the session user; no player id can be supplied.

| Method/path                      | Success body                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/me/progress`               | `{ games, savingGameIds, totalPoints, maxPoints, topicOutcomes, achievements }`                                                             |
| GET `/me/attempts?gameId=&page=` | `{ attempts: [{ attemptId, gameId, rulesetVersion, contextKind, score, maxScore, completedAt }], page, total }` (10 per page, newest first) |

`games` has one entry per production-registered saving game: `{ gameId, saves: true, completedCount, bestScore, maxScore, points, lastCompletedAt }`. The client merges it with its catalog; catalog games absent from `savingGameIds` are unsaved. `gameId` must be a registered game id and `page` a positive integer up to 10000, as plain strings; arrays, objects and operators return 400.

## Access rules

Only `status: completed` attempts are read. Completed class-context attempts stay listed after the player loses class access (attempts README). Player ids, receipts, state, final snapshots and feedback are never returned.

## Points

Per game, the best attempt is the highest `score / maxScore` among attempts on the latest ruleset version the player completed; points = `round(100 * best)`, 0 with none. `totalPoints` is the sum; `maxPoints` is `100 * savingGameIds.length`. Raw scores from different games are never summed.

## Topic outcomes

`topicOutcomes` is `[{ topic, attempted, passed }]` sorted by topic: each topic outcome entry on a completed attempt counts once as attempted, and as passed when its `achieved` flag is true.

## Achievements (`achievements.js`)

`earnedAt` is the `completedAt` of the attempt that first satisfied the rule, in completion order.

| key                    | rule                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `first-clue`           | any completed saved attempt                                 |
| `perfect-case`         | an attempt with `score === maxScore`                        |
| `well-rounded`         | completed attempts across 3 different games                 |
| `persistent-detective` | 5 completed attempts                                        |
| `topic-expert`         | one attempt with at least one topic outcome, all `achieved` |

## Bounds

The history query uses the `{ playerId, gameId, startedAt }` index and sorts the player's completed attempts by `completedAt`. Progress reads at most the newest 1000 completed attempts (`MAX_PROGRESS_ATTEMPTS`); a player beyond that sees derived values for the newest 1000 only. Results are performance evidence, not validated mastery.

Tests: `server/tests/unit/progress/` (points, achievements) and `server/tests/integration/progress/` (HTTP, needs the disposable replica-set runner).
