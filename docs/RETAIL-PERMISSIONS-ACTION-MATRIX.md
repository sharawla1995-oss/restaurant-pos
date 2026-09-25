# Sharawla Retail Permissions Action Matrix

Status: DESIGN / READ-ONLY
Implementation: NOT STARTED
DB mutation: NONE
Runtime change: NONE

This matrix maps Retail pages and business operations to existing or required Action Permissions V2.

## 1. Rules

- Page permission controls visibility/navigation.
- Action permission controls business authority.
- Location scope controls where the action may execute.
- Backend owner is authoritative.
- A hidden button is not authorization.
- Reuse an existing Action when business meaning/risk matches.
- Do not create one Action per RPC version.

## 2. POS / Sales

Page:
pos

Required Actions:

### sales.create
Status:
NEW

Owners:
- create_retail_pos_order_atomic
- create_retail_variant_pos_order_atomic_v1 when Variants enabled

Location:
order.branch_id

Purpose:
complete normal Retail sale.

### sales.discount.apply
Status:
NEW

Owner:
sale/checkout discount validation boundary

Location:
order.branch_id

Purpose:
manual discount authority.

Automatic Retail Offers/Promo calculations do not require manual-discount authority unless the user overrides them.

### retail.sales.suspend
Status:
NEW

Owner:
retail_suspend_sale

Location:
branch_id

Purpose:
Hold sale.

### retail.sales.resume
Status:
NEW

Owner:
retail_delete_suspended_sale after state is restored

Location:
suspended sale branch

Purpose:
Resume/remove the stored suspended sale.

Security:
resume must not allow cross-branch retrieval.

## 3. Returns

Page:
returns

### returns.create
Status:
NEW platform Action from Permissions V2 plan

Owners:
- create_retail_order_return_idempotent
- create_retail_variant_order_return_idempotent_v1

Location:
original order branch

Return quantity/cost/lineage remain owner invariants.

## 4. Inventory

Page:
inventory

### inventory.adjust
Status:
EXISTING

Owners:
- retail_inventory_adjust
- retail_variant_inventory_adjust_v1 where same risk semantics are accepted

Location:
branch_id

If variant/manual stock authority needs separate commercial policy later, split only with evidence.

### retail.inventory.policy.manage
Status:
NEW

Owners:
- retail_inventory_set_policy
- retail_inventory_set_item_policy

Location:
branch_id

Purpose:
tracking/low-stock/default stock policy.

Do not hide this inside inventory.adjust because changing stock policy and changing quantity are different authorities.

## 5. Stock Count

Page:
stockCount

### inventory.count.post
Status:
NEW recommended

Owner:
retail_post_stock_count

Location:
branch_id

Reason:
current inventory.count Cloud Feature is an entitlement/capability, not an employee Action.

Do not reuse inventory.adjust if business wants cashier/count-entry separation from final posting.

Optional future split:
- inventory.count.create
- inventory.count.post

V1 may use only inventory.count.post because current flow posts directly.

## 6. Transfers

Page:
transfers

### inventory.transfer.create
Status:
NEW recommended shared Action

Owner:
retail_transfer_create

Location semantics:
- source Location mutation authority required;
- destination must be allowed/visible according to final transfer policy.

### inventory.transfer.receive
Status:
NEW recommended shared Action

Owner:
retail_transfer_receive

Location:
destination branch

Do not use one generic inventory permission for both if receive responsibility differs operationally.

## 7. Suppliers

Page:
suppliers

### purchasing.suppliers.manage
Status:
NEW

Owner:
retail_supplier_create and final supplier update owner

Scope:
Business-wide supplier master data, unless supplier-location ownership is introduced later.

Location:
none for supplier master itself.

Visibility may remain constrained by user role/page.

## 8. Purchase Requests

Page:
purchasing

### purchasing.request.create
Status:
EXISTING

Owner:
retail_purchase_request_create_v1

Location:
request branch

### purchasing.request.submit
Status:
NEW recommended

Owner:
retail_purchase_request_submit_v1

Location:
request branch

Reason:
draft creation and submission can be different authority.

### purchasing.request.approve
Status:
EXISTING

Owner:
retail_purchase_request_decide_v1

Location:
request branch

Reject uses same approval Action in V1.

## 9. Purchase Orders

### purchasing.po.create
Status:
EXISTING

Owners:
- retail_purchase_order_create
- retail_purchase_order_create_v2
- retail_purchase_request_convert_to_po_v1

Location:
PO branch

### purchasing.po.approve
Status:
EXISTING

Owner:
retail_purchase_order_approve

Location:
PO branch

### purchasing.receive
Status:
EXISTING

Owners:
- retail_purchase_receive
- retail_purchase_receive_v2

Location:
GRN/PO branch

### purchasing.supplier_return
Status:
EXISTING

Owners:
- retail_supplier_return_create
- retail_supplier_return_create_v2

Location:
return branch

## 10. Supplier Invoices / 3-Way Match

### purchasing.invoice.create
Status:
NEW

Owner:
retail_supplier_invoice_create_v1

Location:
invoice/PO branch

### purchasing.invoice.approve
Status:
NEW

Owner:
retail_supplier_invoice_approve_v1

Location:
invoice branch

Exception approval uses the same Action in V1 but must write an explicit audit note/event.

Future high-risk split only if required:
- purchasing.invoice.exception_approve

## 11. Replenishment

### purchasing.reorder.manage
Status:
NEW

Owner:
retail_reorder_rule_upsert_v1

Location:
rule branch

### purchasing.request.create
Status:
EXISTING

Owner:
retail_reorder_suggestion_to_request_v1

Location:
source branch

Suggestion read access:
can inherit inventory/purchasing page read permission in V1.

## 12. Landed Cost

### purchasing.landed_cost.allocate
Status:
NEW

Owner:
retail_landed_cost_allocate_v1

Location:
GRN branch

### purchasing.landed_cost.post
Status:
NEW HIGH RISK

Owner:
retail_landed_cost_post_v1

Location:
GRN branch

Reason:
posting changes inventory average cost/valuation and must not be implied by allocation authority.

If posting UX is not sold in V1, keep this Action unavailable to Business users.

## 13. Variants

Page:
products

Feature prerequisite:
commerce.variants

### retail.variants.manage
Status:
NEW

Owners:
- retail_variant_axis_save_v1
- retail_variant_axis_value_save_v1
- retail_variant_combination_save_v1
- retail_variant_combination_set_active_v1

Scope:
Business product master.

Location:
none for matrix definition.

### inventory.adjust
Status:
EXISTING

Owner:
retail_variant_inventory_adjust_v1

Location:
branch

Variant stock adjustment is separate from variant definition.

## 14. Products / Catalog

Page:
products

### catalog.categories.manage
Status:
NEW platform Action

Owners:
final category write owner

### catalog.products.manage
Status:
NEW platform Action

Owners:
final product create/edit owner

### catalog.branch_availability.manage
Status:
NEW platform Action

Owner:
branch_products / final guarded owner

Location:
target branch

### retail.product_settings.manage
Status:
NEW

Owner:
retail_set_product_settings

Purpose:
unit/decimal/barcode/online Retail settings.

Scope:
Business product setting unless branch-specific field exists.

## 15. Retail Offers

Page:
retailOffers

### retail.offers.manage
Status:
NEW

Owners:
- retail_offer_save
- retail_offer_set_active

Location:
offer branch when branch-specific.
Business-wide offer requires Business-level authority.

Do not reuse promotions.manage automatically because Retail Offers have their own stacking engine and product scope.

## 16. Promo Codes

Page:
promoCodes

### promotions.manage
Status:
NEW platform Action

Owner:
final Promo guarded owner

Location:
depends on promo branch scope.

## 17. Customers

Page:
customers

### customers.create
Status:
EXISTING

Manual customer screen create.

### customers.edit
Status:
NEW

### customers.address.manage
Status:
NEW

### customers.import
Status:
NEW

POS minimal customer resolve/create must have an explicit sale-owned compatibility contract so every cashier does not need full CRM edit permission.

## 18. Delivery

Pages:
deliveryOrders
deliverySettings

Existing Actions:
- delivery.mark_delivered
- delivery.payment.change_at_delivery
- delivery.settlement.view
- delivery.settlement.create

New Actions required:
- orders.driver.assign
- delivery.drivers.manage
- delivery.zones.manage

Location:
order/driver/zone branch.

Retail reuses accepted shared Delivery settlement owners where business semantics match.

## 19. Pickup

### pickup.complete
Status:
NEW platform Action

Owner:
final guarded Pickup completion owner

Location:
order branch.

## 20. Website Orders

Page:
websiteManagement / Retail Website Orders

Required:
- online_orders.accept
- online_orders.reject
- online_orders.payment.review

Status:
NEW platform Actions

Owners:
- accept_retail_website_order
- reject_retail_website_order
- final payment-review owner where applicable

Location:
website order branch.

Public website order creation is NOT an employee Action.

## 21. Website Management

Actions:
- website.settings.manage
- website.branch_schedule.manage
- website.product_availability.manage
- website.appearance.manage
- website.payment_methods.manage

Status:
NEW platform Actions

Location:
branch-specific operations use target branch.
Business appearance may be Business-wide.

Public catalog/quote endpoints do not consume employee Actions.

## 22. Shifts / Expenses

Shared Actions from Permissions V2 plan:

- shifts.open
- shifts.close
- shifts.cash.view
- expenses.create

Location:
shift branch.

Retail must use same hardened owners as Restaurant where shared.

## 23. Reports

Current:
- reports.export — EXISTING

Retail Reports V1 adds:
- reports.sales.view
- reports.cost.view
- reports.profit.view
- reports.inventory_valuation.view
- reports.stock_movements.view
- reports.purchasing.view
- reports.suppliers.view

Location:
report branch scope.

Cost/profit visibility is intentionally separable from basic sales visibility.

## 24. Users / Settings / Branches

Reuse platform Permissions V2 actions:

Users:
- users.view
- users.create
- users.edit
- users.activate
- users.password.reset
- users.page_permissions.manage
- users.action_permissions.manage
- users.location_scope.manage

Settings:
- settings.business_identity.manage
- settings.printing.manage
- settings.financial.manage
- settings.operational.manage

Branches:
- branches.create
- branches.edit
- branches.activate
- branches.delete
- branches.copy_configuration

## 25. Role template proposal

These are defaults only, not hard-coded final authority.

### Retail Cashier

Default Pages:
- home
- pos
- orders
- customers
- shifts
- returns where business policy permits

Suggested Actions:
- sales.create
- retail.sales.suspend
- retail.sales.resume
- customers.create
- shifts.open
- shifts.close
- returns.create only if business chooses

No inventory/purchasing/admin authority by default.

### Retail Call Center

Default:
- orders
- customers
- deliveryOrders
- website intake if assigned

Suggested:
- online_orders.accept/reject where assigned
- customers.create/edit where assigned
- no POS stock adjustment.

### Stock Clerk

Pages:
- inventory
- stockCount
- transfers
- products read

Suggested:
- inventory.adjust optional
- inventory.count.post
- inventory.transfer.create/receive

No PO approval/financial profit visibility by default.

### Purchasing

Pages:
- suppliers
- purchasing
- inventory read

Suggested:
- purchasing suppliers/manage
- request create/submit
- PO create
- receive
- supplier return

PO/invoice approval can be separate.

### Manager

Broad operational pages.
Sensitive actions remain explicit:
- manual discounts
- returns
- PO approval
- invoice approval
- Landed Cost post
- profit reports
- user/permission administration.

### Admin

Current accepted Admin semantics retained, but trusted Retail Profile guard still applies.

Retail Business Admin cannot call unrelated Pharmacy/Restaurant/etc. owners.

## 26. Backend closure requirement

Every Retail staff mutation owner must eventually compose:

trusted profile = retail
AND
Action permission
AND
Location scope when applicable
AND
business invariants

ACL:
employee owners should remove anon/PUBLIC EXECUTE as designed in X1.

Public website owners remain separate.

## 27. Acceptance

For each representative Action:
- correct Profile + allow + correct Location -> proceeds;
- wrong Profile -> PROFILE_MISMATCH;
- Action deny -> ACTION_DENIED;
- Location deny -> LOCATION_DENIED;
- direct RPC cannot bypass;
- direct REST cannot bypass sensitive owner;
- audit evidence where required.

## 28. Current state

Retail Action Matrix:
DESIGN CLOSED.

Existing catalog Actions are reused where semantics match.

New Action rows:
NOT CREATED.

Backend wiring:
NOT STARTED.

No DB/Runtime/Cloud mutation.
