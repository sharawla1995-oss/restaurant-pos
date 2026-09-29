# Sharawla Universal Dashboard V1 — Offline Behavior

## Authority contract

The dashboard preserves the existing ownership boundary:

- Local DB is Device Operational Authority.
- Cloud is Global/Central Authority.

V1 reads supported local operational rows only through `__SharawlaBeta554RuntimeRecovery.readOperationalRows`. It does not read the native outbox directly and does not introduce another cache, projection, replay, ACK, or reconciliation owner.

## Supported local datasets

The existing recovery adapter supports `orders`, `order_items`, `order_payments`, `expenses`, `returns`, `return_items`, `return_payments`, `customers`, customer addresses, and shifts. Dashboard V1 uses only the commerce rows needed for current-branch summaries.

## Offline UI

- The authority badge reads `LOCAL / OFFLINE` and “بيانات محلية على هذا الجهاز — ليست تجميعًا مركزيًا”.
- Branch selection is forced to the current branch.
- Current-branch commerce widgets may calculate from existing projections.
- Inventory, purchasing, specialized profile tables, Central Warehouse, employee directory, and cross-branch comparison are marked unavailable unless an existing authoritative local projection already covers them. V1 does not create one.
- No last-sync timestamp is invented. Existing `syncStats` provides counts but not a universal authoritative last-sync time.

## Reconciliation

The recovery adapter already reconciles native local projections with a Cloud baseline and gives a synced Cloud row precedence. The pure dashboard engine adds a final read-only identity collapse for mixed fixtures/results:

- entity aliases share a canonical identity namespace;
- `client_tx_id`, document IDs, offline references, and projection keys remain field-aware;
- a local ACK mapped through `_server_entity_id` collapses with the Cloud `id`;
- unrelated values in different identity namespaces do not collide;
- Cloud data wins for the same entity.

## Explicit exclusions

V1 does not modify `beta55-4-runtime-recovery.js`, Offline V2 storage/transport/takeover, Point 4, Bon allocation or replay digests, shift lifecycle ownership, or any offline write path.

## Failure semantics

If an operational local source is unavailable, the affected widget is unavailable/error—not zero. A local summary is never promoted to an all-branch or Cloud-confirmed result after reconnect unless a fresh Cloud read completes and passes the current request-generation guard.
