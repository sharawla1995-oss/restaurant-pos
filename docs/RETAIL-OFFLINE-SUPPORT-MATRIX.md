# Sharawla Retail Offline Support Matrix

Status: DESIGN / CURRENT-BEHAVIOR AUDIT
Implementation: NOT STARTED
Runtime change: NONE
DB mutation: NONE

This document distinguishes current guaranteed Offline behavior from Online-only Retail operations.

## 1. Current durable Offline owner

The current core queue explicitly persists only:
- sale
- return
- expense
- shift_open
- shift_close

Retail sale sync owner:
- create_retail_pos_order_atomic

Retail return sync owner:
- create_retail_order_return_idempotent

Variant-enabled Retail sale payloads are enriched before Offline persistence.

This is the current guaranteed local-first Retail business surface.

## 2. Guaranteed Offline-capable today

### Shift open
Status:
SUPPORTED

Behavior:
- local shift created;
- queued;
- remapped to server id after sync.

### Sale
Status:
SUPPORTED

Behavior:
- local order;
- local items;
- payments;
- Point4 identity;
- Retail owner on sync;
- exactly-once/idempotency protections.

### Return
Status:
SUPPORTED

Behavior:
- local return;
- local return items/payments;
- original order lineage;
- Retail return owner on sync.

Constraint:
the original order must be known/cached sufficiently for the return flow.

### Expense
Status:
SUPPORTED

Behavior:
- local expense;
- queued;
- tied to local/server shift remapping.

### Shift close
Status:
SUPPORTED

Behavior:
- local close state;
- metrics snapshot;
- queued sync.

Must preserve accepted driver cash custody blockers when applicable.

### Printing
Status:
LOCAL

Customer/report/prep printing is a local desktop concern and can operate without Cloud when the needed document data exists.

## 3. Offline-read support

### Bootstrap/navigation
SUPPORTED through cached bootstrap.

Cached scope includes:
- employee;
- branches;
- categories;
- products;
- modifiers;
- variants;
- delivery zones/drivers;
- payment methods;
- print settings;
- permissions;
- settings;
- active branch.

### Customer lookup
PARTIAL

Cached customer lookup and cached addresses exist.

This supports sale-time lookup better than full CRM offline editing.

### Orders
PARTIAL

Recent order bundles can be cached.

This is not equivalent to a complete historical Orders database offline.

## 4. Not guaranteed Offline today

The following do not have first-class entries in the standard offlineQueue sync switch:

### Retail Hold / Resume
- retail_suspend_sale
- retail_delete_suspended_sale

Current UX is backend-table/RPC dependent.

Status:
ONLINE-ONLY unless separately proven through Offline V2 takeover.

### Customer manual CRUD
- create
- edit
- delete
- address management
- import

Status:
ONLINE-ONLY for management operations.

Cached lookup remains available for sale support.

### Products / catalog editing
- category changes
- product changes
- price changes
- branch availability

Status:
ONLINE-ONLY.

### Market Settings
- unit type
- decimal rules
- embedded barcode configuration

Status:
ONLINE-ONLY.

### Retail Offers
- create
- edit
- archive

Status:
ONLINE-ONLY.

### Stock adjustment
- retail_inventory_adjust
- retail_variant_inventory_adjust_v1
- stock policy changes

Status:
ONLINE-ONLY as management operations.

Offline V2 inventory ledger support does not automatically make these editor actions local-first.

### Stock Count
- retail_post_stock_count

Status:
ONLINE-ONLY.

### Transfers
- retail_transfer_create
- retail_transfer_receive

Status:
ONLINE-ONLY.

### Suppliers
- create/edit terms

Status:
ONLINE-ONLY.

### Purchasing
- PR
- PO
- approve/reject
- GRN
- supplier return
- supplier invoice
- 3-Way Match
- replenishment
- Landed Cost

Status:
ONLINE-ONLY.

### Website intake
- list pending website orders
- accept
- reject
- reservation release

Status:
ONLINE-ONLY by product nature.

### Delivery management
- driver assignment
- route/status changes
- driver settlement/configuration

Status:
not part of the standard Retail Offline queue unless separately owned by an accepted Offline module.

### User / permission / settings management
Status:
ONLINE-ONLY.

### Reports
Status:
ONLINE-DEPENDENT for full current data.
Local cached data is not a complete report authority.

## 5. Inventory ledger clarification

Offline V2 includes an inventory ledger/projection layer.

It can derive/store inventory effects attached to supported offline operations.

Examples:
- sale deduction;
- return restoration;
- other registered inventory movement operations when a takeover adapter exists.

This does NOT mean every Retail inventory workflow has an Offline business owner.

Distinguish:

A. Inventory effect projection
vs
B. Full business workflow local-first ownership.

Retail closure must not advertise B where only A exists.

## 6. Recommended commercial Offline promise for Retail V1

For V1, the safest product promise is:

Guaranteed Offline:
- login/bootstrap within allowed cached/grace conditions;
- POS sale;
- returns for sufficiently cached orders;
- shift open/close;
- expenses;
- local printing.

Online required:
- inventory management;
- stock count;
- transfers;
- purchasing;
- suppliers;
- advanced purchasing;
- website order intake;
- admin/settings;
- full reports.

This is a valid commercial model if the UI clearly shows Online-required operations.

It is safer than expanding complex stock workflows before ownership/idempotency contracts are ready.

## 7. Optional future Offline expansion

If business demand requires it, expand in this order:

1. Hold/Resume local suspended sale.
2. Inventory adjustment.
3. Stock count.
4. Transfer create/receive.
5. Supplier return.
6. GRN.
7. PO/PR workflow only if approval semantics remain safe offline.

Each expansion needs:
- canonical client_tx_id;
- local durable record;
- single local owner;
- inventory projection;
- idempotent server owner;
- conflict semantics;
- authorization re-check on sync;
- cleanup/recovery;
- acceptance chaos tests.

Do not enable Offline approvals casually.

## 8. UI rule

When offline:

Supported operation:
- remain usable;
- show Offline/local state visibly.

Online-only operation:
- do not silently fail after data entry;
- disable or show clear "يتطلب اتصال بالإنترنت";
- preserve unsaved form only where explicitly designed.

## 9. Permissions on sync

Offline creation does not grant permanent authority.

At sync time backend re-evaluates:
- trusted Profile;
- Action permission;
- Location scope;
- business invariants.

If authorization changed:
- sync fails visibly;
- operation remains unresolved;
- no silent mutation.

## 10. Acceptance matrix

For each supported Offline operation test:

- network forced offline;
- operation succeeds locally;
- durable outbox exists;
- restart app;
- operation still pending;
- reconnect;
- sync once;
- server row/effect exactly once;
- ACK persists;
- local pending clears;
- stock/payment totals reconcile.

Chaos:
- lost ACK;
- app restart before sync;
- app restart during retry;
- duplicate retry;
- authorization revoked before sync;
- wrong branch after reconnect;
- update pending guard.

## 11. Current state

Retail POS Offline core:
SUBSTANTIALLY PRESENT.

Retail management-operation Offline:
NOT IMPLEMENTED as a general guarantee.

Recommended Retail V1 promise:
POS-critical Offline only.

Final decision:
to be approved before Retail commercial closure.
