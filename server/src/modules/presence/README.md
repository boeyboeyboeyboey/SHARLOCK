# Presence

MP-01 stage A (server). Live positions of classmates on the 3D wharf over one WebSocket, `ws` 8.22.0 (MIT, pinned exact). Stage B (client) is separate. See the MP-01 record in [TASKS.md](../../../../TASKS.md).

## Connect

`GET /api/presence` upgrade, attached to the HTTP server by `server.js` (`app.locals.presence.handleUpgrade`); any other upgrade path is destroyed. Checks run before the handshake and refuse with a bare status and no body:

| Status | Cause                                                                                   |
| ------ | --------------------------------------------------------------------------------------- |
| 403    | Origin (or Referer fallback) is not the configured client origin (`hasExpectedOrigin`)  |
| 401    | no valid `sharlock.sid` session, expired session, or `findActiveSessionUser` finds none |

The session is read through the existing auth session middleware and store (`resolveSessionUser`, `recheckSession` from the auth router); there is no second session system. After the handshake a student with no active class is closed with code 4403 (the client retries slowly so an approval is picked up without a reload).

One presence per account: when a user's new socket registers, every older socket of that user leaves its room at once (classmates get `leave`) and is closed with 4409 `superseded`. The newest tab wins, so there is no per-user connection cap and no ghost peer for a second tab; the client treats 4409 as final and does not reconnect.

| Close code | Meaning                                               |
| ---------- | ----------------------------------------------------- |
| 4401       | session or account ended (`replaced` or `signed out`) |
| 4403       | no active class, class changed or class not available |
| 4408       | too many bad messages                                 |
| 4409       | superseded by a newer socket of the same account      |

## Rooms

A room is a class (cohort) id. A student is placed by the server in their active membership whose class and institution are active; with several (legacy data) the most recently approved wins. Staff (instructor or admin role) are labelled `role: "staff"`, start roomless and must send `join` first: an instructor needs an active assignment to an active class, an admin may join any active class. A failed join closes the socket with 4403. Students cannot join; the message counts as a bad message.

## Wire protocol (JSON, 256-byte cap)

- client to server `{"type":"move","x":n,"z":n,"yaw":n,"moving":bool}`: x clamped to -60..70, z to -90..80, yaw wrapped to (-pi, pi], rounded to 3 dp; at most 10 per second per connection, faster ones are dropped.
- client to server `{"type":"move","mode":"2d","x":n,"y":n,"moving":bool}` (TOWN-03 stage 3, the 2D town): x clamped to 0..1120, y to 0..800 world px, `moving` optional (default false); same 10 per second limit. A connection starts in `3d`; its first move in another mode switches it and re-sends it a `snapshot`. Any other `mode` value is a bad message.
- client to server `{"type":"join","cohortId":"<24 hex>"}`: staff only, first message.
- server to client `{"type":"snapshot","you":sid,"mode","peers":[state...]}`: on entering a room and after a mode switch; peers that have moved at least once, shaped for the receiver's mode as above.
- server to client `{"type":"state","sid","username","avatarId","look","role","mode","x","z","yaw","moving"}`: after a valid move from another member of the room. A 2d peer carries `x`,`y`,`moving` instead of `z`,`yaw`. Positions go only to viewers in the same mode; a viewer in the other mode gets the same state with `mode` but no coordinates (`moving` false), so it still counts the classmate online without seeing where they are.
- server to client `{"type":"leave","sid"}`: a member left the room or disconnected.

`sid` is random per connection. `look` is `{scarf,hat,monocle,accessory}` catalog item ids from `look.js`. Emails, user ids and rosters are never sent. Invalid JSON, unknown types and bad fields are ignored; 30 bad messages in 10 s close the socket (4408), an oversized frame closes it (1009).

## Limits and lifecycle

- One socket per account (MP-02 removed the old 3-connection cap); a ping every 30 s, terminate on a missed pong.
- Every 60 s each connection rechecks its session, account and room access; failure closes with 4401 (session or account) or 4403 (class).
- Logout emits `session-ended` from the auth router and closes that session's sockets at once (4401). A newer login by the same account (SESS-01) emits it for every older session, so those sockets close with 4401 and close reason `replaced` (other 4401 closes use `signed out`). Only `replaced` makes the hub show `/login?reason=elsewhere`; other 4401 closes show the `expired` notice. A membership decision (`cohorts` `decide`) calls `presence.refresh()` straight away; other class changes are caught by the 60 s recheck.
- Idle HTTP sessions still expire after 30 minutes (the socket does not extend them), so a long-idle tab is closed with 4401.
- `shutdown()` closes every client and the server; `disposeAuth` does the same for tests.

## Files

`protocol.js` (validation, bounds, rate rule), `look.js` (public outfit), `rooms.js` (class lookups), `service.js` (upgrade, rooms, timers). Tests: `server/tests/unit/presence/`, `server/tests/integration/presence/`.
