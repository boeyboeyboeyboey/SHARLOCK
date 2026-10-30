# Botnet Tag (server)

Server-authoritative infection tag for a class: 3 to 8 players (bots fill to 3), one Patient Zero (two at 7+), 3-minute rounds, patch-station puzzles grant 15 s immunity. Task record: G-TAG in [TASKS.md](../../../../TASKS.md). Stage 1 is the pure core (`arena`, `rules`, `puzzles`, `rounds`, `bots`); stage 2 is `socket.js`, `protocol.js` and `ruleset.js`. The client is a later stage.

## Connect

`GET /api/botnet-tag` upgrade, routed by `server.js` to `app.locals.botnetTag`. Same checks as presence (403 bad origin, 401 no session). A student is placed by the server in their active class and into an open lobby round (or a new one, cap 8); a student with no class is closed 4403. Staff send `join {cohortId}` first (instructor needs an active assignment, admin any active class), play flagged `isStaff`, and are never saved. One round per socket; one game socket per account (the newest closes the older with 4409).

Close codes: 4401 session ended (`replaced` after a newer login, SESS-01, or signed out), 4403 no class or class changed, 4408 too many bad messages, 4409 superseded, 1009 oversized.

## Protocol (JSON, 2304-byte frame cap)

Client to server, with per-second limits: `join {cohortId}` (staff only, 3), `ready {ready}` (5), `move {x,z,yaw}` (25), `sprint {}` (3), `tag {target}` (10), `station {id}` (5), `submit {submission}` (5, at most 2 KB), `leave {}` (3, closes the socket). Unknown, malformed or over-limit messages are dropped and count as strikes (30 in 10 s closes 4408). Moves, tags, sprints and puzzles are validated by the round rules, so a rejected move simply keeps the last accepted position.

Server to client: `snapshot` (`sid` is your per-connection id, plus the round snapshot: phase, players, stations, `you` with only your own puzzle) at 15 Hz while playing and at most 2 Hz in the lobby (also at once on join, ready, station and submit), `events` (tags, patches, start, end), `results` (all players' scores, no ids beyond the per-connection sid), `saved {saved, score?, maxScore?}` to each saved player. No email, user id or puzzle answer is ever sent.

## Saving

At round end the service calls `recordCompletedAttempt` once per human non-staff player: class context, mode `practice`, `resultKey` = round id + sid. Ruleset `botnet-tag@1` is server-recorded and noncompetitive, so no leaderboard. State is outcome, side won, survival seconds, patches, tags; the score is recomputed from them (survival seconds + 50 per patch + 30 per tag + 100 for the winning side). A player who disconnects before the round ends is not saved. A failed save sends `saved {saved:false}`; there is no retry.

## Limits and tests

One interval per live round, cleared when the round empties; `close()` stops everything. Tests use an injected clock, a parked tick (`tickAll`) and `inspectRounds` (test seams on the service). Unit: `server/tests/unit/botnet-tag`; integration: `server/tests/integration/botnet-tag/socket.test.js`.
