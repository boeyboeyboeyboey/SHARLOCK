# Admin workspace

## Presentation summary

- What it is: the `/admin` workspace for administrators to create institutions and classes, provision instructors, assign them to classes, manage account status, read audit events and start student password recovery.
- Security concept: role-based access control and least privilege with accountable administration. The route requires a freshly verified admin; the server re-checks role on every call, never accepts a submitted role, and writes metadata-only audit events. Course link: access control (07-access-control.pptx) and authentication (06-authentication v2.pptx) in the [course reference index](../../../../TASKS.md#course-reference-index).
- Using it: sign in as an administrator, open Admin workspace, create an institution then a class, use "Provision an instructor", copy the one-time activation link from the dialog and deliver it privately, then "Save assignments" once the instructor has activated.
- Components: `pages/AdminPage.vue` plus `InstitutionCohortForm`, `InstructorProvisionForm`, `AssignmentEditor`, `ActivationLinkDialog`, `AccountStatusPanel` and `AuditEventsPanel`; `api.js` wraps the admin endpoints.
- Data: sends only `{ name, slug }`, `{ institutionId, name, term }`, `{ email, username, avatarId }` and `{ cohortIds, expectedRevision }`; edits use `expectedRevision` to reject stale writes. Activation links are shown once and cleared on close.
- Status: see the ADMIN-01-A, REC-01-A and LOG-01-A records in [TASKS.md](../../../../TASKS.md).
- Limits: needs transaction-capable MongoDB; existing users are never promoted; no student enrolment or learning dashboard here (see the cohorts and class-results modules); no demo fixtures.

The `/admin` utility page replaces the earlier preview in place. It uses the shared admin API and the existing `PortalLayout`, pixel tokens, `PixelIcon`, and `AvatarPicker`; router registration, account guards, and the role-aware navigation entry are shared integration points.

## Administrator flow

The page requests institutions, classes, and instructors with bounded pages. An administrator creates an institution, selects it to create a class, provisions a separate disabled instructor, and privately delivers the single-use activation link. Disabled instructors can receive a replacement link; active instructors can be assigned to active classes.

Institution and class creation send only `{ name, slug }` and `{ institutionId, name, term }`. Existing institutions can be edited by name or deactivated/reactivated; their IDs and slugs remain fixed. Existing classes can be edited by name/term or deactivated/reactivated; their IDs and parent institutions remain fixed. Edits use an `expectedRevision` and stale revisions require a reload. A class can be reactivated only while its institution is active; an institution can be deactivated only when all its classes are inactive. Class deactivation preserves memberships, instructor assignments, and history, but revokes its invitation; reactivation requires a new invitation. Reactivating an institution does not change class statuses.

Instructor provisioning sends only `{ email, username, avatarId }`; confirmation and passwords are never collected here. Assignment updates send `{ cohortIds, expectedRevision }`. New assignment choices require an active class in an active institution. Previously assigned inactive classes remain visible as read-only retained assignments and stay in the save payload. A stale assignment revision preserves the local draft and waits for the administrator to reload before another save. Lists use 20 items by default; assignment options request at most 50 classes at a time.

The read-only audit viewer filters by event type and optional browser-local date bounds. Leaving either date empty lets the server apply its current 90-day window on each request. Results show readable event, outcome, and time labels, with identifiers available on expansion; there is no export or name lookup. Pagination requests 25 rows at a time (up to 50).

Account controls list only pure student or instructor accounts and support role/status filters. Administrators and mixed-role accounts are excluded. Administrators can enable or disable students and disable active instructors; a disabled instructor must use the existing private activation-link flow to regain access. Disabling an account preserves memberships/assignments while revoking its active sessions and outstanding activation/recovery links. This page does not edit roles, passwords, or credentials.

Each mutation obtains a fresh CSRF token and is sent once. Safe API errors use fixed local messages; raw response text is not rendered. The activation URL is validated as a same-origin `/activate-account` link with a 32-byte base64url token in its fragment and no query string. It exists only in component memory and the open dialog; closing the dialog removes it from the page. The copy action runs only from an explicit button press.

`api.js` owns the shared Axios calls and safe error mapping. `AdminPage.vue` owns request lifetimes, paginated lists, mutation state, and the one-time link. `InstitutionCohortForm`, `InstructorProvisionForm`, and `AssignmentEditor` keep their editable inputs local and emit only the approved fields. `AuditEventsPanel` and `AccountStatusPanel` own their focused filters, result states, and controls. `ActivationLinkDialog` presents and clears the private link. `admin.css` scopes every rule under `.admin-workspace`.

Focused mounted tests live in `__tests__/admin.test.js`. The real admin-to-instructor journey is in [`tests/e2e/admin-workspace.spec.js`](../../../../tests/e2e/admin-workspace.spec.js) and uses the guarded synthetic admin fixture. The workspace operates on the normal database when used normally; test fixtures are restricted to disposable `_test` databases.
