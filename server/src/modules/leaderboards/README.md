# Class leaderboards (server)

BOARD-01 server side. Read-only rankings over completed saved attempts in one class. It adds no collection or write route.

## Endpoints

Paths are relative to `/api`. Both need an active cookie session (401), send `Cache-Control: no-store`, reject unknown query keys and bad values with 400 `LEADERBOARD_INVALID_REQUEST`, and are limited to 120/user and 240/IP per minute.

| Method/path                                                              | Success body                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| GET `/cohorts/:cohortId/leaderboard/games`                               | `{ games: [{ gameId, rulesetVersion, competitive }] }` sorted by `gameId`            |
| GET `/cohorts/:cohortId/leaderboard?gameId=&rulesetVersion=&view=&page=` | `{ gameId, rulesetVersion, competitive, view, rows, page, pageSize: 25, total, me }` |

`gameId` is required and must be a registered game or have completed class attempts. `rulesetVersion` defaults to the ruleset of the newest completed attempt in the class (null with empty `rows` if none). `view` is `best` (default) or `all-time`. `page` defaults to 1 (max 10000). The games endpoint accepts no query keys and lists each game with at least one counted attempt, using the ruleset of its newest one.

Row shapes (`isSelf` marks the caller; `me` is the caller's row on any page, or null if unranked):

- `best`: `{ rank, username, avatarId, score, maxScore, isSelf }`
- `all-time`: `{ rank, username, avatarId, points, plays, bestScore, maxScore, isSelf }`

## Access rules

`requireCapability(actor, 'cohort:play', { cohortId })`: active members, assigned instructors and admins pass. Everyone else, pending or removed members, unknown ids and malformed ids get the same 404 `COHORT_NOT_FOUND`.

## Eligibility and ranking

- Ranked students: active membership now, active account, role student only (no instructor or admin). Removed members and staff drop off even if they played.
- Counted attempts: `status: completed`, cohort context for this class, one game and one ruleset (rulesets are never mixed), player ranked. Personal attempts never count.
- `best` on a competitive ruleset counts only `competitiveEligible` attempts; on a non-competitive ruleset it counts all attempts (a practice best). `all-time` counts all counted attempts.
- `best`: one row per student with their best score. Order is score descending, earliest completion of that score, then username. Rank is a competition rank on score (1, 1, 3).
- `all-time`: points are the sum of `round(100 * score / maxScore)` over attempts (0 when max score is 0). Order is points descending, then username; competition rank on points.
- Paging happens after ranking the whole board.

## Bounds

A board reads at most 20000 completed attempts (`MAX_BOARD_ATTEMPTS`) and 2000 roster members, with explicit projections. Responses are built field by field: user ids, emails, attempt ids and rosters are never returned.

Files: `policy.js` (query parsing), `rank.js` (pure ranking), `service.js` (access and queries), `router.js` (limits and errors).

Tests: `server/tests/unit/leaderboards/` and `server/tests/integration/leaderboards/` (needs the disposable replica-set runner).
