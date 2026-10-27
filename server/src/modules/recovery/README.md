# Instructor activation and student recovery

REC-01-A implements activation for newly provisioned, disabled accounts with exactly the instructor role. REC-01-B provides approved student-only staff-assisted password recovery; its current implementation and verification status are tracked in [TASKS.md](../../../../TASKS.md). Emergency administrator maintenance and recovery for staff or dual-role accounts remain excluded.

## Issue and consume

The [admin service](../admin/README.md) calls `issueActivation({ userId, actorId }, { session })` inside its existing transaction. Recovery rechecks an active administrator and a disabled instructor or administrator (ADMIN-03; the role comes from the stored account, never the request), records it as `activationRole` on the token record, increments the target's auth version, revokes earlier outstanding activation records and creates a 24-hour record with only a SHA-256 hash of a cryptographically random 32-byte token. The response contains a once-visible trusted-origin `/activate-account#token=...` URL. It uses the validated localhost client origin, never a request Host header. Redemption requires the account to still hold exactly the role stored on the token (legacy tokens without one mean instructor), so a role change after issue fails closed. The audit event is `account.instructor.activate` or `account.administrator.activate`. No email service or normal-data demo seeding is involved.

`POST /api/auth/activate-account` accepts exactly `{ token, password }`, an empty query, an expected origin and the existing session's CSRF token. The public browser page removes the fragment before account restoration or API requests; confirmation stays local. An IP gate allows 10 requests per 15 minutes. No GET consumes a link, and activation does not establish an authenticated session.

The service checks the token hash/expiry before bounded Argon2id work, then conditionally consumes the still-valid record in a transaction. It rechecks the disabled instructor's role and bound auth version, sets the new password hash, activates the account, increments its auth version, revokes other activation records, removes existing target sessions and writes a metadata-only success audit. All changes commit together; an audit failure rolls them back. Snapshot/majority transactions have a ten-second timeout and a five-second commit bound. Expiry is enforced by the transaction; TTL cleanup is housekeeping. Invalid, expired, superseded, consumed and role/version-stale links receive the same safe unavailable response. An uncertain failure returns fixed guidance without secrets.

## Storage and integration

`PasswordReset` owns `password_resets` with a unique token-hash index, expiry TTL index and user/purpose/status index. Fields are user ID, activation or student-password-reset purpose, token hash, bound auth version, initiator, optional cohort scope, and creation/expiry/consumption/revocation timestamps. Startup explicitly creates this collection and its indexes without inserting records or modifying existing accounts. Plaintext tokens/passwords never enter persistent storage, audit metadata or response errors.

The auth router mounts activation under its existing Mongo session, no-store, origin and CSRF runtime. The frontend is feature-owned under [`client/src/features/activation/`](../../../../client/src/features/activation/README.md). No game, shared palette, private environment or dependency change is required.

The token lifecycle, normal sign-in afterward and session invalidation follow [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), checked on 15 October 2026. The 24-hour lifetime and private manual delivery are this project's approved instructor-activation choices; this is not a general forgot-password service.

## Student-only staff-assisted recovery (REC-01-B)

Admin-role issuers, including admin/instructor accounts, use the admin area and require `admin:recovery:manage`; they may assist any active pure student. The exact-email lookup is `POST /api/admin/recovery/lookup { email }`, returning a minimal student DTO or `null`. Instructor roster issuance is `POST /api/cohorts/:cohortId/students/:studentId/recovery { identityVerified: true }`; only an active instructor without the admin role may use it, and the student must have active membership in that instructor's assigned active class at an active institution. Admin issuance is `POST /api/admin/users/:userId/recovery { identityVerified: true }`. Both issue routes return `{ resetUrl, expiresAt }` once. Staff verify identity through a school channel outside the app; the checkbox records attestation only. Staff privately deliver the link, and the student chooses the password. Staff and dual-role targets are rejected; emergency recovery remains deferred.

Student reset tokens use purpose `student-password-reset`, 32 random bytes encoded as base64url, SHA-256 storage only, and a 30-minute lifetime. The trusted configured frontend origin builds `/reset-password#token=...`; redemption is `POST /api/auth/reset-password { token, password }`, returns 204 and creates no session. The client captures and scrubs the fragment before session restoration or requests. Reissue invalidates outstanding student-reset tokens only. All eligibility is rechecked during issuance and redemption.

Conditional `recoveryRevision` writes serialize eligibility changes on User, Membership and InstructorAssignment; legacy documents without the field are guarded with an absent-field match and initialized on the authorized transaction. Keep these fields internal and excluded from caller DTOs. Future status-changing writers for these records must continue to contend with the recovery guard writes; reading status without a conditional write does not provide the same race protection. A successful reset atomically consumes the token, changes the password and `authVersion`, revokes remaining student-reset tokens, deletes target sessions and writes a metadata-only audit. Audit failure rolls back the transaction. Sessions carrying the old password version are unusable at their next auth check; a concurrent delayed session-store touch cannot recreate a deleted session record. This does not promise zero-latency elimination of every in-flight login race.

## Targeted checks

Activation and student-recovery unit tests cover forged fields, malformed tokens, malformed Unicode and passwords outside the shared policy. Guarded disposable replica-set integration covers successful/concurrent consumption, normal login and session races, session revocation, expiry, reissue, role/version changes, rollback, GET/origin/CSRF protections and rate limiting:

```sh
node scripts/run-with-test-db.mjs integration --replica-set server/tests/integration/recovery/activation.test.js server/tests/integration/recovery/password-reset.test.js --no-file-parallelism
```

The real mobile/desktop journey is `tests/e2e/admin-workspace.spec.js`, using explicitly isolated synthetic account contexts in a helper-owned `_test` database. It never uses normal accounts or private credentials.
