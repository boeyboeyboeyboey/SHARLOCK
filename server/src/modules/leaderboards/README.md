# Class leaderboards (server)

BOARD-01 server side. Read-only rankings over completed saved attempts in one class. It adds no collection or write route.

## Endpoints

Paths are relative to `/api`. Both need an active cookie session (401), send `Cache-Control: no-store`, reject unknown query keys and bad values with 400 `LEADERBOARD_INVALID_REQUEST`, and are limited to 120/user and 240/IP per minute.

| Method/path                                                              | Success body                                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GET `/cohorts/:cohortId/leaderboard/games`                               | `{ games: [{ gameId, rulesetVersion, competitive }] }` sorted by `gameId`                       |
| GET `/cohorts/:cohortId/leaderboard?gameId=&rulesetVersion=&view=&page=` | `{ gameId, rulesetVersion, competitive, view, rows, page, pageSize: 25, total, me, truncated }` |

`gameId` is required and must be a registered game or have completed class attempts. `rulesetVersion` defaults to the registry's current ruleset once the class has a completed attempt on it, otherwise the ruleset of the newest completed attempt in the class (null with empty `rows` if none), so one late finish of an old run cannot flip the board back. `view` is `best` (default) or `all-time`. `page` defaults to 1 (max 10000). The games endpoint accepts no query keys and lists each game with at least one counted attempt, using the ruleset of its newest one.

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
- `all-time`: points are the sum of `round(100 * score / maxScore)` over attempts, each capped at 100 (0 when max score is 0). Order is points descending, then username; competition rank on points.
- Paging happens after ranking the whole board.

## Bounds

A board reads at most 20000 completed attempts (`MAX_BOARD_ATTEMPTS`), newest first, and 2000 roster members, with explicit projections. Past the cap `truncated` is true and the oldest plays are not counted, so a new personal best still appears; the page says so. Responses are built field by field: user ids, emails, attempt ids and rosters are never returned.

Games feeding boards (SAVE-01, see [TASKS.md](../../../../TASKS.md)): all five saved games. CLI Cyber Defender timed runs, Phishing Post-Mortem `phish-4` (and `phish-3` before it) timed runs (PHISH-01) and SQL Injection Arcade class runs are the competitive rulesets (the `sql` ruleset has `competitive: true`; a class-context run starts in standard mode with a timer, so it ranks by `competitiveEligible`, while personal runs are practice). CLI and Phishing practice count in the all-time view only. Clearance Tower (`clear-4`, practice-only with 10-point hints that lower a level's score) and LLM Social Engineering Simulator are not competitive, so their `best` boards are practice best scores; a board shows one ruleset, by default the newest, so older Clearance Tower scores are not mixed in. Phishing results saved under the earlier `phish-2` ruleset are not competitive.

Files: `policy.js` (query parsing), `rank.js` (pure ranking), `service.js` (access and queries), `router.js` (limits and errors).

Tests: `server/tests/unit/leaderboards/` and `server/tests/integration/leaderboards/`. The integration suite needs the disposable test database; one case, a removal through the real class route, also needs `--replica-set` and skips without it.
