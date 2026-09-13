# Sharawla Functional Blueprint V1

Status: DESIGN LOCK CANDIDATE
Baseline: 10.5.4-beta.53
Implementation branch: beta54-functional-core
Sandbox target only: SH-0007 / business 91826502-590e-4afa-8826-2c0f4b99c490
Production SH-0005 / SH-0006 / Top Burger: READ-ONLY and OUT OF SCOPE

## 1. Product rule

Sharawla POS is one multi-industry platform. Profiles control industry behavior; Features control optional capabilities; permissions control who can see and use each capability.

Every new function MUST follow this chain:

Feature Enable -> Page Permission -> Action Permission -> Branch/Data Scope -> Audit Log

Hiding a button is never sufficient authorization. Sensitive write operations must also be rejected by the backend when the employee does not have permission.

## 2. Shared Business Core

These capabilities are shared across profiles when enabled.

### Customers
- Customer list/search
- + New Customer
- Edit customer
- Multiple addresses
- Active/inactive status
- Duplicate detection/merge workflow
- Customer transaction/history view
- Sales/returns/service/shipment history depending on profile
- Receivable balance when credit sales are enabled
- Collections and statement

### Employees
Employees are business people records and are separate from Login Users.
- Employee directory
- + New Employee
- Job title / department / branch
- Hire date / status
- Salary basis and base salary
- Employee advances
- Advance installment schedule
- Deductions
- Bonuses / overtime
- Payroll periods
- Payroll settlement / payslip
- Employee statement
- Optional attendance/check-in module

### Users & Permissions
Users are authentication identities linked optionally to employees.
- Create/edit/disable user
- Role templates
- Branch access
- Page permissions
- Action permissions
- Data scope: all branches / selected branches / assigned records only where relevant
- Advanced allow/deny override
- Last sign-in / last seen
- Audit history

### Treasury / Cash
- Cash In
- Cash Out
- Drawer deposit / withdrawal
- Shift cash movement
- Employee advance cash-out link
- Supplier payment cash-out link
- Merchant/COD settlement link
- Reason, employee, shift and branch required
- No business transaction is silently converted into a generic expense

### Accounts
- Customer Receivables
- Customer Collections
- Supplier Payables
- Supplier Payments
- Employee Advances
- Merchant/COD settlement for Logistics
- Due dates / aging where enabled
- Account statement per party

### Notifications
- Capability-aware and permission-aware notifications
- Low stock
- Near expiry
- Purchase approval waiting
- Membership expiry
- Shipment exception / failed delivery
- Unsettled COD
- Payroll/advance approval if enabled

### Attachments
Reusable attachment service for:
- Supplier invoices
- Expense receipts
- Employee documents
- Service job photos
- Logistics POD
- Other module evidence

### Audit
Record actor, action, target, branch, timestamp and relevant before/after metadata for sensitive operations including:
- Price/cost changes
- User/permission changes
- Returns/voids
- Purchase approvals
- Supplier payments
- Employee advances/payroll
- Shipment delivery override
- COD settlement

## 3. Permission model

### Layers
1. Feature: capability available to the business.
2. Page: employee can open the screen.
3. Action: employee can perform an operation.
4. Scope: which records/branches the employee can access.
5. Audit: sensitive action is logged.

### Required action examples
Customers:
- customer.view
- customer.create
- customer.edit
- customer.address.manage
- customer.statement.view
- customer.collection.create

Employees:
- employee.view
- employee.create
- employee.edit
- employee.salary.view
- employee.advance.create
- employee.advance.approve
- employee.deduction.manage
- employee.bonus.manage
- payroll.view
- payroll.run
- payroll.approve
- payroll.pay

Purchasing:
- purchase.request.create
- purchase.request.approve
- purchase.po.create
- purchase.po.approve
- purchase.grn.receive
- purchase.invoice.create
- purchase.invoice.approve
- purchase.return.create
- supplier.statement.view
- supplier.payment.create

Logistics:
- shipment.view
- shipment.create
- shipment.edit
- shipment.assign
- shipment.scan
- shipment.status.update
- shipment.delivery.verify_otp
- shipment.delivery.override
- shipment.rto
- cod.view
- cod.driver_settle
- cod.merchant_settle

The Admin user can configure visibility/action access per employee. Role defaults are convenience templates only.

## 4. Restaurant / Cafe profile

Existing core areas remain: POS, Orders, Returns, Customers, Delivery, Kitchen, Shifts, Inventory, Expenses, Products, Promotions, Website, Reports, Users, Settings.

V1 completion adds when enabled:
- Suppliers
- Raw-material purchasing
- Purchase Request / PO / Approval / GRN
- Supplier returns
- Ingredient stock count
- Branch ingredient transfers
- Waste/spoilage
- Ingredients master
- Recipes
- Recipe yield
- Automatic ingredient consumption
- Food Cost / theoretical vs actual cost
- Production/preparation batches where needed
- Tables / dine-in table management as an optional Restaurant capability
- Supplier account and payments through Shared Accounts

Key acceptance flow:
Purchase ingredient -> receive -> stock increases -> sell recipe -> ingredients deduct -> return/waste/adjust -> food-cost reconciliation -> zero duplicate movements.

## 5. Retail / Supermarket profile

Existing core areas remain: POS, Orders, Customers, Delivery, Shifts, Inventory, Suppliers, Purchasing, Weighted Barcode, Offers, Promotions, Stock Count, Transfers, Website, Returns, Expenses, Products, Reports, Users, Settings.

V1 completion adds:
- Direct customer creation from Customers screen
- Supplier full management/edit/status
- Supplier statement/payment/due dates
- Customer credit sales / receivables / collections
- Stock movement ledger
- Damage/waste adjustment
- Min/Max and positive replenishment workflow
- Inventory valuation
- Barcode/label printing
- Bulk product import/export
- Retail POS Delivery/Pickup when those capabilities are enabled
- Proper product/variant live stock units

## 6. Clothing pack over Retail

No separate application. Clothing is a Retail capability pack.

Adds:
- Size axis
- Color axis
- Matrix variants
- Independent SKU/barcode per variant
- Independent inventory per variant
- Optional brand / season / gender / collection
- Product/variant images
- Barcode/price label printing
- Exchange workflow in addition to return

## 7. Pharmacy profile

Existing areas remain: Pharmacy POS, Customers, Drug Catalog, Batches, Expiry, Prescriptions, Insurance, Claims, Delivery, Shifts, Inventory, Stock Count, Transfers, Suppliers, Purchasing, Promotions, Website, Returns, Expenses, Products, Reports, Users, Settings.

V1 completion adds:
- FEFO enforcement at sale
- Batch-aware return to supplier
- Expired/quarantine/waste workflow
- Near-expiry dashboard and alerts
- Reorder by product/batch policy
- Controlled-drug movement log
- Substitute suggestion inside sale flow
- Prescription linked to sale
- Insurance claim settlement/reconciliation
- Full batch traceability from receipt to sale/return

## 8. Logistics / Shipping profile

Current skeleton must be expanded to an operational shipping system.

### Parties
- Merchant / shipper account
- Recipient is not the same entity as merchant
- Merchant price plan and settlement terms

### Shipment
- + New Shipment
- Immutable Tracking Number
- Sender / recipient details
- Phones / address / zone
- Weight / pieces
- Content description
- COD amount
- Service level
- Notes
- Barcode/QR shipping label

### Tracking timeline
Every state transition records timestamp, actor, hub/branch, driver where relevant and note/reason.

Recommended states:
Created -> Pickup Requested -> Picked Up -> Hub Received -> In Transit -> Destination Hub -> Out for Delivery -> Delivery Verification -> Delivered

Exception path:
Delivery Failed -> Reason -> Reattempt Scheduled OR RTO -> Returned to Hub -> Returned to Merchant

### Delivery OTP
- OTP is generated when delivery verification is required
- Recipient receives OTP
- Driver only sees the input field, never the OTP value
- Successful verification is required before normal Delivered transition
- Expiry / resend / attempt limit
- Manager override is separate permission and always audited
- Optional POD name/photo/signature in addition to OTP

### Pickup / Hubs / Scan
- Pickup requests
- Driver assignment
- Scan In / Scan Out
- Hub transfer manifests
- Chain-of-custody timeline

### Drivers / Routes
- Drivers and vehicles
- Assigned shipments
- Route/manifest
- Load/dispatch batch
- Assigned-record-only scope for drivers

### COD and settlements
For each shipment track separately:
- Recipient COD collected
- Driver liability to company
- Shipping/COD/return fees
- Merchant payable
- Driver settlement
- Merchant settlement

COD is not ordinary sales revenue and settlement is not a generic expense.

### Pricing
- Origin/destination zone
- Base weight
- Extra weight
- Service level
- COD fee
- Return fee
- Merchant contract overrides

### Merchant portal / tracking website
- Create shipment
- Bulk Excel upload
- Print labels
- Track shipments
- View exceptions
- Merchant statement / settlements
- Public tracking by Tracking Number with safe recipient-visible data only
- API integration capability

## 9. Membership / Gym profile

Adds:
- Member profile
- Plans
- Membership start/end
- New subscription / renewal
- Freeze/unfreeze with rules
- Installments/payments
- QR/barcode member check-in
- Attendance history
- Classes
- Coaches
- Schedule
- Booking/capacity
- Expiry reminders
- Membership history
- Optional Retail POS module for products/supplements

## 10. Warehouse profile

Existing areas: Products, Inventory, Stock Count, Transfers, Suppliers, Purchasing, Customers, Sales Orders, Expenses, Reports, Users, Settings.

V1 completion adds:
- Warehouses / zones / bins
- Receiving
- Putaway
- Stock reservation
- Picking
- Packing
- Dispatch
- Delivery note
- Batch/Lot/Serial tracking where enabled
- Cycle count
- Replenishment
- B2B sales orders
- Customer credit/collections
- Supplier payables/payments
- Price lists
- Inventory valuation
- Stock movement ledger

## 11. Service / Maintenance profile

V1 completion adds:
- Service catalog
- Customer assets (car/device/machine/etc.)
- Appointment calendar
- Work/Job Order
- Technician assignment
- Job statuses
- Estimate/quotation
- Customer approval
- Deposit
- Parts/material consumption
- Labor/time entries
- Final invoice
- Warranty
- Attachments / before-after photos
- Service history per customer asset

## 12. UI organization rules

Every main management screen must expose its primary action clearly:
- Customers -> + New Customer
- Suppliers -> + New Supplier
- Employees -> + New Employee
- Advances -> + New Advance
- Purchasing -> + Purchase Request / + PO
- Logistics -> + New Shipment
- Membership -> + New Membership
- Service -> + New Job Order

Terminology must be stable across the product. Employees and Users remain separate concepts.

## 13. Release execution order

Beta54: Shared Business Core + permissions foundations
Beta55: Restaurant closure
Beta56: Retail / Supermarket / Clothing closure
Beta57: Pharmacy closure
Beta58: Logistics closure
Beta59: Membership closure
Beta60: Warehouse closure
Beta61: Service closure
Beta62: Cross-profile closure / full capability coverage
RC1: migration, 32/64-bit, offline/update/backup/permissions/full profile acceptance
Production: only after RC pilot and explicit rollout plan

## 14. Beta54 acceptance gates

Beta54 may be considered complete only when:
- Existing Beta53 accepted runtime remains regression-safe.
- Production devices/business are untouched.
- New Customer can be created from Customers page.
- Employees are distinct from Users.
- Employee advance/payroll data cannot be seen or changed without explicit permissions.
- Supplier payments and customer collections post through dedicated accounting records, not generic expenses.
- Treasury movement is linked when actual cash moves.
- New pages/actions obey Feature + Page + Action + Scope authorization.
- Backend rejects unauthorized sensitive writes.
- Sensitive writes create audit records.
- Sandbox cleanup leaves no acceptance residue.
- SH-0007 Full Acceptance remains READY_FOR_RC with no FAIL before Beta54 closure.
