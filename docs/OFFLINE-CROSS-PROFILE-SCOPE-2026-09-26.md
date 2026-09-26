# Sharawla POS — Cross-Profile Offline Commerce Scope

Recorded: 2026-09-26
Branch: `beta56-offline-ownership-consolidation`
Status: CURRENT SUPPORT CONTRACT / SOURCE BOUNDARY

## Canonical rule

`implemented=true` for a Profile does not imply that generic POS Offline sale/return is supported.

Offline V2 may recognize the platform Profile name for shared Core behavior, but **commerce sale/return local-first ownership is eligible only for Restaurant and Retail** until a profile-specific contract says otherwise.

## Current matrix

| Profile | Offline commerce sale/return | Current contract | Point-15 interpretation |
|---|---|---|---|
| Restaurant | SUPPORTED | Native Offline V2 local-first; current Full/Chaos runtime evidence is READY_FOR_RC / 100%. | Positive runtime coverage already exists; do not rerun broad Restaurant without a regression reason. |
| Retail | SUPPORTED for POS-critical core | Sale, return, expense, shift open/close and local printing are the V1 guaranteed surface; management workflows remain Online-only. | Prior SH-0007 Retail crash/recovery proved durable local commit, restart survival and exactly-once reconciliation. Dedicated Retail product closure remains a separate environment/acceptance track. |
| Pharmacy | NOT SUPPORTED for commerce today | Pharmacy checkout is Online-only; generic Offline return is unsafe without Pharmacy batch-return ownership. | Must fail closed for generic Offline sale/return. Future PH-OFF stages require dedicated owners and acceptance. |
| Service | NOT ELIGIBLE for generic POS commerce | Profile-specific primary workflow is not a Restaurant/Retail POS sale contract. | Generic Offline sale/return must fail closed. |
| Warehouse | NOT ELIGIBLE for generic POS commerce | Inventory/warehouse workflow is not a generic POS sale contract. | Generic Offline sale/return must fail closed. |
| Membership | NOT ELIGIBLE for generic POS commerce | Membership primary workflow requires its own operational contract. | Generic Offline sale/return must fail closed. |
| Logistics | NOT ELIGIBLE for generic POS commerce | Shipment/COD workflow is not a generic POS sale contract. | Generic Offline sale/return must fail closed. |

## Source boundary

- `beta45-offline-v2-transport-runtime.js` keeps all known platform profile names for authoritative profile validation, but `resolveSale()` / `resolveReturn()` accept only `restaurant` and `retail`.
- Unsupported commerce profiles fail with `OFFLINE_V2_COMMERCE_PROFILE_UNSUPPORTED` before selecting an operational RPC.
- Legacy renderer Offline helpers `saveOfflineSale()` / `saveOfflineReturn()` also fail closed outside Restaurant/Retail with `OFFLINE_COMMERCE_PROFILE_UNSUPPORTED`.
- `openReturnForOrder()` blocks generic returns outside Restaurant/Retail, preventing Pharmacy from using a return owner that cannot restore Pharmacy batch stock.
- Pharmacy checkout keeps its explicit `navigator.onLine` guard before the Pharmacy sale RPC.
- Generic POS routing has explicit Restaurant/Retail adapters, Pharmacy has its dedicated adapter, and other profiles show `PROFILE_NOT_POS` instead of falling back to Restaurant.

## What this does not claim

- It does not claim Retail commercial closure; dedicated Retail Acceptance V2 remains its own track.
- It does not claim Pharmacy Offline support. The current contract is explicit Online-only commerce and fail-closed generic return.
- It does not claim Service/Warehouse/Membership/Logistics domain workflows are Offline-capable.
- Shared Core operations must be judged by their own owner/capability contracts; this matrix only closes the dangerous generic commerce fallback.

## Future expansion rule

Any new profile-specific Offline sale/return capability requires: canonical transaction identity, durable local owner, profile-specific server owner, idempotency/exactly-once receipt, authorization re-check, recovery/conflict semantics, and focused acceptance before the profile is added to the eligible commerce set.
