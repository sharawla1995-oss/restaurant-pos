# Top Chicken SH-0008 — employee, delivery, supplier, customer, test queue source candidate
Date: 2026-10-15. Status: SOURCE-ONLY; production release NO-GO.

## Scope and protections
Only repository `sharawla1995-oss/restaurant-pos` branch
`codex/top-chicken-sh0008-rc9-prelaunch-no-deploy`.
Target: Top Chicken business `5358328c-9724-49aa-affc-1bce8be90f92`, Beta Supabase
`xihcxydjnzemflhedzor`, branch 22, device SH-0008.
Top Burger Production, legacy Beta tenant and SH-0005/SH-0006/SH-0007 unaffected.
No SQL/Edge deploy, no entitlement write, no device installer, no local queue clear, no live website intake.

## Implemented in source
1. Staff new users may be created with lowercase Latin username (3..32 chars) and
   four-digit PIN. The dedicated `top-chicken-staff` candidate provisions a synthetic
   Auth email and server-secret HMAC-derived strong Auth credential.
   Secret `TOP_CHICKEN_STAFF_PIN_SECRET` must be provisioned to both functions
   before deployment; never expose it to clients or SQL. Old admin email Auth
   remains unchanged. New `top-chicken-pin-login` candidate gets a real Supabase
   Auth session only after the service-role PostgreSQL admission gate and verification.
   PIN4 offline login intentionally fails closed. PIN reset NOT implemented.
2. `review-only/top-chicken-sh0008-pin4-login-NO-DEPLOY.sql` contains the
   isolated account-level 5-attempt / 15-minute lock and success audit.
   3 core Beta grants are required and rechecked at success, including expiry/revocation.
3. A Top Chicken-only add-customer control is now present in customers list and
   POS. Server RLS/tenant selector, normalized phone uniqueness, and binding
   to a default customer address remain authoritative.
4. Delivery driver and zone create error messages now expose the exact commercial
   entitlement blocker rather than leaving the user with a silent failed tap.
   Both still call existing audited/idempotent `offline_delivery_*_save_v1` RPCs.
5. Supplier saving still calls `food_supplier_save_v1` which is the authoritative
   owner; the UI clarifies when `inventory.suppliers` is denied. No alternative
   financial writer or entitlement bypass was introduced.
6. Previous Beta-style `SH-0008` test sync reset remains only in source.
   It makes an on-device local SQLite backup, marks unsynced operations
   `discarded`, clears only local queue JSON and never deletes Cloud transactions.
   Because local pending operations could include actual sales, never install or
   invoke reset before operator verifies affected transactions are disposable.

## Live read-only findings from Beta (not assumptions)
- Top Chicken Beta operational feature grants: **0**.
- Central Admin commercial resolver `core.auth`, `core.users`,
  `core.permissions`: entitled=true.
- Central commercial resolver `commerce.delivery` and
  `inventory.suppliers`: entitled=false, `NOT_ENTITLED`.
- Required action features from Beta action/profile lookup:
  `delivery.drivers.manage` -> `commerce.delivery`;
  `delivery.zones.manage` -> `commerce.delivery`;
  `food.suppliers.manage` -> `inventory.suppliers`.
- Branch 22: 24 zones, zero drivers; two active admin employees without action
  overrides. Customer table already has Top Chicken-scoped normalized-phone
  UNIQUE index and tenant RLS/write guards.

## Independent gates before any claimed live PASS
1. Central authenticated, audited commercial entitlement action by a real
   authorized Sharawla Admin for Top Chicken **only**, for
   `commerce.delivery` and `inventory.suppliers`. Do not fabricate access
   or grant those by Beta direct SQL.
2. Independently review/build an authenticated, audited cross-project
   entitlement sync bridge. It must verify central source and actor, grant/revoke
   only this business, bind version+expiry, fail closed, and leave the legacy
   Beta business untouched. Current Beta has zero grants; adding staff PIN
   SQL alone will not make staff creation work.
3. Reviewed independent migration approval to apply PIN login SQL on Beta;
   provide recovery plan before deployment; do not rerun the already applied
   four 2026-10-15 Beta migrations.
4. Separate approval to deploy only `top-chicken-staff` candidate update and
   `top-chicken-pin-login` (verify_jwt=false, server admission on each attempt).
   Set a fresh 32+-character server-only secret in project Edge secrets.
5. Authenticated hosted end-to-end: staff create then login, wrong PIN lock,
   active/disabled/revoked/expired, driver and zone CRUD, supplier create,
   customer create (from both surfaces), branch 22 isolation, and regression
   tests against another Beta tenant.
6. Windows in-place upgrade and local restart+SQLite persistence + queue inspection
   on disposable Windows before any physical SH-0008 release approval.
7. With user approval, install on SH-0008 and separately authorize any test queue
   reset. Don't open website orders for real customers before a full website→POS
   acceptance run.

CI results are separately linkable from GitHub Actions.
