# Restaurant Universal Offline Audit V2 — 2026-09-28

## Safety boundary
Source/gates/tests only. No Supabase deployment. No Production write. SH-0005/SH-0006 remain immutable on 10.5.3 CLEAN. Canonical Stock and Cutover remain OFF.

## Contract
An OFFLINE_MUTATION is not closed until Durable Local Commit -> Local Projection -> Cold Restart Offline -> Sync -> Explicit ACK -> Exactly Once -> Reconciliation -> Restart without duplicate/resurrection.

## Evidence baseline
Audit baseline HEAD: d42f52be8c4562b5e99b29826d3069aec6a1bc33.

The generic runtime recovery caches exact successful GET queries, but only core operational tables have compatibility/native projections. Restaurant domain screens therefore depend on whether the exact query happened to be warmed online. That is not sufficient for universal offline operation.

## Restaurant operation matrix

| Area | Read offline now | Mutation offline now | Current evidence / verdict |
|---|---|---|---|
| POS sale | YES | YES | V2 owner/projection/transport exists; real SH-0007 sale/sync evidence exists. |
| Expenses | YES | YES | Core operational projection exists; real device sync evidence exists. |
| Orders / fulfillment status | YES | YES | cachedOrders + V2 order_status owner. |
| Kitchen/KDS | NO (not deterministic) | status transition YES | renderKitchen reads orders/order_items directly; exact-query cache is incidental. Must use shared local order bundles. |
| Customers / addresses | YES | YES | customersCache/customerAddressesCache + V2 direct operations. |
| Delivery assignment | YES | YES | delivery_assign_driver V2 owner/projection exists. |
| Delivery driver/zone administration | bootstrap read only | NO | permissions-v2-delivery-settings-routing.js explicitly requireOnline(). |
| Ingredients | partial snapshot/read cache | NO | inventory overview has complete food snapshot, but Restaurant Closure CRUD/adjust/conversion are direct RPCs. |
| Recipes / Food Cost | NO (not deterministic) | NO | direct REST reads and recipe RPC mutations. |
| Prep definitions | NO | NO | direct REST/RPC. |
| Production batch start/complete | NO | NO | direct REST + food_production_batch_*_action_v2 RPCs. |
| Waste | NO | NO | direct REST + food_waste_post_action_v2. |
| Food suppliers | NO | NO | direct suppliers REST + food_supplier_save_v1. |
| Ingredient purchase orders | NO | NO | direct purchases/purchase_items reads + create/approve/cancel RPCs. |
| Ingredient receiving | NO | NO | direct receipt data + food_purchase_receive_v1. |
| Supplier returns | NO | NO | food_supplier_return_create_v1 direct RPC. |
| Ingredient stock count | partial snapshot | NO | direct food_stock_count_post_v1. |
| Ingredient transfers | NO | NO | direct stock_transfers reads + create/receive/cancel RPCs. |
| Floors / tables configuration | NO | NO | direct restaurant_floors/restaurant_tables reads + save RPCs. |
| Table sessions | NO | NO | direct sessions/link reads + open/attach/close RPCs. |
| Inventory overview | YES (last complete snapshot) | N/A | intentionally read-only; does not invent pending stock effects before authoritative ACK. |

## Root cause classes
1. READ_PROJECTION_GAP: domain data is read from Cloud and only incidentally available if the exact GET query was cached.
2. MUTATION_OWNER_GAP: RPC is not registered as an Offline V2 operation and has no durable local owner.
3. LOCAL_PROJECTION_GAP: after durable commit the relevant screen has no deterministic local row/state to display.
4. REPLAY_CONTRACT_GAP: operation may have a server RPC, but no Offline V2 adapter/replay/ACK contract.
5. DEPENDENCY_IDENTITY_GAP: dependent offline entities need stable local identity mapping before child operations can be safely queued.
6. STOCK_AUTHORITY_GAP: stock-changing food operations cannot fabricate canonical stock while Canonical Stock/Cutover are OFF; pending effects need explicit pending projections and authoritative reconciliation.

## Dependency-closed implementation order
### Batch A — Restaurant Offline Read Foundation
Prewarm/cache deterministic branch/business snapshots for ingredients, units, recipes, prep/production/waste reference data, suppliers/purchases, floors/tables/sessions, and delivery settings. Kitchen must read the shared cached order bundles instead of Cloud-only reads. Reads must be branch/business scoped and cold-restart safe.

### Batch B — Reference/config mutations
Drivers/zones, suppliers, floors/tables, ingredient metadata/unit conversions, recipe/prep definitions. Add V2 owners, deterministic local IDs, local projections, server ACK identity mapping and restart tests.

### Batch C — Operational non-stock lifecycle
Table session open/attach/close and purchase-order draft/approve/cancel where safe dependency identity can be proven.

### Batch D — Stock-changing operations
Ingredient adjustment, purchase receive, supplier return, stock count, transfer create/receive/cancel, production start/complete, waste. Preserve Point 4 stock authority: durable pending effect locally, no invented canonical stock before server ACK unless the accepted stock contract explicitly owns the local effect.

### Batch E — Universal acceptance
For every OFFLINE_MUTATION: offline save UI confirmation, immediate local visibility, cold restart, reconnect, explicit ACK, exactly-once Cloud result, reconciliation, second restart with no duplicate/resurrection. Include two-branch isolation where applicable.

## Immediate next step
Implement Batch A source-only and add executable regression tests. Do not deploy SQL or activate Canonical Stock/Cutover.
