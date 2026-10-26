# CLI Cyber Defender — client module

Browser half of the `cli-cyber-defender` game (G-CLI), served at `/games/cli-cyber-defender` from the existing `cottage` building at (112, 112). Scoring and timing live on the server; see `server/src/modules/games/cli-cyber-defender/README.md`.

## Presentation summary

- **What:** a timed terminal game. Read a fictional security alert, then type the one command that contains it (`block ip`, `disable user`, `isolate host`). Eight challenges per shift, maximum 2,100 points.
- **Concept taught:** incident triage and containment (firewall blocking, account security, host isolation) with CIA-triad and attack-stage tags in every debrief; nothing real is ever executed.
- **How to play:** choose where to save the run (personal or a class), then **Start game** (10-15 seconds per challenge, pausable) or **Practice** (no timer, one hint per incident). Tap alert names or command templates on touch screens.
- **Technical points:** `CliDefenderGame.vue` → `useCliDefender.js` → `cliDefender.js`. Runs need a signed-in session and CSRF (via the shared `writeAttempt`); the server owns the timing and score. The shared `AttemptContextChooser` supplies the run context.
- **Saved runs:** a finished timed shift or a practice run is saved as an attempt on `/complete`; the debrief shows "Result saved to your account." or the save error with **Try saving again**. Timed class runs rank on the class Best board (Timed runs); practice counts toward the all-time view.
- **Status and limits:** record in TASKS.md (SAVE-CLI). Runs live in server memory with a 10-minute idle expiry, so an abandoned run is never saved. Rankings are practice evidence, not validated mastery.

## Data flow

`CliDefenderGame.vue` → `useCliDefender.js` → `cliDefender.js` (shared `services/api.js`) → Express router → service → in-memory run.

1. `BriefingPanel` first shows `AttemptContextChooser` (personal or a class), then states the player's role, plays `DemoTerminal` and offers **Start game** (confirmed in a "Ready to play?" `ConfirmDialog`) or **Practice (no timer)**. Starting emits `start(mode, context)` and the composable posts `{ mode, context }`, creates a run and prints the first challenge.
2. The player types a command, taps a command template, or taps a name in the alert to fill in the target. `help`, `history` and `clear` stay in the browser; everything else is posted with a fresh `actionId`. Enter is ignored while a command is in flight.
3. A 100ms interval only refreshes the displayed countdown from the server deadline, corrected by `serverNow`. When a window reaches zero, or the tab becomes visible again, the composable fetches a fresh snapshot instead of counting ticks.
4. After each closed challenge the terminal and `ReviewNote` show the correct command, why, and concept tags; `useCliDefender({ onEvent })` reports `alert`, `ok`, `fail` and `miss` so the screen can play `useCliSound` beeps, a keyed flash/stamp overlay and a shake.
5. In a timed game, hiding the tab or choosing **Pause** in `GameMenu` freezes the server clock. `PausedPanel` covers the full-size console (the alert and terminal stay mounted but hidden and inert) until **Resume game**. Practice never pauses.
6. **Leave game** confirms that points won't be saved and returns to the briefing; in a timed game the clock pauses while the dialog is open. **End practice** finishes a practice game early.
7. When no challenge remains, the composable requests the debrief. `ShiftDebrief` shows summary tiles, a topic table and collapsible incidents; the result shows "Result saved to your account." or the server's `saveError` with **Try saving again** (`retrySave` calls `/complete` again); **Play again** restarts the same mode and context and **Main menu** returns to the briefing.

## Components

| Component              | Props                                                                                                                                                                  | Emits                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `BriefingPanel.vue`    | `{ pending, error }`; owns the context step and the Ready-to-play dialog                                                                                               | `start(mode, context)`                            |
| `DemoTerminal.vue`     | `{ typeMs }`: looping demo with demo-only incidents; pauses off-screen or in a hidden tab, still frame for reduced motion                                              | —                                                 |
| `ConfirmDialog.vue`    | `{ open, id, title, confirmLabel, cancelLabel }`; native modal dialog, default slot for the message                                                                    | `confirm`, `cancel`                               |
| `GameMenu.vue`         | `{ canPause, paused, canEnd, soundOn, soundUnavailable }`: in-game dropdown replacing Back to town                                                                     | `pause`, `resume`, `toggle-sound`, `end`, `leave` |
| `ScoreHud.vue`         | `{ score, streak, multiplier, remainingMs, resolvedCount, total, mode, history, currentIndex }`: score, streak meter, window and Challenge n / 8 with an outcome track | —                                                 |
| `IncidentBanner.vue`   | `{ incident, remainingMs, mode, interactive, canHint, hintDisabled }`: alert with tappable names, countdown and practice hint                                          | `select-target(target)`, `hint`                   |
| `ReviewNote.vue`       | `{ review }`: correct command, explanation and tags for the last closed challenge (wide screens)                                                                       | —                                                 |
| `ConceptTags.vue`      | `{ concepts }`: attack type, CIA property at risk, response stage                                                                                                      | —                                                 |
| `TerminalPanel.vue`    | `{ lines, disabled, busy, modelValue, history, maxLength }`; exposes `focus()`                                                                                         | `submit-command`, `update:modelValue`             |
| `CommandReference.vue` | `{ disabled }`: command templates under the prompt                                                                                                                     | `insert-template(template)`                       |
| `PausedPanel.vue`      | `{ pending }`; focuses Resume game on mount                                                                                                                            | `resume`                                          |
| `ShiftDebrief.vue`     | `{ result, saving }`                                                                                                                                                   | `replay`, `menu`, `retry-save`                    |
| `CliIcon.vue`          | `{ name, size }`: original line icons drawn with `currentColor`, always decorative beside text                                                                         | —                                                 |

## Design and accessibility

The game uses the DESIGN.md game exception: an original green/amber-on-black terminal set in Silkscreen (headings, stats, stamps) and Azeret Mono (body and terminal text), both SIL Open Font License, imported from Google Fonts in `cli.css` with a system monospace fallback and ligatures off. Every rule in `cli.css` is under `.cli-game` with `--game-*` variables; nothing targets `:root`, `body`, the navbar or another module. The town building, metadata card and shared pages keep the hub pixel scheme.

- Layout uses the Bootstrap grid (status tiles 2 then 4 columns from `md`; briefing lists side by side from `lg`; alert beside the terminal from `xl`). Container queries size the command templates, the prompt (`$` only when narrow) and the briefing lists by their own width, so labels never wrap mid-word. The terminal scrolls inside a fixed height so the prompt never moves.
- Bootstrap `.btn`, `.badge`, `.progress` and `.visually-hidden` are re-themed through their `--bs-*` variables under `.cli-game`; `.portal-shell .btn` has equal specificity, so the game styles win because `cli.css` loads after `main.css`.
- The terminal output is a `role="log"` live region; outcomes are written as `[ OK ]`, `[FAIL]`, `[MISS]` text and stamps, never colour alone. The countdown is hidden from assistive technology and the window length is announced once per challenge.
- `GameMenu` follows the menu-button pattern (`aria-haspopup`, arrow keys, Escape returns focus, outside click closes); `ConfirmDialog` uses the native modal so focus stays inside and Escape cancels.
- Up/Down recall earlier commands; template, chip and menu targets are at least 34–48px tall; the input disables autocorrect and autocapitalisation.
- Animations (alert entry and typing, line fade-in, stamps, flash/shake, score count-up, icon pops, radar sweep, confetti, demo loop) are limited to moments that mean something, and reduced motion turns all of them off along with the scanlines. Sound is generated with Web Audio, off on every visit, and the context is closed on unmount.
- All requests are aborted and the interval, `visibilitychange` and outside-click listeners removed on unmount.
- A signed-out request (401) shows "Your session ended. Sign in again to play."
