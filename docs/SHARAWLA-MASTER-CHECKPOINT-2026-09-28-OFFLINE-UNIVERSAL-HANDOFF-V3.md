# SHARAWLA MASTER CHECKPOINT — UNIVERSAL OFFLINE HANDOFF V3
Date: 2026-09-28
Repository: sharawla1995-oss/restaurant-pos
Branch: rc1-beta58-32-performance-hotfix

## 0. HOW TO CONTINUE — READ THIS FIRST
This document is the authoritative continuation checkpoint for the next ChatGPT session.

Before ANY edit:
1. Read this file completely.
2. Fetch the exact remote HEAD of `rc1-beta58-32-performance-hotfix`.
3. Inspect the latest workflow run for that exact HEAD.
4. If CI is failed: inspect and fix the FIRST REAL failure before expanding scope.
5. If CI is pending/running: do read-only inspection only; do not stack unrelated source work.
6. Never force-push and never overwrite concurrent branch changes.
7. Treat all Point-4 historical provenance/ownership closure as CLOSED unless new contradictory evidence appears.

Functional HEAD immediately before this handoff document:
`6176e33c1486dbe08199f22588236a4393abc22d`
Commit: `ci(offline): require guarded food receiving gate`

At handoff creation time, workflow run `36478097272` for that functional HEAD was IN PROGRESS.
The immediately earlier functional commit `28cf16e862c935c4f7b14951c9bd8a2875039010` had workflow run `36478023031` SUCCESS.
Therefore: DO NOT claim D1 Receiving fully closed until the exact mandatory-gate run at/after `6176e33c...` is verified SUCCESS.

## 1. HARD SAFETY BOUNDARY — MUST NOT CHANGE
- Production SH-0005 (الدقي) and SH-0006 (العشرين) remain immutable/read-only on 10.5.3 CLEAN.
- Current engineering/testing target only: SH-0007 / Business تجريبي / Branch TEST.
- Canonical Stock = OFF.
- Cutover = OFF.
- No Supabase/Beta/Production DB deployment unless the user explicitly authorizes it.
- Current Universal Offline work is SOURCE + TEST/GATE work.
- Do not touch Activation, License, Business Connection, Canonical Fingerprint, device identity, Printing, Updater.
- No destructive Production operations.
- Do not restore old special Reset protections for sequences 293/304/316; user explicitly removed that requirement.
- Do not use resetTestAll for normal Reset.
- For stock-changing Offline work: local DB may hold a pending operational projection, but MUST NOT pretend local ingredient stock is authoritative. Server guarded replay + ACK remains stock authority.
- Do not invent new server tables/RPCs unless a concrete operation proves the existing server contract is insufficient.

## 2. UNIVERSAL OFFLINE DEFINITION OF DONE
Every operation must be classified as one of:
- OFFLINE_MUTATION
- OFFLINE_READ
- ONLINE_ONLY
- NOT_APPLICABLE

An OFFLINE_MUTATION is NOT closed until:
Durable Local Commit
→ Local Projection
→ Restart Offline
→ Sync
→ Explicit ACK
→ Exactly Once
→ Reconciliation
→ Restart without Duplicate/Resurrection.

Architecture principle:
Local DB = Device Operational Authority.
Cloud = Global/Central Authority.
For stock-changing operations specifically, authoritative stock quantity/cost changes are applied by the guarded server stock writer at replay/ACK time; local pending UI must not fabricate final stock.

## 3. POINT 4 / HISTORICAL CLOSED STATE
Do not reopen without contradictory evidence:
- Ownership mapping = 61/61 CLOSED.
- Pre-cutover Guard Contracts = 46/46 SOURCE ACCEPTED.
- Deployment remains separately controlled; source acceptance is not deployment authorization.
- Canonical Stock OFF / Cutover OFF.
- Food sale provenance closed:
  `create_food_pos_order_atomic_v1` → frozen recipe evidence → ingredient consumption/cost snapshots.
- Food return provenance closed:
  `create_food_order_return_idempotent_v1` → historical `food_order_item_consumption_snapshots`; never recalculate return from current recipe.
- Final Point-4 guarded definitions exist for stock-changing food operations. When auditing stock operations, use the FINAL guarded definitions, not older base definitions in `supabase-beta55-restaurant-operations.sql`.
- Important final guard artifact:
  `supabase-point4-transitive-action-document-guards-v1.sql`.
  Example: final `food_purchase_receive_v1` resolves/validates the full affected set and calls `inventory_stock_assert_legacy_write_allowed_v2` BEFORE receipt document insertion.

## 4. RESET / BON / TAKEOVER STATUS
### Reset V7
Source/design and TEST acceptance largely closed:
- branch-scoped vs business-global distinction.
- fail-closed unsafe scope.
- backup completeness.
- SQLite + IndexedDB + Native V2 + compatibility cleanup.
- operational read-path verification.
- Partial Failure semantics.
- selected groups and basic restart/no-resurrection tested.
Do not restore Seq293/304/316 protection.

### BON
Real-device finding:
- server allocation was correct (example: actual BON 3 while badge showed 1).
Source fix exists:
- authoritative `pos_next_bon_v1` reader.
- no guessing from orders.
- unavailable source shows dash / “يحدد عند حفظ البون”.
- Offline shows “بعد المزامنة”.
- regression gate exists.
IMPORTANT: this RPC source fix has NOT been deployed to Beta Supabase because DB deployment was not authorized. Installed beta58.32 cannot fully exercise it until authorized.

### Offline V2 Takeover
- Default remains disabled; no automatic activation.
- SH-0007 was explicitly activated by user through diagnostics after preflight PASS.
- Restaurant preflight support was fixed.
- Do not auto-activate any other device/business.

## 5. UNIVERSAL RESTAURANT OFFLINE AUDIT
Audit document:
`docs/RESTAURANT-UNIVERSAL-OFFLINE-AUDIT-V2-2026-09-28.md`

Root gap classes:
1. READ_PROJECTION_GAP
2. MUTATION_OWNER_GAP
3. LOCAL_PROJECTION_GAP
4. REPLAY_CONTRACT_GAP
5. DEPENDENCY_IDENTITY_GAP
6. STOCK_AUTHORITY_GAP

Original broad audit included:
POS sales/orders, expenses, kitchen, customers/addresses, delivery assignment/admin, ingredients, recipes/food cost, prep, production, waste, suppliers, ingredient POs, receiving, supplier returns, stock count, transfers, floors/tables, table sessions, inventory overview.

## 6. COMPLETED UNIVERSAL OFFLINE WORK

### A. Restaurant Offline Read Foundation — SOURCE/GATE CLOSED
- scoped cache by business + branch.
- deterministic Restaurant read snapshots.
- ingredients, stock, units, products/variants, recipe/prep, purchasing/receipts, branches/transfers, floors/tables/sessions, dine-in, etc.
- Kitchen local-first read path added.
- CI gates green.
Real-device exhaustive acceptance still belongs to final Universal acceptance.

### B. Reference/config mutations — SOURCE/GATE CLOSED
#### Suppliers
- idempotent owner + transport + runtime projection + local-first UI.
- ACK reconciliation and duplicate prevention.
- performance gate fixed.

#### Delivery driver/zone admin
- idempotent owners + transport + projections + local-first UI.
- branch isolation.
- CI green.

#### Floors/Tables
- idempotent owners.
- V2 transport.
- durable projections.
- unresolved identities fail closed.
- local-first config.
- runtime + mandatory CI green.

#### Table Sessions
- open/attach/close owners.
- pending order resolution via sale tx/server receipt.
- durable projections + local-first UI.
- lifecycle runtime gate + mandatory CI.
- four-state compatibility closed.
Potential real-device details to verify later:
  - cachedOrders shape vs cachedOrderBundles.
  - displayed table status from open session when cloud table status stale.
  - local/canonical session link counts after ACK.

#### Four-state compatibility contract
For optional Offline mutations:
1. V2 active + Offline → durable local owner.
2. V2 active + Online → V2 interception.
3. V2 inactive + Online → canonical RPC payload with offline-only tx/dependency fields stripped.
4. V2 inactive + Offline → fail closed.
Implemented via `commitOptionalTxRpc` and regression gates.

#### Ingredient metadata / unit conversions
- idempotent owners.
- transport.
- durable projections.
- ACK/dependency guards.
- local-first UI.
- four-state behavior.
- source/runtime/performance/mandatory gates.
Stock adjustment deliberately NOT included here.

### Recipe / Prep reference lifecycle — SOURCE/GATE CLOSED
Recipe Draft:
- idempotent owner.
- transport.
- durable `offlineV2RecipeVersions`.
- local-first UI.
- pending local ingredient dependency fails closed.
- restart/ACK/no-resurrection gate.

Recipe Activate:
- idempotent owner.
- transport.
- runtime owner.
- safe UI routing.
- CI green.

Prep Item + Prep Recipe Draft:
Key commits:
- `3d713ba...` prep owners.
- `d8faa849...` prep transport.
- `f4bf1fcc...` prep durable projections.
- `d856350a...` prep local-first UI.
- `455bf813...` restart/ACK lifecycle test.
- `12652048...` mandatory gate.
- `aba680d...` gate aligned with durable result contract.
- `161921b4...` fixed real ACK reconciliation bug.
Result:
- local Prep Item survives restart.
- ACK replaces local prep ID with canonical prep_item_id and preserves output_ingredient_id.
- Prep Recipe requires canonical prep item + canonical ingredient IDs.
- pending local dependencies fail closed.
- no duplicate/resurrection after ACK.
- SOURCE/GATE CLOSED.

## 7. BATCH C — INGREDIENT PURCHASE ORDER LIFECYCLE — SOURCE/GATE CLOSED
Operations:
- Draft/Create
- Approve
- Cancel
Receiving is NOT part of Batch C.

Canonical facts:
- `food_purchase_order_create_v1` already has client_tx_id idempotency.
- approve/cancel are state-idempotent on canonical server purchase ID.
- pending local PO cannot be approved/cancelled until create ACK gives canonical ID.

Important commits:
- `d716704d...` PO lifecycle owners.
- `7fa13e7f...` fixed an existing malformed Prep whitelist expression AND safely bound Prep + Food PO transport.
- `aa0f0ca...` PO durable lifecycle projection.
- `3c827d9...` PO local-first UI.
- `848b7d7...` restart/ACK lifecycle gate.
- `f733c1c...` mandatory gate.
- `2dd22682...` fixed real PO canonical ACK reconciliation bug.

Verified workflow:
- run `36476672261` on `2dd22682...` = SUCCESS.

Behavior:
- Create Offline → `offline-food-po-<tx>`.
- restart Offline retains it.
- pending local PO approve/cancel fails closed.
- create ACK replaces local PO identity with canonical purchase_id.
- canonical PO can approve/cancel Offline through safe owner.
- repeated reconciliation produces one row, no resurrection.
- inactive+online strips offline tx and uses canonical path.
- inactive+offline fails closed.

## 8. BATCH D1 — GUARDED FOOD PURCHASE RECEIVING — CURRENT ACTIVE POINT
This is the exact current work area.

### Canonical contract audit
Base canonical RPC:
`food_purchase_receive_v1(p_purchase_id bigint,p_items jsonb,p_client_tx_id text)`

It is idempotent by client_tx_id and changes ingredient stock.
DO NOT use the older unguarded-looking base definition as the authority.
The FINAL accepted Point-4 definition in:
`supabase-point4-transitive-action-document-guards-v1.sql`
does:
- resolve and validate all purchase_item lines first.
- validate quantity and remaining quantity.
- guard every affected ingredient with
  `inventory_stock_assert_legacy_write_allowed_v2(branch,'ingredient',ingredient_id)`
  BEFORE the receipt document is inserted.
- only then insert receipt and call `food_apply_ingredient_delta_internal_v1`.
This final guarded definition is the required server stock writer.

### D1 commits already made
1. `72aa0973a2cbacfff3dde22d2903a5834e274c3a`
   `feat(offline): add guarded food purchase receipt owner`
   File:
   `supabase-offline-v2-restaurant-food-receive-owner-v1.sql`
   Source-only.
   Wrapper requires canonical purchase and purchase_item dependencies and delegates stock write to guarded canonical `food_purchase_receive_v1`.

2. `3b543a309ab1d49c747c194d04eea8c8dcb6c62c`
   `feat(offline): bind guarded food receipt transport`
   Adds operation `food_purchase_receive` → `offline_food_purchase_receive_v1`.

3. `a4cbe1a3cbe590315ac828d12b0347aea67c98fc`
   `feat(offline): add pending food receipt projection`
   Runtime projection key:
   `offlineV2FoodPurchaseReceipts`
   Local identity:
   `offline-food-receipt-<tx>`
   Projection explicitly carries:
   `stock_authority: 'server_ack_only'`
   It does NOT mutate authoritative local ingredient stock.

4. `28cf16e862c935c4f7b14951c9bd8a2875039010`
   `feat(offline): route food receiving through guarded owner`
   UI in `beta55-restaurant-closure-ui.js`:
   - canonical purchase + purchase_item IDs required.
   - uses `commitOptionalTxRpc('food_purchase_receive_v1', ...)`.
   - Offline durable message:
     “تم حفظ الاستلام محليًا وسيتم تحديث المخزون بعد المزامنة”
   - no fake local stock update.
   Workflow run `36478023031` = SUCCESS.

5. `3a8edbc61130b0c4c3e9b1786bff67c1295274d5`
   `test(offline): guard food receiving restart ACK stock authority`
   Runtime gate verifies:
   - durable Offline receipt.
   - restart retention.
   - local PO dependency fails closed.
   - ACK replaces local receipt ID with canonical receipt_id.
   - repeated reconciliation no duplicate.
   - restart after ACK no resurrection.
   - inactive+online canonical path strips client tx.
   - inactive+offline fails closed.
   - test harness throws if runtime tries to write keys matching ingredientStock / ingredient_stock / stockCache.
   - UI uses guarded owner and stock-after-sync message.

6. `6176e33c1486dbe08199f22588236a4393abc22d`
   `ci(offline): require guarded food receiving gate`
   Adds D1 gate to mandatory `npm run check`.
   At handoff creation: workflow run `36478097272` was IN PROGRESS.

### EXACT NEXT STEP
First action in the next chat:
- verify current remote HEAD.
- inspect latest CI for `6176e33c...` or its descendant.
- If SUCCESS: mark D1 Receiving SOURCE/GATE CLOSED.
- If FAILED: inspect first real failure and fix it before continuing.
- Do NOT deploy the owner/transport SQL.

After D1 Green, continue Batch D one stock-changing operation at a time, preserving server stock authority.

## 9. REMAINING BATCH D STOCK-CHANGING WORK
Do not implement all at once. Audit final Point-4 definition first for each operation.

Recommended sequence:
1. Supplier Return
   Canonical: `food_supplier_return_create_v1`
   Final guarded definition exists in `supabase-point4-transitive-action-document-guards-v1.sql`.
   It validates stock sufficiency + unit conversion and guards affected ingredients before document insertion.
   Offline projection must be pending return only; no fake local stock decrement.

2. Stock Count
   Canonical: `food_stock_count_post_v1`
   Base source already shows deterministic full validation + guard union before header insert.
   Offline semantics are especially sensitive: local UI may record pending counted quantities, but must not replace authoritative system stock until server ACK/reconciliation.

3. Transfers
   - `food_stock_transfer_create_v1`
   - `food_stock_transfer_receive_v1`
   - `food_stock_transfer_cancel_v1`
   Final guarded definitions exist.
   Create deducts source stock server-side; receive adds destination; cancel restores source.
   Pending local transfer state must be visually distinct from authoritative stock.

4. Ingredient Stock Adjustment
   Audit canonical/final guarded contract before implementation.

5. Production
   - start lifecycle where safe.
   - complete is stock-changing and must use final guarded definition/frozen consumption evidence.
   Never fabricate output/consumption stock locally.

6. Waste
   Final guarded action `food_waste_post_action_v2` exists and guards ingredient before delegating to canonical waste post.
   Pending local waste event only; server ACK is stock authority.

For EVERY Batch D operation:
- canonical dependencies only unless explicit safe mapping exists.
- durable local operation.
- pending operational projection.
- restart Offline.
- guarded server replay.
- explicit ACK.
- exactly once.
- canonical identity reconciliation.
- restart no duplicate/resurrection.
- test that no authoritative stock cache is mutated locally.

## 10. OTHER UNRESOLVED UNIVERSAL OFFLINE ITEMS
### ORDER_NOT_FOUND
A real-device/local detail issue was observed:
- order exists in list but detail/card can show `ORDER_NOT_FOUND`.
Likely local projection/detail identity resolution issue after sync.
Not closed. Must be investigated before Universal Offline final acceptance.

### Real-device acceptance
Many new source/gate closures still need practical SH-0007 acceptance after an authorized Beta build/deployment path.
Source/gate green is NOT equivalent to Production Ready.

### Universal per-control closure
The broad Restaurant audit covered all major areas, but not every button/action has been practically accepted 100%.
Final phase must inventory remaining controls and classify each operation.

## 11. NO DB DEPLOYMENT STATUS
The recent Offline owners/transports are SOURCE ONLY.
No authorization has been given to deploy these SQL changes to Beta Supabase.
Do not claim SH-0007 can exercise a new server RPC/owner until the required SQL is actually deployed under explicit authorization.
Production remains untouched.

## 12. FUTURE AFTER UNIVERSAL OFFLINE
After Universal Offline is fully closed and practical acceptance is complete:
- implement the new “الملخص” managerial dashboard.
Target includes branch/date filters, sales KPIs, orders, average order, returns, discounts, expenses, hourly sales, peak periods, branch comparison, payment distribution, best sellers, latest orders, stock alerts.
Keep “الرئيسية” as operational home and “الملخص” as managerial analytics.
Do not mix this phase into current stock-authority work.

Future roadmap also includes Sharawla Accounting, but only after Offline/Canonical Stock/Inventory/Purchasing are stable.

## 13. AUTOMATION / CONCURRENCY WARNING
An hourly automation named `Sharawla Offline Continuation` exists and may advance the same branch.
Therefore EVERY new chat/tool session must fetch remote HEAD immediately before editing.
A 409 during update means the branch moved; re-fetch and reconcile. Never force overwrite.

## 14. SHORT HANDOFF COMMAND FOR NEXT CHAT
Use this instruction:

“Continue Sharawla Universal Offline from `docs/SHARAWLA-MASTER-CHECKPOINT-2026-09-28-OFFLINE-UNIVERSAL-HANDOFF-V3.md` on branch `rc1-beta58-32-performance-hotfix`. Read the whole checkpoint first, verify exact remote HEAD and latest CI before edits, then continue the EXACT NEXT STEP. Preserve all hard safety boundaries. No Supabase/Beta/Production DB deployment, no Production writes, Canonical Stock OFF, Cutover OFF. Fix the first real CI failure before expanding scope.”

END OF HANDOFF.
