# Sharawla Pharmacy Product Map + Capability Alignment

Status: DESIGN / READ-ONLY
Runtime change: NONE
Cloud mutation: NONE
DB mutation: NONE

## 1. Confirmed current mismatch

Pharmacy Engine defines page permissions for Pharmacy pages.

But the current Pharmacy UI injects all Pharmacy-specific navigation buttons whenever:
profile = pharmacy.

Current injected pages:
- pharmacyCatalog
- pharmacyBatches
- pharmacyExpiry
- pharmacyPrescriptions
- pharmacyInsurance
- pharmacyClaims

The injection path does not currently enforce:
- feature entitlement per page;
- canAccessPage/page permission per injected button.

Unified Navigation Registry currently lists Pharmacy-specific routes with:
pagePermission = null
for several Pharmacy routes and marks them with missing permission-boundary metadata.

Therefore the current Pharmacy navigation/capability surface is not final.

## 2. Cloud capability model

Current Pharmacy Features and dependencies:

### pharmacy.catalog
Class:
standard

Depends on:
- commerce.products

Owns:
- Drug Catalog extensions.

### pharmacy.alternatives
Class:
add_on

Depends on:
- pharmacy.catalog

Owns:
- substitute/alternative management and use.

### pharmacy.prescriptions
Class:
add_on

Depends on:
- core.customers
- pharmacy.catalog

Owns:
- prescription create/review/fulfillment.

### pharmacy.insurance
Class:
add_on

Depends on:
- commerce.pos
- core.customers

Owns:
- insurance companies/plans and sale insurance selection.

### pharmacy.claims
Class:
add_on

Depends on:
- commerce.orders
- pharmacy.insurance

Owns:
- claim lifecycle and financial claim reporting.

### pharmacy.controlled_drugs
Class:
add_on

Depends on:
- pharmacy.catalog
- pharmacy.prescriptions

Owns:
- controlled-drug dispense/return/audit rules.

Separate Inventory capabilities:
- inventory.batch — required
- inventory.expiry — required.

## 3. Route-to-capability contract

### pharmacyCatalog
Feature:
pharmacy.catalog

Page permission:
pharmacyCatalog

Visible only when:
Profile=pharmacy
AND feature allowed
AND page permission allowed.

### pharmacyBatches
Feature:
inventory.batch

Page permission:
pharmacyBatches

### pharmacyExpiry
Feature:
inventory.expiry

Page permission:
pharmacyExpiry

### pharmacyPrescriptions
Feature:
pharmacy.prescriptions

Page permission:
pharmacyPrescriptions

### pharmacyInsurance
Feature:
pharmacy.insurance

Page permission:
pharmacyInsurance

### pharmacyClaims
Feature:
pharmacy.claims

Page permission:
pharmacyClaims

Do not use legacy module "insurance" as the final commercial entitlement authority.

It may remain compatibility plumbing during migration.

## 4. Non-page capabilities

### pharmacy.alternatives

No separate sidebar page is required.

Controls inside:
- Drug Catalog
- Pharmacy POS
- Prescription fulfillment

Visibility/action requires:
Feature allowed + Action permission.

When feature denied:
- alternative management button hidden/disabled;
- POS cannot perform substitute action.

### pharmacy.controlled_drugs

No generic standalone page required in V1.

Controls:
- product master controlled flag;
- POS dispense guard;
- return guard;
- controlled audit/report.

Feature denial must prevent:
- controlled-drug-specific operational flow.

Existing product flag alone is not entitlement.

## 5. Pharmacy Product Map

Recommended sidebar:

### 1. الرئيسية
- Home

### 2. المبيعات
- كاشير الصيدلية
- الفواتير
- المرتجعات
- العملاء
- البرومو كود when enabled

### 3. تشغيل الصيدلية
- دليل الأدوية
- الباتشات والتشغيلات
- الصلاحيات والتنبيهات
- الروشتات when entitled

Optional operational badges/cards:
- near expiry
- pending prescriptions

### 4. التأمين
Only when pharmacy.insurance allowed:
- شركات وخطط التأمين

Only when pharmacy.claims allowed:
- مطالبات التأمين

If neither allowed:
do not render an empty Insurance heading.

### 5. الطلبات الأونلاين
When Website/Prescription web intake is implemented and entitled:
- طلبات الروشتات
- online orders if shared website order flow exists.

Do not mix this with Delivery route naming.

### 6. تشغيل التوصيل
When commerce.delivery enabled:
- طلبات الدليفري

### 7. المخزون والمشتريات
- المخزون
- الجرد
- التحويلات
- الموردين
- المشتريات والاستلام

Conditional:
- internal supply/multi-warehouse

### 8. الموظفون
Shared HR group.

### 9. المالية
- الخزنة
- المصروفات
- الورديات

Insurance financial views may link to Claims but should not duplicate page owner.

### 10. التقارير
- reports hub

### 11. إدارة الموقع
When Website enabled.

### 12. الإدارة والإعدادات
- الأصناف الأساسية
- إدارة الدليفري when enabled
- المستخدمون والصلاحيات
- الإعدادات

## 6. Product Map implementation rule

Do not build a separate Pharmacy navigation engine.

Use:
- Unified Navigation Registry
- Product Map grouping layer
- profile-aware route adapters

Required registry corrections:
- Pharmacy routes get explicit pagePermission.
- Pharmacy routes get feature metadata.
- shared Delivery routes reflect Pharmacy/Retail/Restaurant eligibility instead of Restaurant-only metadata.

## 7. Page permission enforcement

Current Pharmacy UI addNav() must not unconditionally inject pages.

Future injection/visibility contract:

if not Profile Pharmacy:
do nothing.

if feature denied:
do not expose page.

if page permission denied:
do not expose page.

Direct route activation also re-checks permission.

Do not rely only on hiding the nav button.

## 8. Home cards

Current Pharmacy UI injects one Home card per Pharmacy page.

Future:
Home card uses same route visibility evaluator as sidebar.

A user denied Insurance must not still see/open Insurance from Home.

Feature-denied page must not appear in Home.

## 9. Role templates

Current rolePages are useful defaults:
- admin
- cashier
- pharmacist
- callcenter
- delivery

But final effective route access uses:
- page permission
- feature entitlement
- trusted Profile.

Role template alone is not runtime authorization.

## 10. Catalog capability overstatement

Cloud currently says multiple Pharmacy add-ons:
implemented=true.

This means code capability exists, not that product closure is proven.

Current Audit found:
- alternatives partial;
- prescriptions backend enforcement incomplete;
- insurance claim lines incomplete;
- controlled-drug operational enforcement absent.

Therefore final Admin should distinguish:
- Implemented
- Entitled
- Runtime Allowed
- Product Closure/Readiness

Do not let implemented=true imply production-safe.

## 11. Controlled-drug visibility

When pharmacy.controlled_drugs is not allowed:
- controlled-specific controls should not be operationally enabled;
- product master may preserve existing metadata for migration/read purposes;
- dispensing remains blocked according to feature/policy if product is controlled.

Do not silently treat controlled drug as ordinary medicine when feature is off.

Safer:
fail visibly and require appropriate capability.

## 12. Insurance / claims separation

pharmacy.insurance:
- company/plan
- POS insurance selection
- plan economics

pharmacy.claims:
- claim lifecycle
- line reconciliation
- insurer receivable reporting

Claims depends on Insurance.

If Insurance allowed but Claims denied:
define whether insurance sale is allowed without claim workflow.

Recommended:
for current architecture, insured POS sale requires Claims capability because sale creates claim state.

Therefore runtime dependency may need tightening beyond current catalog if the product contract keeps automatic claims.

## 13. Prescription dependency

Controlled Drugs depends on Prescriptions in Cloud.

This is appropriate for the current intended compliance model.

Backend sale owner must enforce it operationally before feature closure.

## 14. Batch / Expiry

inventory.batch and inventory.expiry are required Pharmacy capabilities.

Their pages are part of Pharmacy baseline.

They still require:
- page permission
- Action permission for mutations
- Location scope.

Feature required does not mean every employee can receive/adjust batches.

## 15. Website capability

commerce.website being enabled does not automatically mean public Pharmacy prescription upload is closed.

Website route exposure needs an implemented public Pharmacy contract.

Until public request creation is closed:
- do not advertise Pharmacy Web Rx as complete;
- staff prescription page can exist independently.

## 16. Navigation acceptance

On future Pharmacy Beta verify:

- all visible groups have at least one route;
- no denied Feature page visible;
- no denied page-permission route visible;
- direct click/open denied path fails;
- Home/sidebar parity;
- no Restaurant Kitchen/Tables/Food routes;
- no Retail Market Settings/Offers;
- Delivery shown only when enabled;
- Website shown only when enabled;
- Insurance/Claims independently gated;
- Touch navigation usable.

## 17. Current state

Pharmacy Product Map design:
CLOSED.

Feature/page permission binding:
DESIGN CLOSED.

Current runtime enforcement:
OPEN.

Unified Registry Pharmacy permission metadata:
OPEN.

No Runtime/Cloud/DB mutation.
