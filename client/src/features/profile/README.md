# Profile editing

The existing `/profile` page lets a signed-in learner change only their username and one of the six preset avatars. `/progress` has its own page in `features/progress`. `ProfileEditor.vue` owns the temporary form values and reuses the existing `AvatarPicker` without changing its interface.

`api.js` uses the shared credentialed Axios client, whose base URL already includes `/api`. It reads `GET /me/profile` and sends `PATCH /me/profile` with exactly `{ username, avatarId }`, obtaining a fresh CSRF token before the mutation. The server response is expected to contain exactly `{ username, avatarId }`. Only safe, known feedback is displayed.

After a successful save, the page applies the returned identity immediately and calls the existing auth store's forced session refresh so the shared shell gets the current username and avatar. If that refresh fails, the page keeps the saved values and offers a separate retry. A failed save keeps the edit draft available for correction; Cancel discards it and returns focus to Edit profile.

The server owns authorization, exact-field validation, username normalization and uniqueness, and the avatar preset allowlist. The feature does not edit email, role, class membership, scores, awards or learning data. Its styles stay under `.profile-view` and use the existing shared design tokens.
