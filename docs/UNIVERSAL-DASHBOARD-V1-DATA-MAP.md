# Sharawla Universal Dashboard V1 — Data and Authority Map

This map records what V1 can calculate from sources already present in the repository. `SUPPORTED` means implemented from current authoritative rows. `BOUNDED` means the widget fails closed above the V1 client read limit. `UNSUPPORTED` means no value is fabricated.

## Commerce metrics

| Metric | Applies when | Authoritative source and formula | Permission | Branch/date scope | Offline | Status |
|---|---|---|---|---|---|---|
| Gross sales collected | `commerce.orders` + `core.reports` | `orders.total` for non-`cancelled` orders. Non-website orders are collected. Website orders require `payment_status=confirmed`, or cash with `status` `delivered`/`completed`. | `reports` | selected allowed branches; `orders.created_at` | existing local `orders`, current branch | SUPPORTED/BOUNDED |
| Returns | `commerce.orders` + reports | Sum `returns.total` by `returns.created_at`. This follows the current POS report's period behavior. | `reports` | selected allowed branches/date | local `returns` | SUPPORTED/BOUNDED |
| Net sales | same | eligible gross sales − returns. It is not cash, profit, or revenue recognition. | `reports` | same | current branch | SUPPORTED/BOUNDED |
| Order count | same | Count of eligible collected orders after identity reconciliation. | `reports` | same | current branch | SUPPORTED/BOUNDED |
| Average order value | same | eligible gross sales ÷ eligible completed/collected order count; `0` only when a successful read has zero eligible orders. | `reports` | same | current branch | SUPPORTED/BOUNDED |
| Discounts | same | Sum `orders.discount` for eligible collected orders. | `reports` | same | current branch | SUPPORTED/BOUNDED |
| Expenses | `core.expenses` | Sum `expenses.amount`; kept separate from sales. | `reports` | `expenses.created_at` | local `expenses` | SUPPORTED/BOUNDED |
| Payment distribution | orders/payments | Sum `order_payments.amount` for eligible orders; fall back to `orders.payment_method + total` only when no detailed payment rows exist; subtract `return_payments.amount` by method. | `reports` | parent orders/returns in scope | local payment projections | SUPPORTED, detail limit 300 parents |
| Sales over time | commerce reports | Eligible order total grouped by device-local date; returns reduce their return date bucket. | `reports` | selected range | current branch | SUPPORTED/BOUNDED |
| Hourly/peak sales | commerce reports | Eligible order total grouped by device-local hour; highest three buckets are peak hours. | `reports` | selected range | current branch | SUPPORTED/BOUNDED |
| Branch comparison | multi-branch reports | Net sales grouped by `branch_id` after the same identity and eligibility rules. | `reports` and existing multi-branch access | all permitted branches only | no | SUPPORTED/BOUNDED |
| Employee performance | commerce reports | Gross eligible order total minus returns attributed to `employee_id`; order count is eligible orders. Names come from `employees`. | `reports` | selected branches/date | names unavailable offline | SUPPORTED online |
| Best sellers | commerce products/reports | `order_items.quantity,total` for eligible orders minus `return_items.quantity,total` for returns; grouped by product ID/name. | `reports` | parent scope | local item projections | SUPPORTED, detail limit 300 parents |
| Lowest sellers | same | Current data cannot distinguish “available for sale but never sold” without a complete scoped product availability join. | `reports` | — | — | UNSUPPORTED |
| Recent operations | `commerce.orders` | Latest scoped order identity, type, status, and time. No totals are requested for a non-report user. | `orders` | selected branch/date | local orders | SUPPORTED |
| Customer activity | customers + orders | Count distinct non-null `orders.customer_id` among eligible orders. | `reports` + `customers` | selected scope | current branch | SUPPORTED/BOUNDED |
| Previous-period comparison | all | No repository-wide authoritative branch timezone contract. | — | — | — | UNSUPPORTED in V1 |
| Profit / COGS | all | Not sufficiently authoritative across profiles. Retail has sale-time cost contracts, while Pharmacy explicitly lacks closed historical batch COGS. | — | — | — | UNSUPPORTED |

## Profile and capability metrics

| Widget/metric | Profile/capability | Source | Permission | Scope | Offline | Status |
|---|---|---|---|---|---|---|
| Restaurant order modes | restaurant; any delivery/pickup/tables/kitchen | `orders.order_type/status` | `orders` | branch/date | local orders | SUPPORTED |
| Delivery/pickup/dine-in counts | corresponding capability only | `orders.order_type` | `orders` | branch/date | local orders | SUPPORTED |
| Kitchen preparation distribution | `food.kitchen` | `orders.status` is available, but no single kitchen timing/SLA authority is established | — | — | — | UNSUPPORTED for SLA/performance |
| Food stock alerts | restaurant + `inventory.stock` | `ingredients.minimum_quantity/track_inventory` joined to `ingredient_stock.quantity` | `inventory` | selected branches, current snapshot | no safe dashboard local snapshot contract | SUPPORTED online |
| Production/waste indicators | `food.production`/`food.waste` | completed `food_production_batches`; posted `food_waste_events` | `inventory` | branch/date (`created_at` / `occurred_at`) | no | SUPPORTED online |
| Purchasing indicator | restaurant | `purchases.status` | `purchasing` | branch/date | no | SUPPORTED online |
| Retail low/out-of-stock | retail + inventory | `retail_inventory_balances.quantity`, row threshold or `retail_inventory_settings.default_low_stock_threshold` | `inventory` | selected branches, snapshot | no | SUPPORTED online |
| Retail/warehouse inventory value | retail/warehouse | Existing overview can sum costs, but parent/variant completeness and double-count prevention are not a universal closed contract. | — | — | — | UNSUPPORTED |
| Variant performance | `commerce.variants` | Sale item variant identity is not consistently present in the common audited item source. | — | — | — | UNSUPPORTED |
| Pharmacy expiry | pharmacy + batch/expiry | positive active `pharmacy_batches.quantity`, `expiry_date`, product name; warning window 90 days | `inventory` | selected branches, snapshot | no | SUPPORTED online |
| Pharmacy profit/value | pharmacy | Pharmacy costing contract states historical batch allocation/COGS is not closed. | — | — | — | UNSUPPORTED |
| Service operations | service jobs/appointments | active `service_jobs_v1.status`; scheduled `service_appointments_v1.status/starts_at` | `orders` | branch/date | no | SUPPORTED online |
| Membership activity | membership subscriptions/check-in | active `membership_subscriptions_v1`; `membership_checkins_v1.checked_in_at` | `customers` | subscription state + branch/date check-ins | no | SUPPORTED online |
| Logistics activity | logistics shipments | non-terminal/delivered `logistics_shipments_v1.status` | `orders` | branch/date | no | SUPPORTED online |
| Warehouse stock alert | warehouse inventory | retail balance authority used by the Warehouse engine | `inventory` | branches, current snapshot | no | SUPPORTED online |
| Central Warehouse requests | `inventory.multi_warehouse` | `inventory_supply_requests`, terminal states excluded from open count | exact action `inventory.supply.view` | source/destination allowed branches/date | no | SUPPORTED online |

## Identity and double-counting

Rows are reconciled within their entity type using field-aware identities. Server aliases (`id`, `server_id`, `canonical_id`, `_server_entity_id`) share the canonical entity namespace. Transaction/document/projection fields keep separate namespaces, so an order ID equal to an unrelated client transaction string does not collide. Cloud rows win when an acknowledged local projection and Cloud row represent the same entity.

This is additive to the existing Offline V2 reconciliation performed by `beta55-4-runtime-recovery.js`; it does not change that owner.

## Evidence locations

- Current formulas and collection eligibility: `app.js` (`renderReports`, shift reports).
- Reports V2 source: `supabase-engine-reports-v2.sql`, `reports-v2-ui.js`.
- Retail costing boundaries: `docs/RETAIL-REPORTS-V1-CONTRACT.md`.
- Pharmacy costing gaps: `docs/PHARMACY-COSTING-REPORTS-V1-CONTRACT.md`.
- Local projection authority: `beta55-4-runtime-recovery.js`.
- Profile/capability catalog: `sharawla-capabilities.js`, `sharawla-capabilities-v3.js`.
- Specialized schemas: `supabase-engine-service-v1.sql`, `supabase-engine-membership-v1.sql`, `supabase-engine-logistics-v1.sql`, `supabase-engine-recipe-advanced-v1-foundation.sql`, and the retail/pharmacy/central-warehouse foundation sources.
