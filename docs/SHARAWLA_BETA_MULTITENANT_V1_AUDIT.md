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

The existing historical Beta dataset is assigned to one tenant:

- code: `beta-current`
- name: `تجريبي`

The POS already persists a canonical Sharawla Cloud `business_id` in License State and in the Offline V2 identity. The V1 registry therefore includes `external_business_id` so the existing licensed identity can later be bound to the database tenant without re-licensing SH-0007.

Authenticated requests resolve tenant from the employee tied to `auth.uid()`. Anonymous website requests will use the existing external business identity through the `x-sharawla-business` header after the website/client patch is proven.

## Ownership/backfill rule

No child row may be assigned a tenant arbitrarily.

The foundation draft applies this order:

1. Seed the one historical tenant (`beta-current`).
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

## Singleton compatibility

`business_settings` and `website_settings` historically use logical `id=1`.

To keep old Restaurant clients compatible, V1 changes the primary key from global `id` to `(business_id,id)`. Each tenant can therefore have its own `id=1` row while RLS selects only its tenant.

This is the key compatibility mechanism for a later Top Chicken tenant.

## Remaining gates before any Beta DB write

1. Complete SECURITY DEFINER RPC inventory and explicit anon allowlist.
2. Scope idempotency/receipt uniqueness by `business_id`.
3. Patch every operational receipt lookup to include tenant identity before composite receipt keys are enabled.
4. Add composite parent FKs for the core restaurant graph (order/items/payments, customer/address, purchase/items, return/items/payments, recipe/version/lines, website order/items, employee/branch, delivery, HR).
5. Prove the current SH-0007 client still bootstraps/login/loads `TEST` with the schema changes in an isolated database.
6. Create a second test tenant only after the first tenant backfill is proven.
7. Run cross-tenant read/write/delete/RPC attacks plus Offline replay/idempotency.
8. Only then may the Beta database migration be considered for execution.

## Hard stop

These drafts contain an apply guard and are intentionally non-deployable unless the session explicitly sets:

`SET sharawla.multitenant_apply = 'beta-only-approved';`

That setting is not authorization by itself; explicit user approval for the Beta DB write is still required.
