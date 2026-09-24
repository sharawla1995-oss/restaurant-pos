# Sharawla Pharmacy Beta Environment Provisioning Plan

Status: DESIGN / NO PROVISIONING EXECUTED
Cloud mutation: NONE
Operational DB mutation: NONE
Runtime change: NONE

## 1. Target topology

Create a dedicated isolated Pharmacy Beta environment after the current Restaurant gate and platform environment pattern are accepted.

Cloud:
- dedicated Beta/Test customer
- Pharmacy Beta Business
- Activity Category: pharmacies / الصيدليات
- POS Profile: pharmacy
- dedicated Business Branch
- dedicated License
- dedicated Device

Operational:
- dedicated Supabase backend
- trusted operational Profile binding=pharmacy
- dedicated Auth users/employees
- dedicated Pharmacy fixtures

Do not reuse:
- SH-0007 Restaurant Business
- SH-0007 backend
- future Retail Beta backend
- Top Burger Production.

## 2. Cloud Business

Business name:
clear Pharmacy Beta/QA name.

Required:
- active=true
- pos_profile=pharmacy
- activity_category=pharmacies
- no Production customer/business data.

Cloud currently has zero Pharmacy Businesses.

## 3. Branch identity

Recommended first Cloud branch:

Name:
TEST Pharmacy

Code:
PHARMACY-TEST-01

Operational branch:
- name = TEST Pharmacy
- location_type = branch
- location_code = PHARMACY-TEST-01

Cloud and operational mapping:
business_branches.code <-> branches.location_code

Do not map by display name.

## 4. License

Dedicated Pharmacy Beta license:
- max_devices=1 initially
- offline_grace_days=7 unless Pharmacy policy changes
- primary device classification
- active=true

Do not reuse Retail/Restaurant license.

## 5. Device

Dedicated Pharmacy test PC/VM.

Requirements:
- Cloud-generated Support Code
- canonical fingerprint through normal activation
- Profile=pharmacy via trusted Business
- branch=TEST Pharmacy
- Beta runtime environment

Do not pre-assign a Support Code in design docs.

No automatic Rebind.

## 6. Operational backend

Dedicated Pharmacy Beta Supabase project.

Schema source:
accepted operational Beta schema baseline after prerequisite platform gates.

Do not copy live customer/order data.

Required schema validation:
- pharmacy_* tables
- Pharmacy RPC owners
- Retail/shared product stock owners used by Pharmacy sale
- returns/payments
- permissions
- offline infrastructure
- shared inventory/purchasing
- RLS/policies/triggers
- backup/restore contracts.

## 7. Trusted Profile binding

Provision private operational identity:

cloud_business_id = Pharmacy Beta Business UUID
profile_code = pharmacy

Write authority:
Sharawla Cloud/Admin provisioning only.

The POS cannot set profile_code.

Acceptance:
- Pharmacy assertion passes
- Retail/Restaurant/etc. assertions deny.

## 8. Auth / employees

Minimum users:

Pharmacy Admin
- broad test authority.

Pharmacist
- prescription/dispense test.

Cashier
- ordinary sale only.

Stock Clerk
- batch/inventory receiving.

Claims Clerk
- insurance workflow.

Optional:
Delivery/Call Center.

These are acceptance fixtures, not hard-coded production roles.

## 9. Core medicine fixtures

Seed at least:

### Medicine A — ordinary
- batch tracked
- no prescription
- not controlled
- valid stock.

### Medicine B — prescription required
- batch tracked
- prescription_required=true.

### Medicine C — controlled
- controlled_drug=true
- prescription rule according to accepted policy.

### Medicine D — alternative
- linked as substitute for B or another test product.

### Medicine E — non-batch if supported
- track_batch=false
to test mixed catalog behavior.

## 10. Batch fixtures

For ordinary/prescription medicine:

Batch A:
- valid, earliest expiry
- positive quantity

Batch B:
- valid, later expiry
- positive quantity

Batch C:
- expired
- positive test quantity only in isolated fixture

Use for:
- FEFO
- expiry block
- partial allocation
- return restore
- waste.

## 11. Prescription fixture

Create:
- customer/patient
- doctor
- prescription
- prescription items
- requested quantities.

Need scenarios:
- full dispense
- partial dispense
- substitute
- over-dispense deny.

Do not rely only on manually created header with no line tracking.

## 12. Insurance fixtures

Company:
Acceptance Insurance

Plans:
1. simple copay
2. max-coverage
3. prior-approval required

Scenarios:
- normal approved split
- missing approval deny
- coverage limit
- claim lifecycle
- return/claim correction.

## 13. Controlled-drug fixture

Only after operational policy implementation exists.

Seed:
- controlled product
- required patient/prescriber details
- dedicated user Action permissions.

Do not test controlled dispensing against an undefined regulatory contract.

## 14. Website prescription fixture

Only after public request owner exists.

Need:
- secure upload/storage bucket/path
- test image/document
- customer phone
- pickup request
- delivery request
- status lifecycle.

Do not enable anonymous direct table writes as shortcut.

## 15. Second branch

For:
- batch transfer
- shared inventory transfer
- branch/location permission tests

Recommended:
PHARMACY-TEST-02

No device required initially.

Must have:
- Cloud branch code
- operational location_code.

## 16. Feature waves

Start baseline:

Required:
- commerce.pos
- commerce.orders
- commerce.products
- inventory.stock
- inventory.batch
- inventory.expiry
- core required services.

Wave 1:
- pharmacy.prescriptions
- pharmacy.alternatives

Wave 2:
- pharmacy.insurance
- pharmacy.claims

Wave 3:
- pharmacy.controlled_drugs only after compliance owner is ready

Wave 4:
- commerce.website + Pharmacy web prescription path

Shared optional:
- delivery
- pickup
- purchasing
- transfers
- stock count

Do not turn every Pharmacy feature on just because Cloud currently maps it enabled.
Acceptance readiness still matters.

## 17. Commercial/readiness distinction

For each optional capability display:

Eligible
Entitled
Runtime Allowed
Product Closure Status

A Cloud feature being implemented=true is not evidence that the workflow has passed Pharmacy Closure.

Examples currently needing closure:
- pharmacy.controlled_drugs
- pharmacy.claims
- pharmacy.alternatives

## 18. Initial acceptance order

PH0 Environment Lock
PH1 Drug master
PH2 Batch receive/expiry/FEFO
PH3 Sale
PH4 Prescription
PH5 Pharmacy return + batch restore
PH6 Alternatives
PH7 Insurance/claims
PH8 Controlled drugs
PH9 Shared inventory/purchasing
PH10 Website
PH11 Permissions/Cross-profile
PH12 Reports
PH13 Offline policy
PH14 Touch/Printing/Backup/Update
PH15 Closure

Reference:
docs/PHARMACY-ACCEPTANCE-V2-DESIGN.md

## 19. Environment lock

Before write tests confirm:
- Support Code belongs to Pharmacy Beta device
- business Profile=pharmacy
- activity=pharmacies
- Business Connection host = Pharmacy Beta backend
- trusted operational binding=pharmacy
- Beta environment
- no Production data
- no unsafe pending update.

Mismatch:
STOP.

## 20. Cleanup

All write fixtures tagged by run ID.

Cleanup must reconcile:
- shared product stock
- Pharmacy batch stock
- batch movements
- allocations
- prescriptions/items
- insurance claims/items
- substitutes
- acceptance customers
- website requests

Final:
residue=0.

## 21. Backup

Before major acceptance:
- schema/config checkpoint
- initial fixture baseline
- app backup test

After accepted Pharmacy milestones:
- known-good backup snapshot.

## 22. Current state

Activity category:
pharmacies — active.

Profile:
pharmacy — implemented/active.

Current Pharmacy Cloud Business count:
0.

Provisioning plan:
DESIGN CLOSED.

Actual Pharmacy Business:
NOT CREATED.

Actual Pharmacy Device:
NOT CREATED.

Actual Pharmacy backend:
NOT CREATED.

No Cloud/DB/runtime mutation.


## 23. Confirmed Cloud reference IDs

Read-only Sharawla Cloud confirmation:

Pharmacy POS Profile:
- code: pharmacy
- id: fa4320e5-0aa5-4df2-8fd8-5f2ea400f453
- implemented=true
- active=true

Pharmacy Activity Category:
- code: pharmacies
- name_ar: الصيدليات
- id: bc12f7a0-1247-442c-b2cd-3f105c27c7de
- active=true

Current Pharmacy Business count in Sharawla Cloud:
- 0

These IDs are reference evidence only.
Actual Pharmacy Beta Business/Branch/License/Device IDs do not exist yet and must be generated by the accepted Admin provisioning flow.
