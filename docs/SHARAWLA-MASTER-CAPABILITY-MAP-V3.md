# Sharawla POS — Master Capability Map V3

Status: DESIGN BASELINE / NO ASSIGNMENT WRITES

Catalog: 107 capabilities total
- Existing foundation: 65
- New V3 shared engines: 42
- Implemented now: 40
- Planned now: 67

This document defines how the catalog SHOULD be distributed later. It does not change any Profile, Category or Business assignment by itself.

## 1. Resolution model

Core Locked -> Profile Default -> Activity Category Override -> Business Add-on/Override -> POS Operational Settings

Rules:
1. Core is platform infrastructure, not a business add-on.
2. Profile defines the sensible baseline for a business family.
3. Category specializes a Profile without cloning the product.
4. Business can receive extra capabilities when needed.
5. Daily operational toggles remain inside Sharawla POS when possible.
6. Planned capabilities are visible for roadmap/design only and cannot be enabled until implemented=true.
7. Dependencies must be satisfied automatically/explicitly before enabling a capability.
8. A capability is assigned; it is never physically moved from one industry to another.

## 2. Reporting architecture

`core.reports` remains one Report Engine rather than dozens of report capabilities.

Report packs are derived from enabled capabilities:
- Sales/Orders pack
- Inventory pack
- Purchasing pack
- Food/Production/Costing pack
- Finance/Receivables pack
- Service/Appointments pack
- Pharmacy pack
- Logistics pack
- Membership pack

Common filters should include date range, branch, shift, user, payment method, supplier, customer, category and item where applicable. Reports should support drill-down, comparison, print/export and audit-safe historical snapshots where required.

## 3. Shared engine groups added in V3

### Commerce
- commerce.variants
- commerce.custom_orders
- commerce.price_tiers
- commerce.gift_cards
- commerce.loyalty
- commerce.installments
- commerce.trade_in
- commerce.consignment
- commerce.b2b_orders
- commerce.quotations
- commerce.return_policies
- commerce.weight_sales
- commerce.bundles_kits
- commerce.b2b_portal
- commerce.season_pricing

### Purchasing / Inventory
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost
- inventory.returnables
- inventory.testers

### Food Advanced
- food.prep
- food.production
- food.waste
- food.costing

`food.ingredients` + `food.recipes` remain the Basic Recipe foundation. The V3 food capabilities extend that foundation into full preparation, production, waste and food-cost control.

### Service
- service.warranty
- service.packages
- service.installation

### Finance
- finance.credit
- finance.receivables
- finance.collections
- finance.aging
- finance.commissions

### Fiscal
- fiscal.receipts
- fiscal.invoices

### Automotive
- automotive.fitment
- automotive.cross_reference
- automotive.vin

### Healthcare
- healthcare.emr
- healthcare.insurance

### Education / Institutional
- education.school_lists

### Integrations
- integrations.delivery_aggregators

## 4. Profile baselines — target design

These are design targets only. No rows are written by this document.

### Restaurant
Primary engine family:
- POS / Products / Orders / Payments
- Delivery / Pickup / Website
- Kitchen / Modifiers
- Inventory / Suppliers / Purchasing / Receiving
- Basic Recipe optional: food.ingredients + food.recipes
- Advanced Recipe optional: food.prep + food.production + food.waste + food.costing
- Purchasing advanced optional: purchase_orders + supplier_returns + replenishment + landed_cost
- Loyalty / gift cards / custom orders / weighted sales / delivery aggregators as category-specific add-ons

### Retail
Primary engine family:
- POS / Products / Barcode / Orders / Returns
- Customers / Promotions
- Inventory / Suppliers / Purchasing / Receiving / Count / Transfers
- Category-specialized capabilities such as variants, serials, batch/expiry, warranty, installments, trade-in, consignment, weighted sales and B2B

### Pharmacy
Primary engine family:
- Retail inventory core
- Batch / Expiry
- Pharmacy catalog, alternatives, prescriptions, insurance, claims, controlled drugs
- Website / Delivery optional
- Fiscal integration optional by jurisdiction
- Advanced purchasing optional

### Logistics
Primary engine family:
- Customers / Payments / Expenses / Reports
- Shipments / Waybills / Pickup Requests / Tracking / Zones / Drivers / COD / Client Settlements / Returns
- Receivables / Collections / Commissions may be added when implemented

### Membership
Primary engine family:
- Members / Plans / Subscriptions / Renewals / Freeze / Check-in / Classes / Trainers / Bookings
- Payments / Expenses / Reports
- POS / Products / Stock optional for merchandise
- Loyalty / gift cards optional

### Warehouse
Primary engine family:
- Products / Barcode / Stock / Suppliers / Purchasing / Receiving / Count / Transfers
- Purchase Orders / Replenishment / Supplier Returns / Landed Cost when implemented
- B2B Orders / Price Tiers / Credit / Receivables optional for distribution businesses
- Multi-warehouse / serials when implemented

### Service
Primary engine family:
- Customers / Appointments / Jobs / Assets
- Payments / Expenses / Reports
- Packages / Commissions / Warranty / Installation depending category
- Products / Stock / Purchasing optional when service consumes/sells parts/materials

## 5. Category specialization map — 24 working categories

`companies` and `other` intentionally excluded from this stage.

### Restaurant profile

#### restaurants — المطاعم
Suggested extras:
- food.ingredients
- food.recipes
- food.prep
- food.production
- food.waste
- food.costing
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- commerce.loyalty
- commerce.gift_cards
- integrations.delivery_aggregators

Basic restaurants may stop at Ingredients + Recipes. Large restaurants may add the full Advanced Food stack.

#### cafes — الكافيهات
Suggested extras:
- food.ingredients / food.recipes
- food.prep / food.production / food.waste / food.costing
- commerce.loyalty / commerce.gift_cards
- integrations.delivery_aggregators
- commerce.custom_orders when pre-orders/catering are needed

#### bakery_sweets — المخابز والحلويات
Suggested extras:
- food.ingredients / food.recipes / food.prep / food.production / food.waste / food.costing
- commerce.custom_orders
- commerce.weight_sales
- inventory.batch / inventory.expiry
- commerce.website
- inventory.purchase_orders / supplier_returns / replenishment

#### juices_beverages — العصائر والمشروبات
Suggested extras:
- food.ingredients / food.recipes / food.production / food.waste / food.costing
- commerce.loyalty
- integrations.delivery_aggregators
- inventory.returnables when crates/bottles are used
- commerce.website

### Retail profile

#### retail — التجارة والتجزئة
Generic Retail baseline. Additional capabilities should normally be assigned only when the actual business needs them.

#### supermarkets — السوبر ماركت
Suggested extras:
- commerce.weight_sales
- inventory.batch / inventory.expiry
- commerce.loyalty
- inventory.replenishment
- inventory.purchase_orders / supplier_returns
- commerce.return_policies

#### hypermarkets — الهايبر ماركت
Suggested extras:
- commerce.weight_sales
- commerce.variants
- inventory.serials
- service.warranty
- commerce.loyalty
- inventory.replenishment
- commerce.return_policies
- commerce.season_pricing

#### grocery — البقالة والميني ماركت
Suggested extras:
- commerce.weight_sales
- inventory.batch / inventory.expiry
- inventory.returnables
- finance.credit / finance.receivables / finance.collections
- commerce.delivery
- inventory.purchase_orders / replenishment

#### clothes — محلات الملابس
Suggested extras:
- commerce.variants
- commerce.season_pricing
- commerce.gift_cards
- commerce.return_policies
- commerce.loyalty
- commerce.website

#### shoes — الأحذية
Suggested extras:
- commerce.variants
- commerce.season_pricing
- commerce.gift_cards
- commerce.return_policies
- commerce.loyalty
- commerce.website

#### cosmetics_perfumes — مستحضرات التجميل والعطور
Suggested extras:
- commerce.variants
- inventory.batch / inventory.expiry
- inventory.testers
- commerce.consignment
- finance.commissions
- commerce.gift_cards
- commerce.loyalty
- commerce.website

#### electronics — الأجهزة والإلكترونيات
Suggested extras:
- inventory.serials
- service.warranty
- service.jobs
- service.installation
- commerce.b2b_orders
- commerce.quotations
- commerce.return_policies
- commerce.website

#### mobiles_accessories — الموبايلات والإكسسوارات
Suggested extras:
- inventory.serials
- service.warranty
- commerce.installments
- commerce.trade_in
- service.jobs
- commerce.variants for accessories
- commerce.return_policies

#### home_supplies — الأدوات المنزلية
Suggested extras:
- commerce.variants
- commerce.bundles_kits
- inventory.serials optional for appliances
- service.warranty optional
- commerce.return_policies

#### auto_parts — قطع غيار السيارات
Suggested extras:
- automotive.fitment
- automotive.cross_reference
- automotive.vin
- service.jobs optional when workshop exists
- commerce.b2b_orders
- commerce.quotations
- commerce.return_policies
- commerce.website

#### bookstores_stationery — المكتبات والأدوات المكتبية
Suggested extras:
- education.school_lists
- commerce.b2b_orders
- commerce.quotations
- finance.credit / receivables / collections
- commerce.price_tiers
- commerce.website optional

#### wholesale — تجارة الجملة
Suggested extras:
- commerce.b2b_orders
- commerce.quotations
- commerce.price_tiers
- finance.credit
- finance.receivables
- finance.collections
- finance.aging
- finance.commissions
- commerce.b2b_portal
- inventory.purchase_orders / supplier_returns / replenishment / landed_cost

### Pharmacy profile

#### pharmacies — الصيدليات
Suggested extras beyond the Pharmacy baseline:
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost optional
- fiscal.receipts / fiscal.invoices according to jurisdiction
- commerce.website / delivery / pickup optional
- commerce.loyalty optional

### Logistics profile

#### shipping_logistics — الشحن واللوجستيات
Suggested extras:
- finance.receivables
- finance.collections
- finance.aging
- finance.commissions
- fiscal.invoices optional for B2B billing

Core Logistics capabilities remain shipments, waybills, pickup requests, tracking, zones/pricing, drivers, COD, client settlements and shipping returns.

### Membership profile

#### gyms_clubs — الجيم والعضويات
Suggested extras:
- commerce.pos / commerce.products / inventory.stock optional for merchandise
- commerce.loyalty
- commerce.gift_cards
- finance.collections when account collection is needed

### Service profile

#### maintenance_services — الخدمات والحجوزات
Suggested extras:
- service.appointments
- service.jobs
- service.assets
- service.warranty
- service.installation
- service.packages optional
- finance.commissions
- inventory.stock / purchasing optional for parts/materials
- commerce.quotations optional

#### beauty_salons — الصالونات ومراكز التجميل
Suggested extras:
- service.appointments
- service.packages
- finance.commissions
- inventory.stock / purchasing
- commerce.gift_cards
- commerce.loyalty
- commerce.website for online booking

Material consumption should be implemented through the service workflow or a future generic consumption engine, rather than forcing Food-specific recipes onto salons.

#### medical_centers — العيادات والمراكز الطبية
Suggested extras:
- service.appointments
- service.packages
- healthcare.emr
- healthcare.insurance
- finance.commissions
- fiscal.receipts / fiscal.invoices according to jurisdiction
- commerce.website for online booking

### Warehouse profile

#### warehouses — المخازن والتوزيع
Suggested extras:
- inventory.purchase_orders
- inventory.supplier_returns
- inventory.replenishment
- inventory.landed_cost
- inventory.multi_warehouse
- inventory.serials optional
- commerce.b2b_orders / price_tiers / credit / receivables for distribution businesses

## 6. Strong purchasing design

The target purchasing lifecycle is:
Purchase need/reorder -> Purchase Order -> Approval policy inside POS/Admin settings -> Partial/complete receiving -> Cost update -> Landed cost allocation -> Supplier return if needed -> Purchasing reports.

Not every step must become a separate capability. The capability catalog controls major engines; workflow details and approval thresholds should remain settings/permissions inside the Purchasing engine.

## 7. Strong orders design

`commerce.orders` remains the shared order engine. Specialized order capabilities extend it:
- Restaurant: dine-in/takeaway/delivery/pickup/website
- Retail: POS order + reservation/delivery/pickup
- Bakery: custom/pre-orders
- Wholesale: B2B sales orders + quotations
- Service: appointments/jobs
- Logistics: shipments/pickup requests
- Membership: bookings/subscriptions

This prevents seven separate order systems.

## 8. Recipe levels

### Basic Recipe
- food.ingredients
- food.recipes
- unit conversions
- variant/size recipe support
- modifier impact on stock where applicable
- automatic ingredient deduction

### Advanced Recipe / Food Cost
Adds:
- food.prep
- food.production
- food.waste
- food.costing
- yield
- theoretical vs actual usage
- weighted cost / cost snapshot
- recipe versioning
- branch override only when necessary

A business may start Basic and later enable Advanced without rebuilding its product/ingredient master data.

## 9. Production safety rule

SH-0005, SH-0006 and Top Burger remain Production Read-Only. No Profile, Category or Business capability assignment from this V3 design is permitted to target them during beta work.

All implementation/assignment testing must use SH-0007 / business `تجريبي` only, and experimental Business Overrides must be reset after the test cycle.

## 10. Next implementation order

Recommended engine build order:
1. Product Variants + purchasing foundation
2. Basic Recipe (Ingredients + Recipes)
3. Advanced Purchasing (PO / returns / replenishment / landed cost)
4. Advanced Recipe (Prep / Production / Waste / Costing)
5. B2B Orders + Price Tiers + Credit/Receivables/Aging
6. Service Jobs + Warranty + Packages + Commissions
7. Serial/IMEI completion + Installments + Trade-in
8. Fiscal integrations
9. Automotive / Healthcare / Education specializations
10. External delivery aggregator integrations

Do not mark any Planned capability implemented until its runtime, UI, permissions, offline behavior, reporting contract and acceptance tests are complete.
