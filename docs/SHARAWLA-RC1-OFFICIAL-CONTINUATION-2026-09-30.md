# SHARAWLA RC1 — OFFICIAL CONTINUATION CHECKPOINT / HANDOFF
Date: 2026-09-30
Repository: sharawla1995-oss/restaurant-pos
Official branch: rc1-beta58-32-performance-hotfix
Authoritative code HEAD before this checkpoint document: e260ccd5b216dc8abd79e9799309ecfeb62a17b9
Purpose: exact continuation state for a new ChatGPT/session. Do not reopen CLOSED evidence unless contradictory evidence appears.

## 1. HARD SAFETY BOUNDARY
- Production SH-0005 (Dokki) and SH-0006 (20th): 10.5.3 CLEAN, immutable/read-only.
- Never run Beta, Migration, Reset, Rebind, acceptance mutation, or experimental deployment on SH-0005/SH-0006.
- Beta device only: SH-0007, Business = تجريبي, Branch = TEST.
- Canonical Stock = OFF. Cutover = OFF.
- No Supabase deployment/write unless separately and explicitly authorized.
- No SH-0007 device write/install/reset unless separately and explicitly authorized.
- No Activation/Licensing/Canonical Fingerprint/Device Identity/Printing/Updater change unless explicit.
- The old special runtime protection for historical sequences 293/304/316 is REMOVED. They are ordinary historical test data. Legacy checker wording may still mention them; that wording is not an active runtime safety rule.
- Source/build work does not equal live SH-0007 deployment.

## 2. ARCHITECTURAL RULE
Offline authority:
- Local DB = Device Operational Authority.
- Cloud = Global/Central Authority.
Required supported-write flow:
Local durable commit -> Outbox -> Replay -> Server -> ACK -> Local reconciliation.
Replay must be idempotent.
Every mutation must be either:
1. Full Offline ownership/sync flow, or
2. Strict Online-only / Fail-Closed with zero unsafe Offline write.
A local save alone is NOT proof of Offline support.

## 3. POINT 4 — CLOSED
- Ownership Mapping: 61/61 CLOSED.
- Direct + Transitive + Document/In-flight Barriers: CLOSED.
- 46/46 pre-cutover guard contracts: SOURCE ACCEPTED.
- Historical authoritative owners: resolved.
- Reservation Identity V1: CLOSED.
- Food Sale/Return provenance: CLOSED.
- Return rule: restore from historical consumption snapshots; never recalculate current recipe.
- Point 4 historical evidence must not be reopened absent contradictory evidence.

## 4. PRACTICAL OFFLINE BASE / FIXES ALREADY CLOSED
Historically tested on SH-0007:
- Offline Sale.
- Offline Delivery order.
- Offline Expense.
- Offline Return.
- Immediate local RAW on tested paths.
- Reconnect and sync on tested paths.
- No data loss in those tested scenarios.
Fixed source issues include:
- Duplicate Offline notice.
- MutationObserver loop.
- Overlapping network polling.
- Delivery/Expense RAW.
- Unified operational local projections.
- Local -> Server ACK reconciliation.
- Cross-field identity collision.
Important RAW patch: f27017101280186911ec3989f24aba6c8ba39383.

## 5. RETAIL / FOOD / WAREHOUSE / CUSTOMER / DELIVERY SOURCE OWNERSHIP
Retail Purchasing V2 authoritative paths:
- retail_purchase_order_create_v2
- retail_purchase_receive_v2
- retail_supplier_return_create_v2
Replay-safe owners:
- offline_retail_supplier_create_v1
- offline_retail_purchase_order_approve_v1
GRN must use authoritative purchase_order_item_id. Never fabricate IDs.
Stock variants require explicit variant identity.

Other audited Retail mutations are strict Online-only Fail-Closed where no full Offline owner exists.

Food/Central Warehouse source gates cover:
- Food PO lifecycle.
- Receiving.
- Supplier return.
- Stock count.
- Transfer create/receive/cancel.
- Ingredient stock adjustment.
- Production lifecycle.
- Waste.
- Ingredient master/conversion.
- Recipe activation.
- Prep item recipe dependency.
- Central warehouse request/state/stock lifecycle.
- Central warehouse config authority (Offline fail-closed).

Customer/Delivery true Offline E2E source acceptance covers:
- Customer create/update.
- Address save/delete.
- Delivery assign driver.
- Order status.

## 6. BON
- BON source contract is CLOSED.
- Online next BON uses pos_next_bon_v1.
- Offline must never invent an official BON.
- Offline official BON only from trusted pre-reserved capacity; otherwise OFF-*.
- BON live deployment remains separate authorization work. Do not claim it is live merely because source is closed.

## 7. SYSTEM-WIDE OFFLINE CLOSURE
The system-wide Runtime Mutation Ownership audit was closed across the reviewed loaded runtime.
Important closure matrix:
RC1 Offline Closure Matrix PASS — strict=53; warehouse=2; website=2; routing=2; unresolved=0.
Direct Cloud-authoritative and special mutation paths are guarded/fail-closed where they do not own a full Offline route.
Do not reopen the source-wide ownership audit without new contradictory runtime evidence.

## 8. PRACTICAL ACCEPTANCE SAFETY
Customer/Delivery mutating acceptance has a defense-in-depth sandbox lock:
- support_code = SH-0007
- Business = تجريبي
- Branch = TEST
Central Acceptance Registry additionally checks the isolated Beta backend/business/support identity.
PR #25 merged this safety work.
Read-only SH-0007 preflight was added in PR #26.
Windows PR candidate gate/build wiring was closed in PR #27/#28.

## 9. WINDOWS BUILD GATE
PR #28 fixed Windows-specific CI/build issues:
- npm run check:ci avoids Windows command-length overflow.
- CRLF-safe source checkers.
- packaged app.asar inventory marker aligned to current runtime.
Official merge after PR #28: bfe7a38c529e0f296a9c786a82dc2e45959bf2c7.

## 10. ZERO-STATE REQUIREMENT — CURRENT LATEST WORK
User requires final practical acceptance to begin from a true operational zero state on SH-0007/TEST:
- Orders = 0
- Delivery operational orders = 0
- Returns = 0
- Expenses = 0
- Shifts/test transactions = 0
- old Offline queue/projections/test operational data = 0
- after Reload/Restart/Sync, old data must NOT resurrect.
Preserve:
- Business تجريبي.
- Branch TEST.
- user/permissions.
- device identity/Activation.
- catalog/settings needed to operate and test.

### Reset V7 findings
Existing resetGroups() already uses reset_pos_data_v7 and:
- creates full local backup.
- creates full Cloud JSON backup.
- performs branch-scoped Cloud reset.
- performs scoped Offline V2 cleanup on SH-0007/TEST.
- cleans compatibility caches and IndexedDB.
- has Partial Failure semantics.
Cloud V7 orders group DOES delete returns and verifies orders/returns/website_orders are gone.
The normal scoped Offline reset intentionally does NOT clear the entire Offline V2 inbox/state.
That makes normal scoped Reset insufficient as the guaranteed final acceptance Zero-State path.

### Zero State V1 added
PR #29: fix: add SH-0007 operational zero state v1
Merged: YES.
Merge SHA: e260ccd5b216dc8abd79e9799309ecfeb62a17b9
Feature source:
- resetSh0007ZeroState()
- hard locked to SH-0007 / TEST.
- operational groups only: orders, shifts, expenses, customers, delivery.
- deliberately preserves catalog/promos/permissions/settings/audit.
- local + Cloud backup before destructive Cloud call.
- reset_pos_data_v7 Cloud reset first.
- only after verified Cloud success: offlineV2.resetTestAll(scope).
- clears Offline V2 outbox/records/mappings/inbox/device sequence test state through the existing test-only full reset.
- runs sandbox.cleanRuntime(scope).
- cleans IndexedDB operational compatibility keys/prefixes.
- verifies no outbox/sync/inbox residue.
- explicit ZERO_STATE_PARTIAL_FAILURE if Cloud reset succeeded but local cleanup failed.
- NOT wired to a UI button. It cannot be accidentally invoked from the normal Reset UI.

Regression gate:
scripts/check-rc1-sh0007-zero-state-v1.js
Integrated into scripts/run-full-checks.js.

PR #29 final source head before merge:
f16989601b71c0632f5dabe5b505ff470b28604a
Source CI:
Run #78 = SUCCESS
Full source and regression gates PASS = 184/184
Zero State V1 gate = PASS.

Windows candidate:
Run #786 = SUCCESS.
All Windows steps PASS:
- dependency install
- sqlite3 N-API verification
- candidate validation
- Windows x64 installer build
- packaged app.asar verification
- SH-0007 sandbox installer artifact upload.

No actual SH-0007 Reset or install was executed by this source work.
No Supabase deployment/write was executed by this source work.

## 11. IMPORTANT DISTINCTION: WHAT IS CLOSED VS WHAT IS NOT
CLOSED / SOURCE VERIFIED:
- Point 4 ownership/evidence.
- Source-wide mutation ownership audit.
- Offline Closure Matrix.
- Reset V7 source contract.
- Zero State V1 source contract.
- Source suite 184/184 for PR #29.
- Windows candidate Run #786 PASS.

NOT YET CLAIMED AS LIVE/PRACTICALLY VERIFIED:
- Zero State V1 has NOT been executed on SH-0007.
- Final clean-state practical acceptance after Restart/Sync has NOT been completed.
- This checkpoint does not claim a new installer was installed on SH-0007.
- No new Supabase deployment is implied.
- BON server deployment remains separately authorized if still required.
- Server dispatcher live deployment state must be checked only if practical runtime exposes a relevant failure; do not reopen it speculatively.

## 12. EXACT NEXT PHASE
The next phase is Practical Runtime Acceptance on SH-0007 only.

Before any device write, obtain explicit authorization for SH-0007 Beta device actions.
The intended runtime sequence is:
1. Confirm the exact approved installer/artifact corresponding to the final merged source.
2. Install/update on SH-0007 only if explicitly authorized.
3. Establish a true operational Zero State for TEST.
4. Because Zero State contains a Cloud V7 destructive call, obtain separate explicit authorization for the test-business Cloud write before executing it.
5. Verify immediately:
   - Orders 0
   - Delivery operational orders 0
   - Returns 0
   - Expenses 0
   - Shifts/test transactions 0
   - Offline outbox/records/mappings/inbox operational residue 0
6. Reload.
7. Restart application/device as required.
8. Sync/reconnect.
9. Re-check all zero-state counters and prove no old Delivery/Returns resurrect.
10. Then run practical Offline/Sync acceptance operation-by-operation across the system.
11. For every practical failure: identify the owning layer and fix only that path; do not reopen already-closed architecture/evidence without contradictory proof.

## 13. REQUIRED AUTHORIZATION BOUNDARIES FOR NEXT CHAT
Do NOT silently perform:
- SH-0007 installer/device write.
- SH-0007 actual reset.
- Supabase/test-business Cloud destructive reset/write.
Ask for explicit permission at the point each is required.
Never touch SH-0005/SH-0006.

Suggested authorization wording:
"The source/build gates are closed. The next step writes only to SH-0007 Beta: install the approved build and prepare the local side for practical acceptance. The actual Zero-State Cloud V7 reset is a destructive write to the TEST business and requires separate explicit permission. No SH-0005/SH-0006. Authorize the SH-0007 install/device step?"

Then separately before Cloud reset:
"Authorize the Zero-State destructive Cloud V7 reset for Business تجريبي / Branch TEST only, with pre-reset local + Cloud backups, followed by full SH-0007 local cleanup and Restart/Sync verification?"

## 14. CONTINUATION KEYWORD
When the user says "بلح":
Return the authoritative roadmap/checkpoint:
- completed
- current/open
- blockers
- safety boundaries
- exact next step
Do not reopen closed evidence unless contradictory evidence appears.

## 15. AUTHORITATIVE CONTINUATION POINTER
Start from this checkpoint file and the current official branch HEAD.
The code merge immediately before this checkpoint document is:
e260ccd5b216dc8abd79e9799309ecfeb62a17b9
PR #29 is merged.
Source Run #78 PASS 184/184.
Windows Run #786 PASS.
Next work = explicit-authorized SH-0007 Practical Runtime Acceptance / Zero-State execution and verification.
