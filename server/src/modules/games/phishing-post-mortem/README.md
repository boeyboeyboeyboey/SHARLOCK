# Phishing Post-Mortem - server module

Holds the authored cases for G-PHISH and the saved-attempt ruleset that scores the player's single verdict. The private answer key never leaves this directory.

## Request and data flow

```
client -> shared Axios client (baseURL /api)
  -> POST /api/games/phishing-post-mortem/attempts   (shared attempts router; body { context })
  -> POST /api/attempts/:id/actions                  (type submit-verdict)
  -> POST /api/attempts/:id/complete
  -> ruleset.js  stored state, action validation, public state, summary
  -> policy.js   field allowlist, identifier patterns, typed PhishingError
  -> service.js  case loading, answer-free public case, scoreVerdict
  -> cases/*.public.json           public content, safe to send to the browser
  -> cases/answers/*.answers.json  patient zero, correct clues, notes - server only
```

This module adds no routes of its own. It registers `phishingRuleset` in `server/src/modules/attempts/production-registry.js` (ruleset `phish-2`, `maxScore` 100, `competitive: false`, `maxActions` 2, practice mode). Attempts, ownership, context (personal or cohort) and the class leaderboard come from the shared attempts and leaderboards modules (see `server/src/modules/attempts/README.md`).

## Attempt contract

- **Start** picks a case with `crypto.randomInt` and stores `{ caseId, datasetVersion, emailOrder, verdict: null }`. `emailOrder` is the inbox shuffle, stored so the public state is stable across reads.
- **Action** `submit-verdict` with `{ selectedEmailId, evidenceIds }` (exactly two different clue ids). Any other field, including `caseId`, `datasetVersion`, `actionId` and `score`, is rejected. Only one verdict is accepted per attempt.
- **Complete** is allowed once a verdict exists; before that it returns 409.
- **Public state** is `{ case, verdict }`. `case` holds the briefing, emails in the stored order, timeline and clue options, with no answer fields. `verdict` is `null` until submitted, then `{ score, result, feedback, debrief }`; the debrief (Patient Zero, chain, clue notes, decoys) is revealed only at that point.
- **Stored state** keeps only the compact inputs; score, feedback and topic outcomes are recomputed from the answer key in `summarize` and `serializePublicState`.

Scoring is 60 points for naming Patient Zero and 20 for each correct supporting clue, with clues counting only behind a correct accusation. Maximum 100.

Errors use the shared attempt error shape `{ error: { code, message }, requestId }`: `PHISH_INVALID_REQUEST` (400, bad verdict fields), `PHISH_INVALID_ACTION` (400, unknown action type), `PHISH_UNKNOWN_SELECTION` (400, email or clue not in the case), `PHISH_VERDICT_SUBMITTED` (409, second verdict), plus the shared `ATTEMPT_*` codes.

Class-context attempts appear on the cohort leaderboard as practice best scores; personal attempts do not.

## Authoring a case

Each case is a pair: `cases/<id>.public.json` and `cases/answers/<id>.answers.json`. A case needs exactly twenty uniquely identified emails, one unambiguous Patient Zero, exactly two correct clues among six options, and a timeline whose ordering supports the answer. Destinations must be `https` on a fictional `.example` host, links are inert text, and no real brand may appear. `server/tests/unit/phishing-post-mortem/case-integrity.test.js` enforces all of this, so run the unit suite after editing a case.

Add the new id to `CASE_IDS` in `service.js`. Nothing else changes; random selection and shuffling pick it up automatically.
