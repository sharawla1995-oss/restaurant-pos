# Top Chicken SH-0008 Staff Account Creation — targeted source repair

**STATUS: SOURCE-ONLY / DRAFT PR #45 / DO NOT DEPLOY** (2026-10-15)
Project: Beta `xihcxydjnzemflhedzor`; tenant `5358328c-9724-49aa-affc-1bce8be90f92`; branch 22.
Base release branch remains `ee030278fe09d37b7ab5e83c305672bcee849410`.
No Top Burger Production, SH-0005/0006/0007, or SH-0008 installation/data changes.

## Proven root cause

On-screen **Add user** routes via `mutateTopChickenStaff` → `callFunction('smart-function')`, which is intentionally rerouted to `top-chicken-staff` for Top Chicken. Beta Edge Function list does NOT include `top-chicken-staff`. Beta function logs recorded repeated `POST /functions/v1/top-chicken-staff 404` responses.

Therefore a well-formed email containing `@` still fails, and an entry without `@` is rejected at the form's `type=email` validation. It is **not** resolved by changing or deleting credentials, using the existing shared `smart-function`, or granting broad direct table permissions.

## Staged source fixes

- `app.js`: refuse any foreign authenticated tenant and branch, use normal full email for account creation, explain the requirement for a valid email without pretending username-only login is implemented, enforce 8-character minimum for Top Chicken passwords only, prevent double-click while saving, report missing service instead of false success. Existing other-tenant path is preserved.
- `supabase/functions/top-chicken-staff/index.ts`: dedicated Edge handler with explicit JWT verification, independently server-checked actor, service-only DB reservation and completion RPCs, Auth Admin account creation, no unsafe retry after uncertain Auth result, no automatic delete of possibly committed Auth user.
- `supabase/functions/top-chicken-staff/staff-domain.mjs`: pure validation/digest. Canonical lowercase email with `@` required; usernames without `@` are **not implemented as a login identity**. The app currently uses password authentication via Supabase Auth by email. Admin role ignores UI permissions because it has role-based privileges.
- `review-only/top-chicken-sh0008-staff-create-NO-DEPLOY.sql`: receipt reservation + transactional commit of employees, tenant membership, branch 22, explicit permissions and audit; RPC execution service_role only, no anon/authenticated or foreign tenant create.
- Actor gate checks an **active Top Chicken admin with server-owned membership, branch 22**, AND exact Top Chicken's own `core.auth`, `core.users`, and `core.permissions` entitlements (enabled and unexpired). It never borrows the legacy Beta singleton grants.
- Validation of explicit permission keys derived from the 58 source definitions in `restaurant-engine.js`, with `home` as navigation-only; avoids arbitrary feature identifiers.
- If Auth creation succeeds but DB completion response is uncertain, the reservation remains pending for **manual reconciliation**. Staff records and passwords are not deleted/reset to hide the partial failure. Cross-system account creation is not a single atomic transaction.

## CI evidence and limits

- `tests/top-chicken/staff-create-source-regression.cjs`: source validation, email `@`, unknown role, foreign branch, password length, exact permission allowlist, actor token gate and idempotency design.
- `tests/top-chicken/isolated-pg16-staff-fixture.sql` / `isolated-pg16-staff-assert.sql`: PostgreSQL 16 disposable fixture, actor/admin/legacy boundaries, missing/disabled/expired feature deny, client request replay conflict, matching Auth identity, verified employee + branch + permissions + membership + audit, repeat-completed no duplicates.
- `.github/workflows/top-chicken-sh0008-staff-create-NO-DEPLOY.yml`: source tests + Deno `check` + disposable PG16; **no Supabase credentials, no deployments, no accounts created**.
- This does not establish that live Edge deployment, Auth Admin interaction, device-side form, or login for a newly created account passes. Tests use simulated Auth and tenant fixture, not real data.

## Hard gate before rollout

1. Independently approve and verify exact SQL migration and real Beta backup+restore in separate environment.
2. Independently approve exact `top-chicken-staff` Edge deployment **after SQL**, validating server role secrets/JWT and no changes to `smart-function`.
3. Independently review/grant specific **Top Chicken** tenant entitlements through authenticated+audited Cloud Admin; do not grant by Direct SQL or copy 36 legacy Beta grants.
4. Read-only resolve and protect pending SH-0008 offline sync operation. Do not replay, delete or reset.
5. After all stages and test authorizations, exercise add user on isolated Beta login with a real test email, verify user + membership + permissions, login/logout, role revoke and duplicate replay; then install on SH-0008 only following a full local backup and separate approval.

**NO real staff account was added or modified during this source work.** The original two Top Chicken admins must be preserved.
