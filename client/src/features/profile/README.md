# Profile editing

## Presentation summary

- What it is: the `/profile` page where a signed-in learner changes their username and preset avatar.
- Security concept: input validation and preventing mass assignment. The client sends exactly `{ username, avatarId }`; the server validates, normalises and applies only those two fields, so email, role, membership and scores cannot be edited here. Course link: web security (11a, 12a decks) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: open Profile, press "Edit profile", change the username or avatar, save; Cancel discards the draft.
- Components: `ProfileEditor.vue` (draft values) reusing the shared `AvatarPicker`; `api.js` for `GET /me/profile` and `PATCH /me/profile` with a fresh CSRF token.
- Data: after saving, the auth store refreshes the session so the navbar shows the new identity; nothing is stored in the browser.
- Status: see the profile record in [TASKS.md](../../../../TASKS.md).
- Limits: only username and six preset avatars; no email or password change here (password recovery is a separate feature); signed-out visitors see sign-in prompts.

The existing `/profile` page lets a signed-in learner change only their username and one of the six preset avatars. `/progress` has its own page in `features/progress`. `ProfileEditor.vue` owns the temporary form values and reuses the existing `AvatarPicker` without changing its interface.

`api.js` uses the shared credentialed Axios client, whose base URL already includes `/api`. It reads `GET /me/profile` and sends `PATCH /me/profile` with exactly `{ username, avatarId }`, obtaining a fresh CSRF token before the mutation. The server response is expected to contain exactly `{ username, avatarId }`. Only safe, known feedback is displayed.

After a successful save, the page applies the returned identity immediately and calls the existing auth store's forced session refresh so the shared shell gets the current username and avatar. If that refresh fails, the page keeps the saved values and offers a separate retry. A failed save keeps the edit draft available for correction; Cancel discards it and returns focus to Edit profile.

The server owns authorization, exact-field validation, username normalization and uniqueness, and the avatar preset allowlist. The feature does not edit email, role, class membership, scores, awards or learning data. Its styles stay under `.profile-view` and use the existing shared design tokens.

## Wardrobe (SKIN-01)

`components/WardrobePicker.vue` sits after the profile overview on `/profile`. It loads `GET /me/wardrobe` through `api.js` (`getWardrobe`) and shows one fieldset per slot (scarf, hat, monocle, accessory) as radio swatches with a colour chip and the item name. Locked items are disabled and read "Locked: earn <achievement>". A change calls `PUT /me/wardrobe/:slot` (`equipWardrobeItem`, fresh CSRF token); only after the server accepts it does the picker update, announce "<item> equipped." in a polite live region and mirror the equipped ids into the auth store (`setWardrobe`). A failed save shows an error and returns the selection to the saved item. Chip colours come from `client/src/data/wardrobeLook.js`, which the 3D hub also reads. The server owns the catalog and unlock rules (`server/src/modules/wardrobe/README.md`); there is no 3D preview here.
