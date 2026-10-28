# Phishing Post-Mortem - server module

Two rulesets share the game ID `phishing-post-mortem`. `phish-3` is the current triage run (PHISH-01). `phish-2` is the earlier inbox investigation, kept registered but not current so saved results and unfinished runs still read. The private answers never leave this directory.

## Request and data flow

```
client -> shared Axios client (baseURL /api)
  -> POST /api/games/phishing-post-mortem/attempts   (shared attempts router; body { context })
  -> POST /api/attempts/:id/actions                  (type triage-call)
  -> POST /api/attempts/:id/complete
  -> triage/ruleset.js    stored state, deadline, public state, summary
  -> triage/policy.js     constants, action allowlist, typed TriageError
  -> triage/scoring.js    judgeCall, streak and mistake tally, topic breakdown
  -> triage/generator/    seeded email generator (index, pools, random, templates, tricks)
```

This module adds no routes. `attempts/production-registry.js` registers `triageRuleset` (current) and `phishingRuleset` (phish-2, `current: false`). Ownership, context (personal or cohort) and ranking come from the shared attempts and leaderboards modules (see `server/src/modules/attempts/README.md`).

## phish-3 contract

- **Ruleset:** `phish-3`, generator `triage-2`, `competitive: true`, `maxActions` 60, `maxScore` from `maxTimedScore()` (every round a phish with its tell found on a perfect streak).
- **Start:** `createState` stores `{ seed, generatorVersion, rounds: [] }` with a 128-bit random seed (32 hex characters). A cohort context starts a timed run: mode `standard`, `deadlineAt` = start + 180 s. A personal context starts practice: mode `practice`, no deadline.
- **Generator:** `generateRound({ seed, roundIndex })` builds each email from a SHA-256 based stream, so the same seed and index always give the same email. About 60% of rounds are genuine. Each round picks one of 20 scenarios (password expiry, sign-in alert, mailbox full, software update, device enrolment, vendor invoice, bank-detail change, payslip, expense claim, urgent executive payment, shared document, e-signature, calendar change, voicemail or fax, parcel delivery, subscription renewal, event or parking QR, benefits deadline, policy acknowledgement, staff survey) and the same scenario can arrive as a genuine email or a phish, so subjects and sender names never give the answer away. Genuine emails carry a safe-route sentence (for example "call the number on file") about half the time and phish never do. Phish types: lookalike domain, display-name spoof, reply-to mismatch, link-text mismatch, link-less payment-change (BEC), QR code, attachment. Difficulty tier is fixed by round: 1-4 tier 1, 5-9 tier 2, 10 and later tier 3. All domains are fictional `.example` hosts and links are inert text. Part IDs and round IDs are short random strings.
- **Action:** `triage-call` with `{ roundId, call: 'report' | 'trust', partId }`. `partId` is required for `report` and forbidden for `trust`. Any other field is rejected. The round ID must match the current email.
- **Scoring:** a correct call scores 10, 20 or 30 by tier, plus 10 when a reported phish names one of its tell parts, multiplied by the streak before the call (x1 at 0-2, x2 at 3-5, x3 at 6 or more). Trusting a phish or reporting a legitimate email scores 0, is a mistake and resets the streak. Reporting a phish with the wrong part scores the call without the +10 and is not a mistake. Totals are derived from the stored rounds.
- **End conditions:** timed runs end at the deadline, the third mistake or 60 rounds; practice ends after 12 rounds. `canComplete` is true only then; before that complete returns 409. Actions after the end return `PHISH_RUN_OVER`.
- **Public state:** `{ mode, totalRounds, maxMistakes, roundsPlayed, score, streak, mistakes, current, last }`, plus `review` once completed. `current` is the next email (no answer fields) and is `null` once the run is over. `last` is the previous round's outcome with the verdict, type, tell part IDs and explanation, revealed only after the call.
- **Errors:** shared attempt shape `{ error: { code, message }, requestId }`: `PHISH_INVALID_REQUEST` (400, with field errors), `PHISH_INVALID_ACTION` (400), `PHISH_UNKNOWN_SELECTION` (400, part not in this email), `PHISH_STALE_ROUND` (409), `PHISH_RUN_OVER` (409), plus the shared `ATTEMPT_*` codes.
- **Ranking:** class-context standard-mode runs are `competitive`, so the leaderboard shows them as "Timed runs". Personal practice is not ranked.

## phish-2 (legacy, not current)

`ruleset.js`, `policy.js`, `service.js` and `cases/` hold the inbox investigation: a random authored case of twenty emails, one `submit-verdict` action `{ selectedEmailId, evidenceIds }`, 100 points (60 for Patient Zero, 20 per correct clue), `competitive: false`. New attempts no longer use it. Keep these files while old results or unfinished `phish-2` runs may exist; the client shows such results as a score summary only. `server/tests/unit/phishing-post-mortem/case-integrity.test.js` still guards the case files.

## Changing the generator

Add a scenario as one entry in the `SCENARIOS` array in `generator/templates.js` (an id, 2-4 `phishTypes`, a `safeRoute` sentence and `safeNote`, and a `build(c, { verdict, phishType })` that returns the genuine email and lets `finish` turn it into the phish) and keep every domain on a fictional `.example` host. Bump `GENERATOR_VERSION` when a change would alter what an existing seed produces, because unfinished runs regenerate their emails from the stored seed. `server/tests/unit/phishing-post-mortem/triage-generator.test.js` and `triage-ruleset.test.js` cover determinism, content safety, the tier ramp, scoring and end conditions.
