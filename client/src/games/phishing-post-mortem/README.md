# Phishing Post-Mortem - SHARMAIL client module

## Presentation summary

- What: a SHARMAIL inbox of twenty synthetic messages where the player finds Patient Zero, the one email that caused the compromise, and backs the verdict with exactly two clues.
- Concept: tracing a credential theft through lookalike domains, reply-to mismatches and proxy logs (course reference index, phishing and web security decks).
- How to play: choose where to save the case, read and inspect messages (link destinations stay inert until inspected), accuse one message, pick two clues, submit once.
- Technical: `useAttempt('phishing-post-mortem')` runs the server attempt; the server picks the case, scores the `submit-verdict` action and holds the answer key, and the client completes the attempt right after the verdict.
- Saved: a verdict is worth up to 100 points and is saved as a completed attempt; class attempts appear on the class leaderboard, personal practice does not. `?attempt=` resumes a saved result with its debrief.
- Status: playable and saved (see TASKS.md). Limits: two authored cases, one verdict per attempt, scores record this exercise rather than validated mastery.

## Files

| File                              | Responsibility                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PhishingPostMortem.vue`          | Route entry, context chooser, saved result wrapper, pane focus handling, error and retry states.                                                                                                             |
| `components/SharmailShell.vue`    | SHARMAIL chrome: wordmark, mailbox name, folder rail.                                                                                                                                                        |
| `components/InboxList.vue`        | Message rows, unread state, arrow-key walking. Emits `select-email`.                                                                                                                                         |
| `components/EmailInspector.vue`   | Headers, body and inert link inspection. Emits `inspect-link`.                                                                                                                                               |
| `components/EvidenceTimeline.vue` | The security log.                                                                                                                                                                                            |
| `components/VerdictPanel.vue`     | Verdict bar docked under the mail client (shell `footer` slot), outside any message: accused message, an Evidence toggle that opens the two-clue list, submit. Emits `update-evidence` and `submit-verdict`. |
| `components/CaseDebrief.vue`      | Score, evidence chain, clue review, decoy explanations. Emits `replay`.                                                                                                                                      |
| `composables/usePhishingCase.js`  | Module state: the attempt (via `useAttempt`), selection, accusation, clues, verdict submit and save.                                                                                                         |     |
| `phishing.js`                     | Date and initials helpers.                                                                                                                                                                                   |
| `phish.css`                       | Every style, scoped under `.phish-game`.                                                                                                                                                                     |

## State ownership

`usePhishingCase()` wraps `useAttempt` and owns the inbox state around it. Two ideas are deliberately separate:

- `selectedEmailId` is the message being **read**.
- `accusedEmailId` is the message being **accused**.

Opening a message never accuses it; only the Accuse button does. `canSubmit` needs an accusation plus exactly two clues. The case is `snapshot.publicState.case`; the verdict and debrief appear in `publicState.verdict` only after the server scores the action. Inbox state resets whenever the attempt id changes.

## Saved attempts

A chooser (`AttemptContextChooser`) starts the attempt and the route keeps `?attempt=<id>`. Submitting sends `submit-verdict` and then completes the attempt automatically; a failed verdict or save keeps the form and shows Retry verdict or Retry save, and a verdict that is judged but unsaved offers Save result. A completed attempt renders inside `SavedAttemptResult` with the inbox still readable. Play again returns to the chooser and the server picks the next case.

## Design boundary

This module uses the DESIGN.md game exception: a desktop mail-client look with a system font stack, the town's green and cream accents and its own controls, rather than the hub's pixel scheme. Realism is the point - a spoofed display name only teaches if the inbox looks like an inbox.

Every rule in `phish.css` sits under `.phish-game`, and the palette is defined as `--game-*` variables on that wrapper. Nothing touches `:root`, `html`, `body`, `.portal-shell`, the navbar or another module. SHARMAIL is an original fictional mail client; it deliberately borrows no real product's branding, wordmark or icons. The town building, its metadata card, the shared navbar and every shared page keep the hub pixel scheme.

## Accessibility

The reading pane and the list are side by side from 992px and swap below it, where Back to inbox returns focus to the row the reader came from. Rows are buttons with `aria-current`, and Arrow Up and Arrow Down walk them. Link destinations are revealed by a button with `aria-expanded`; no anchor is rendered, so inspecting can never navigate. Controls are at least 44px, focus is always visible, and verdict states carry text as well as colour. There is no animation.
