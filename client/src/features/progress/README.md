# Learning progress

## Presentation summary

- What it is: the `/progress` page. A signed-in learner sees points, a card for every town activity, topic outcomes, badges and a paged list of their completed attempts.
- Security concept: privacy and own-data scoping. The server reads only the session user's completed attempts, and the client never supplies a player id, score or achievement. Scoring stays server-side, so the page only displays values (course reference: [TASKS.md course reference index](../../../../TASKS.md#course-reference-index) for the access-control material).
- Using it: sign in, play a saved activity to the end, then open Progress. Filter the history by activity and page through it.
- Components: `ProgressPage.vue` (account states, loading, error with retry, empty state), `ProgressSummary.vue` (points, game cards, topics), `AttemptHistory.vue` (table, filter, pager). Badges reuse the shared `TrophyCase`.
- API (`api.js`): `GET /me/progress` and `GET /me/attempts?gameId=&page=`. See the [server module README](../../../../server/src/modules/progress/README.md).
- Points: per game `round(100 * best score / max score)`; the total is out of `100 * saving games`. Achievements are derived on every read, so there is no award record to duplicate.
- Status: see the LEARN-01 record in [TASKS.md](../../../../TASKS.md).
- Limits: all five scored games save results; the daily briefing is not scored and shows "Results not saved yet". Progress covers the newest 1000 completed attempts. Results are performance evidence, not validated mastery.
