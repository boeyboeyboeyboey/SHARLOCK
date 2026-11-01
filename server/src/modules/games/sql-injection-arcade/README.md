# SQL Injection Arcade server rules

## Presentation summary

- Server-only bounded teaching parser and saved-attempt ruleset for a seeded run of cases
- Stable game ID `sql-injection-arcade`, current ruleset `sql-3`; `sql-2` and `sql-1` stay registered, not current, for old results
- CS440 `12a-web-security-partII.pptx` slides 16–24 support quote breakout, comments, stacked statements, escaping and bound parameters; unquoted numeric fields, UNION, boolean-blind and second-order injection are team extensions beyond that deck
- Case types: login bypass (quoted tautology, comment cut-off, unquoted numeric), UNION, boolean-blind, second-order, plus a repair choice after every fourth case
- Class context is a 180 s ranked run with 3 lives; personal context is untimed practice of 12 cases plus 3 repairs, with hints
- Uses the existing attempt API/store, ownership, CSRF, revisions and receipts
- No SQL, database, shell or network is ever touched: `engine.js` only tokenises and compares in memory
- Review status and evidence: [SQL-02 / G-SQL](../../../../../TASKS.md#g-sql-saved-practice)

## Files

- `policy.js`: constants, slot schedule, action parsing, `maxTimedScore`, `maxTimedActions`
- `engine.js`: tokeniser, allowlist grammar and one runner per case type
- `generator/`: `generateCase({seed,index})` returning `{public,private}`; `random.js` is a sha256 stream like the phishing triage generator; `pools.js` holds the synthetic names
- `scoring.js`: `tally` and topic breakdown derived from case records only
- `feedback.js`: teaching messages keyed by outcome code
- `ruleset.js`: `sql-3` registry entry and the earlier `sql-2` one (`createSqlRuleset({randomSeed})`, `sqlRuleset`, `sqlPreviousRuleset`)
- `legacy.js`, `parser.js`: the frozen `sql-1` ruleset and its parser

## Run rules (`sql-3`)

`sql-3` changes three things from `sql-2`, which stays registered with the old rules for attempts saved or open under it: the maximum (`maxScore` 320, was 1,130 from `maxTimedScore()`, 36 slots in 180 seconds), stacked statements (below) and the blind letter probe (below).

- Class context: mode `standard`, 180 s deadline, 3 lives, `competitive: true`. Ends at the deadline, at 0 lives or after 36 slots (the cap that keeps `maxActions` at 210, under the 255 limit).
- Par: `maxScore` is `PAR_SCORE`, 320, the lowest score of a flawless practice run whatever the seed (3 cases at 20, 4 at 20, 5 at 30, 3 repairs at 10; computed over 2,000 seeds: 320 to 410, median 370). `summarize` and the public `score` both stop there, so a player with luckier cases may lose up to 90 points of slips and still reach it. In a class run it takes about 14 flawless slots, 13 seconds each; 10 slots, 18 seconds each, save 190 to 240.
- Personal context: mode `practice`, no deadline, no lives, ends after 15 slots (12 cases and 3 repairs).
- Slots repeat as four cases then one repair. Cases 1–3 are tier 1, cases 4–7 mix tier 1 and 2, later cases mix tier 2 and 3.
- Each case allows 3 tries. Unsupported or malformed syntax gives feedback but still counts as a try. A blind case has 6 probes and one answer instead. Out of tries closes the case as failed, and in timed mode costs a life.
- Points: 10, 20, 30 for tier 1, 2, 3 on a solved case, plus 10 for solving with no earlier slip and no hint. A correct repair is worth 10. A wrong repair scores 0 and costs no life.
- `hint` is practice only, once per case, and marks the case assisted (no first-try bonus).
- `summarize` clamps to `maxScore` and reports per-topic outcomes for the injection types played plus `parameterized-queries` when a repair was answered. Its `verdictCode` is `SQL_RUN_LIVES_OUT` only in a class run; practice has no lives.

## Actions

All payloads carry the current `caseId` (a stale id is a 409). Extra fields are rejected.

| Type              | Payload                 | Use                                                |
| ----------------- | ----------------------- | -------------------------------------------------- |
| `attempt`         | `{caseId, inputs[1-2]}` | login (2 fields), numeric, union, blind probe (1)  |
| `register`        | `{caseId, inputs[1]}`   | second-order step 1, name up to 40 characters      |
| `change-password` | `{caseId}`              | second-order step 2, uses the stored name          |
| `answer`          | `{caseId, value}`       | blind, `yes` or `no`, only after the stage 1 proof |
| `choose-fix`      | `{caseId, optionId}`    | repair, option `a` to `d`                          |
| `hint`            | `{caseId}`              | practice only                                      |

Input strings are at most 120 characters. The old `test-payload` and `select-repair` types are only valid on `sql-1` attempts.

## Teaching grammar

The query is built exactly as the vulnerable page would, by pasting the raw input into fixed text. The text is tokenised and the condition is evaluated in memory against synthetic rows.

- Tokens: integers (12 digits), quoted strings (80 characters, `''` escape), words, `( ) , = < >`. `--` and `#` start a comment that drops the rest. At most 48 tokens. `;` stops with `STACKED_NOT_RUN`: stacked statements are never run, the message says so, and it spends a try but is not a slip, so the first-try bonus stays. Any other character (such as `*`) is `UNSUPPORTED`. A stray `%` or an unterminated string is a `SYNTAX_ERROR`.
- Condition: `operand (= | < | > | LIKE) operand`, joined by `AND`/`OR` (AND binds tighter). An operand is a number, a string, `NULL` or a known column. Unknown columns are a `SYNTAX_ERROR`. `LIKE` treats `%` as any run and `_` as any one character, and retries only from the last `%`, so its work stays at subject length times pattern length because the player can type both sides. It folds case one character at a time like a case-insensitive regex, so `ß` never matches `SS`. A number compared with a string that holds a number compares as numbers, so `10 > '9'` holds. A trailing `;` followed only by space or a comment ends the statement; anything else after it stays `STACKED_NOT_RUN`. These stop wrongly refusing inputs and change no points or maximum, so `sql-3` is not bumped; a run already saved keeps its saved score. A blind probe of another column or letter answers `YES_OFF_TARGET` or `NO_OFF_TARGET` under `sql-3`, which says it is not evidence.
- Login (quoted, two fields): `WHERE user = '<u>' AND pass = '<p>'`. A tautology matches the first row. The comment variant must match the named account, otherwise `WRONG_ACCOUNT`.
- Numeric: `WHERE badge = <input>` with no quotes, so a quote only causes a syntax error.
- UNION: `WHERE col LIKE '%<input>%'` then `UNION [ALL] SELECT <n items> FROM <table>`. Items are literals, `NULL` or columns of that table. Wrong count is `COLUMN_MISMATCH`, only literals is `NO_DATA`, the decoy table is `WRONG_TABLE`, the target table is `SUCCESS`.
- Blind: `WHERE crate = '<input>'` answers in stock or not. Stage 1 needs one injected true probe and one injected false probe that starts with the known crate. Stage 2 adds `SUBSTRING(col,i,1)` (third argument 1 only) compared with `= < >`. The answer is allowed after both stage 1 proofs and one probe of `SUBSTRING(<hidden column>,1,1)`, the fact the question asks about; a substring of another column or position proves nothing, so it does not count. The browser asks for a second press before sending the answer.
- Second-order: step 1 stores the name (escaped on insert, refused if it matches an existing account, which costs a try). Step 2 pastes the stored name into `UPDATE ... WHERE user = '<stored>'`. Success is exactly the target row; more rows is `TOO_BROAD`.

## Stored state

Strict schema `{seed, generatorVersion, cases[]}` (at most 36 records, no Mixed or Map). A case record holds `kind, tier, tries, slips, outcome, assisted, points, trueSeen, falseSeen, probed, stored, picked, last`. `stored` is the registered name between the two second-order steps and is cleared once the update runs. No other raw input is saved. Totals are derived from the records. Answers are regenerated from the seed and never serialized.

## Public state

`serializePublicState` returns `mode, totalCases, maxLives, lives, casesClosed, serverNow, score, solved, failed, current, last` and, once completed, `review`. `current` is the open case without its model (scenario, goal, query template, fields, optional schema hint, known crate, question, repair options, tries, stage, phase, hint once requested). `last` holds the outcome code, message, leaked rows for a union success, and the explanation once the case closes.

## Test seam

`createSqlRuleset({ randomSeed })` replaces the 128-bit random seed in unit tests, like `createTriageRuleset`. Integration tests read `state.seed` from the stored attempt document and rebuild the private case with `generateCase`.

## Verification

Unit: `server/tests/unit/sql-injection-arcade/` (engine, generator, ruleset, legacy). Integration: `server/tests/integration/sql-injection-arcade/game.test.js` against the guarded disposable `_test` database. Exact commands and outcomes live in TASKS.md.

**Known limit (Russell, 1 November 2026):** the 320 par cap stays, so capped class runs may tie and the earlier finisher ranks higher. There is no per-mode maximum.

## Retained sql-1 limitation

`evaluateLogin` in `parser.js` evaluates both fields and returns `UNSUPPORTED` if either is unsupported. It is kept unchanged for `legacy.js`.
