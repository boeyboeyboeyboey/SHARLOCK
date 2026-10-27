# Profile editing

This module lets an authenticated account read and update its own username and preset avatar. It reuses the existing User model, cookie session, current-account checks, username policy, avatar allowlist, and CSRF/origin middleware. It creates no profile collection, learning records, audit events, or credentials.

## Routes

| Method | Path                          | Input                            | Response                                |
| ------ | ----------------------------- | -------------------------------- | --------------------------------------- |
| GET    | `/api/me/profile`             | Empty query                      | `{ username, avatarId }`                |
| PATCH  | `/api/me/profile`             | Exactly `{ username, avatarId }` | `{ username, avatarId }`                |
| PUT    | `/api/me/how-to-play/:gameId` | Exactly `{ dismissed: boolean }` | `{ howToPlayDismissed: [gameId, ...] }` |

The server derives the actor from the authenticated session. The request cannot select a user ID or edit email, roles, account status, password, class memberships, scores, or achievements. PATCH requires the existing expected-origin and CSRF checks.

## Validation and storage

Username validation reuses the account policy: trim the value, retain the submitted case for display, accept 3–32 ASCII letters, digits, underscores, or hyphens, and compare the lowercase normalized value through the existing unique index. The avatar must be one of the six server-owned preset IDs. Unknown, prototype, dotted, operator, and otherwise unapproved fields are rejected.

Updates write only `username`, `usernameNormalized`, and `avatarId` for the current active account and session version. A unique-index race returns the same generic conflict response without exposing database index details. The response serializes only username and avatarId. Learning titles and points remain part of a later learning feature.

## How to play dismissals

`PUT /api/me/how-to-play/:gameId` stores whether the signed-in account hid a game's How to play dialog (HOW-01). `gameId` must be one of the five scored game ids in `how-to-play.js` (Threat Briefing is excluded); an unknown id or any body other than exactly `{ dismissed: boolean }` returns the module's `VALIDATION_ERROR` and never reaches MongoDB. It needs the same session, CSRF and expected-origin checks as PATCH. The update uses `$addToSet` (true) or `$pull` (false) on `User.howToPlayDismissed`, filtered by the actor's `_id`, active status and auth version, so repeating a call is harmless. The response is `{ howToPlayDismissed }` with `Cache-Control: no-store`, and `/api/auth/me` returns the same list on the user DTO. The profile PATCH allowlist is unchanged. A unit test checks that the id list matches the attempts production registry.
