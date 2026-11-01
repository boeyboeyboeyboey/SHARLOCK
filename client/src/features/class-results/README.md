# Class results

## Presentation summary

- What it is: the Results view inside the instructor class page. An instructor sees, for one assigned class, a per-activity summary, a student table with best scores, and a paged attempt list for one student.
- Security concept: least privilege and purpose-limited disclosure for staff. The server returns only class-context results for classes assigned to the signed-in instructor, and the client never sends a role, score or student scope as proof of access (course reference: [TASKS.md course reference index](../../../../TASKS.md#course-reference-index) for the access-control material).
- Using it: Instructor, pick a class, choose Results. Select a student name to open their attempts, filter by activity, then use Back to students.
- Components: `ClassResults.vue` (container: loading, error, 404, stale-response handling, selected student), `ResultsSummary.vue`, `StudentResultsTable.vue`, `StudentAttempts.vue`; `format.js` holds game-name and date helpers.
- API (`api.js`): `GET /cohorts/:cohortId/results?page=` and `GET /cohorts/:cohortId/students/:studentId/attempts?gameId=&page=`. Nothing is stored client-side.
- Status: see the INST-01 record in [TASKS.md](../../../../TASKS.md).
- Limits: only completed class-context attempts of registered games appear (`server/src/modules/attempts/registry.js` sets the columns); personal practice and staff play are excluded. A very large class shows a notice when its oldest attempts could not be counted. Results are completion and performance evidence, not validated mastery.

## Components

| Component             | Props                                                                                           | Emits                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `ClassResults`        | `cohortId`                                                                                      | none                                           |
| `ResultsSummary`      | `games`, `activeStudents`                                                                       | none                                           |
| `StudentResultsTable` | `students`, `games`, `page`, `pageSize`, `total`, `loading`                                     | `select`, `change-page`                        |
| `StudentAttempts`     | `student`, `attempts`, `page`, `pageSize`, `total`, `loading`, `error`, `gameId`, `gameOptions` | `close`, `change-page`, `change-game`, `retry` |

`ClassManagementPage.vue` mounts `ClassResults` when `?view=results` is active (kept beside `?class=` by `history.replaceState`).

## Layout

Below 992px the table scrolls sideways inside `.class-results__scroll` and the page does not; at 1200px every column fits, because `ClassManagementPage` widens the page for the Results view. Cells keep whole words: the shared body rule `overflow-wrap: anywhere` is switched off here, because it let the browser squeeze columns to one letter. The scroller is positioned so the visually hidden "Not attempted" text cannot widen the page.

A 401 has no message of its own: the shared handler in `features/auth/guards.js` ends the session and returns to sign-in.

## Tests

`pnpm exec vitest run --project client client/src/features/class-results client/src/features/cohorts` covers the api wrappers, summary empty states, table rows, drill-in focus restore, pagination, 404 and error states, stale responses and the Roster | Results switch.
