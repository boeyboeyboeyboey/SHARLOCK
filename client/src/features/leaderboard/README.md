# Leaderboards

## Presentation summary

- What it is: the `/leaderboard` page. A signed-in student, instructor or admin picks a class (select) and a game (one-click tab row) and sees the class ranking as Best score or All-time points.
- Security concept: access control, least privilege and data minimisation. The server ranks only completed class-context attempts by students with current active membership and returns just username, preset avatar, rank and score; the client sends no role, score or scope as proof of access (course reference: [TASKS.md course reference index](../../../../TASKS.md#course-reference-index) for the access-control material).
- Using it: open Leaderboard in the navbar, choose a class, click a game tab, then switch between Best score and All-time. The selection is kept in the URL (`?class=&game=&view=`). Your own row is highlighted.
- Components: `LeaderboardPage.vue` (container: class list by role, games, board, stale-response handling, pager, states), `LeaderboardFilters.vue` (class select plus game tablist with roving tabindex; arrows/Home/End move focus, Enter/Space/click selects; both tab rows point `aria-controls` at the one `#leaderboard-panel`), `LeaderboardTable.vue`.
- API (`api.js`): `GET /cohorts/:cohortId/leaderboard/games` and `GET /cohorts/:cohortId/leaderboard?gameId=&view=&page=`. Classes come from the existing `listMemberships` (students) or `listManagedCohorts` (instructors, admins). Nothing is stored client-side.
- Status: see the BOARD-01 record in [TASKS.md](../../../../TASKS.md).
- Limits: all five games (SQL Injection Arcade, Clearance Tower, Phishing Post-Mortem, CLI Cyber Defender, Social Engineering Simulator) feed boards. CLI timed runs are the only competitive ruleset ("Timed runs" best board); every other game shows "Practice best scores". There is no ruleset selector; the server uses the newest completed ruleset. Rankings are performance evidence, not validated mastery.

## Components

| Component            | Props                                | Emits               |
| -------------------- | ------------------------------------ | ------------------- |
| `LeaderboardPage`    | none (state in the route query)      | none                |
| `LeaderboardFilters` | `cohorts`, `games`, `modelValue`     | `update:modelValue` |
| `LeaderboardTable`   | `rows`, `loading`, `view`, `caption` | none                |

## Tests

`pnpm exec vitest run --project client client/src/features/leaderboard` covers the api wrappers, filter emits, game tab selection and keyboard focus, table columns and own-row marking, the page load chain, view switching, off-page rank, empty states and the 503 error state.
