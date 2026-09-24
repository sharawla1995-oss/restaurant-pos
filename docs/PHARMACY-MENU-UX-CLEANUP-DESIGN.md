# Sharawla Pharmacy Menu & UX Cleanup Design

Status: DESIGN / DOCUMENTATION ONLY
Runtime change: NONE
DB mutation: NONE
Cloud mutation: NONE

Purpose:
define the final Pharmacy navigation, page ownership and user-facing terminology before dedicated Pharmacy runtime closure.

---

## 1. Current Pharmacy surface

Current Pharmacy Engine exposes 26 pages:

- home
- pos
- orders
- customers
- pharmacyCatalog
- pharmacyBatches
- pharmacyExpiry
- pharmacyPrescriptions
- pharmacyInsurance
- pharmacyClaims
- deliveryOrders
- shifts
- inventory
- stockCount
- transfers
- suppliers
- purchasing
- promoCodes
- websiteManagement
- returns
- expenses
- products
- reports
- users
- settings
- deliverySettings

Current dedicated Pharmacy UI pages are inserted into navigation by:
- DOM injection;
- MutationObserver;
- periodic setInterval.

This is transitional behavior, not final route ownership.

---

## 2. Final Pharmacy navigation groups

### 1. الرئيسية
- الرئيسية

### 2. البيع والصرف
- كاشير الصيدلية
- الفواتير
- المرتجعات
- العملاء
- الورديات

### 3. الأدوية والروشتات
- دليل الأدوية
- الروشتات
- البدائل

The Alternatives capability may remain inside Drug Catalog in V1 if a separate page adds no operational value.

Feature-aware:
- prescription workflows appear only when pharmacy.prescriptions is enabled.
- substitute controls appear only when pharmacy.alternatives is enabled.

### 4. المخزون والصلاحية
- المخزون
- الباتشات والتشغيلات
- تواريخ الصلاحية والتنبيهات
- الجرد
- تحويلات الفروع

Preferred label:
"تواريخ الصلاحية والتنبيهات"

Do not use:
"الصلاحيات والتنبيهات"

Reason:
"الصلاحيات" is easily confused with user permissions.

### 5. التأمين
Feature-aware:
- شركات وخطط التأمين
- مطالبات التأمين

Only visible when the relevant Pharmacy insurance capabilities are entitled/enabled.

### 6. الموردون والمشتريات
- الموردون
- المشتريات والاستلام

Advanced purchasing tools remain inside Purchasing and are Feature-gated.

### 7. الطلبات والقنوات
Feature-aware:
- طلبات التوصيل
- طلبات روشتات الموقع
- إدارة الموقع
- إعدادات التوصيل

Do not expose delivery/page entries when disabled.

### 8. المالية والتقارير
- المصروفات
- التقارير

Future Pharmacy report sections:
- المبيعات
- الربحية
- المخزون
- تواريخ الصلاحية
- الباتشات
- الروشتات
- التأمين والمطالبات

### 9. الإدارة والإعدادات
- المستخدمون
- الإعدادات

Admin-only/base product configuration may expose:
- الأصناف الأساسية
- branch/business settings
- printing
- payment/tax settings

---

## 3. Drug Catalog vs Products

Current UI has both:
- products
- pharmacyCatalog

They serve different meanings.

### Products
Commercial/product master:
- base product name
- price
- barcode
- category
- active state
- branch availability

### Drug Catalog
Pharmacy metadata:
- scientific name
- active ingredient
- strength
- dosage form
- manufacturer
- registration number
- prescription_required
- controlled_drug
- batch tracking
- reorder level
- substitute relations

Final UX should make this distinction clear.

Recommended:
- ordinary pharmacist works mainly from "دليل الأدوية".
- generic "الأصناف الأساسية" remains an Admin/Product setup page.
- do not show both as equal duplicate daily-work pages.

---

## 4. Pharmacy-specific pages must become canonical routes

Current dedicated pages are injected dynamically.

Final target:
register Pharmacy pages in the unified Navigation/Route Registry.

Each page needs:
- canonical route id;
- page title;
- permission key;
- feature/capability gate;
- renderer owner;
- home card position;
- role visibility.

No page should depend on DOM mutation timing.

Remove final dependence on:
- MutationObserver navigation insertion;
- periodic setInterval insertion.

---

## 5. Pharmacy POS UX

POS header:
- كاشير الصيدلية

Search supports:
- product name
- barcode
- scientific name
- active ingredient
- manufacturer

Product card should clearly show:
- name
- strength/dosage form where useful
- price
- available valid batch quantity
- prescription badge
- controlled-drug badge

Do not use badges as the security boundary.

Backend remains authoritative.

---

## 6. Prescription UX

Prescription selector should show:
- patient/customer
- doctor
- date
- fulfillment state

Better states:
- مفتوحة
- صُرف جزء منها
- تم الصرف
- ملغاة where supported

Do not mark a prescription fully dispensed just because it was selected at checkout.

After the integrity contract implementation:
show line-level:
- requested medicine
- prescribed quantity
- dispensed quantity
- remaining quantity
- substitute used if applicable

---

## 7. Controlled-drug UX

When product is controlled:
- clearly mark it in catalog/POS;
- require the backend-approved workflow;
- show required evidence fields from configured policy;
- require confirmation where appropriate.

Do not show a generic "مراقب" badge and then allow normal unrestricted checkout.

If the deployment does not have controlled-drug workflow closed:
- feature should remain unavailable/disabled commercially.

---

## 8. FEFO UX

Current UI automatically allocates earliest-expiry batches.

Final POS should:

Default:
- auto-select FEFO.

If override is allowed:
- explicit "اختيار باتش مختلف"
- show earlier available batches
- require reason
- require pharmacy.fefo.override
- display audit warning

Never make override a silent dropdown.

---

## 9. Batch page cleanup

Current Batch page is useful but should clarify actions:

Primary:
- استلام باتش
- تسوية كمية
- هالك

Each row:
- drug
- batch no
- expiry
- quantity
- cost
- sale price
- status

Statuses:
- ساري
- قريب الانتهاء
- منتهي
- غير نشط

Waste:
- positive user-entered waste quantity preferred in UX;
- backend translates to negative stock effect;
- do not ask ordinary user to type "-2" as the business meaning.

Current prompt text asking for negative quantity is developer-ish and should be cleaned.

---

## 10. Expiry page

Rename:
"تواريخ الصلاحية والتنبيهات"

Sections:
- منتهي
- خلال 30 يوم
- 31-90 يوم

Later:
- configurable alert windows
- branch filter
- supplier/manufacturer filters
- value at risk
- write-off/quarantine workflow

Do not call FEFO "closed" merely because this page sorts by expiry.

---

## 11. Insurance UX

Separate two concepts:

### Setup
"شركات وخطط التأمين"

For:
- companies
- plans
- copay
- coverage
- prior approval rules

### Operations
"مطالبات التأمين"

For:
- claim review
- submit
- approve/reject according to workflow
- settle
- adjustments

Do not mix setup and claim operations in one permission.

---

## 12. Claim status UX

Current page exposes a raw dropdown across all statuses.

Final UX should show only valid next actions.

Example:
draft:
- إرسال

submitted:
- اعتماد
- اعتماد جزئي
- رفض

approved / partially approved:
- تسوية

settled:
- read-only except explicit adjustment workflow

cancelled/rejected:
- read-only or controlled reopen if product policy allows.

Backend transition guard remains authoritative.

Do not allow arbitrary state jumps from one dropdown.

---

## 13. Website prescription requests

Current requests appear inside the Prescriptions page.

V1 can keep them there with a dedicated section:

"طلبات روشتات الموقع"

Actions:
- بدء المراجعة
- قبول/تحويل إلى روشتة
- رفض
- link to customer/order when created

If volume becomes high:
make a canonical separate route later.

Do not create a separate route only for visual symmetry.

---

## 14. Offline UX

Current Pharmacy checkout shows:
"بيع الباتشات والتأمين يحتاج اتصال إنترنت في Beta30"

This must not remain in product UI.

Until Pharmacy Offline is implemented:

Use:
"بيع الصيدلية يحتاج اتصال بالإنترنت حاليًا."

No internal Beta version in the message.

For unsupported Offline return:
"مرتجع الصيدلية يحتاج اتصال بالإنترنت حاليًا."

Do not let generic offline return silently queue.

---

## 15. Error-state cleanup

Do not show:
- SQL migration instructions;
- Beta numbers;
- raw function names;
- PostgREST errors;
- Supabase implementation details.

Map failures to stable product/support codes.

Examples:
- PHARMACY_BATCH_STOCK_INSUFFICIENT
- PHARMACY_PRESCRIPTION_REQUIRED
- PHARMACY_FEFO_OVERRIDE_REQUIRED
- PHARMACY_PROFILE_MISMATCH
- PHARMACY_CLAIM_RULE_FAILED
- PHARMACY_RETURN_ONLINE_REQUIRED

User-facing Arabic remains concise.

---

## 16. Feature-aware page visibility

### Base Pharmacy
Always where profile permits:
- POS
- orders
- customers
- drug catalog
- batches
- expiry
- shifts
- inventory
- products
- reports

### pharmacy.prescriptions
Controls:
- prescriptions page/workflow
- prescription checkout features

### pharmacy.alternatives
Controls:
- substitute configuration/use UI

### pharmacy.insurance
Controls:
- companies/plans
- insurance POS inputs

### pharmacy.claims
Controls:
- claims operations

### pharmacy.controlled_drugs
Controls:
- controlled-drug workflow

Do not merely rely on a generic "pharmacy" module for all optional features.

---

## 17. Role-focused navigation

These are UI defaults only.
Backend Action permissions remain authoritative.

### Cashier
- home
- Pharmacy POS
- orders
- customers
- shifts
- returns if allowed

No batch adjustment or insurance administration by default.

### Pharmacist
- Pharmacy POS
- drug catalog
- prescriptions
- batches
- expiry
- inventory
- returns
- insurance operations where assigned

### Purchasing / Stock
- inventory
- batches receive
- stock count
- transfers
- suppliers
- purchasing

### Insurance staff
- insurance companies/plans only if assigned
- claims operations

### Call Center
- orders
- customers
- delivery orders
- website prescription requests where assigned

### Admin
All profile/feature-allowed pages.

Admin still cannot bypass trusted Profile boundary.

---

## 18. Home page priorities

Recommended first cards:

1. كاشير الصيدلية
2. الفواتير
3. الروشتات
4. الباتشات والتشغيلات
5. تواريخ الصلاحية
6. المخزون
7. مطالبات التأمين if enabled
8. المشتريات
9. التقارير
10. الإعدادات

Hide unavailable cards entirely.

No empty layout holes.

---

## 19. Touch requirements

Pharmacy is barcode/search heavy but must remain touch-friendly.

Requirements:
- large product cards;
- large quantity +/- controls;
- prescription selector usable on small screens;
- insurance inputs not cramped;
- batch/expiry tables horizontally scroll safely;
- claim action buttons touch-sized;
- no hover-only action;
- modal dialogs reachable on compact displays.

Scanner focus must not trap touch navigation.

---

## 20. Final page count philosophy

Do not optimize for a fixed page count.

Optimize for:
- clear workflows;
- capability-aware visibility;
- role relevance;
- one owner per function.

Current 26-page surface can be grouped so the sidebar feels substantially smaller without deleting real functionality.

---

## 21. Acceptance

Pharmacy Menu/UX cleanup is accepted only when:

- canonical Pharmacy routes are registry-owned;
- no MutationObserver/setInterval navigation ownership remains;
- feature-disabled pages do not appear;
- role/permission filtering works;
- "الصلاحية" terminology is not confused with user permissions;
- no Beta/version SQL setup text appears;
- claim actions follow valid transitions;
- controlled/prescription badges match real backend behavior;
- online-only states are explicit;
- representative touch pass succeeds.

---

## 22. Current state

Design:
CLOSED.

Runtime implementation:
NOT STARTED.

Known cleanup debt:
- dynamically injected Pharmacy routes;
- periodic DOM route insertion;
- confusing "الصلاحيات والتنبيهات" label;
- Beta30 online-only message;
- unrestricted claim status dropdown;
- feature-aware optional page gating not fully separated;
- duplicate-feeling Product vs Drug Catalog presentation.

No Runtime/DB/Cloud mutation was performed.
