# Student password recovery

## Presentation summary

- What it is: student password recovery. Staff issue a one-time reset link for an eligible student; the student opens `/reset-password` to choose a new password.
- Security concept: account recovery without enumeration or recoverable passwords. Staff attest that identity was verified outside the app; the token is random, expiring, single-use and stored only as a hash; a reset revokes sessions and requires normal sign-in. Course link: authentication and identity (06-authentication v2.pptx) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: staff look up an active student by email (admin workspace) or pick the student in their assigned class, confirm identity was verified and deliver the link privately; the student sets a password and signs in.
- Components: `RecoveryStudentLookup`, `RecoveryIssueForm`, `RecoveryLinkDialog` and the public `ResetPasswordForm`; `api.js` validates response shapes and same-origin reset URLs.
- API and data: the client sends `{ identityVerified: true }` to issue and the token plus new password to reset; tokens live in memory, are cleared on close and never stored.
- Status: see the REC-01-B record in [TASKS.md](../../../../TASKS.md).
- Limits: pure students only (staff and dual-role targets excluded); no email delivery; emergency recovery is deferred; needs transaction-capable MongoDB.

The recovery feature keeps staff lookup, issuance, public reset forms, and their styles inside this module. The admin workspace looks up an active student by exact email. A pure instructor can issue a link for an active student in the selected assigned class; admin-role accounts use the admin workspace instead. The server remains authoritative for role, class, membership, and account eligibility.

Staff attest that they verified the student's identity through a school channel. The client sends only `{ identityVerified: true }` when issuing. It presents the one-time link in a dialog for private delivery, clears it when the dialog closes or its host page leaves, and never sends it to email or SMS.

The public `/reset-password` route captures a strict token fragment in module memory and replaces the URL before session restoration. It rejects query tokens and malformed fragments. The reset form requires a signed-out session, posts the token and chosen password, clears its secrets, and sends the student to ordinary sign-in after a successful response. It does not persist the token or create a signed-in session.

The API wrapper uses the shared `/api` client and a fresh CSRF token for each mutation. It validates response DTOs and same-origin reset URLs and maps server failures to allowlisted messages. Server-side policy enforces password length from 12 through 128 code points and composition; public guidance displays the minimum only.

## Current browser verification

REC-01-B is in Review; current verification and acceptance status are tracked in [TASKS.md](../../../../TASKS.md). The guarded browser journey passed in separate fresh runs for each project:

```sh
pnpm test:e2e --replica-set tests/e2e/recovery.spec.js --project=mobile-chromium --reporter=list --workers=1
pnpm test:e2e --replica-set tests/e2e/recovery.spec.js --project=desktop-chromium --reporter=list --workers=1
```

Each project passed **2/2**. Separate runs avoid cross-project interference from the shared request budget. The four role journeys cover responsive layouts, fragment scrubbing before requests, signed-out gating, one-time-link cleanup, GET non-mutation and generic invalid-link handling. Traces, screenshots and videos were disabled, and run contexts were removed.
