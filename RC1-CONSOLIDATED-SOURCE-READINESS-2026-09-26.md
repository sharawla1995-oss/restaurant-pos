# Sharawla POS — RC1 Consolidated Offline Source Readiness

Recorded: 2026-09-26
Scope: Restaurant RC1 practical Offline consolidation
Status: **SOURCE READY FOR CONTROLLED BETA SQL DEPLOYMENT REVIEW — RC1 NOT YET CLOSED**
Runtime version in source: `10.5.4-beta.58.30` (do not publish this materially changed tree under the same installed candidate; allocate the next candidate version only when build is authorized)

## Safety boundary

- Production `SH-0005` / `SH-0006` remain on `10.5.3 CLEAN`, read-only and excluded.
- Only isolated Beta `SH-0007` / business `تجريبي` may be used for later runtime acceptance.
- Canonical Stock remains OFF.
- Cutover remains OFF.
- Historical Offline evidence `Seq293 / Seq304 / Seq316` must remain preserved and must not be Retry/Delete/Reset.
- No Supabase write, installer deployment, integration-branch merge, or Production change was performed during this consolidation.

## Inputs reconciled

This source candidate consolidates the two divergent RC1 lines rather than overwriting either one:

- Later RC1 contract/reference branch through `5c5fc25aa708c8347d3c521b5a9c7720713cb1b3`.
- Work practical-audit lineage through `4a9d893c3e242dfab0b99cc2a3714e401ae3e5b3`, with the principal Work source-fix commit `1aea3d8`.

The Work source corrections were retained where safe, while later RC1 guarantees were restored where the Work handoff had regressed them.

## Restaurant operational Offline source closures

| Area | Consolidated source contract | Source status |
|---|---|---|
| Durable Sale | Native/local-first durable event, restart/replay/ACK contract preserved | PASS |
| Official bon / invoice numbers | Offline creates only `offline_reference`; `bon_number` / `invoice_number` remain null until server allocation | PASS |
| Sale ACK reconciliation | Local and server representations reconcile by `client_tx_id` / ACK mapping; no intentional Local+Server duplicate | PASS |
| Customer Create | Durable local success is returned to UI; local projection remains visible | PASS |
| Customer → Sale | Sale carries `customer_create_tx`; sync waits for acknowledged customer mapping; terminal/missing parent fails closed | PASS — requires Beta SQL artifact below before runtime proof |
| Delivery required fields | Client validates phone/address/zone before durable Sale; server-side Beta guard source rejects incomplete delivery as defense in depth | PASS — requires Beta SQL artifact below before runtime proof |
| Delivery / Kitchen / Orders | Cached + pending local operational projections retained with Offline/stale semantics | PASS / device manual proof remains |
| Offline-created order lifecycle | Status and driver operations support local parent identity and resolve after Sale ACK | PASS / device manual proof remains |
| Return before Sale first sync | Return depends on Sale TX; stable local line index is mapped to authoritative server `order_item_id` after Sale ACK | PASS — server Outer V3 required |
| Duplicate pending Return quantity | Pending local returns reserve refundable quantity before ACK; final submit re-reads pending use | PASS |
| Shift metrics / Expenses | Complete cached baseline + native pending local overlay; incomplete baselines fail closed | PASS / device manual proof remains |
| Driver cash custody | Cached custody snapshot + local delivered overlay; settled/non-cash rows excluded; settlement itself remains Online-only | PASS / device manual proof remains |
| Inventory overview | Only a complete `ingredients + ingredient_stock` snapshot is cached/displayed Offline, with timestamp; no fake zero/half-cache state | PASS / device manual proof remains |
| Online-only Storage/Admin samples | Authenticated connectivity preflight before first mutation; upload compensation cleanup; payment settings bulk write | PASS for covered flows; remaining admin areas stay intentionally Online-only/fail-closed |
| Printer failure / reprint | Printing occurs only after a durable Sale result; printer failure returns false and cannot re-enter checkout/create another Sale | PASS at source level; hardware/IPC remains MANUAL |
| Legacy write interception | Generic legacy `orders PATCH` / `customers POST` interception is not an accepted current Offline write owner | PASS |

## Live Beta read-only evidence used for final-definition review

All checks below were **read-only** against Supabase project `xihcxydjnzemflhedzor` (`sharawla beta restaurant test`). No SQL changes were executed.

- Deployed `public.sharawla_offline_v2_apply_event(jsonb)` MD5: `a269349dbc9a71f453e12699bc0617ce`.
- Deployed `public.create_pos_order_atomic(jsonb,jsonb,jsonb)` MD5: `a677482d9944aa8ae40003408506c7c1`.
- Deployed `public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb)` MD5: `c6de3f95f85c6bb2f9d4854c1d7c5a8c`.
- Deployed `public.create_order_return(bigint,text,text,jsonb,jsonb)` MD5: `3fe18445ec4e05799bd8bebdeeb716c9`.
- Deployed `public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)` MD5: `8fb379d606004c895befb2b0f9787586`.
- Deployed `assign_order_numbers()` MD5: `b2b1154fa33599e60fbae758fe6e9853`.
- `trg_assign_order_numbers` is a BEFORE INSERT trigger on `public.orders`; invoice numbers are allocated from branch counters and bon numbers from shift counters.
- Required Offline V2 owner RPC families were present with the expected signatures and one overload each.
- `offline_v2_server_receipts` contained the receipt/mapping columns required by the consolidated Outer.
- `delivery_zones` has the expected `id`, `branch_id`, `active`, and related fields required by the delivery guard.

## Two source-only SQL artifacts still requiring explicit Beta deployment authorization

### 1. `supabase-rc1-offline-outer-consolidated-v3.sql`

Purpose:
- Preserve current Work customer/address dependency behavior.
- Add Customer → Sale ACK mapping.
- Add dependency-gated Return of a brand-new Offline Sale.
- Keep authoritative replay before dependency re-evaluation.
- Preserve current owner/RPC families and ACL intent.
- Refuse execution if the deployed Outer or pinned Restaurant Sale/Return definitions drift from the reviewed MD5s.

SHA-256: `a49e28526099f9d2c827c5f3681e36a0c2901222a02124e749b7718b04bcc536`

### 2. `supabase-rc1-delivery-required-fields-guard-v1.sql`

Purpose:
- Add a server-side delivery invariant before order insertion/update.
- Require valid Egyptian mobile, non-empty address, and active delivery zone matching the same branch.
- Refuse execution if the reviewed `create_pos_order_atomic` definition drifts.

SHA-256: `5216a7724912dad5c5d573584aa2be8332e85cfbc07bcac75a0ed9dd30db6ff9`

These files are **not deployed** in this source-readiness package.

## Validation result

Final local command:

`npm run check`

Result: **PASS** across the existing source pipeline and the new RC1 consolidated gates, including:

- Customer → Sale dependency and fail-closed parent states.
- Pending Sale → Return dependency/mapping.
- Driver custody local projection.
- Complete Inventory snapshot.
- Server Delivery guard source contract.
- Official-number reconciliation contract.
- Online-only Storage/Admin fail-closed contract.
- Printer failure / reprint no-duplicate source contract.
- Existing Point 4, Offline V2, Permissions, Restaurant, Delivery Settlement, Online Orders, version and SH-0007 source gates.

## What is still manual / runtime-only

Source PASS is not practical RC1 closure. The following still require one controlled SH-0007 run after the two Beta SQL artifacts are explicitly authorized, deployed and post-verified:

- Physical printer unavailable/failure/reconnect/reprint behavior.
- Electron cold start and cached session/bootstrap while Offline.
- Full Offline Shift lifecycle with sales/expense/close/restart/reconnect.
- Customer Offline create → dependent Sale → ACK reconciliation.
- Delivery Sale → Preparing → Ready → Assign Driver → Delivered before first Sale sync.
- Return against a Sale that has not yet received its first server ACK.
- Lost ACK/reconnect and Local→Server row/official-number reconciliation.
- Driver custody display and subsequent Online settlement boundary.
- Inventory snapshot stale timestamp/fail-closed UX on the actual device.
- Preservation of historical Seq293/304/316 and existing local conflict evidence.
- Representative intentionally Online-only admin/storage actions with DNS/fetch failure.

Historical Action Matrix / Defect Ledger files bundled from the Work audit remain historical evidence. Their old OPEN/PARTIAL verdicts are not silently rewritten; this document supersedes them only for the consolidated source changes listed above. Any action still marked MANUAL remains MANUAL until SH-0007 evidence exists.

## Exact next safe step

1. Obtain explicit authorization for **Beta SH-0007 backend only** to deploy the two reviewed SQL artifacts. Do not touch Production.
2. Immediately post-verify definitions, MD5/markers, ACLs, trigger order, and required RPC families on Beta.
3. Re-run the source/definition gates against the post-deploy Beta state.
4. Only then allocate the next unique candidate version (recommended lineage: `10.5.4-beta.58.31`) and build exactly one Windows x64 candidate.
5. Install only on SH-0007 and execute one consolidated practical Offline acceptance run.
6. Merge toward the integration line only after the practical run proves: zero duplicate economics, zero lost operations, zero orphan dependencies, zero unexpected Conflict/DLQ, and correct Local→Server reconciliation.
