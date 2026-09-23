# Point 4 — Corrective Batch 4 v2 — Pre-Deployment / Runtime Acceptance Plan

Status: PLAN CLOSED / PASS
Scope: isolated Beta only (SH-0007 / sharawla beta restaurant test)
Production: OUT OF SCOPE / MUST NOT TOUCH
Canonical Stock: OFF
Cutover: OFF

## Pinned deployed source
- File: `supabase-point4-deploy-batch4-foundation-preserve-newer-catalog-view-v2.sql`
- Deployed source commit after SQL terminator fix: `7bfe4a40711ebcde1958c9f3fe90e3172acd56e2`
- Blob: `ab7cbd6c8dc5b463e24918ae32de2983db24a6bf`
- Beta migration result: SUCCESS
- Earlier source-ready commit/blob `a22451d... / 5e379da7...` is historical pre-deployment evidence only and MUST NOT be used as the deployed digest.

## Runtime boundary
Runtime PASS requires an authenticated Beta Admin session. PostgreSQL/service-role execution is not runtime acceptance because the official fixture requires both `auth.uid()` and `public.is_admin()`.

Official fixture/cleanup:
- `public.sharawla_beta55_supply_acceptance_fixture_v1(text)`
- `public.sharawla_beta55_supply_acceptance_cleanup_v1(text)`
- run id MUST match `^ACC-`
- cleanup MUST finish with `residue=0`.

## Existing evidence
1. Batch10 validates the isolated Supply fixture: IDs allocated before first write, both legacy stock identities guarded, no activation.
2. Batch11 validates Request Create (#42): replay check, validation/frozen set, document guard before first durable request write.
3. Batch12 validates Request Decide (#43) source boundary.
4. Corrective v2 additionally changes Submit and the reservation-aware Decide/Cancel final definitions. Therefore Batch10/11/12 alone are insufficient for runtime closure.

## Authenticated acceptance sequence
Use ONE Beta Admin authenticated session and isolated `ACC-<run>` identities.

### A — Fixture / Batch10
Call the official fixture. Assert:
- ok=true
- warehouse, branch, product, route and catalog ids returned
- source warehouse quantity=10
- destination branch quantity=2.

### B — Create / #42 / Batch11
Create a normal supply request against the returned route/catalog with a positive quantity and unique `ACC-<run>-CREATE` client_tx_id.
Assert:
- request created in `draft`
- exactly the intended frozen line exists
- replay with the same client_tx_id returns the same request id and does not duplicate rows.

### C — Submit
Call `inventory_supply_request_submit_v1(request_id)`.
Assert:
- `draft -> submitted`
- submitted_by/submitted_at populated
- one submitted event exists
- replay returns the same request id without a second transition.

### D — Decide / reservation-aware #43
Approve the submitted request.
Assert:
- `submitted -> approved`
- approved quantity is positive and <= requested
- `quantity_reserved = quantity_approved`
- warehouse physical quantity is NOT consumed by approval
- approval event records reservation semantics.
A reject-only path is not sufficient to verify the newer reservation-aware owner.

### E — Cancel after approval
Cancel the approved, not-dispatched request.
Assert:
- `approved -> cancelled`
- all request-line `quantity_reserved=0`
- event/audit records reservation release
- warehouse/destination physical balances remain unchanged.

### F — Partial-dispatch negative assertion
This must be exercised only through an existing official fulfillment/dispatch acceptance path; do not directly mutate `quantity_dispatched` merely to manufacture the state.
If an official path produces `quantity_dispatched>0`, assert Cancel fails and no cancellation mutation occurs.
If that path is not available in the current authenticated harness, record this assertion as NOT RUN rather than PASS.

### G — Cleanup
Call official cleanup with the same run id.
Assert:
- ok=true
- residue=0
- no ACC request/movement/fixture rows remain.

## Failure policy
Any FAIL stops the run. Do not increase Runtime Verified. Run cleanup if safe. Do not enable Canonical Stock or Cutover. Do not touch Production.

## Counting policy
Static/schema verification is not Runtime Verified.
Only contracts actually exercised through the authenticated runtime path may advance the 5/46 counter. Do not count the partial-dispatch negative assertion unless it was genuinely exercised.

## Gate result
Pre-Deployment / Acceptance Plan: CLOSED / PASS.
Authenticated Runtime Acceptance: READY TO RUN, not yet PASS.
