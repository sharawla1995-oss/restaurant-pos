# Sharawla Unified Navigation Registry V1 — Batch 1A

Baseline: `8089c031bcc8e11d508dfffac4920e66681efea5`

## Scope
Batch 1A is static inventory only. It is additive and shadow-only. It does not dispatch routes, change permissions, change business logic, activate fail-closed behavior, or alter any existing navigation owner.

Canonical model:

`Route → Metadata → Eligibility → Page Permission → Location Scope → Renderer Owner`

Actions remain outside the registry:

`Action → Permission → Validation → Location Scope → Execution → Audit`

## Safety boundaries
- Orders V58.3 ownership is locked.
- Purchasing is CONFLICT_BLOCKED.
- Website Payments permission mismatch is documented and deferred; Batch 1A does not correct it.
- Dynamic navigation owners (Restaurant Closure, Beta54 Shared Core, Central Warehouse) remain untouched.
- No Point 4, Offline/Sync, stock ownership, printing, updater, licensing, activation, Business Connection, fingerprint, database schema or RPC changes.
- No Production deployment.
- Unknown-route fail-closed activation is explicitly NOT part of 1A.

## Migration states
- DISCOVERED: evidence exists but route is not yet in the registry.
- REGISTERED_SHADOW: registered without runtime ownership.
- CONFLICT_BLOCKED: known route whose canonical owner cannot be selected yet.
- SHADOW_VERIFIED: reserved for later runtime comparison.
- CANONICAL_READY: reserved for later cutover eligibility.
- CANONICAL: reserved for later registry ownership.
- DEFERRED_FIX: registered with a known out-of-scope defect.
- LOCKED_ACCEPTED_OWNER: accepted existing owner that Batch 1 must not alter.
- NEW_TARGET: target route not implemented in current runtime.

## Batch sequence
1A Static Route Inventory → 1B Dynamic Navigation Adapters → 1C Ownership/Conflict Detection → 1D Shadow Runtime Audit → 1E Coverage Gate → 1F Fail-Closed Activation.

1F is a separate gate and must not be activated merely because 1A succeeds.
