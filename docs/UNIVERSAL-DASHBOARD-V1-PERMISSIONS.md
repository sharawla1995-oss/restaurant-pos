# Sharawla Universal Dashboard V1 — Permissions

## Existing authorities reused

The dashboard does not introduce a role or authorization model. It consumes:

- profile-aware page access from `canAccessPage`;
- the employee's `employee_permissions`/role fallback through the existing effective permission set;
- `allowedBranchIds` and `canSeeAllBranches`;
- Permissions V2 `has_action_permission_v2` for exact sensitive actions;
- server RLS and existing `has_branch_access` policies.

## Read-plan enforcement

Permission filtering occurs before reads. This is not merely CSS hiding.

| Data class | Required gate before request |
|---|---|
| sales, returns, discounts, payments, expenses, sales charts | `reports` |
| recent order status/type without totals | `orders` |
| customer-linked activity | `reports` and `customers` |
| inventory alerts | `inventory` and `inventory.stock` capability |
| purchasing indicators | `purchasing` and `inventory.purchasing` capability |
| Central Warehouse requests | `inventory.multi_warehouse` and exact `inventory.supply.view` |

A cashier who lacks `reports` receives no financial dashboard request. If that cashier has `orders`, the recent-operations request selects only identity, type, status, and timestamps—not totals or payment fields.

## Branch access

- Branch options are built only from `allowedBranchIds`.
- A requested specific branch must be in that set.
- All branches requires both multiple allowed branches and existing report access.
- Every Cloud query carries the resolved allowed branch filter; RLS remains the final check.
- Offline forces the current branch even if the user normally has multi-branch access.

## Fail-closed behavior

- An unavailable Permissions V2 RPC is `false`, never permissive.
- Unknown profiles/capabilities do not receive a fallback profile widget.
- Missing permissions omit the widget and its datasets.
- Cached exact action results are only held in memory for the signed-in runtime; no new permission persistence is created.

## Relevant evidence

- Legacy/page evaluation: `app.js` (`effectivePermissionSet`, `hasFeaturePermission`, `canAccessPage`, `allowedBranchIds`).
- Permissions V2 evaluator: `permissions-v2-effective-evaluator.sql`.
- Central Warehouse RLS/action: `supabase-beta55-central-warehouse-foundation.sql`.
- Profile-specific permission definitions: the seven `*-engine.js` profile engines.
