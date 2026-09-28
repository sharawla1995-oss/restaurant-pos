# Sharawla Offline Universal Operation Contract V1

Date: 2026-09-28
Scope: architecture/source contract only. SH-0007 is the acceptance device. SH-0005/SH-0006 Production remain read-only.
Canonical Stock remains OFF. Cutover remains OFF.

## Why this contract exists

Real SH-0007 operator testing exposed a repeated class of failures that isolated feature patches cannot safely solve:

- an order can be visible Offline while its detail/items are unavailable to another screen;
- an order-status mutation is implemented in Offline V2 but the ordinary UI can still be blocked by an inactive takeover gate;
- return lookup can fail Offline even when the sale is visible locally;
- bon allocation/reconciliation can be correct in Cloud while the visible local counter remains stale.

The invariant is therefore operation-level, not screen-level.

## Classification

Every user-visible operation MUST be registered as exactly one of:

1. `OFFLINE_MUTATION` — business mutation is allowed without network.
2. `OFFLINE_READ` — read/navigation must work from an identified local projection/cache.
3. `ONLINE_ONLY` — operation inherently requires a live authority and MUST fail closed before any business write.
4. `NOT_APPLICABLE` — not available for the active profile/capability set.

No operation inherits Offline support merely because another operation on the same page is Offline-capable.

## Mandatory OFFLINE_MUTATION lifecycle

An `OFFLINE_MUTATION` is not accepted unless one authoritative owner provides the complete lifecycle:

`local input -> permission/scope validation -> stable identity -> durable local transaction -> local projection -> UI success -> restart recovery -> sync -> server idempotent owner -> explicit ACK -> mapping/reconciliation -> projection refresh`

Required invariants:

- success MUST NOT be reported before durable local commit;
- `client_tx_id` is stable across retry/restart;
- branch/business/device identity is captured at commit time;
- local projection is updated by the same committed operation or an atomic projection record;
- app restart Offline reproduces the committed business state;
- sync retries the same identity, never invents a replacement operation;
- Cloud applies the operation exactly once or returns the existing receipt;
- `synced` is set only after explicit server ACK;
- ACK mappings replace temporary/local identities without duplicating visible rows;
- reconciliation refreshes counters/status/projections from the authoritative accepted result;
- legacy and V2 owners MUST NOT both write the same business mutation.

## Mandatory OFFLINE_READ lifecycle

An `OFFLINE_READ` must name its local owner and the complete data shape required by the screen/action.

A list row is not proof that details are Offline-ready. If details require order + items + payments, the local projection must contain order + items + payments.

Read path:

`authoritative local projection -> local filter/lookup -> visible stale/source state when applicable`

Network may refresh the projection when available, but loss of network MUST NOT turn an already accepted local object into "not found".

## ONLINE_ONLY contract

An `ONLINE_ONLY` operation MUST:

- detect missing authority/network before the first durable business write;
- show a clear operator-facing message;
- create no local fake success and no pending mutation;
- preserve the current local projection unchanged.

Examples include operations that require a live cross-branch/global authority unless a dedicated Offline owner is later designed.

## Ownership / takeover rule

Takeover is an ownership migration mechanism, not an operator-visible feature dependency.

An operation classified `OFFLINE_MUTATION` MUST NOT be unusable merely because a historical/global takeover switch is inactive. Before release it must have one explicit active owner selected by the operation registry. If ownership cannot be resolved safely, fail closed.

Removing a takeover guard without proving single ownership is forbidden.

## Projection rule

Every mutation declares the projections it invalidates/updates. At minimum:

- sale: orders, order items/payments, delivery/orders list, home totals, bon counter where applicable;
- return: return rows/items/payments, original-order return availability, stock-facing projection;
- expense: expenses + shift totals;
- shift open/close: current shift + shift history/counters;
- customer/address: customer/address lookup;
- order status: order list + detail + delivery queue/status;
- delivery assignment/completion: order + driver/custody/economic state.

## Bon/counter rule

Visible counters are projections, not independent truth.

After local allocation, server ACK, reconnect, reset, or restart, the visible next-bon value MUST be reconciled from the authoritative counter/accepted reservation state. A stale badge is a contract failure even when the Cloud counter is correct.

## Reset interaction

Reset deletes only selected scoped business data and their local projections. It MUST NOT reset the Offline engine globally. Deleted selected data must not resurrect from SQLite/IndexedDB/outbox/inbox after restart.

## Acceptance gate for every OFFLINE_MUTATION

Each operation must pass this sequence on SH-0007 before it is called Offline-ready:

1. establish required data Online;
2. disconnect network;
3. perform the real visible UI action;
4. verify durable local event and immediate local projection;
5. close the app;
6. relaunch while still Offline;
7. verify the same visible business state;
8. reconnect;
9. sync and require explicit ACK;
10. verify exactly one Cloud effect;
11. verify local/server identity reconciliation and counters;
12. restart again and verify no duplicate/resurrection;
13. retry/replay the same TX and verify stable exactly-once result.

Static string assertions alone are insufficient evidence.

## Current real-device gaps promoted to contract regressions

The following are regressions to be fixed under this contract, not isolated exceptions:

- ordinary UI order-status Offline path blocked by `active takeover`;
- order details/return lookup must consume a complete local order bundle, not only an order header;
- native pending sale/return projections must be visible to ordinary screens;
- bon visible counter must reconcile after Offline sync/ACK;
- historical protected reset sequences 293/304/316 are no longer special runtime reset state.

## Rollout rule

Apply this contract profile-by-profile and operation-by-operation. Restaurant findings define the generic lifecycle, but do not automatically authorize Pharmacy/Retail/other profile mutations. Each profile declares its Offline-capable operations and server owner.

Production deployment is not authorized by this document.
