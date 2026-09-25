# Sharawla Retail Product Map + Capability Alignment

Status: DESIGN / READ-ONLY
Runtime change: NONE
Cloud mutation: NONE
DB mutation: NONE

This document closes the no-laptop Retail navigation/capability design gaps found during Retail Closure Audit.

## 1. Current navigation facts

Retail Engine currently exposes:
- 22 pages;
- Delivery + Pickup are intentional Retail capabilities;
- Dine-in/Tables/Kitchen are not Retail baseline.

Unified Navigation Registry currently still marks:
- deliveryOrders as profile=restaurant;
- deliverySettings as profile=restaurant.

This metadata is stale relative to current Retail Engine behavior.

Historical Beta23 acceptance also treated those pages as Restaurant leakage.

Both must be modernized before Retail Closure.

## 2. Shared Delivery ownership decision

deliveryOrders and deliverySettings are not Restaurant-exclusive routes anymore.

Final registry model should represent them as shared profile-aware routes.

Preferred model:
- route owner = Core/Shared Delivery;
- allowed profiles determined by profile/module/capability;
- Restaurant adapter where Restaurant-specific presentation is needed;
- Retail adapter/shared presentation where Retail is active;
- unsupported Profiles fail closed.

Do not duplicate two independent route keys solely to fix metadata.

Do not keep profile=restaurant if Retail intentionally uses the route.

## 3. Retail Product Map

Recommended Retail sidebar grouping:

### 1. الرئيسية
- Home

### 2. المبيعات
- نقطة البيع
- الفواتير / الطلبات
- المرتجعات
- العملاء
- عروض الماركت
- البرومو كود

### 3. الطلبات الأونلاين
When Website enabled:
- طلبات الموقع

Do not duplicate the same website-order inbox under Delivery.

### 4. تشغيل المتجر
When Delivery enabled:
- طلبات الدليفري

Future operational store tools may live here if they are not inventory/admin configuration.

### 5. المخزون والمشتريات
- المخزون
- الجرد
- التحويلات
- الموردين
- المشتريات والاستلام

Conditional:
- التوريد الداخلي when inventory.multi_warehouse is entitled.

Advanced Purchasing stays inside Purchasing rather than creating five sidebar pages.

### 6. الموظفون
Shared HR group when enabled:
- الموظفون
- السلف
- الخصومات والمكافآت
- المرتبات

### 7. المالية
- الخزنة
- المصروفات
- الورديات

Financial supplier/payment tools may appear here when their commercial capability is enabled.

### 8. التقارير
- التقارير

Retail Reports V1 becomes the profile-aware report hub.

### 9. إدارة الموقع
When commerce.website enabled:
- إدارة الموقع
- توافر الأصناف
- إعدادات الفرع
- طرق الدفع
- المظهر

The Retail Website Orders inbox stays in "الطلبات الأونلاين", not duplicated here.

### 10. الإدارة والإعدادات
- الأصناف
- وحدات وباركود الوزن only when appropriate capability is allowed
- إدارة الدليفري only when Delivery enabled
- المستخدمون والصلاحيات
- الإعدادات

Products remain administrative catalog ownership rather than inventory transaction ownership.

## 4. Current Product Map compatibility

The existing profile-aware Product Map V1 already has appropriate cross-profile groups:
- sales
- online-orders
- profile-operations
- inventory-purchasing
- hr
- finance
- reports
- website
- administration

Therefore Retail does NOT need a separate sidebar system.

Required closure is metadata alignment + route ordering/visibility, not a new navigation engine.

## 5. Retail-specific route placement

retailOffers:
- group = sales
- accepted.

marketSettings:
- current group = administration
- accepted conceptually, but visibility must follow Weighted Sales capability decision.

retailWebsiteOrders:
- group = online-orders
- accepted.

deliveryOrders:
- group = profile-operations
- accepted for Retail when Delivery enabled.

deliverySettings:
- administration/settings.
- only visible when Delivery enabled and user page/action permissions allow.

## 6. Weighted Sales current drift

Sharawla Cloud feature:

code:
commerce.weight_sales

name:
البيع بالوزن والميزان

description:
Weighted-item sales and scale/barcode integration contracts.

Current Cloud state:
- feature_class = planned
- implemented = false
- active = true

Current Retail runtime already supports:
- unit_type piece/kg/g/liter/ml;
- allow_decimal;
- qty_step;
- min_qty;
- barcode_mode normal/weight/price;
- scale-style embedded EAN13 decoding;
- weight_prefix;
- PLU code;
- embedded divisor;
- quantity normalization.

Current runtime uses those behaviors whenever Profile=Retail.
It does not check commerce.weight_sales.

Therefore Cloud catalog and Runtime are not aligned.

## 7. Weighted Sales final capability decision

Do not globally remove existing Retail behavior before a migration gate.

Target architecture:

### Baseline Retail quantity engine
Keep as Retail core:
- decimal quantity support;
- quantity step/minimum;
- unit labels.

Reason:
decimal quantities are not only "scale integration"; many Retail businesses sell fractions/meters/volume.

### commerce.weight_sales capability
Own the advanced weighted-sale/scale contract:
- scale barcode mode weight;
- scale barcode mode price;
- PLU;
- weight prefix;
- embedded divisor;
- future physical scale integration.

This creates a clean split:
- decimal/fraction quantity = Retail baseline;
- scale/embedded-weight integration = capability-gated.

## 8. Migration compatibility

Current installations may already use barcode_mode=weight/price.

Therefore future capability gating must not silently break an existing entitled/legacy Retail Business.

Before enforcement:
1. discover Businesses/products using weight/price modes;
2. grant/migrate appropriate entitlement where contract requires;
3. verify runtime config;
4. then gate scale-specific UI/runtime.

For the first new Retail Beta Business:
- test baseline decimal quantity separately;
- enable commerce.weight_sales only for scale/embedded barcode acceptance when the Feature is implemented.

## 9. Cloud catalog update gate

Do NOT change commerce.weight_sales to implemented=true merely because code paths exist.

Before catalog promotion require:
- Feature-gated runtime behavior;
- UI visibility gate;
- scale barcode acceptance;
- offline sale acceptance;
- return acceptance;
- report acceptance;
- capability dependency decision;
- Retail Activity defaults/commercial rule.

Then:
- implemented=true;
- feature_class chosen intentionally (standard/add_on);
- Profile/Activity defaults configured.

## 10. Activity Category defaults

Current Cloud:
- generic retail activity is active;
- supermarkets/grocery/clothes/electronics/etc. exist but are inactive.

Long-term Activity defaults may be:

Supermarket/Grocery:
- weight sales likely enabled/default eligible.

Clothes/Shoes:
- Variants more relevant.

Electronics/Mobiles:
- serial/IMEI capabilities may matter later.

Do not activate those categories only to solve the first Retail Beta acceptance.

First Retail Beta uses active generic retail.

## 11. Variants placement

commerce.variants remains an optional capability.

UI:
- Variants controls live inside Products.
- no separate sidebar page required.

When feature off:
- no variant controls.
- legacy product sale remains.

When on:
- matrix/SKU/barcode/stock unit controls become available.

This is accepted Product Map behavior.

## 12. Advanced Purchasing placement

Advanced Purchasing add-ons remain inside Purchasing:
- PR
- advanced PO
- Supplier Invoice / 3-Way Match
- Replenishment
- Supplier Return
- Landed Cost

Do not expand sidebar with one page per workflow in V1.

Feature-gated cards/tabs inside Purchasing are preferred.

## 13. Retail route leakage definition

For Retail, the following are NOT leakage:
- Delivery Orders when commerce.delivery enabled;
- Delivery Settings when commerce.delivery enabled;
- Pickup behavior when commerce.pickup enabled;
- Website orders when commerce.website enabled.

Actual Restaurant leakage includes:
- Kitchen;
- Tables/Dine-in;
- Restaurant food ingredients;
- recipes/Food Cost;
- food production/waste/prep;
- restaurant-only operational labels/flows.

Acceptance V2 must use this definition.

## 14. Product Map acceptance

On dedicated Retail Beta:

Verify group order:
1. Home
2. Sales
3. Online Orders if enabled
4. Store Operations if populated
5. Inventory & Purchasing
6. Employees if enabled
7. Finance
8. Reports
9. Website if enabled
10. Administration & Settings

Verify:
- no empty headings;
- no duplicate routes;
- no stale Restaurant-only routes;
- entitled optional routes appear;
- non-entitled optional routes disappear/fail closed;
- page permissions still hide denied pages;
- Touch navigation remains usable.

## 15. Current state

Retail Product Map design:
CLOSED.

Shared Delivery registry metadata correction:
REQUIRED, NOT IMPLEMENTED.

Weighted Sales capability split:
DESIGN DECISION RECORDED.

Weighted Sales Cloud/runtime migration:
NOT STARTED.

No Runtime/Cloud/DB mutation was performed.
