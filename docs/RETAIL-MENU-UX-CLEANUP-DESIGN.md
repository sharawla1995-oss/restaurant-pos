# Sharawla Retail Menu & UX Cleanup Design

Status: DESIGN / DOCUMENTATION ONLY
Runtime change: NONE
DB mutation: NONE
Deployment: NONE

Purpose:
close the Retail presentation/navigation contract before dedicated Retail runtime acceptance.

## 1. Current Retail navigation surface

Current Retail Engine exposes:
- home
- pos
- orders
- customers
- deliveryOrders
- shifts
- inventory
- marketSettings
- retailOffers
- promoCodes
- stockCount
- transfers
- suppliers
- purchasing
- websiteManagement
- returns
- expenses
- products
- reports
- users
- settings
- deliverySettings

Retail Website Orders is currently injected by the Retail website runtime rather than owned as a first-class Retail Engine page.

## 2. Final Retail navigation groups

### 1. الرئيسية
- الرئيسية

### 2. المبيعات
- نقطة البيع
- المبيعات والفواتير
- المرتجعات
- العملاء
- الورديات

### 3. الطلبات والقنوات
Feature-aware:
- طلبات التوصيل
- طلبات الموقع
- استلام من الفرع remains an order mode, not a separate management page unless a dedicated Pickup queue is later required.

Rules:
- delivery entries appear only when commerce.delivery is enabled.
- website orders appear only when commerce.website is enabled.
- do not show Restaurant kitchen/tables/dine-in concepts.

### 4. الأصناف والتسعير
- الأصناف
- الوحدات والباركود
- العروض
- أكواد الخصم

Recommended label changes:
- "وحدات وباركود الوزن" -> "الوحدات والباركود"
- "عروض الماركت" -> "العروض"
- "البرومو كود" -> "أكواد الخصم"

Reason:
Retail is broader than supermarket/market.

### 5. المخزون
- نظرة عامة على المخزون
- الجرد
- تحويلات الفروع

Variant stock remains inside:
- product/variant management;
- inventory details;
unless a dedicated Variant Stock screen becomes necessary.

### 6. الموردون والمشتريات
- الموردون
- المشتريات والاستلام

Feature-aware advanced actions inside Purchasing:
- PR
- PO
- GRN
- Supplier Invoice / 3-Way Match
- Supplier Return
- Replenishment
- Landed Cost

Do not create seven permanent sidebar pages unless runtime evidence proves the page is too dense.

### 7. المالية والتقارير
- المصروفات
- التقارير

Future Retail Reports V1 sections live inside Reports:
- Sales
- Profit / COGS
- Inventory Valuation
- Stock Movements
- Purchasing
- Suppliers
- Variants

### 8. الموقع والتوصيل
- إدارة الموقع
- إعدادات التوصيل

This group appears only when relevant feature/module is enabled.

### 9. الإدارة والإعدادات
- المستخدمون
- الإعدادات

Permissions V2 may later expose authorized management shortcuts from Settings.

## 3. Home page order

Recommended Home card order:

1. نقطة البيع
2. المبيعات والفواتير
3. الطلبات والقنوات
4. العملاء
5. المخزون
6. المشتريات
7. الأصناف والتسعير
8. المالية والتقارير
9. الموقع والتوصيل
10. الإدارة والإعدادات

Feature-disabled cards must not leave empty holes.

Role/user permissions filter after profile/feature filtering.

## 4. Role-focused navigation defaults

These are presentation defaults only.
Backend Action permissions remain authoritative.

### Cashier
Primary:
- Home
- POS
- Orders
- Customers
- Shifts
- Returns if allowed

Optional:
- Delivery Orders

### Call Center
Primary:
- Home
- Orders
- Customers
- Delivery Orders
- Website Orders

No stock/purchasing/admin by default.

### Stock Clerk
Primary:
- Inventory
- Stock Count
- Transfers
- Products read

### Purchasing
Primary:
- Suppliers
- Purchasing
- Inventory read

### Manager
Broad operational navigation.
Sensitive actions remain separate permissions.

### Admin
All profile-allowed pages.

## 5. Retail terminology rules

Preferred customer-facing terms:

- Retail -> do not expose as English technical label unless intentionally branded.
- Market -> avoid as generic UI noun.
- Supermarket -> only for that Activity Category, not the generic Retail engine.
- "بيع تجزئة" -> valid order type label.
- "استلام من الفرع" -> Pickup.
- "توصيل" -> Delivery.
- "المبيعات والفواتير" -> better generic page label than only "الفواتير".
- "الأصناف" -> Products.
- "الوحدات والباركود" -> units, decimal rules, normal/embedded barcodes.

## 6. User-facing Beta/setup text that must be removed before Retail Closure

Current source still contains runtime messages such as:

- "شغّل SQL beta.15 Retail Inventory أولًا"
- "شغّل SQL beta.15 Retail Inventory على قاعدة الـBeta أولًا"
- "شغّل SQL beta.16 Suppliers & Purchasing أولًا"
- "شغّل SQL beta.17 Retail Market Core أولًا"
- older generic "شغّل SQL V..." messages in shared pages.

These are developer/setup instructions, not product UX.

Final behavior:

If required backend capability is genuinely unavailable:
- fail closed;
- show a normal support message;
- include a stable support/error code;
- do not instruct a cashier/admin to run SQL.

Example product message:
"الميزة غير متاحة في إعدادات النشاط الحالية. تواصل مع دعم Sharawla. (RETAIL_BACKEND_CAPABILITY_MISSING)"

For feature-disabled behavior:
"الميزة غير مفعلة لهذا النشاط."

For permission denied:
"ليس لديك صلاحية لتنفيذ هذه العملية."

For location denied:
"ليس لديك صلاحية لهذا الفرع."

Do not conflate these cases.

## 7. Internal version/cache strings

Current source contains historical cache-buster strings such as beta.54.

Current build pipeline sync-version/check-version already normalizes packaged version references before build.

Therefore:
- do not manually mass-edit cache-buster strings as a Retail UX task;
- keep version synchronization owned by the existing version pipeline;
- acceptance must verify packaged artifacts, not raw historical cache-buster text.

This is not a Retail runtime blocker by itself.

## 8. First-class Retail Website Orders route

Current Retail Website Orders button/page is injected dynamically.

Final target:
- register Website Orders as a profile-aware route in the unified navigation/route registry;
- capability-aware;
- permission-aware;
- no DOM-only ownership.

Requirements:
- one canonical route id;
- one title;
- one permission mapping;
- one home/nav location;
- one renderer owner.

Do not duplicate Website Management and Website Orders.

Suggested distinction:
- Website Orders = operations/intake.
- Website Management = configuration/catalog/appearance/payments.

## 9. POS terminology cleanup

Retail POS should present:

Order types:
- بيع تجزئة
- استلام من الفرع
- توصيل

Not:
- Restaurant takeaway/dine-in terminology.

Delivery fields only appear for Delivery.

Pickup must not ask for delivery-only fields.

Normal immediate Retail sale stays the fastest default path.

## 10. Product screen cleanup

Baseline product row/card should surface:
- name
- category
- sale price
- barcode
- active
- branch availability indicator where useful

Retail settings should not overwhelm the baseline editor.

Advanced blocks:
- unit/decimal/barcode settings
- Variants when entitled
- inventory policy/stock
- website availability

Feature-gated UI:
- Variants controls only when commerce.variants enabled.

Do not show disabled add-on buttons with broken actions.

## 11. Purchasing screen cleanup

Current baseline + Advanced Purchasing injection can become dense.

Final page should have:
- summary/KPIs
- purchase orders
- receiving
- supplier returns

Conditional tools:
- Purchase Requests
- Supplier Invoices
- Replenishment
- Landed Cost

Only show each tool when its controlling Feature is enabled.

Do not show empty advanced cards merely because code exists.

## 12. Inventory screen cleanup

Overview:
- total tracked items
- low stock
- out of stock
- inventory value after Reports V1/valuation owner is accepted

Actions:
- detailed balances
- stock count
- transfers
- movement history

Variant-aware:
- parent/variant visibility when enabled.

Do not merge product balance and variant balance in a way that double-counts stock.

## 13. Reports screen cleanup

Before Retail Reports V1:
- use profile-aware order type labels;
- remove dine-in from Retail filter.

After Reports V1:
tabs/sections:
- المبيعات
- الربحية
- قيمة المخزون
- حركة المخزون
- المشتريات
- الموردون
- الأصناف / Variants

Cost/profit tabs are permission-aware.

## 14. Settings cleanup

Retail Settings Hub should expose only profile-relevant cards.

Retail:
- Business identity
- Printing
- Financial
- Operational
- Update/health
- Website settings where enabled
- Delivery settings where enabled

Do not leak:
- Kitchen
- Tables
- Restaurant-only recipe/settings cards

unless a future Retail vertical explicitly owns them.

## 15. Touch rules

All Retail navigation and primary actions:
- >= current accepted coarse-pointer tap target baseline;
- no hover-only critical actions;
- scroll-safe tables;
- dialogs fit small screens;
- sticky primary action where large forms justify it.

Barcode focus:
- scanner input may autofocus on POS;
- it must not trap navigation or prevent touch controls.

## 16. Empty/error/loading states

Every Retail page needs three explicit states:

Loading:
- "جاري التحميل…"

Valid empty:
- e.g. "لا توجد أوامر شراء حتى الآن."

Error:
- human-readable;
- stable support/error code;
- retry when safe.

Do not use schema migration instructions as an error state.

## 17. Feature-disabled states

Preferred:
- hide unavailable management entry from ordinary users.

If direct route is reached:
- fail closed with:
  "الميزة غير مفعلة لهذا النشاط."

Do not render half-functional controls.

## 18. Acceptance

Retail Menu/UX closure requires:

- all navigation groups render correctly;
- feature-disabled pages hidden;
- permission-disabled pages hidden;
- allowed pages open;
- no empty content;
- no Restaurant-only leakage;
- no user-facing "run SQL beta..." text;
- no stale market-only generic labels;
- Retail Website Orders has canonical route ownership;
- touch representative pass;
- role navigation pass.

## 19. Implementation boundary

Do not implement this cleanup before:
- Restaurant SH-0007 G0-G3 closes;
or
- a dedicated source-only Retail cleanup batch is explicitly opened with no deployment.

When implementation starts:
- source changes only first;
- static validation;
- package validation;
- dedicated Retail runtime acceptance.

## 20. Current status

Retail Menu/UX design:
CLOSED.

Runtime implementation:
NOT STARTED.

Known cleanup debt:
- flat menu presentation;
- injected Website Orders route;
- generic Market terminology;
- user-facing historical SQL/Beta setup messages;
- Retail Reports filter terminology.

No Runtime/DB/Cloud mutation was performed.
