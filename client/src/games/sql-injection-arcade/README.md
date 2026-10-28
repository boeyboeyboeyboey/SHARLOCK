# SQL Injection Arcade

## Presentation summary

- A run of server-generated customs-house SQL cases in a blue 8-bit database console at `/games/sql-injection-arcade`
- Teaches quote breakout, comments, unquoted numbers, UNION, boolean-blind and second-order injection, then bound parameters as the fix
- Course references: [course index](../../../../TASKS.md#course-reference-index); CS440 `12a-web-security-partII.pptx`, slides 16–24
- Class context: a ranked 180 second run with 3 lives. Personal context: untimed practice of 12 cases and 3 repairs, with server hints that mark a case assisted
- Each case shows a scenario, goal and the vulnerable query with ‹placeholders›; you get 3 tries (6 probes for blind), then the case closes with an explanation
- Five case types: login (three variants), UNION, blind, second-order and a repair choice after every fourth case
- Components: `RunHud`, `CasePanel`, `AttemptForm`, `BlindAnswer`, `RepairSelector`, `HintPanel`, `ResultPanel`, `RunReview`, `HowToPlayScene`; state in `useSqlInjection.js`
- The server owns generation, rules and scoring; the client only sends `attempt`, `register`, `change-password`, `answer`, `choose-fix` and `hint`
- No actual SQL is executed; ruleset `sql-2` (see the [server README](../../../../server/src/modules/games/sql-injection-arcade/README.md)); `sql-1` results stay readable in history
- Status: Review, see [SQL-02 / G-SQL](../../../../TASKS.md#g-sql-saved-practice). Known limits are at the end of this file

## Playing

Enter through the Customs House destination or the direct route. On the briefing choose personal practice or an available class (the shared context chooser), then press Open the case. How to play (a button on the briefing, and a first-visit dialog until dismissed) is a four-step guide: `howToPlay.js` and `components/HowToPlayScene.vue`.

The top row is the case file: title, scenario, goal and the query template. The row below holds the run status, the latest result and the controls for the open case:

- login, numeric, UNION and blind probes: one or two labelled fields and a run button
- blind: once the server reports `canAnswer`, Yes and No buttons appear for the question
- second-order: register a name, then Change password uses the stored name
- repair: radio options and Confirm repair

After each submit the result region is announced (`aria-live="polite"`) and receives focus. It shows the server message and response code, a leaked-rows table for a UNION success and, when a case closes, the points and explanation. A closed case stays on screen until Next case, which returns focus to the first control. The server has already advanced `current`, so Next case needs no request. When the run is over (practice after 15 slots, a class run at the deadline, zero lives or 36 slots) Finish and save result calls the shared complete action; a class run also completes itself shortly after the deadline. The end screen shows the shared saved result, a summary line and the run review table (case, kind, outcome, points, assisted).

Practice offers one hint per case: it marks the case assisted and removes the first-try bonus. The old client-only clue is gone. The URL's `attempt` parameter restores an active or completed run after reload, and Play again starts a fresh attempt.

## Implementation and accessibility

`SqlInjectionArcade.vue` coordinates the shared attempt state (`useAttempt`), route and focus. `useSqlInjection.js` derives `current`, `last`, the review state and the countdown to the server `deadlineAt`, and wraps each action with the open `caseId`. Props and emits follow WAD2 `Week6Slides.pptx`, slides 3–7, 9–17 and 22–28. Query text is rendered through text interpolation only; there is no `v-html`.

Keane approved a CLI-inspired blue arcade console as a game-local palette exception. `.sql-game` owns the navy palette, cyan keywords and amber highlights; Silkscreen headings are self-hosted through `@fontsource/silkscreen` (FONT-04) with the shared pixel font as fallback. The case file is always a full-width row above the control row. The game frame fills the workspace and caps at the shared `1320px` width, compensating for the shell gutters from its container width rather than `100vw`. Laptop screens use contained scrolling; narrow or short screens scroll naturally. Lives and time carry text and icons, never colour alone. Native forms, labelled inputs, radio choices, visible focus and 44px controls support keyboard and touch. No scanline, flicker or audio effects exist, and transitions are disabled under reduced motion.

## Tests

- `__tests__/components.test.js` and `__tests__/game.test.js`: Vue Test Utils mounts of each component and the view (login, union table, blind answer, second-order phases, repair, practice hint, timed HUD, end screen)
- `__tests__/howToPlay.test.js`: first-visit dialog and reopen button
- `tests/e2e/sql-injection-arcade.spec.js`: practice run with a wrong try, hint, full solve, review and replay; class timed run; resume after reload; widths and keyboard; town entry; lost-response recovery
- E2E reads `state.seed` from the disposable test database and rebuilds each case with the server `generateCase` and `solutionFor` (`tests/e2e/fixtures/sql.js`), the same seam as the server integration test

## Known limits

The client trusts the server for every outcome, so a run cannot be solved without the generated model; the E2E seed read is test-only. The countdown uses the browser clock against the server deadline, so a skewed clock shows a slightly wrong time, while the server decides when the run is over. Hints are practice only and one per case. The retained `sql-1` ruleset has no screen: old attempts show only in history. Scores describe exercise performance, not validated mastery, and the teaching query is not Sharlock's own authentication or password storage.
