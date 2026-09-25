# Sharawla Retail Reports V1 Contract

Status: DESIGN / READ-ONLY
Implementation: NOT STARTED
DB mutation: NONE
Runtime change: NONE

This contract is derived from the current Retail schema and current generic Reports implementation.

## 1. Current reporting baseline

The current shared Reports screen already covers:
- gross/net sales;
- returns;
- expenses;
- discounts;
- payment-method totals;
- delivery fees;
- product quantity/sales;
- order channels;
- hourly sales;
- delivery zones/drivers;
- promos;
- return reasons;
- employee activity;
- shift filtering;
- print;
- CSV export.

This remains the operational baseline.

Retail Reports V1 extends it rather than replacing it.

## 2. Current Retail report gaps

The current shared report does not yet close:
- COGS;
- gross profit;
- gross margin;
- inventory valuation;
- stock movement ledger;
- stock adjustment analysis;
- purchase/GRN metrics;
- supplier return analysis;
- supplier invoice / 3-Way Match analysis;
- Landed Cost impact;
- reorder/replenishment metrics;
- variant-level sales/profit/stock;
- slow/fast moving items;
- dead/idle stock.

The current report also hardcodes order-type filter labels including dine-in instead of consuming the Retail Engine report-order-type contract.

## 3. Core accounting sources

Sales header:
- orders

Sales lines:
- order_items

Important sale-line fields:
- quantity
- unit_price
- cost
- total
- variant_id
- variant_name
- variant_sku
- variant_barcode

order_items.cost is the sale-time cost snapshot and is the primary COGS source for completed Retail sales.

Returns:
- returns
- return_items

Important:
return_items does not store cost or variant identity directly.

Use:
return_items.order_item_id -> order_items.id

to recover:
- original cost snapshot;
- product;
- variant;
- original line identity.

Do not use current product cost to value a historical return.

## 4. Sales revenue basis

For a completed/collected order:

merchandise_net = subtotal - discount

Keep separately:
- tax_amount
- service_amount
- delivery_fee

Do not include delivery fee in merchandise gross margin.

Payment collection remains a separate cashflow/payment report.

Cancelled orders do not contribute revenue.

Uncollected online orders do not contribute collected-sales totals.

## 5. Item-level discount allocation

Product/variant margin reports need order-level discount allocated to lines.

For each order:
1. calculate line_gross = order_items.total.
2. calculate gross_sum = sum(line_gross).
3. allocate orders.discount proportionally by line_gross / gross_sum.
4. use deterministic final-line rounding reconciliation so allocations sum exactly to the order discount.

Then:

line_net_revenue = line_gross - allocated_discount

Promo and manual discount may be shown separately at order level, but total line allocation must reconcile to orders.discount.

Do not independently subtract promo_discount again if orders.discount already includes it.

Acceptance must confirm actual checkout semantics before implementation.

## 6. COGS

Sale COGS:

sum(order_items.cost * order_items.quantity)

for collected, non-cancelled orders.

Return COGS reversal:

sum(original_order_item.cost * returned_quantity)

using return_items.order_item_id.

Net COGS:

sale_cogs - return_cogs_reversal

Do not use current average cost for historical sale COGS.

## 7. Gross profit / margin

Store-level Retail gross profit:

net_merchandise_revenue - net_cogs

Gross margin percentage:

gross_profit / net_merchandise_revenue * 100

when net merchandise revenue > 0.

Do not subtract operating expenses here.
Expenses belong to a later operating-profit view.

## 8. Product and Variant profitability

Group by:
- product_id

When Variants enabled:
- product_id
- variant_id

Show:
- units sold;
- units returned;
- net units;
- gross line sales;
- allocated discounts;
- net merchandise revenue;
- COGS;
- gross profit;
- margin %.

Variant label:
- variant_name
- variant_sku
- variant_barcode.

A parent-product total is the sum of all variants plus any non-variant lines.

## 9. Inventory valuation

Product inventory source:
- retail_inventory_balances

Value:
quantity * average_unit_cost

Variant inventory source:
- retail_variant_inventory_balances

Value:
quantity * average_unit_cost

Report by:
- branch;
- product;
- variant;
- category where product mapping is available.

Show:
- quantity;
- average cost;
- last purchase cost;
- stock value;
- low-stock threshold;
- tracking status.

Total branch inventory value:
sum product + variant stock values without double-counting stock-unit variants.

The implementation must ensure parent product balances are not counted for inventory that is fully owned by stock-unit variants.

## 10. Stock Movement Ledger report

Sources:
- retail_inventory_movements
- retail_variant_inventory_movements

Show:
- date/time;
- branch;
- product/variant;
- movement_type;
- quantity_delta;
- balance_after;
- unit_cost;
- reference_type;
- reference_id;
- employee;
- notes;
- client_tx_id.

Filters:
- date;
- branch;
- product;
- variant;
- movement type;
- employee.

Movement families include:
- opening;
- sale;
- return;
- adjustment;
- waste;
- purchase;
- supplier_return;
- transfer_out;
- transfer_in.

Unknown future movement types must remain visible rather than silently omitted.

## 11. Stock Count report

Sources:
- retail_stock_counts
- retail_stock_count_items

Show:
- count id;
- branch;
- created/posted employee;
- created/posted time;
- product;
- system_qty;
- counted_qty;
- variance.

Derived:
- positive variance;
- negative variance;
- absolute variance quantity.

Value variance may be calculated using an explicitly documented cost source at posting time.
Do not retrospectively use current average cost without labeling it as current-cost estimate.

## 12. Purchasing report

Sources:
- retail_purchase_orders
- retail_purchase_order_items
- retail_goods_receipts
- retail_goods_receipt_items

Show:
- PO number;
- supplier;
- branch;
- created/approved;
- expected date;
- ordered quantity;
- received quantity;
- outstanding quantity;
- unit cost;
- ordered value;
- received value;
- status;
- created/approved employee.

Metrics:
- PO count;
- approval lead time;
- receiving lead time;
- fill rate;
- open PO value;
- partially received PO count.

Variant-aware lines use variant_id.

## 13. Supplier Returns report

Sources:
- retail_supplier_returns
- retail_supplier_return_items

Show:
- supplier;
- branch;
- date;
- product/variant;
- quantity;
- unit cost;
- total value;
- notes;
- employee.

Derived:
- supplier return value;
- return rate relative to receipts where meaningful.

## 14. Supplier Invoice / 3-Way Match report

Sources:
- retail_supplier_invoices
- retail_supplier_invoice_items
- retail_supplier_invoice_match_v2

Show:
- invoice number/date;
- supplier;
- PO;
- invoice subtotal;
- discount;
- tax;
- other charges;
- total;
- status;
- match status;
- exception count;
- approved by/date.

Do not label supplier invoice total as paid amount unless a payment/payables subsystem explicitly records payment.

## 15. Landed Cost report

Sources:
- retail_landed_costs
- retail_landed_cost_allocations
- retail_inventory_value_adjustments_v1

Show:
- GRN;
- cost type;
- amount;
- allocation method;
- status;
- allocated lines;
- old average cost;
- new average cost.

Separate:
- allocated, not posted;
- posted.

This report must make it obvious when Landed Cost has not yet affected inventory valuation.

## 16. Replenishment report

Sources:
- retail_reorder_rules
- retail_reorder_suggestions_v1

Show:
- branch;
- product;
- current quantity;
- min;
- target;
- reorder quantity;
- suggested quantity;
- preferred supplier;
- lead time.

Derived:
- below-min count;
- total suggested units;
- items with no preferred supplier;
- zero/invalid rule anomalies.

## 17. Slow / Fast Moving report

Use completed/collected sale lines over selected period.

Fast moving:
- rank by net units and/or net merchandise revenue.

Slow moving:
- low net units relative to current positive stock.

Dead/idle stock:
- current positive stock
AND
- no net sale movement in selected age window.

The age window must be user-selected/configurable.

Do not infer dead stock solely from current quantity.

## 18. Website / channel report

Retain current source/channel reporting.

For Retail website additionally include:
- retail_website_orders;
- reservation lifecycle;
- accepted order link;
- reject count/reasons where stored;
- pickup vs delivery;
- payment status.

Avoid double counting:
accepted website order + generated POS order are one commercial sale.

The POS order is revenue authority after acceptance.

## 19. Payment / cashflow report

Keep payment reporting separate from profit reporting.

Sources:
- order_payments
- return_payments
- orders fallback payment_method only when detailed rows do not exist.

Show:
- cash;
- wallet;
- Instapay;
- other configured methods;
- returns deducted by method.

Delivery cash custody remains a settlement/control report, not gross profit.

## 20. Permissions

Suggested Actions:
- reports.sales.view
- reports.cost.view
- reports.profit.view
- reports.inventory_valuation.view
- reports.stock_movements.view
- reports.purchasing.view
- reports.suppliers.view
- reports.export

Current reports.export action alone is not sufficient because cost/margin visibility can be more sensitive than sales totals.

Location scope:
- report user sees only allowed branches unless explicit multi-location authority exists.

## 21. Retail terminology

Report order-type filter must consume Retail Engine reportOrderTypes().

Expected Retail labels:
- takeaway -> بيع تجزئة
- pickup -> استلام من الفرع
- delivery -> توصيل

Do not show dine-in in Retail.

## 22. Performance / architecture

Do not make the renderer fetch unbounded operational tables for large date ranges.

V1 should use backend report owners/read models for:
- sales/profit aggregation;
- inventory valuation;
- movements pagination;
- purchasing aggregation.

Requirements:
- branch/date filters server-side;
- pagination for detail;
- deterministic totals;
- export from the same filtered contract;
- no hidden mismatch between screen and CSV.

## 23. Acceptance

For each report use a fixed fixture with:
1. sale;
2. discount;
3. partial/full return;
4. variant line where enabled;
5. purchase receive;
6. supplier return;
7. stock adjustment;
8. transfer;
9. landed-cost allocation/post where enabled.

Verify:
- source transaction totals;
- report totals;
- CSV totals;
- branch isolation;
- Action permission;
- Location permission.

Financial totals must reconcile to currency precision.

## 24. Closure rule

Retail Reports V1 is CLOSED only when:
- generic sales report is profile-aware;
- COGS is based on sale-time cost snapshots;
- return COGS reverses original line cost;
- gross profit/margin reconcile;
- inventory valuation exists;
- movement ledger report exists;
- purchasing/supplier reports exist;
- variant reporting works when Variants entitled;
- permissions/branch scope enforced;
- print/export reconcile to screen.

## 25. Current state

Design:
CLOSED.

Implementation:
NOT STARTED.

Current shared sales report:
PRESENT.

Retail financial/reporting closure:
OPEN.
