# Leaderboards

## Presentation summary

- What it is: the `/leaderboard` page. A signed-in student, instructor or admin picks a class (select) and a game (one-click tab row) and sees the class ranking as Best score or All-time points.
- Security concept: access control, least privilege and data minimisation. The server ranks only completed class-context attempts by students with current active membership and returns just username, preset avatar, rank and score; the client sends no role, score or scope as proof of access (course reference: [TASKS.md course reference index](../../../../TASKS.md#course-reference-index) for the access-control material).
- Using it: open Leaderboard in the navbar, choose a class, click a game tab, then switch between Best score and All-time. The selection is kept in the URL (`?class=&game=&view=`). Your own row is highlighted.
- Components: `LeaderboardPage.vue` (container: class list by role, games, board, stale-response handling, pager, states), `LeaderboardFilters.vue` (class select plus game tablist with roving tabindex; arrows/Home/End move focus, Enter/Space/click selects; both tab rows point `aria-controls` at the one `#leaderboard-panel`), `LeaderboardTable.vue`.
- API (`api.js`): `GET /cohorts/:cohortId/leaderboard/games` and `GET /cohorts/:cohortId/leaderboard?gameId=&view=&page=`. Classes come from the existing `listMemberships` (students) or every page of `listManagedCohorts` (instructors, admins), labelled with the institution so two classes called 1A stay apart. Nothing is stored client-side.
- Status: see the BOARD-01 record in [TASKS.md](../../../../TASKS.md).
- Limits: all five games (SQL Injection Arcade, Clearance Tower, Phishing Post-Mortem, CLI Cyber Defender, Help Desk Shift) feed boards. CLI timed runs and Phishing Post-Mortem timed class runs (PHISH-01, `phish-4`, `phish-3` before it) are the competitive rulesets ("Timed runs" best board); every other game shows "Practice best scores". There is no ruleset selector; the server uses the newest completed ruleset and never mixes rulesets, and the page shows the game name only (the ruleset stays in the API response as data). With no class, the page says what to do next: a student joins, a student with a pending request waits, an instructor goes to Manage your classes, an administrator to the admin area. Above the server's read cap the page says the oldest plays are not counted. Rankings are performance evidence, not validated mastery.

## Components

| Component            | Props                                | Emits               |
| -------------------- | ------------------------------------ | ------------------- |
| `LeaderboardPage`    | none (state in the route query)      | none                |
| `LeaderboardFilters` | `cohorts`, `games`, `modelValue`     | `update:modelValue` |
| `LeaderboardTable`   | `rows`, `loading`, `view`, `caption` | none                |

## Tests

`pnpm exec vitest run --project client client/src/features/leaderboard` covers the filter emits, game tab selection and keyboard focus, table columns and own-row marking, the page load chain, view switching, paging with one request per change, an older answer arriving last, off-page rank, every empty state, try again and the 401 and 503 states.
