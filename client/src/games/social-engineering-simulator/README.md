# Social Engineering Simulator - client module

## Presentation summary

- What it is: G-SOC, a chat where a fictional colleague pressures the player to hand over a synthetic reset code, then the player picks a decision.
- Concept taught: social engineering and impersonation, and verifying a request through an independent channel (see the course reference index in TASKS.md).
- How to play: choose where to save the run (personal practice or a class), read the brief, chat with the contact, optionally message a real colleague in a second tab, then choose "Refuse and end", "Verify through a known channel" or "Share the code".
- Saved results: the shared `AttemptContextChooser` runs before the briefing and its context is sent when the session starts. The server scores the run and saves it as an attempt, so class runs reach that class's leaderboard (untimed, practice best scores). The debrief shows "Result saved to your account." or the save error with "Try saving again", which asks the server to complete the same decision again.
- Technical: `SocialEngineeringSimulator.vue` uses `composables/useSocialEngineeringSession.js` and `useVerifierChat.js`; `simulator.js` posts through the shared Axios client with a CSRF token on every request (see the [server module](../../../../server/src/modules/games/social-engineering-simulator/README.md)). Chat replies come from an LLM on the server.
- Status: playable with saved results (SAVE-SOC); task status lives in TASKS.md.
- Limits: messages are capped at 1000 characters; a finished run can be re-saved for only a few minutes; the E2E spec stubs chat replies in the browser (no model on the test server) and covers start, complete, save and leaderboard only.

## File map

- `SocialEngineeringSimulator.vue`: game entry, routed at `/games/social-engineering-simulator`.
- `simulator.js`: API wrappers, decision list and limits.
- `composables/`: session state and the real-colleague chat state.
- `components/`: `ScenarioBrief`, `ConversationTabs`, `ChatThread`, `MessageComposer`, `DecisionBar`, `DebriefPanel`.
- `sim.css`: game-scoped styles.
- `__tests__/`: component, session and verifier tests; the browser journey is `tests/e2e/social-engineering-simulator.spec.js`.
