# Social Engineering Simulator - server module

## Presentation summary

- What it is: the server side of G-SOC, a chat where a fictional colleague, played by an LLM, pressures the trainee to reveal a synthetic reset code.
- Rules: the server owns the 12 scenarios (`scenarios.js`), the reset code and the system prompts, and decides the score; model output is never a security boundary.
- API: signed-in `POST` `session`, `message`, `verifier-message`, `nudge` and `complete` under `/games/social-engineering-simulator` (`router.js`); live chat sessions are held in memory and each belongs to the player who started it.
- Saving: `complete` records one practice attempt (max 100, never ranked as competitive) through `recordCompletedAttempt`; personal and class runs are readable at `/api/attempts/:id`, class runs appear on the class leaderboard.
- LLM: a bad-actor adapter (`LLM_API_KEY` + `LLM_MODEL`) and a separate real-colleague adapter (`LLM_COLLEAGUE_*`); without them the game reports it is not configured.
- Help Desk Shift (SOC-02, see TASKS.md): a shift of 4 seeded calls with desk tools, a colleague, hints and strikes, saved once per shift under ruleset `2026-10-31`. It works with no keys at all (scripted mode). The single-call routes below still play but are no longer saved.
- Status: playable and saved (SAVE-SOC, see TASKS.md). The `llm/` engine is separately owned and not changed here.

Runs G-SOC: a fictional colleague, played by an LLM, pressures the trainee to reveal a
synthetic reset code. The server owns the code and the system prompts and decides the
score; the model's words are never a security boundary.

The LLM engine in `llm/` (adapter, providers, bounded chat-session store and runner) is a
separate contributor's work. This module **imports** it and does not modify it.

## Help Desk Shift (SOC-02)

A shift is 4 calls at the Capybara and Crown help desk. All routes are signed-in `POST`s under `/api/games/social-engineering-simulator/shift/`, with the same session, CSRF and origin guards, `no-store` and per-player pacing as the other routes. Bodies reject unknown fields; a shift belongs to its player and another player's `shiftId` gets `SOC_SHIFT_NOT_FOUND` (404).

| Route             | Body                    | Returns                                                                                                                                                      |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shift/start`     | `{ context }`           | `{ shiftId, rulesetVersion, mode, colleagueMode, callIndex, callsTotal, strikes, maxStrikes, finished, call }`                                               |
| `shift/message`   | `{ shiftId, content }`  | `{ reply, replyMode: model or scripted, messagesUsed, messagesLeft, leaked }`; the typed code ends the call (see below)                                      |
| `shift/colleague` | `{ shiftId, content }`  | `{ reply, replyMode, asksUsed, asksLeft }` (2 asks per call)                                                                                                 |
| `shift/tool`      | `{ shiftId, tool }`     | `directory`, `ticket` or `callback`: the seeded facts as `{ found, entry, summary, outcome? }`, the same on every use                                        |
| `shift/hint`      | `{ shiftId }`           | `{ hint, hintsUsed, hintsLeft, penalty: 10 }` (3 per call: pattern, tool to try, then the specific clue)                                                     |
| `shift/nudge`     | `{ shiftId }`           | `{ message, nudgesLeft }`, a scripted pressure line (3 per call), no cost                                                                                    |
| `shift/decide`    | `{ shiftId, decision }` | `grant`, `callback`, `refuse` or `escalate`; returns `{ correct, score, breakdown, streak, streakBonus, genuine, debrief, strikes, finished, finishReason }` |
| `shift/next`      | `{ shiftId }`           | the next call (`{ ...status, call }`); needs the current call decided and the shift not finished                                                             |
| `shift/complete`  | `{ shiftId }`           | after the last call or the third strike: the shift result and the saved attempt (`saved`, `attempt`, or `saveError`); idempotent, retryable for 5 minutes    |

`call` holds `pretext`, `caller { displayName, claimedRole, claimedDepartment }`, `asks`, `secret { label, value }`, `openingMessage`, `colleague { displayName, role }` and `limits`. The secret value is the synthetic code on the player's own screen (as `resetCode` was before); it appears in no other payload, in no prompt and in no saved state. Whether the caller is genuine, and every desk fact, is revealed only after the call is decided.

Errors added: `SOC_SHIFT_NOT_FOUND` 404, `SOC_CALL_RESOLVED`, `SOC_CALL_OPEN`, `SOC_SHIFT_FINISHED`, `SOC_SHIFT_NOT_FINISHED`, `SOC_MESSAGE_LIMIT`, `SOC_COLLEAGUE_LIMIT`, `SOC_HINT_LIMIT` and `SOC_BUSY` (all 409), plus `SOC_INVALID_BODY` 400.

**Generation.** `callGenerator.js` builds each call from one private seed: pretext (8: IT reset, lost MFA, payroll change, courier, executive in a hurry, supplier invoice, new starter, contractor), caller name, role and department, the secret asked for (a per-call `SYNTH-...-####-####` code, never reused within a shift), the tactic (urgency, authority, familiarity, helpfulness, fear) and `genuine`. `planShift` draws about 40% genuine and never all one kind. Genuine callers have consistent directory, ticket and number-on-file facts. An attacker has 1-2 contradictions, obvious on call 1 and subtle on call 4 (calls 1-2 carry two, calls 3-4 one). When a pretext has no number on file the call back is not viable and cannot carry a contradiction.

**Decisions and scoring** (`shiftScoring.js`, ruleset `2026-10-31`, max 430, practice, untimed). Per call: decision 60, checked first 25 (a desk tool or a colleague ask before deciding, or the call back decision itself), efficiency 15 (4 messages or fewer), minus 10 per hint. Decision points: an attacker scores 60 for `refuse`, `escalate` or `callback`, 0 for `grant`. A genuine caller scores 60 for `grant` after checking (30 without checking) or `callback`, 30 for `escalate`, 0 for `refuse`. `callback` is the proper out-of-band check, so it scores 60 when a number is on file and 30 when none is. The checked and efficiency points need a non-zero decision score. A strike is a typed code (to the caller or the colleague, ends the call at once with no model call) or granting an attacker; three strikes end the shift early. The streak bonus is 10 for each correct call that follows a correct call (up to 30). One attempt is saved per shift with `resultKey` = `shiftId`; the stored state holds only per-call scoring inputs (`genuine`, `callbackViable`, `decision`, `leaked`, `verified`, `messagesUsed`, `hints`) and `shiftRuleset.js` recomputes the score. The earlier `2026-10-27` ruleset stays registered but not current, so old saved attempts keep scoring.

**Model budget and scripted mode.** Openings, nudges, hints, the colleague fallback and the Tells debrief are scripted from the seed (`scriptedLines.js`) with no model call. Only the caller's reply to a free-text message may use the model (Gemini through `llm/`): at most 5 model-backed replies per call, a server-wide token bucket (`LLM_REQUESTS_PER_MINUTE`, default 10, in memory, `limiter.js`) and a 15 s deadline. The colleague (Ollama) gets at most 2 asks per call, one in flight server-wide and a 20 s deadline. Limiter full, 429, 503, a timeout, any provider error or a missing key falls back to a scripted line in the same persona (`replyMode: 'scripted'`, and the debrief carries a note). With no `LLM_API_KEY` and no colleague the whole shift is scripted, so the game starts and finishes without any keys. The server does not edit `llm/`; it only calls the adapters' public `chat`.

## Request and data flow

```
client/src/games/social-engineering-simulator/simulator.js
  -> shared Axios client (client/src/services/api.js, baseURL /api)
  -> Express app (server/src/app.js mounts createSocialEngineeringRouter under /api)
  -> router.js    session + csrf guards, validates the body, resolves the run context, paces requests, maps errors
  -> ruleset.js   attempt registry entry: strict state schema, recomputes the score on save
  -> policy.js    field allowlist, decision enum, limits, typed SocialEngError
  -> service.js   picks a persona, runs both chats, detects leaks, scores the run
  -> scenarios.js server-owned personas: system prompt + private code + public brief
  -> verifiers.js server-owned real colleagues (prompt + facts) and scripted nudges
  -> llmConfig.js builds the two adapters; llmTimeout.js wraps the colleague's fetch
  -> llm/*        imported bounded in-memory session store + stateless adapter
                  (attacker: Gemini adapter; colleague: Ollama adapter)
```

## Endpoints (single call, not saved since SOC-02)

| Route                                                           | Purpose                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/games/social-engineering-simulator/session`          | Body `{ context }` (`{ kind: 'personal' }` or `{ kind: 'cohort', cohortId }`, validated by the attempts service before the session exists). Returns `{ sessionId, gameId, rulesetVersion, persona, brief, openingMessage, resetCode, verifier }`. |
| `POST /api/games/social-engineering-simulator/message`          | Body `{ sessionId, content }` (1..1000 chars); chat with the bad actor. Returns the reply, turn count and `leaked`/`ended`.                                                                                                                       |
| `POST /api/games/social-engineering-simulator/verifier-message` | Body `{ sessionId, content }` (1..1000 chars); chat with the real colleague. Returns `{ reply, verifierTurnsUsed, verifierTurnBudget, leaked, ended }`.                                                                                           |
| `POST /api/games/social-engineering-simulator/nudge`            | Body `{ sessionId }`; returns the next scripted bad-actor pressure line as `{ message, nudgesLeft }`. No model call.                                                                                                                              |
| `POST /api/games/social-engineering-simulator/complete`         | Body `{ sessionId, decision }` (`refuse` / `verify-independently` / `share-code`); returns the score and debrief plus `saved` and, when saved, `attempt: { attemptId, score, maxScore, persisted, context }`.                                     |

Every route needs a signed-in session; each POST also needs the allowed origin and the CSRF token.
A session belongs to the player who started it: another player's `sessionId` gets the same
`LLM_SESSION_NOT_FOUND` (404) as an unknown one, on every route including a replayed `complete`.

All five send `Cache-Control: no-store`. Request bodies reject unknown fields.

Errors use the project shape `{ error: { code, message, fieldErrors? }, requestId }`:
`SOC_INVALID_BODY` (400), `LLM_SESSION_NOT_FOUND` (404), `LLM_SESSION_BUSY` (409),
`SOC_VERIFIER_LIMIT` (409, the five colleague messages are used up),
`SOC_VERIFIER_BUSY` (429, another player's colleague reply is in flight),
`SOC_RATE_LIMITED` (429),
`LLM_NOT_CONFIGURED` / `LLM_UPSTREAM_UNAVAILABLE` (503) from the adapter, and
`SOC_UNAVAILABLE` (503) as the catch-all, and the shared auth and attempt errors
(`AUTHENTICATION_REQUIRED` 401, `CSRF_INVALID` / `ORIGIN_FORBIDDEN` 403, and a foreign or inactive class at start). A colleague reply that fails or times out returns
`LLM_UPSTREAM_UNAVAILABLE` with the text "<name> hasn't replied yet. Try again." and does not
spend one of the five messages. No stack or configuration detail leaks.

## Scoring (server-authoritative)

Maximum 100: `noLeak` 60, `verify` 25, `efficiency` 15. `rulesetVersion` is `2026-10-27` (bumped when saving was added).

Since 18 October 2026 half of the answer depends on the scenario. Each scenario has a
`legitimate` flag, kept server-side and revealed only as `legitimate` in the `complete` result.
With a colleague configured, about 35% of runs (`LEGITIMATE_SHARE`) are genuine requests
(`own-ticket`, `scheduled-migration`); without one only attacks are served. For a genuine
request: contact then `share-code` = 100 (`resisted`); every other path earns efficiency only:
contact then `refuse` (`partial`), refuse without contact (`partial`), share without contact
(`compromised`). Since 24 October 2026 the 25 verify points need the share after the check, so
messaging the colleague and then refusing everything no longer scores near an informed player
(about 70 across the mix instead of 79; informed play stays 100). A code typed to the requester in a genuine scenario counts as a
share at that moment; a code typed to the colleague is always a leak. Attack scoring below is
unchanged. Design: `docs/superpowers/specs/2026-10-18-soc-scenario-variety-design.md`.

- `noLeak` is 60 unless the code ever leaked or the trainee chose `share-code`; then it is 0
  and the outcome is `compromised`.
- `verify` is 25 only when the decision is `verify-independently`; `refuse` alone scores 0 here.
  When a real colleague is configured this changes (16 October 2026, at Eric's request: the
  verify decision is removed in colleague mode and verify credit follows contact): `verify` is
  25 when the trainee got at least one reply from the colleague (`verifier-message` succeeded),
  the run is not compromised and the decision is not `share-code`, for `refuse` or
  `verify-independently` (the latter is still accepted for compatibility). Outcome is
  `resisted` when protected and contacted, `partial` when protected but never contacted.
  `refuse` without contact gets the debrief note "You protected the code but did not check with
  <colleague name>...". `verify-independently` without contact is scored as a refusal without
  contact and the debrief says "You chose to verify but did not contact anyone". The client
  only offers `refuse` and `share-code` in this mode.
  The breakdown label reads "Checked with <colleague name>" whenever a colleague session
  exists for the run, whether or not the trainee contacted them (without a colleague session it
  reads "Verified through an independent channel"). The points still depend on contact.
- `efficiency` is 15 within the bad-actor turn budget, scaling to a floor of 0 beyond it.
  Colleague messages do not count toward this budget.
- Outcome is `resisted` (protected + verified), `partial` (protected, refused only) or
  `compromised` (code exposed).

Leak detection normalises both the code and the trainee message (uppercase, everything
except letters and digits removed) and checks for a substring match, so `synth reset 4821`
and `synth_reset.4821` are caught. Partial disclosure such as only the digits is not flagged.
It applies to both chats: a message containing the code is never forwarded to either model,
and it ends the whole run as compromised.

## Two LLM roles and the real-colleague chat

Implemented on branch `g-soc-real-colleague` (15 October 2026) and merged to `main` via
PR #3 (c46dfba). Saving was added later (SAVE-SOC, see [Saved attempts](#saved-attempts-save-soc)). Full design: `docs/superpowers/specs/2026-10-15-soc-real-colleague-verification-design.md`.

- **Two chats.** The existing pressure chat stays. A second chat lets the player message the
  real colleague (`verifiers.js`: one colleague per persona, four in all, with server-owned
  facts and rules). The colleague is a different real person, for example Marcus Tan in the IT
  Service Centre, who honestly does not know the sender. Verification is credited only if the player
  actually got a reply from that colleague. The server decides the score; the model never does.
- **Two adapters, fixed roles** (`llmConfig.js`, `createGameAdapters`). The bad actor always
  uses Gemini (`LLM_API_KEY` + `LLM_MODEL`; a model without a key leaves it unconfigured). The
  real colleague always uses Ollama (`LLM_COLLEAGUE_BASE_URL` and `LLM_COLLEAGUE_MODEL`, set
  together or both empty, plus optional `LLM_COLLEAGUE_AUTH_TOKEN` and
  `LLM_COLLEAGUE_TIMEOUT_MS`). It is a second `createLlmAdapter()` instance, so the
  contributor-owned `llm/` folder is not edited. `LLM_API_KEY` never reroutes the colleague.
  `LLM_BASE_URL` and `LLM_AUTH_TOKEN` are no longer read by the game.
- **Fallback.** With no colleague configured, `session` returns `verifier: null`, the
  colleague endpoint answers `LLM_NOT_CONFIGURED`, and `verify-independently` is the old
  one-click choice that scores 25 without any contact (`refuse` stays 75).
- **Limits.** The colleague gets at most 5 replies per run (`VERIFIER_TURN_BUDGET`), one
  colleague reply may be in flight across the whole server (`VERIFIER_CONCURRENCY` 1, extra
  requests get `SOC_VERIFIER_BUSY`), and one reply per run at a time (`LLM_SESSION_BUSY`).
  A spent bad-actor budget does not stop the player from checking with the colleague.
- **Nudges.** `nudge` returns up to 3 scripted pressure lines per run (`MAX_NUDGES`) from the
  bad-actor persona while the player is idle or checking. They are fixed server text with no
  model call and do not spend a turn. Once the run has ended or leaked it returns
  `{ message: null, nudgesLeft: 0 }`. Each delivered nudge is recorded in the session
  metadata and added to the bad actor's system prompt on its next turn ("You also sent these
  follow-up messages while the trainee was away"), so it remembers them; the transcript
  store is append-only and is not edited.
- **Reply backstop.** The colleague's reply is trimmed deterministically before it is returned
  (`tidyColleagueReply` in `service.js`): at most the first 3 sentences, with http, https and
  www URLs removed. Sentences are split on whitespace that follows `.`, `!` or `?`, so
  dotted hostnames and version numbers such as `v1.2` do not break a sentence; an abbreviation
  like "e.g." may count as a sentence end. The model transcript keeps the raw reply.
- **No artificial delay.** The Ollama model's own latency is the pacing.
- **Timeouts.** The colleague reply may take up to 60 seconds on the server (`LLM_COLLEAGUE_TIMEOUT_MS` accepts an integer from 1000 to 60000, so it never exceeds the browser wait). The Ollama
  provider hardcodes `AbortSignal.timeout(30000)` inside `llm/`, so the colleague adapter
  instead receives a `fetchImpl` wrapped by `withTimeout` in `llmTimeout.js` that applies
  `LLM_COLLEAGUE_TIMEOUT_MS` (default 60000). The browser waits 65000 ms for the colleague
  (`VERIFIER_TIMEOUT_MS` in the client `simulator.js`; 45000 ms for the bad-actor chat). A
  reply that passes the limit shows a retryable "hasn't replied yet" state.
- **Status.** Unit tests cover the behaviour with mocked adapters. On 24 October 2026 Eric ran
  live rehearsals with `node tests/soc-live-session.mjs [--scenario <id>]` against Gemini and the
  Ollama colleague (an attack and a legitimate scenario, both with a colleague check). Known
  limit: Gemini thinking tokens count against `maxOutputTokens: 256` in the guarded
  `llm/providers/cloud.js`, so attacker replies can be cut short; see the TASKS.md record. The
  gateway token is shared privately and lives only in each teammate's own `.env`.

## Saved attempts (SAVE-SOC)

Since SOC-02 the saved ruleset is the Help Desk Shift (`2026-10-31`). The description below is the earlier single-call save: its `complete` route now returns the score with `saved: false` and `saveError.code` `SOC_SINGLE_CALL_NOT_SAVED`, and the older ruleset stays registered (not current) so saved results still read.

The module is server-recorded: the attempts registry entry (`ruleset.js`, registered in
`server/src/modules/attempts/production-registry.js`) has `serverRecorded: true`, so the public
`POST /api/games/social-engineering-simulator/attempts` route answers `409 ATTEMPT_SERVER_RECORDED`.
Live chat state stays in memory; only the finished run is stored.

- **Start.** `router.js` calls `attempts.resolveRunContext(actor, context)` first, so a foreign,
  pending or removed class fails before a session or any LLM call exists. The resolved context and the
  player id are kept in the session metadata, and every later route checks the owner.
- **Complete.** `service.completeAndRecord` scores exactly as before, then calls
  `recordCompletedAttempt(actor, 'social-engineering-simulator', { context, mode: 'practice',
startedAt, state, resultKey: sessionId })`. The saved `state` holds only the effective scoring
  inputs: `scenarioId`, `decision`, `leaked`, `turnsUsed`, `verifierRequired`, `verifierContacted`.
  `ruleset.summarize` recomputes the score from them with the same `scoreOutcome`; legitimacy and the
  turn budget are read from the scenario, never from the stored state. Transcripts, the reset code and
  prompts are never stored.
- **Idempotent and retryable.** The result is kept for 5 minutes (`COMPLETED_TTL_MS`). A repeated
  `complete` returns the same saved attempt. If the save fails with an attempt or cohort error (for
  example the student left the class mid-run) the response keeps the score and debrief with
  `saved: false` and `saveError: { code, message }`; calling `complete` again within the window retries
  the save. Unexpected errors surface as `SOC_UNAVAILABLE`.
- **Scoring and boards.** `maxScore` 100, `competitive: false`, mode `practice`. Class runs appear on
  the class leaderboard as practice best scores and in the all-time view; personal runs do not.
- **Limits.** Pacing in `router.js` is per player and in memory (not a security boundary). A run
  that is never completed, or whose idle transcript expired, is not saved.

## Tuning

`turnBudget` (8), the persona set in `scenarios.js`, the colleague facts and nudges in
`verifiers.js`, and the limits and `WEIGHTS` in `policy.js` are
defaults chosen for the MVP and can be adjusted without touching the engine.
