# Sharawla Master Checkpoint — Universal Offline Handoff
Date: 2026-09-28

## Safety boundary
- Production: SH-0005 الدقي + SH-0006 العشرين = 10.5.3 CLEAN, immutable/read-only.
- All current source/runtime acceptance work targets SH-0007 / Business تجريبي / Branch TEST only.
- Canonical Stock OFF. Cutover OFF.
- Do not touch Activation/License, Business Connection, Canonical Fingerprint, Printing or Updater.
- TEST business data is disposable, but identity/licensing/device connection are protected.
- No Production DB deployment is authorized.

## Repository checkpoint
- Repo: sharawla1995-oss/restaurant-pos
- Branch: rc1-beta58-32-performance-hotfix
- Current verified HEAD at handoff: b6fada3def45ac0907147f02fd199ab3112e29ae
- Before every mutation, re-read remote branch HEAD and reconcile if it moved. Never force-push.

## Point 4 inherited state
- Ownership mapping: 61/61 CLOSED = 40 Direct + 15 Transitive + 6 Document Barriers.
- Pre-cutover guard contracts: 46/46 SOURCE ACCEPTED.
- Historical authoritative owners: 6/6 resolved.
- Reservation Identity V1 uses document_uid + line_uid + client_tx_id with deterministic digest/idempotency/projection lineage/guard-before-first-durable-write.
- Do not reopen these closures absent contradictory evidence.

## Reset V7
V7 was manually executed by the user on Beta Supabase and reported successful. Real SH-0007 TEST checks proved selected TEST orders/expenses/shifts can be deleted, restart does not resurrect them, and unselected expense can survive selected shift deletion through safe shift-reference detachment.

Reset ownership rule:
Admin + Current Branch + Selected Groups + actual ownership model -> Capture scoped IDs -> Delete dependent children -> Delete scoped roots/mappings -> Verify -> Refresh local view -> Commit.

Branch-owned transactional data is current-branch scoped. Shared masters are not falsely branch-owned. Customers are business-global by schema. Catalog/promos/payment/settings use branch mappings where applicable. Cloud failure means zero local delete. Cloud success plus local cleanup failure is structured Partial Failure.

Runtime special protection for device sequences 293/304/316 was explicitly removed by user direction and MUST NOT be reintroduced.

Important Reset source commits:
- 3fc8fb... create V7 SQL
- 367419... route app reset to V7
- b62ff1... V7 gate
- b661d0... newline fix
- bb3c4879f4da2006d4fc4b09a106a4c7e360be1e JWT fallback hardening
- 55f5f75043bf991ddb5e129478fbad0747b57790 remove protected sequences
- 5dd49284a161f9c4990a4c394a89320343f12add gate update
- 6c5da53335eb6aca06968390e03602fd251aae0b structured Partial Failure

Do not use resetTestAll. Reset is selected business-data cleanup, not a global Offline-engine reset.

## Why Offline closure was reopened
Real-device SH-0007 UI testing proved that engine-level acceptance was insufficient:
- delivery/order list could be visible Offline while Details returned order-not-found;
- Offline delivery status transition showed "Offline V2 order status requires active takeover";
- Offline return lookup by BON could say invoice is not stored/not found;
- Offline sale + Online sale produced correct Cloud BON counter but visible next-BON badge could remain stale.

Therefore old claims that Offline was 100% closed cannot be used as full UI/runtime acceptance evidence.

## Universal Offline architecture — official direction
Do NOT patch each screen independently. Every operation must be explicitly classified:
- OFFLINE_MUTATION
- OFFLINE_READ
- ONLINE_ONLY
- NOT_APPLICABLE

For OFFLINE_MUTATION the mandatory lifecycle is:
Local Read/Input -> permission/scope validation -> stable identity -> Durable Local Commit -> Local Projection -> UI success -> Restart Recovery -> Sync -> explicit server ACK -> Idempotency/Exactly Once -> identity mapping -> Reconciliation -> same state after restart.

One authoritative mutation owner only. No dual-write. Takeover is an ownership migration mechanism, not an arbitrary operator-visible dependency. Do not simply remove takeover guards without proving single ownership. If safe ownership cannot be resolved, fail closed.

For OFFLINE_READ, every screen declares its complete local data shape. Seeing an order header in a list does not prove details/return are Offline-ready; required children such as order_items/payments/returns must be materialized in the local projection.

Operations inherently requiring live cross-authority can be ONLINE_ONLY. The platform direction is offline-capable by default where the business operation can logically work Offline, across restaurant/retail/pharmacy/etc., with profile-specific declarations.

Acceptance for every Offline-capable mutation:
Online setup -> disconnect -> real UI action -> verify durable local commit/projection -> close app -> reopen Offline -> same state -> reconnect -> sync -> explicit ACK -> exactly one Cloud effect -> reconciliation -> restart -> no duplicate/resurrection -> replay same TX -> exactly-once result.

## Universal contract commits
- bf86939f7815c09a17ac0fa6005b3fa619faef4c — docs(offline): Universal Offline Operation Contract V1.
- 8f699021a1393ec3b50eaf2f7ee78e065e23f643 — executable contract gate.
The gate keeps real matrix failures visible and requires the lifecycle concepts; static-string evidence alone is not sufficient acceptance.

## Supabase Beta read-only review
Project: xihcxydjnzemflhedzor (Beta restaurant test).
The latest review was READ-ONLY; no Supabase write was made by the universal-offline work.

Existing server infrastructure already includes:
- offline_v2_server_receipts with client_tx_id, server_event_id, payload_digest, operation_type, rpc_name, device_id, device_sequence, branch_id, employee_id, auth_user_id, server_entity_id, server_version, result_json, created_at.
- sharawla_offline_v2_apply_event / sharawla_offline_v2_apply_event_core_v1.
- offline_v2_pull_events_v1.
- order_status_apply_offline_v2.
- offline_v2_update_order_status_v1.
- offline_delivery_assign_driver_v1.
- offline_customer_create/update/address save/delete functions.
- open_pos_shift_idempotent / close_pos_shift_idempotent.
- food return idempotent functions.
- shift_bon_counters and branch_invoice_counters.

Conclusion: do not invent new tables/RPCs merely to generalize Offline. Reuse current server authority and add SQL only where a concrete operation proves a missing server contract.

## BON finding and source fix
Real-device test: Offline delivery sale got BON 1; Online sale got BON 2; visible next-BON badge stayed stale.
Beta DB read-only evidence showed open shift #62 had max bon_number=2 and shift_bon_counters.next_number=3. Cloud was correct; UI reconciliation was stale.
Commit f391cb2581ec88b046dc63c7d883a275f81c396d refreshes updateNextBonBadge after successful Offline queue sync.
This still requires a new build + SH-0007 real-device acceptance before closure.

## Shared local order projection work
Commit 9848801352f512763d9b3fc79cb3ca2406763477 changed cacheOrderRows so Online order-list loads also prefetch/store order_items when missing. This attacks the header-only cache problem.

Commit e48e9223597410eb0a52a1eb2b9ccfe5c8154fe8 added resolveOrderBundleLocalFirst(id):
- Offline: resolve order + items from cachedOrders projection.
- Online: refresh order + items from Cloud, cache bundle, return it.
- fallback to cached bundle on network loss.
Both ordinary order Details and Delivery Details now use this shared resolver.

Commit b6fada3def45ac0907147f02fd199ab3112e29ae (current handoff HEAD) changed Delivery queue itself:
- Online loads orders/drivers and cacheOrderRows materializes order bundles.
- Network failure falls back to cachedOrderBundles for current branch delivery/pickup.
- drivers fall back to existing state.
This means Delivery list + Delivery Details now share the same local order projection direction instead of separate Cloud-only reads.

## Order-status root cause
permissions-v2-order-fulfillment-routing.js sends Offline transitions to SharawlaOfflineV2Takeover.saveOrderStatus().
beta45-offline-v2-runtime-takeover.js saveOrderStatusV2 currently THROWS when takeover is inactive:
OFFLINE_V2_ORDER_STATUS_TAKEOVER_REQUIRED.

This differs from several other V2 save paths (return/shift/etc.) that can fall back to legacy owner while takeover is inactive.
Do NOT just delete the guard or auto-activate takeover. The required fix is a general operation ownership resolver:
- V2 owner when active/ready and operation binding is proven;
- otherwise a safe legacy owner if one exists;
- otherwise fail closed;
- exactly one owner; never dual-write.
Takeover activation remains explicit and safety-gated.

## Return lookup gap
renderReturns currently has its own search logic. Offline fallback scans cachedOrderBundles by branch/BON/invoice/shift, but then item retrieval is duplicated and historically could be empty.
Next source step is to move return invoice lookup onto the same shared order-bundle projection/resolver, with explicit supported identities (BON/invoice/server/local/client_tx as applicable) and complete items.
Do not promise arbitrary old historical invoices Offline unless they have been materialized/cached by the declared projection policy.

## Immediate continuation — exact order
1. Re-read remote HEAD; expected handoff HEAD b6fada3def45ac0907147f02fd199ab3112e29ae.
2. Finish shared local order projection:
   - make Return invoice lookup consume a shared bundle lookup helper rather than its duplicate Cloud/cache branch;
   - define/cache required payments/return overlays if the real screen requires them;
   - ensure Online materialization creates the complete bundle needed by Details + Return.
3. Implement a GENERAL operation ownership resolver/registry. Migrate order_status routing first as the proven regression. Do not auto-activate takeover and do not dual-write.
4. Extend the same ownership contract to delivery assignment/completion and every Restaurant OFFLINE_MUTATION in the matrix.
5. Add executable regression/integration acceptance for:
   - complete order bundle Offline;
   - details after restart Offline;
   - return lookup by BON/invoice Offline;
   - status durable commit -> restart -> sync -> ACK -> exactly once;
   - owner exclusivity/no dual-write;
   - BON badge reconciliation after ACK;
   - no resurrection.
6. Run syntax/static/general contract gates, then CI/build. Do not tell user to update SH-0007 before green build.
7. Install/test only on SH-0007 and execute real UI acceptance sequence. Production stays read-only.
8. Only after Restaurant operations pass the universal contract should equivalent profile matrices be closed for Retail/Pharmacy/etc.

## Current release/readiness statement
Do NOT call RC1/Offline Production-ready yet. Source architecture is being corrected based on real SH-0007 evidence. Existing server infrastructure is substantial, but UI/read projection and operation ownership still have open real-device regressions. A source commit is not acceptance; a green build plus SH-0007 restart/sync/exactly-once test is required.

## Master trigger
When user says "بلح", report this checkpoint as the current official Master continuation unless newer contradictory evidence/commits exist.

## Continuation progress after handoff
- a7d3456502954eb10cd44e8418e599faea3eb141 — Return invoice lookup now consumes shared order bundles through resolveReturnOrderBundles + resolveOrderBundleLocalFirst; duplicate Return-only order_items retrieval was removed. No DB deployment.
- a90098a526cee56f82fd5cc2bd764b1c02773b6d — added general resolveOperationOwner() and migrated order_status ownership decision to it. The resolver enforces one owner only and returns NO_SAFE_OWNER when neither V2 nor an existing safe Legacy owner is available.
- Source review proved order_status has no existing Legacy queue owner. Do not invent a fake fallback merely to suppress the error.
- Source review also proved SharawlaOfflineV2Transport.isActive()/commitRpcLocal still depend on takeoverState active + migration_verified + transport_ready. Delivery assignment therefore does not provide an independent operation-scoped activation precedent.
- Current blocker is now explicit: define and prove the safe activation/readiness policy for order_status (and then delivery operations) without auto-activating global takeover and without dual-write. Until that policy is proven, fail closed is intentional.
- Current source HEAD before this documentation update: a90098a526cee56f82fd5cc2bd764b1c02773b6d.


## 2026-09-28 Universal Offline continuation closure — source/CI/build

Current verified source HEAD before this documentation commit: `42921bdaf51610f6a43f66928f65c603e6124224`.

Completed after the earlier `a90098a...` checkpoint:
- `e0f3db3c04665c88bd7051683d84b2039b2d76e7` — recorded Return shared-bundle + ownership-resolver progress.
- `b9aba26088b626065b39ae1b7cb99dcdc0bc08fd` — corrected stale Reset V7 CI assertion; did NOT restore removed historical sequence protections. Workflow 36376582911 completed SUCCESS with x64 artifact.
- `fa25dd9a7943a576efb48c5e6efc347e006276e7` + `bc61996b7613e0956ac3f382b08f502090db5056` — real VM/runtime operation-ownership acceptance added and wired into npm check. It proves inactive sale uses exactly one existing Legacy owner, inactive order_status fails closed with zero V2 writes, and ready takeover selects V2 exclusively with no dual-write.
- `ad33493464116b4f6d0af23ec8e20e38d19589e5` + `223ecafc672278a0c9b22564e8e36d9bb79f96ed` + `26eafd01574ad79ad58ce8bc3cbdd86b03c3a5bf` — delivery_assign_driver registered as a V2-only ownership-resolver operation, routing moved from direct Transport readiness to the single-owner resolver, and runtime ownership acceptance extended. No Legacy driver owner was invented.
- `09cc4d0fda5188fb696ea033e063ce7a6bd91fc3` — practical RC1 fixture aligned with the real ownership resolver; application fail-closed behavior was not weakened. Full gates/build/artifact SUCCESS.
- `cd787adc5b25b8a33847e06ff0ff8b2ae67065f4` — runtime acceptance proves delivery completion inherits order_status ownership: inactive takeover => OFFLINE_OPERATION_NO_SAFE_OWNER and zero durable writes; ready takeover => exactly one V2 order_status durable commit.
- `7d549492a0707ac4cb6c0148feac6930e41b1112` added a runtime reload/ACK/no-resurrection regression and intentionally failed, exposing a real canonical-identity rollback after ACK.
- `42921bdaf51610f6a43f66928f65c603e6124224` fixed that real recovery bug: a synced sale ACK may map a local order to its canonical server id, and later order_status/delivery patches may update operational fields but must not overwrite that canonical id with the old local id.

Current executable Source/CI evidence now proves:
1. Single mutation owner selection for sale/order_status/delivery assignment; no dual-write.
2. Fail-closed with zero durable writes when order_status/delivery ownership is unsafe.
3. Delivery completion is NOT a separate invented operation; Offline delivered remains the existing order_status durable path. Economic settlement remains server/online authority.
4. Pending order status survives a fresh runtime/reload from durable Native state.
5. After ACK, Local+Server identity reconciles to one canonical row.
6. A subsequent runtime/reload preserves canonical server identity, status, and one-row cardinality: no duplicate, no resurrection, no identity rollback.
7. Existing real SH-0007 acceptance remains the authority for explicit server ACK, server receipt, retry/idempotency, and exactly-once behavior. The new CI reload regression supplements but does not replace a real cold app restart.

Final build evidence for source HEAD `42921bdaf51610f6a43f66928f65c603e6124224`:
- GitHub Actions run: `36377856745` — SUCCESS.
- materialize-version: SUCCESS.
- Full source/regression gates in materialize: SUCCESS.
- Full source/regression gates in Windows build: SUCCESS.
- Windows x64 build: SUCCESS.
- Artifact: `sharawla-pos-10.5.4-beta.58.32-sh0007-x64`.
- Artifact ID: `10951676912`.
- Artifact size: 84,307,441 bytes.
- No Supabase deployment/write was performed by this continuation.
- No Production change was performed.
- No installer was installed on SH-0007 by this continuation.

### Exact next gate
Do not make more source changes merely to simulate a device restart. The remaining acceptance boundary for this corrected build is a real SH-0007 cold-restart sequence:
1. install this green x64 artifact on SH-0007 only;
2. enter the approved isolated Beta acceptance context and ensure V2 takeover readiness is explicitly established by the existing guarded acceptance flow — never auto-activate it;
3. disconnect network;
4. perform a real Restaurant UI order/status path (including a delivery path where practical) and verify durable local success/projection;
5. fully close the application/process and reopen while still Offline;
6. verify the same order/status/details/return-visible projection remains and no duplicate appears;
7. reconnect and sync;
8. require explicit server ACK/receipt and exactly one Cloud effect;
9. restart/reopen again and verify canonical server identity/status remains with no duplicate/resurrection;
10. replay the same transaction identity only through the existing acceptance mechanism and require stable exactly-once result.

Production SH-0005 / SH-0006 remain immutable/read-only on 10.5.3 CLEAN. Canonical Stock OFF. Cutover OFF. Do not call Universal Offline / RC1 Production Ready until the corrected build passes this SH-0007 real-device gate.
