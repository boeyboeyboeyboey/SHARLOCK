# Clearance Tower — client module

## Presentation summary

- **What it is:** a puzzle game (G-CLEAR) where you design who may see what in a fictional intelligence tower, predict a few decisions, then watch the day test your policy.
- **Concept taught:** discretionary, Bell–LaPadula mandatory and role-based access control, including Trojan horses and tampering (CS440 07-access-control, slides 6, 13–32 and 34–38; slides 18–19 are non-examinable background). Separation of duties is a team design built on the roles on slide 36.
- **How to play:** a How to play guide opens on your first visit (**How to play** reopens it; "Don't show again" is saved to your account). Choose where to save the climb (personal practice or one of your classes), then run the six cases in any order. Each case runs once: read the dossier, set the policy, predict, run the day. On the policy desk, **Hint** shows which principle to check and **Another hint** explains it for that case; each costs 10 points and the cost is shown on the button. **Finish climb** saves the total; with cases still unplayed it asks for a second press, because finishing closes the climb. An unsubmitted policy and calls survive a reload in the same tab, and the desk says when they were restored.
- **Scoring:** one attempt is one tower climb, up to 600 points (six cases of 100, all reachable). No leaks 40 (any leak loses the whole row), work 30, least privilege 15, predictions 15; Bell–LaPadula cases drop least privilege and score predictions out of 30. Below three quarters of the work the security rows shrink, so a policy that denies everything earns 15, not 70. "The Gift" scores work out of 7 tasks because every fix blocks 3, so fixing it earns 100 and leaving it unchanged 60. A topic is only achieved when both its cases reach 75 with no leaks. Skipped cases score 0. Each hint taken takes 10 points off that case (never below 0, at most two per case); the case file shows "Hints: n (−X)". The server scores every submission; the browser never decides an outcome.
- **Saved data:** the attempt stores each submitted policy and predictions; the day script, answers and explanations are returned only after a case is submitted. Class climbs appear on that class's practice leaderboard; personal climbs do not.
- **Technical:** `useClearanceTower()` wraps the shared `useAttempt('clearance-tower')`; `?attempt=<id>` resumes a climb. Server rules and endpoints: `server/src/modules/games/clearance-tower/README.md`.
- **Status and limits:** saved attempts (ruleset `clear-4`; `clear-2` and `clear-3` climbs still score and read under their own rules); see the TASKS.md SAVE-CLEAR record. Scores are exercise performance, not a validated mastery measure.

## Flow

```
ClearanceTowerGame.vue ── useClearanceTower() ── useAttempt('clearance-tower') ── /api/games/clearance-tower/attempts, /api/attempts/:id/…
   │                         phase, level, policy, predictions (attempt snapshot is the source of truth)
   ├─ HowToPlayDialog    shared guide, game text in howToPlay.js, scene in components/HowToPlayScene.vue
   ├─ AttemptContextChooser   start a climb (personal or class), ?attempt= replace/resume
   ├─ LevelSelect        cases       → openLevel(id)       submitted cases show their score and reopen as the stored day
   ├─ DossierBrief       brief       → showPhase('design')
   │                     an unsubmitted case restores its draft from clearanceDraft.js (sessionStorage, this tab only)
   ├─ TowerView          design … debrief: floors, rooms, visitors, leak flags
   ├─ AccessMatrix / LabelBoard / RoleDesigner   design: edit the policy (v-model)
   ├─ HintPanel          design: takeHint() → action request-hint, shows the hint text and its cost
   ├─ PredictionPanel    predict     → runDay()            action submit-level
   ├─ DayControls + EventLog   day: useDayPlayback() steps through result.events
   ├─ LevelDebrief       debrief     → next case / all cases
   └─ SavedAttemptResult after Finish climb (complete): score of 600 and a per-case summary
```

## Files

| File                               | Responsibility                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ClearanceTowerGame.vue`           | Root: chooser, resume, picks the component for each phase, starts playback and moves focus to each new heading. |
| `clearanceTower.js`                | Small pure helpers for wording and immutable policy updates (no requests).                                      |
| `composables/useClearanceTower.js` | Wraps the shared attempt client; phase, open level, policy draft, predictions, submit, retry and reload.        |
| `composables/clearanceDraft.js`    | Per-tab drafts of unsubmitted policies and calls; shape-checked on read and removed once scored or saved.       |
| `composables/useDayPlayback.js`    | Which event of the day is showing; play, pause, step, skip and speed, with its timer cleared on unmount.        |
| `components/HowToPlayScene.vue`    | Code-built animated mini matrix, log and score for each guide step; static under reduced motion.                |
| `components/HintPanel.vue`         | Costed hint button (Hint, Another hint, No more hints) and the hint text taken so far; emits `request`.         |
| `components/*.vue`                 | Presentational pieces with explicit props and emits; none of them call the API.                                 |
| `howToPlay.js`                     | Steps, learning line, rules and controls passed to the shared `HowToPlayDialog` (HOW-01).                       |
| `clearance.css`                    | Scoped under `.clearance-game`; town light palette, DotGothic16 body, Pixelify Sans headings (FONT-06).         |

## Boundaries

- A lost submit response is retried with the same action ID (**Retry same request**), so a case is never scored twice; resubmitting a case is rejected by the server.
- A non-retryable error (stale revision from another tab, ended session) offers **Reload climb** and **Sign in**; a case that already ran elsewhere returns to the case list. An attempt that is neither active nor completed shows "This climb has ended".
- Drafts hold only the player's own unsubmitted choices, never auth state, answers or scores; the server still validates and scores every submission.
- Separation-of-duties warnings in `RoleDesigner` are hints only; the server's check decides the score.
- Reduced motion turns off animations and autoplay, so players step through the duty log with **Next event**. Turning it on mid-day pauses a running day.
- Every control is a native button, select, checkbox or radio, so keyboard and touch work without drag gestures. Role badge checkboxes sit in 44px labels. Buttons that wait on a request use `aria-disabled`, so keyboard focus is not lost.
- The duty log shows a step after a blocked one as "not reached"; the floor plan leaves it out.

## How to play

`useHowToPlay('clearance-tower')` opens the dialog on mount unless `user.howToPlayDismissed` includes the game; the checkbox calls the auth store's `setHowToPlayDismissed`, which saves through `PUT /api/me/how-to-play/clearance-tower`. The dialog's `--game-howto-*` variables map to the game's `--game-*` tokens in `clearance.css`.

## Tests

`pnpm exec vitest run client/src/games/clearance-tower` and `tests/e2e/clearance-tower.spec.js` (includes the class climb to leaderboard journey).
