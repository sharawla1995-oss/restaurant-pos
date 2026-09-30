# Sharawla Master Handoff — 2026-09-30

> Authoritative continuation checkpoint. Do not reopen CLOSED evidence unless contradictory evidence appears.

## Safety boundary
- Production SH-0005 / SH-0006: 10.5.3 CLEAN, immutable/read-only.
- Practical/Beta target only: SH-0007, Business `تجريبي`, Branch `TEST`.
- Canonical Stock OFF. Cutover OFF.
- No Production writes. No Supabase deploy/write unless separately authorized.
- No Activation/Licensing/Canonical Fingerprint/Device Identity/Printing/Updater changes.
- The old special handling for historical sequences 293/304/316 is retired by explicit user decision. Do not treat those sequence numbers as protected runtime data.
- Source/CI PASS never means live SH-0007 runtime PASS.

## Point 4 / source ownership — CLOSED
- Ownership mapping 61/61 CLOSED.
- 46/46 pre-cutover guard contracts SOURCE ACCEPTED.
- Direct + Transitive + Document Barriers CLOSED.
- Historical authoritative owners resolved.
- Reservation Identity V1 CLOSED.
- Food Sale/Return provenance CLOSED; returns restore historical consumption snapshots and never recalculate current recipe.
- Architecture: Local DB = Device Operational Authority; Cloud = Global/Central Authority.
- Required Offline flow: Local durable commit -> Outbox -> Replay -> Server -> ACK -> Local reconciliation; idempotent replay.
- System-wide Offline Closure Matrix previously PASS: strict=53; warehouse=2; website=2; routing=2; unresolved=0.

## Practical Offline fixes already closed in source
- Duplicate Offline notice / MutationObserver loop fixed.
- Overlapping network polling fixed.
- Delivery/Expense Read-After-Write fixed.
- Unified operational local projections and Local->Server ACK reconciliation.
- Customer/Delivery practical acceptance sandbox lock merged.
- SH-0007 read-only preflight merged.
- Windows PR candidate build gate merged.
- BON source contract closed, but BON live deployment remains 0 until separately authorized.
- Dashboard/HR source work is merged; practical SH-0007 runtime acceptance still distinct from source PASS.

## Zero State V1 — MERGED
PR #29 `fix: add SH-0007 operational zero state v1` is merged.
- PR head: `f16989601b71c0632f5dabe5b505ff470b28604a`
- Merge SHA: `e260ccd5b216dc8abd79e9799309ecfeb62a17b9`
- Source Run #78: SUCCESS, full gates 184/184.
- Windows Run #786: SUCCESS including sqlite3 verification, candidate validation, Windows x64 installer build, packaged app.asar verification, and artifact upload.
- Zero State contract is restricted to SH-0007 / TEST.
- Operational groups: orders, shifts, expenses, customers, delivery.
- Preserves catalog/settings/permissions and device/activation identity.
- Requires local + Cloud backup before Cloud V7 reset.
- After Cloud success it performs full Offline V2 test cleanup including Inbox, runtime compatibility cleanup, IndexedDB cleanup, and residue verification.
- Explicit `ZERO_STATE_PARTIAL_FAILURE` if Cloud reset succeeds but local cleanup fails.
- The function is not intentionally exposed as an ordinary Reset path; do not execute a live reset without explicit runtime authorization.
- Final zero-state acceptance requirement: Orders/Delivery/Returns/Expenses/Shifts/test transactions + old Offline queue/projections = 0 and remain 0 after Reload + Restart + Sync.

## NEW PRACTICAL BLOCKER — supplier_save does not sync
Observed live on SH-0007 Sync Center on 2026-09-30:
- DLQ = 2.
- Operation: `supplier_save`.
- Seq 48 and Seq 49.
- Error code shown: `22023`.
- UI says operation/RPC binding is unsupported and manual intervention is required.
- Therefore Food Supplier create/save is NOT practically accepted Offline yet, even though source-level Offline tests/ownership gates had passed.

### Source evidence for supplier blocker
Current transport runtime contains inconsistent supplier routing:
- RPC mapper: `supplier_save -> offline_food_supplier_save_v1`.
- Registered adapter allow-list currently references `food_supplier_save_v1`.
- `supabase-rc1-offline-v2-modern-food-final-dispatcher.sql` does not own `supplier_save`; it delegates unlisted operations to `sharawla_offline_v2_apply_event_core_v1`.
- This makes server dispatcher/runtime deployment compatibility the immediate investigation target.
- Do NOT manually Retry/Delete DLQ rows as a substitute for fixing the binding/dispatcher. Preserve the two rows as practical evidence until the root cause is proven.

## Server dispatcher risk still open
Historical review already showed the client supports modern Food operations while server dispatch is layered/fragmented (Outer/Core/Modern Food). The Modern Food final dispatcher artifact was source-only and historical deployment evidence did not prove it live on SH-0007. The new supplier_save DLQ is concrete runtime evidence that source coverage alone is insufficient.

## Exact next work
1. Trace `supplier_save` end-to-end from commit payload -> `mapRpc` -> registered adapter -> server `sharawla_offline_v2_apply_event` / core delegation -> authoritative supplier owner RPC.
2. Identify the exact deployed/expected binding for Food supplier save. Reconcile `offline_food_supplier_save_v1` vs `food_supplier_save_v1`; do not guess or simply rename one side.
3. Inspect source SQL defining both candidate supplier RPCs and dispatcher contracts, including signatures, idempotency, branch/business authorization, replay receipt behavior, and ACK `supplier_id`.
4. Add a real regression test reproducing Seq48/49 semantics and proving create supplier -> durable local -> sync -> ACK -> one authoritative supplier row -> local reconciliation.
5. Make the smallest source patch on a new branch from the current RC1 head. No Supabase deployment during source repair.
6. Run full source gates + Windows candidate build. Merge only after both PASS.
7. After source closure, ask separately for permission before any Supabase Beta dispatcher/RPC deployment if deployment is required.
8. After authorized Beta deployment, retest on SH-0007 with a NEW supplier operation. Do not infer success from old DLQ rows alone.
9. Continue Practical Runtime Acceptance across all remaining modules. Any new operation that saves locally but fails sync reopens only that practical runtime path, not Point 4 ownership evidence.
10. Before final full practical campaign, execute the authorized Zero-State procedure and prove the system stays zero after Reload/Restart/Sync.

## Continuation trigger
When the user says `بلح`, report:
- CLOSED work separately from OPEN practical blockers.
- Safety boundaries.
- Current authoritative Git SHA/PR/CI state.
- Exact next action.
- Never reopen already CLOSED historical evidence without contradictory evidence.
