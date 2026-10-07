# Sharawla POS Beta — Multi-Tenant V1 directed audit

Status: **SOURCE PREPARATION / NOT DEPLOYED**

Authorized database target for later execution: `xihcxydjnzemflhedzor` only.
Production Top Burger project `kzokretuuigjhxjzdlmk` is explicitly out of scope.

## Live Beta evidence captured before any write

- PostgreSQL project: `sharawla beta restaurant test`, active/healthy.
- Public base tables: **252**.
- Tables already carrying `business_id`: **0 / 252**.
- RLS enabled tables: **252 / 252**, but current policies are employee/branch scoped rather than tenant scoped.
- Public functions: **441**.
- `SECURITY DEFINER` functions: **405**.
- `SECURITY DEFINER` functions currently executable by `anon`: **230**. This is an audit count, not a claim that all 230 are exploitable.
- Current core data snapshot included 2 branches, 3 employees, 9 products, 4 customers, 4 orders, 5 shifts, 2 expenses, 2 purchases, 15 stock movements and existing recipe/HR rows.
- `business_settings.id=1` currently exists; its branding text is not treated as tenant identity.
- Current operational branch `TEST` exists and remains untouched.

No migration, UPDATE, INSERT, DELETE, reset, deploy, or device operation was performed during this audit.

## Tenant identity

V1 introduces `public.businesses` as the database tenant registry.

The existing historical Beta dataset uses the exact canonical Sharawla Cloud business UUID already issued to SH-0007:

- canonical `business_id`: `91826502-590e-4afa-8826-2c0f4b99c490`
- code: `beta-current`
- name: `تجريبي`

Read-only verification against Sharawla Cloud confirmed that this exact `businesses.id` is active and named `تجريبي`. The same read-only checkpoint showed the current active device id `8c580a23-8711-4540-b6ca-f5c1725d5fcf` bound to that business.

No parallel/local tenant UUID is generated. `public.businesses.id` is the Sharawla Cloud `businesses.id` itself.

Authenticated tenant resolution is server-owned through `business_auth_memberships` plus the active employee row. `X-Sharawla-Business` is only a selector and cannot grant membership. Desktop requests may also send `X-Sharawla-Device`; when present, it must match `business_device_bindings`. Legacy SH-0007 remains compatible because a headerless authenticated request resolves only when the user belongs to exactly one active tenant.

Anonymous website traffic has no Auth membership, so its canonical UUID acts only as a public tenant selector and remains limited by the restricted public RPC/RLS surface.

## Ownership/backfill rule

No child row may be assigned a tenant arbitrarily.

The foundation draft applies this order:

1. Seed the one historical tenant with canonical Cloud UUID `91826502-590e-4afa-8826-2c0f4b99c490` (never `gen_random_uuid()`).
2. Backfill known root owners (branches, employees, products, categories, customers, suppliers, ingredients, settings, etc.).
3. Backfill children with a real FK to `branches`.
4. Iteratively propagate `business_id` from canonical parent rows through existing single-column FKs.
5. Treat only tables with no tenant parent as historical roots.
6. Abort if any row remains unresolved.
7. Abort if any child/parent FK pair resolves to different tenants.
8. Only after that: validate tenant FKs and make `business_id NOT NULL`.

This deliberately prefers the canonical parent owner over table-name heuristics.

## RLS model

Existing permission policies are not sufficient because permissive policies are ORed together. V1 therefore adds a **RESTRICTIVE** tenant guard:

`business_id = current_business_id()`

Existing branch/role/permission policies continue to decide what the employee may do *inside* that tenant.

Anonymous tables that were already public receive a separate restrictive tenant guard using `request_business_id()`; V1 does not create new public tables.

A row-level write trigger rejects:

- cross-tenant INSERT/UPDATE,
- tenant rebinding on UPDATE,
- cross-tenant DELETE,

including requests that reach tables through SECURITY DEFINER RPCs.

## Settings compatibility

`business_settings` and `website_settings` historically assume physical `id=1`.

V1 deliberately keeps the existing Beta row at `id=1` so SH-0007 continues to load exactly the same record. Future tenants get their own physical row through a sequence plus a unique `business_id`.

The current Beta client is patched on this preparation branch to stop filtering settings with `id=eq.1`; RLS returns the single row for the active tenant. A Restaurant v10.5.15 build for Top Chicken therefore needs the same small compatibility patch before cutover. No re-licensing or data reset is required for SH-0007.

## Remaining gates before any Beta DB write

1. Complete SECURITY DEFINER RPC inventory and explicit anon allowlist.
2. Scope idempotency/receipt uniqueness by `business_id`.
3. Patch every operational receipt lookup to include tenant identity before composite receipt keys are enabled.
4. Add composite parent FKs for the core restaurant graph (order/items/payments, customer/address, purchase/items, return/items/payments, recipe/version/lines, website order/items, employee/branch, delivery, HR).
5. Prove the current SH-0007 client still preserves License State / Business Connection / Runtime Config mismatch checks and bootstraps/login/loads `TEST` with the schema changes in an isolated database.
6. Create a second test tenant only after the first tenant backfill is proven.
7. Run cross-tenant read/write/delete/RPC attacks plus Offline replay/idempotency.
8. Only then may the Beta database migration be considered for execution.

## Hard stop

These drafts contain an apply guard and are intentionally non-deployable unless the session explicitly sets:

`SET sharawla.multitenant_apply = 'beta-only-approved';`

That setting is not authorization by itself; explicit user approval for the Beta DB write is still required.
