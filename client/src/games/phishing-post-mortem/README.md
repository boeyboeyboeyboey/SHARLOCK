# Phishing Post-Mortem - client module

## Presentation summary

- What: a triage run of single synthetic emails. Each round the player presses **Report** (a phish) or **Trust** (genuine), then taps the part that gave a phish away: sender, reply-to, link, attachment or QR code, or the request line.
- Concept: spotting phishing from lookalike domains, display-name spoofing, reply-to and link mismatches, link-less payment-change requests, and not distrusting genuine urgent email. The CS440 decks touch this only briefly: `1-basics.pptx` slide 25 lists phishers among threat sources and says they run phishing schemes to steal identities or information; `12a-web-security-partII.pptx` slide 6 shows a CSRF attack starting from a link in an email; `06-authentication v2.pptx` slide 19 says passwords can be guessed via social engineering. The learning objective is a team design, not course content.
- How to play: choose a context. A class run lasts 3:00 and ends at time-up, the third mistake or 60 rounds; personal practice is 12 untimed emails with an explanation after each. Correct calls score 10, 20 or 30 by difficulty, +10 for the right part, with a streak multiplier of x2 from 3 and x3 from 6.
- Email mix: about 60% of emails are genuine. Each of 20 shared scenarios (password expiry, vendor invoice, parcel delivery and others) can arrive as genuine or phish with the same subject and sender, so only the tell differs; about half of genuine emails add a safe-route line (for example, call the number on file) that phish never carry.
- How to play guide: the shared `HowToPlayDialog` opens on the first visit and from the **How to play** button, with a code-drawn replay preview (cursor trusts one email, reports the next and taps the sender; one static frame under reduced motion), two steps (Play, Modes) and a one-line learn note from `howToPlay.js`.
- Look and motion: desk background, paper card, email slide-in, Reported/Trusted stamp, pulsing tell, draining timer bar (amber at 30 s, red at 10 s), score count-up, x2/x3 badge pop, mistake shake and staggered debrief. All of it is off under `prefers-reduced-motion`.
- Technical: `useTriageRun` wraps `useAttempt('phishing-post-mortem')`; the server generates each email from a 128-bit seed, holds the answers and scores every `triage-call`. Rulesets `phish-3` (current) and the earlier `phish-2` inbox ruleset (read-only here, shown as a score summary).
- Saved: completed class runs appear on the class leaderboard as "Timed runs"; personal practice is saved but not ranked. `?attempt=` reopens a saved result with its debrief.
- Status: Review (see the PHISH-01 record in TASKS.md). Limits: email content is synthetic templates with `.example` domains and no live links; the revised look, motion and the timed stamp badge at 375 px are not yet checked by eye; the countdown is shown by the browser while the server enforces the deadline; a closed tab leaves an expired run unsaved until the attempt is reopened; scores record this exercise, not validated mastery.

## Files

| File                             | Responsibility                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `PhishingPostMortem.vue`         | Route entry, context chooser, saved-result wrapper, Report/Trust controls, part picking, feedback hold in practice, error and retry states.     |
| `useTriageRun.js`                | Module state: the attempt (via `useAttempt`), countdown, previous email, run-over detection, completion with brief retry, `report` and `trust`. |
| `components/TriageEmailCard.vue` | The email with tappable parts. Props `email`, `picking`, `disabled`; emits `select-part` and `cancel-pick` (Escape).                            |
| `components/TriageStatusBar.vue` | Countdown (`role="timer"`), score, streak multiplier, mistakes and email number; announces 1 minute, 30 s and 10 s warnings.                    |
| `components/RoundFeedback.vue`   | Outcome of the previous round with the explanation. Emits `next` in practice; announced politely in timed runs.                                 |
| `components/TriageDebrief.vue`   | End-of-run totals, end reason and per-email review.                                                                                             |
| `components/triageLabels.js`     | Display names for email types and parts.                                                                                                        |
| `howToPlay.js`                   | Guide content: two steps (Play, Modes) and a one-line learn note.                                                                               |
| `components/HowToPlayScene.vue`  | Looping 9 s CSS-only replay preview, mounted only while the guide is open; static Report frame under reduced motion.                            |
| `phish.css`                      | Every style, scoped under `.phish-game`.                                                                                                        |

## State ownership

`useTriageRun()` owns everything outside the shared attempt: the countdown (`secondsLeft`, read from the snapshot's `deadlineAt` every 250 ms), the previous email kept for feedback, and `needsCompletion`, true when the server has no current email or the clock reached zero. All scoring state (score, streak, mistakes, current email, last outcome) comes from `snapshot.publicState`; the browser never computes a score. The part being picked (`picking`) and the practice feedback hold are local to `PhishingPostMortem.vue`.

## Saved attempts

A chooser (`AttemptContextChooser`) starts the attempt and the route keeps `?attempt=<id>`. Each call sends `triage-call` with `{ roundId, call, partId? }`. When time runs out, the third mistake lands or practice finishes, the composable completes the attempt, retrying briefly because the browser clock can run ahead of the server. A failed save shows Retry. Reopening an expired unfinished run completes and saves it. A completed attempt renders inside `SavedAttemptResult`. Attempts saved under `phish-2` show only a score summary with Play again.

## Design boundary

This module uses the DESIGN.md game exception: a system font stack, the town's green and cream and its own controls (tokens in DESIGN.md), rather than the hub's pixel scheme. Every rule in `phish.css` sits under `.phish-game`, with the palette defined as `--game-*` variables on that wrapper. The desk background, paper card and stamp are part of this game-local style and never change shared pages. Nothing touches `:root`, `html`, `body`, `.portal-shell`, the navbar or another module. The town building, its metadata card, the shared navbar and every shared page keep the hub pixel scheme.

## Accessibility

Parts of the email are buttons reached with Tab; Enter or Space selects, Escape cancels picking. Controls are at least 44px, the card is full width at 375px, and focus is always visible. Outcomes carry text as well as colour. The clock is a `role="timer"`, with polite screen-reader announcements at 1 minute, 30 seconds and 10 seconds, and round outcomes are announced in timed runs. Reduced motion turns off all motion: the desk background, email slide-in, stamp, tell pulse, timer drain, score count-up, multiplier pop, mistake shake, debrief stagger and the guide scene. The draining timer bar is a `role="progressbar"`; the Reported/Trusted stamp is decorative, and the outcome is also given in the feedback text.
