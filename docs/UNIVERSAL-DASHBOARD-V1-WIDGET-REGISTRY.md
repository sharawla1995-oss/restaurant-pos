# Sharawla Universal Dashboard V1 — Widget Registry

The canonical registry is `WIDGETS` in `universal-dashboard-engine-v1.js`. Visibility is the intersection of profile, capabilities, page permissions, exact action permissions, branch mode, and connectivity.

| Widget ID | Group | Profile/capability rule | Permission | Offline behavior |
|---|---|---|---|---|
| `quick_actions` | shared | all active profiles | each destination remains page-filtered | full |
| `business_kpis` | shared | commerce orders + returns + reports | `reports` | current branch |
| `sales_timeline` | shared | commerce orders + returns + reports | `reports` | current branch |
| `payment_distribution` | shared | orders + returns + payments + reports | `reports` | current branch |
| `best_sellers` | shared | orders + returns + products + reports | `reports` | current branch |
| `recent_orders` | shared | commerce orders | `orders` | current branch, non-financial columns |
| `employee_performance` | shared | commerce orders + reports | `reports` | unavailable (employee directory is not an operational local projection) |
| `branch_comparison` | shared | commerce orders + reports, all-branch selection | `reports` plus existing multi-branch access | unavailable |
| `customer_activity` | shared | orders + customers + reports | `reports` and `customers` | current branch |
| `inventory_alerts` | capability | inventory stock; restaurant/retail/pharmacy/warehouse | `inventory` | unavailable |
| `purchasing_status` | capability | inventory purchasing | `purchasing` | unavailable |
| `restaurant_orders` | profile | restaurant + any delivery/pickup/tables/kitchen | `orders` | current branch |
| `restaurant_food_ops` | profile | restaurant + production/waste/prep | `inventory` | unavailable |
| `pharmacy_expiry` | profile | pharmacy + batch + expiry | `inventory` | unavailable |
| `service_operations` | profile | service + jobs/appointments | `orders` | unavailable |
| `membership_operations` | profile | membership + subscriptions/check-in | `customers` | unavailable |
| `logistics_operations` | profile | logistics + shipments | `orders` | unavailable |
| `warehouse_operations` | profile | warehouse + inventory stock | `inventory` | unavailable |
| `central_supply` | capability | multi-warehouse | exact action `inventory.supply.view` | unavailable |

## Resolution rules

1. A mismatched profile returns `capability_unavailable`.
2. Missing all-required or any-required capabilities returns `capability_unavailable`.
3. Missing page or action permission returns `no_permission`.
4. A Cloud-only widget while offline returns `offline_unavailable`.
5. An all-branch widget outside all-branch scope is not applicable.
6. Only `ready` widgets contribute datasets to the read plan.

The UI omits `no_permission` and non-applicable widgets. This is intentional: it avoids revealing the existence or shape of unauthorized business data. Offline-unavailable widgets may remain visible with an explicit state.

## Adding a widget

A widget addition must include:

- an authoritative data-map entry and formula;
- its profile/capability and permission gates;
- branch/date semantics;
- explicit online/offline behavior;
- bounded data access;
- loading, empty, error, and unavailable rendering;
- tests for resolution and failure isolation.

The registry must not declare profit, COGS, inventory valuation, or comparison widgets ready until their cross-profile authority contracts are closed.
