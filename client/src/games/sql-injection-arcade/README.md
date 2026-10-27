# SQL Injection Arcade

## Presentation summary

- An untimed customs-house SQL case in a blue 8-bit database console at `/games/sql-injection-arcade`
- Teaches SQL string breakout, Boolean equality, comments and bound parameters
- Course references: [course index](../../../../TASKS.md#course-reference-index); CS440 `12a-web-security-partII.pptx`, slides 16–24
- Inspect a fictional query and try up to five payloads, then make one repair choice
- Earn 80 points for a simulated bypass and 20 for the parameterized-query repair
- Unsupported teaching syntax consumes a test; success ends testing immediately
- How to play: a button on the briefing (and a first-visit dialog until dismissed) opens a four-step guide; content in `howToPlay.js`, animated scene in `components/HowToPlayScene.vue`, tests in `__tests__/howToPlay.test.js`
- `MockAdminLogin`, `QueryExplanation` and `RepairSelector` compose the screen
- Shared attempt components choose personal/class context and display the saved result
- The server owns rules, scoring and persistence; no actual SQL is executed
- Review status and verification: [GAME-01-B / G-SQL](../../../../TASKS.md#g-sql-saved-practice)

## Playing

Enter through the existing Customs House / hut destination or the direct route. The briefing separates its three introductory paragraphs and keeps the save destination and Open the case controls at the bottom of the blue panel; on short desktop screens the introduction scrolls above those controls. Choose personal practice or an available class, then open the case. The full-width query inspector is the top screen; the payload/repair console is the row below. Inspect the query, then use fictional values only in the lower screen. A clue reveals the teaching example `' OR 1=1 --`. The password exercise field is deliberately visible for inspection and cleared on submission; never enter a real credential.

Every structurally valid submission counts, including unsupported grammar and false equality. Five tests or a successful bypass opens the repair stage. Choose once; the result explains the correct defense even when your choice was wrong. A completed result is saved only after server confirmation. Play again creates a fresh attempt. The URL's `attempt` parameter restores your own active or completed case after reload. Keep the URL if you want to revisit it; there is no history-list screen in this scope.

## Implementation and accessibility

`SqlInjectionArcade.vue` coordinates the shared attempt state and route. `useSqlInjection.js` derives the current evaluation and phase. `MockAdminLogin({disabled,attemptsRemaining})` emits `test-payload({username,password})`; `QueryExplanation({evaluation,mode})` renders safe text and annotated teaching syntax; `RepairSelector({options,disabled})` emits `select-repair(optionId)`. Vue props/emits follow WAD2 `Week6Slides.pptx`, slides 3–7, 9–17 and 22–28. The repository's feature folders and safe rendering take precedence over lecture examples.

Keane approved a CLI-inspired blue arcade console as a game-local palette exception. `.sql-game` owns navy backgrounds, light readable text, bright blue controls, cyan SQL keywords and amber parameters/highlights. Silkscreen headings and buttons (self-hosted through `@fontsource/silkscreen` in `sql.css`, FONT-04; the same display face used by CLI Cyber Defender) use the existing shared pixel font as fallback; code and body use system monospace. The query inspector is always a full-width row above the test/repair console. Fictional inputs and repair choices can share columns within the lower row on desktop, then stack on mobile. The game frame fills the available workspace rather than using a centered width cap; its local layout compensates for the shell gutters from its container width, never from `100vw`, so a classic vertical scrollbar cannot push the right edge (back link, simulation indicator, score) out of view, and it caps at the shared `1320px` content width on very wide screens. Laptop screens use contained scrolling with primary actions retained; narrow or short screens scroll naturally. Decorative framing does not cover text and no scanline or flicker effects are used. Native forms, radio choices, visible focus, text feedback and 44px controls support keyboard/touch use. No timer, audio or motion effects are required. The shared navbar and hub retain their styling and controllers.

The [server module](../../../../server/src/modules/games/sql-injection-arcade/README.md) describes the bounded grammar and saved-state boundary. Scores describe exercise performance, not validated mastery; untimed practice never enters rankings. The teaching query depicts an unsafe SQL construction, not Sharlock's authentication implementation or password-storage practice.

## Known limits and handoff

The query inspector uses a fixed illustrative template rather than reconstructing the submitted input. A single fixed case, a direct answer clue and fixed repair choices keep replay simple. Saved attempts/results can be revisited through their case URL; there is no recent-results listing. A failed initial attempt read currently shows the briefing without a dedicated retry-load control. Creation has no idempotency key, so losing its response can leave an uncompleted attempt even though action/completion retries are protected. The bounded parser evaluates the two fictional fields independently; it does not fully model a username comment discarding the password suffix. These are retained limitations, not a claim of full SQL-dialect behavior.

The owner cancelled the proposed follow-up fixes before implementation and requested a feature-branch handoff. See the [TASKS handoff and verification record](../../../../TASKS.md#g-sql-saved-practice) for current progress and separately agreed future work.
