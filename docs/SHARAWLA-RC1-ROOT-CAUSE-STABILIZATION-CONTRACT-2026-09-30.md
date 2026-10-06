# Sharawla RC1 Root-Cause Stabilization Contract

Date: 2026-09-30
Starting source SHA: `40511daacf42b8aed6201bd610f99f6d015d1a23`
Scope: source and tests only; no deployment, device installation, migration execution, merge, or Production access.

## Authority map

| Surface | Device operational authority | Central authority | Canonical navigation/render owner |
|---|---|---|---|
| POS sale | Native Offline V2 DB + sale projection | idempotent sale owner through final dispatcher | Core `app.js` |
| Supplier save | Native Offline V2 DB + `offlineV2Suppliers` | `offline_food_supplier_save_v1` | Core Restaurant supplier renderer |
| Customer create | Native Offline V2 DB + `customersCache` | `offline_customer_create_v1` | Core Customers renderer |
| Delivery driver/zone | Native Offline V2 DB + `offlineV2Drivers` / `offlineV2Zones` | `offline_delivery_driver_save_v1` / `offline_delivery_zone_save_v1` | Core Delivery Settings renderer |
| Treasury read | Durable exact-query snapshot | `treasury_movements` when Online | `beta54-shared-core-ui.js` |
| Treasury post/settlement | None Offline; fail closed | Treasury/settlement RPC | `beta54-shared-core-ui.js` / settlement owner |
| Sharawla HR | Cached permission state; HR operational data per section | Existing HR and HR extension owners | `hr-attendance-admin-v1.js` parent; Beta54 renderers are child targets only |

## Corrected root causes

1. The client could durably enqueue a valid operation while the deployed dispatcher lacked that operation. SQLSTATE `22023` for the precise unsupported-operation contract was treated as permanent and moved the row toward DLQ. It is now a named backend-contract transient condition that retains the same durable event and retries with bounded backoff without exhausting into DLQ. Generic validation `22023` remains permanent.
2. The final source dispatcher validated `driver_save` and `zone_save` bindings but had no matching `CASE` branches. Both branches now delegate to the existing idempotent owners and return canonical entity IDs.
3. A stale capture-phase hardening layer intercepted Delivery driver/zone actions before the registered Offline V2 owner. The layer now allows driver/zone create/update/deactivate operations and blocks only financial settlement Offline.
4. Treasury navigation was split between a Sidebar capture handler and Home click simulation. Home now calls the same Beta54 renderer owner. Treasury read has an explicit cached/empty Offline state; manual posting remains Online-only.
5. CSS-only hiding left legacy HR buttons discoverable as top-level navigation entries. They are now explicit canonical aliases and excluded from top-level enumeration. “Sharawla HR” opens an actual parent landing page with the canonical ten-section contract.
6. The employee HR file used an all-or-nothing query group. The employee identity is now mandatory, while optional sections load independently and report backend unavailability without making the action inert.

## Invariants

- Durable local success always precedes the Offline success UX for the supported supplier, customer, driver, and zone mutations.
- A precise backend contract-skew response cannot destroy or dead-letter otherwise valid durable work.
- Whitelist validation is insufficient: every targeted dispatcher binding must also have an executable dispatch branch.
- Local string identities are rejected/deferred before numeric Cloud boundaries until an ACK mapping exists.
- Home and Sidebar entries call the same Treasury/HR render owner.
- Sharawla HR has exactly ten canonical section identities; legacy Beta54 HR buttons are renderer aliases, not competing roots.
- Cached permission resolution survives an Online-to-Offline transition; unresolved sensitive permissions still fail closed.
- Treasury read availability never grants Treasury write authority.
- Sale remains the unchanged control lifecycle and is exercised by the cross-feature runtime test.

## Deployment readiness boundary

The source dispatcher and owner SQL still require a separately reviewed and explicitly authorized Beta-only deployment before SH-0007 can complete Cloud replay for operations absent from its currently deployed dispatcher. This source task does not execute or authorize that deployment. Until then, corrected clients preserve affected rows as retryable instead of falsely declaring success or permanently orphaning them.