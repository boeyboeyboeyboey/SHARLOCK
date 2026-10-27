# Instructor account activation

## Presentation summary

- What it is: the public `/activate-account` page where an administrator-provisioned instructor sets a first password and activates the account.
- Security concept: single-use, expiring credentials delivered out of band, and account lifecycle control. Instructors cannot self-register; an administrator creates a disabled account and a 24-hour link, and the token is held only in memory and stripped from the address bar. Course link: authentication and identity (06-authentication v2.pptx) and web security (11a/12a decks) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: open the link from the administrator (`/activate-account#token=...`), enter and confirm a password, press "Set password and activate account", then use "Go to sign in". Activation does not sign you in.
- Components: `pages/ActivationPage.vue` (fragment cleanup, confirmation, request state, secret clearing); `api.js` (the POST and fixed error mapping).
- API: `POST /auth/activate-account` with exactly `{ token, password }` and a fresh CSRF token; the server consumes the token in a transaction (see the [recovery module](../../../../server/src/modules/recovery/README.md)). Nothing is stored in the browser.
- Status: see the ADMIN-01-A/REC-01-A records in [TASKS.md](../../../../TASKS.md).
- Limits: needs transaction-capable MongoDB; invalid, expired and used links share one generic message; no email delivery, so the administrator hands over the link privately.

The public `/activate-account` page completes an administrator-created instructor account. Router registration and the branded `PortalLayout` are shared integration points; the page's own styles remain under `.activation-workspace` and reuse the shared pixel colors, controls, and `PixelIcon`.

On entry, the page accepts only a 43-character base64url token from `#token=...`. It keeps the token in component memory and removes the fragment through the router before making any request. Tokens in a query string are rejected and removed. The instructor form collects a new password and a client-local confirmation, validates through the shared data-only `parseNewPasswordInput`, and posts exactly `{ token, password }` with a freshly obtained CSRF token. It never stores a token or password in the auth store or browser storage.

Success clears the token and password fields and offers normal sign-in; activation does not sign the instructor in automatically. If another account is already signed in, the page requires an explicit sign-out action before navigating to sign-in. Invalid, expired, and used links receive the same safe guidance. A failed or uncertain request is never replayed automatically. Leaving the page aborts its request; if departure occurs while CSRF preparation is pending, the activation POST is never dispatched.

`api.js` owns the activation POST and fixed error mapping. `ActivationPage.vue` owns fragment cleanup, password confirmation, request state, and secret clearing. Focused unit tests cover fragment removal, exact payloads, confirmation, validation, and secret cleanup.
