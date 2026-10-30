# Botnet Tag (client)

Browser half of `botnet-tag` (G-TAG), served at `/games/botnet-tag` from the "Server Yard" warehouse: east lane of the 3D wharf at (40, 20.5), and a `warehouse` building at (240, 600) in the 2D town. The server rules are in [server/src/modules/games/botnet-tag/README.md](../../../../server/src/modules/games/botnet-tag/README.md).

## Presentation summary

- **What:** infection tag for a class. 3 to 8 players (bots fill to 3), one Patient Zero tags survivors into the botnet, survivors patch stations for 15 s of immunity, 3-minute rounds.
- **Concept taught:** how worms and botnets spread and why patching and filtering stop them (CS440 `10-software-security.pptx` worms, `1-basics.pptx` botnets, `09a-network-security.pptx` firewalls; the patch tasks themselves are a team design).
- **How to play:** open Botnet Tag, press Ready in the lobby; when everyone is ready a 10 s countdown starts. Results show the winning side and your score, with Play again or Leave.
- **3D only:** the catalog entry sets `needs3d`, so the 2D card and the Places row show a "3D" badge. Without WebGL2 the page shows "Needs 3D" and Back to town; the 2D town setting does not block it.
- **Technical points:** `BotnetTagGame.vue` composes `TagLobby`, `TagHud`, `TagResults` and `NeedsThreeD` over `useTagSocket.js`, which speaks the server's JSON protocol on `/api/botnet-tag` (reconnect with backoff, close codes 4401/4403/4408/4409, moves capped at 20 per second). The `tag-arena` element is the empty mount point for the 3D arena. Rules helpers are in `tagRules.js`; styles are scoped to `.botnet-tag-game` in `tag.css`.
- **Saving:** the server saves one practice attempt per human non-staff player at round end; the results screen shows the saved score. No leaderboard.
- **Staff:** instructors and administrators pick a class first, play flagged as staff and are never saved.
- **Status:** in progress (TASKS.md, G-TAG). Stage 3a is the shell: lobby, results and a HUD skeleton wired to live state. The 3D arena, patch-station puzzles, How to play, audio and achievements come next.
- **Limits:** no movement or tagging UI yet, so a round started now only shows the HUD; the HUD has no sprint or jump buttons.
