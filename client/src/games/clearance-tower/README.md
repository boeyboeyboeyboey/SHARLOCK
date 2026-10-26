# Clearance Tower — client module

## Presentation summary

- **What it is:** a puzzle game (G-CLEAR) where you design who may see what in a fictional intelligence tower, predict a few decisions, then watch the day test your policy.
- **Concept taught:** discretionary, Bell–LaPadula mandatory and role-based access control, including Trojan horses, tampering and separation of duties (CS440 07-access-control, slides 13–32).
- **How to play:** choose where to save the climb (personal practice or one of your classes), then run the six cases in any order. Each case runs once: read the dossier, set the policy, predict, run the day. **Finish climb** saves the total.
- **Scoring:** one attempt is one tower climb, up to 600 points (six cases of 100). Skipped cases score 0. The server scores every submission; the browser never decides an outcome.
- **Saved data:** the attempt stores each submitted policy and predictions; the day script, answers and explanations are returned only after a case is submitted. Class climbs appear on that class's practice leaderboard; personal climbs do not.
- **Technical:** `useClearanceTower()` wraps the shared `useAttempt('clearance-tower')`; `?attempt=<id>` resumes a climb. Server rules and endpoints: `server/src/modules/games/clearance-tower/README.md`.
- **Status and limits:** saved attempts (ruleset `clear-2`); see the TASKS.md SAVE-CLEAR record. Scores are exercise performance, not a validated mastery measure.

## Flow

```
ClearanceTowerGame.vue ── useClearanceTower() ── useAttempt('clearance-tower') ── /api/games/clearance-tower/attempts, /api/attempts/:id/…
   │                         phase, level, policy, predictions (attempt snapshot is the source of truth)
   ├─ AttemptContextChooser   start a climb (personal or class), ?attempt= replace/resume
   ├─ LevelSelect        cases       → openLevel(id)       submitted cases show their score and reopen as the stored day
   ├─ DossierBrief       brief       → showPhase('design')
   ├─ TowerView          design … debrief: floors, rooms, visitors, leak flags
   ├─ AccessMatrix / LabelBoard / RoleDesigner   design: edit the policy (v-model)
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
| `composables/useClearanceTower.js` | Wraps the shared attempt client; phase, open level, policy draft, predictions, submit and retry of the action.  |
| `composables/useDayPlayback.js`    | Which event of the day is showing; play, pause, step, skip and speed, with its timer cleared on unmount.        |
| `components/*.vue`                 | Presentational pieces with explicit props and emits; none of them call the API.                                 |
| `clearance.css`                    | Every rule scoped under `.clearance-game`, using the town's light palette and Pixelify Sans.                    |

## Boundaries

- A lost submit response is retried with the same action ID (**Retry same request**), so a case is never scored twice; resubmitting a case is rejected by the server.
- Separation-of-duties warnings in `RoleDesigner` are hints only; the server's check decides the score.
- Reduced motion turns off animations and autoplay, so players step through the duty log with **Next event**.
- Every control is a native button, select, checkbox or radio, so keyboard and touch work without drag gestures.

## Tests

`pnpm exec vitest run client/src/games/clearance-tower` and `tests/e2e/clearance-tower.spec.js` (includes the class climb to leaderboard journey).
