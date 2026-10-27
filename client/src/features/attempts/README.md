# Shared browser attempt flow

## Presentation summary

- Reusable browser integration for server-owned saved exercises
- Uses the existing Axios client, cookie session and CSRF token endpoint
- `AttemptContextChooser` emits `start(context)` for personal or eligible class practice; optional `label` (default "Save this case to") and `submitLabel` (default "Open the case") let each game set its wording
- Class choices come from authenticated `GET /api/attempt-contexts?page=1&limit=50`
- `useAttempt(gameId)` owns the snapshot, pending mutation, busy/error and retry state
- Mutations keep the original action ID, revision and payload until acknowledged
- A network failure blocks new mutations until the same request is retried
- `SavedAttemptResult` renders a confirmed completed score and emits `replay`
- Attempt IDs are carried in the activity URL; no auth tokens or game input enter local storage
- Scope and review evidence: [GAME-01-B / G-SQL](../../../../TASKS.md#g-sql-saved-practice)

## Contracts

`api.js` reuses `client/src/services/api.js`; no second Axios instance is created. Paths omit the `/api` prefix because it is already the base URL. Writes reuse a CSRF token cached in module memory (never browser storage), shared across concurrent first writes; a `CSRF_INVALID` rejection clears it, fetches a fresh one and retries that write once, and a 401 clears it. `useAttempt` supports start, read, action, completion and exact-request retry, and aborts outstanding requests on unmount. A failed start is not automatically replayed: the server start contract has no idempotency key, so a lost start response may leave an uncompleted attempt. No score or completed result is fabricated.

`AttemptContextChooser({disabled, label, submitLabel})` paginates current eligible classes and offers personal practice. `label` defaults to "Save this case to" and `submitLabel` to "Open the case"; CLI uses "Save this run to" / "Start the run" and Social uses "Save this call to" / "Start the call". The server rechecks permissions on start and every active request. `SavedAttemptResult({attempt})` has a default slot for game-owned explanation and emits `replay`; it displays saved confirmation only for a persisted completed result. These components use existing shared control classes; game wrappers own layout/style.

The canonical API, lifecycle and permission contract lives in the [server attempt README](../../../../server/src/modules/attempts/README.md). This slice does not add a history listing, teaching analytics, points store or leaderboard. Other games retain their existing contracts.

## Retained recovery limits

The current G-SQL screen offers a retry for uncertain action/completion writes, but no dedicated retry-load control when the initial attempt read fails before a snapshot exists. Creation is not idempotent; replaying a start is not equivalent to retrying an existing action. The proposed shared creation-reliability follow-up was cancelled before implementation. The [TASKS handoff record](../../../../TASKS.md#g-sql-saved-practice) retains these limitations and current review evidence.
