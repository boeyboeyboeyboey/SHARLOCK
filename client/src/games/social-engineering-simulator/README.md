# Help Desk Shift (Social Engineering Simulator) - client module

## Presentation summary

- What it is: G-SOC as a shift of 4 help desk calls. Some callers are attackers, about 40% are genuine.
- Concept taught: social engineering and impersonation, and verifying a request through independent records and a call back (course reference index in TASKS.md).
- How to play: choose where to save, take each call, chat, use Directory, Ticket and Call back, ask the colleague (2 per call) or Ask Sharlock (hint, minus 10), then Grant, Call back, Refuse or Escalate. A Tells debrief follows each call. Three strikes end the shift.
- Guide: a **How to play** button (and a first-visit dialog) with a code-built scene; text in `howToPlay.js`.
- Saved results: one practice attempt per shift (max 430) through the server `shift/*` routes, with a retry if saving fails. Class shifts reach the class leaderboard as untimed practice best scores.
- Technical: `SocialEngineeringSimulator.vue` uses `composables/useHelpDeskShift.js` and `simulator.js` (Axios plus CSRF); see the [server module](../../../../server/src/modules/games/social-engineering-simulator/README.md). Replies marked Scripted came from server templates, not a model; with no keys the whole shift is scripted.
- Audio: a synthesised phone ring on each call and shared `playSfx` sounds, both muted by the shared Sound off key.
- Status: task status lives in TASKS.md (SOC-02).
- Limits: messages are capped at 1000 characters; idle nudges are not used by the client; the live Gemini/Ollama path is not rehearsed yet.

## File map

- `SocialEngineeringSimulator.vue`: entry, routed at `/games/social-engineering-simulator`.
- `simulator.js`: API wrappers, decisions, tools and short error messages. `ring.js`: phone ring.
- `composables/useHelpDeskShift.js`: shift state and actions.
- `components/`: `ShiftStatus`, `CallerCard`, `ChatThread`, `MessageComposer`, `DeskTools`, `DecisionBar`, `TellsDebrief`, `ShiftSummary`, `HowToPlayScene`.
- `sim.css`: game-scoped styles. `__tests__/`: component, composable and how-to-play tests; the browser journey is `tests/e2e/social-engineering-simulator.spec.js`.
