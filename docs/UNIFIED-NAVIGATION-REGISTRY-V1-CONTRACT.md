# Sharawla Unified Navigation Registry V1 — Batch 1A/1B

Baseline: `8089c031bcc8e11d508dfffac4920e66681efea5`

## Scope
Batch 1A is static route inventory. Batch 1B adds pure discovery/normalization adapters for the navigation entry mechanisms already present in the current source. Both stages are additive and shadow-only.

Neither stage dispatches routes, changes permissions, changes business logic, activates fail-closed behavior, or replaces an existing navigation owner.

Canonical model:

`Route → Metadata → Eligibility → Page Permission → Location Scope → Renderer Owner`

Actions remain outside the registry:

`Action → Permission → Validation → Location Scope → Execution → Audit`

## 1B adapter coverage
The Batch 1B adapter layer recognizes these navigation entry mechanisms without taking ownership of them:

- `data-page`
- `data-beta54-page`
- `data-beta55-supply-page`
- `data-beta55-hr-group` as a navigation group, not a business route
- `data-site-tool` Website Management hub children

The following top-level controls are explicitly classified as actions, not routes:

- `manageBranchesBtn`
- `addBranchBtn`
- `changeBranchBtn`
- `logoutMenuBtn`

Batch 1B is describe-only: no click handler, no route dispatch, no renderer call, and no permission mutation.

## Safety boundaries
- Orders V58.3 ownership is locked.
- Purchasing is CONFLICT_BLOCKED.
- Website Payments permission mismatch is documented and deferred; 1A/1B do not correct it.
- Dynamic navigation owners (Restaurant Closure, Beta54 Shared Core, Central Warehouse) remain untouched.
- No Point 4, Offline/Sync, stock ownership, printing, updater, licensing, activation, Business Connection, fingerprint, database schema or RPC changes.
- No Production deployment.
- Unknown-route fail-closed activation is explicitly NOT part of 1A or 1B.

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

The checker currently permits only states used by the implemented stage. Future migration-state transitions must extend checker enforcement in the same batch that introduces the transition.

## Batch sequence
1A Static Route Inventory → 1B Dynamic Navigation Adapters → 1C Ownership/Conflict Detection → 1D Shadow Runtime Audit → 1E Coverage Gate → 1F Fail-Closed Activation.

1F is a separate gate and must not be activated merely because earlier stages succeed.
