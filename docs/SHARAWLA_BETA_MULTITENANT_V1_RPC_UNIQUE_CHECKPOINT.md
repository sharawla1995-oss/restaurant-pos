# Sharawla Beta Multi-Tenant V1 — RPC / uniqueness checkpoint

Status: **SOURCE PREP ONLY / NO DATABASE WRITE**

## Live Beta counts

- Public functions: **441**
- SECURITY DEFINER: **405**
- SECURITY DEFINER executable by anon before hardening: **230**
- Heuristic operational SECURITY DEFINER functions lacking an obvious tenant-guard token: **222**
- Of those, anon-executable: **106**
- Non-primary unique indexes on tenant candidates before migration: **191**, all globally scoped because live Beta currently has no `business_id`.

These counts describe the current Beta schema before any Multi-Tenant migration.

## Restaurant public surface now prepared

The preparation branch contains a draft generated from the **live Beta function bodies** for:

- latest 12-argument `create_website_order`
- `preview_promo_code`
- `track_website_order`
- `track_website_orders`
- `cancel_website_order_customer`
- `is_branch_website_open`
- `is_branch_website_schedule_open`

The draft binds every public request to `request_business_id()`, verifies branch ownership, validates product/variant/modifier ownership, scopes tracking/cancellation reads by business, and revokes anon access to older create overloads plus staff accept/reject RPCs.

## Legacy compatibility

The POS preparation branch sends `X-Sharawla-Business` from the already-cached Sharawla business identity.

For the currently installed SH-0007 client that does not yet send this header, `current_business_id()` has a deliberately narrow compatibility fallback: it resolves the authenticated user only when that user belongs to exactly one active tenant. If the same Auth user later belongs to more than one tenant, no tenant is guessed; an explicit header is required.

## Unique constraints

A shadow-index draft creates business-scoped equivalents of legacy non-primary unique indexes without dropping the old indexes. This lets source/RPC `ON CONFLICT` callsites be patched and tested before uniqueness cutover.

The final unique cutover file intentionally aborts even after its readiness flag. Removal of old unique indexes must be generated from the final proven schema after dependency and `ON CONFLICT` mapping is complete.

## Remaining blockers

- Retail public website RPCs and generic Web Portal RPCs are not yet fully tenant-bound.
- Offline receipt functions that read/write receipt rows by global `client_tx_id` are not yet all rewritten with `business_id`.
- Legacy `ON CONFLICT` callsites are not yet completely mapped to scoped unique owners.
- No second tenant has been created yet.
- No Beta migration has been applied.
