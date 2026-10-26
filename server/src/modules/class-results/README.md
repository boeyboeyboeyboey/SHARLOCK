# Instructor class results (server)

INST-01 server side. Read-only views over completed saved attempts in one class. It adds no collection or write route.

## Endpoints

Paths are relative to `/api`. Both need an active cookie session (401), send `Cache-Control: no-store`, reject unknown query keys and bad values with 400 `CLASS_RESULTS_INVALID_REQUEST`, and are limited to 120/user and 240/IP per minute.

| Method/path                                                         | Success body                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET `/cohorts/:cohortId/results?page=`                              | `{ cohort, activeStudents, games, students, page, pageSize: 50, total }`                                                          |
| GET `/cohorts/:cohortId/students/:studentId/attempts?gameId=&page=` | `{ student, attempts: [{ id, gameId, rulesetVersion, score, maxScore, completedAt, topicOutcomes }], page, pageSize: 10, total }` |

`games` has one entry per production-registered game, even with no attempts (`rulesetVersion` and `averageBestPercent` null, `topics` empty). `students` is sorted by username, case-insensitive. A student's `games` lists only games attempted on the class's current ruleset; `bestPercent` is null only if the score is not computable (max score 0).

## Access rules

`requireCapability(actor, 'cohort:teach', { cohortId })`: admins and instructors with an active assignment pass; everyone else, unknown ids and malformed ids get the same 404 `COHORT_NOT_FOUND`.

## Counted rules

- Counted students: active membership in the class, active account, role student only (no instructor or admin). Pending and removed members, staff and disabled accounts never appear; endpoint 2 returns 404 for them.
- Counted attempts: `status: completed`, `context.cohortId` equal to the class, player counted. Personal and other-class attempts never appear.
- Per game the class's current ruleset is the version of its newest counted attempt; best percent and topics use only that version. Best percent is `round(100 * best score / max score)` per student (via `progress/points.js`); the average is the rounded mean over students who attempted. A topic counts a student as attempted if any attempt touched it, passed if any attempt achieved it.

## Bounds

The summary reads at most the newest 5000 counted attempts (`MAX_SUMMARY_ATTEMPTS`) and 2000 roster members (`MAX_CLASS_STUDENTS`), using the `{ 'context.cohortId', status, completedAt }` index. Reads are lean with explicit projections and allowlisted output; email, player ids, ruleset keys, state, feedback, snapshots and receipts are never returned.

Tests: `server/tests/unit/class-results/` and `server/tests/integration/class-results/` (needs the disposable replica-set runner).
