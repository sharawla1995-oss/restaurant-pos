# Sharawla — Pre-RC Product & Security Gates

> Recorded: 2026-09-16
> This file is a companion checkpoint to `SHARAWLA_MASTER_STATUS.md` and does not create Roadmap Point 18.

## A — Security / Source Protection Gate

STATUS: APPROVED DIRECTION / REQUIRED BEFORE RC1.

Purpose: reduce the damage possible if a third party obtains a copy of the POS source code or distributed client.

Required review before RC1:
- Keep source repositories private and restrict write/admin access.
- Review GitHub account/app/token access and require strong account protection such as 2FA where supported.
- Scan the current tree AND Git history for leaked secrets; deleting a secret only from the latest file is not sufficient.
- Private signing keys, Supabase service-role credentials, privileged backend secrets and equivalent sensitive material must remain server-side and must never be shipped inside POS/client code.
- Treat distributed POS/client code as potentially inspectable/reverse-engineerable; security must not depend on hiding client-side code.
- Sensitive authorization, licensing, entitlement and trust decisions must be backend-enforced where appropriate rather than relying only on client UI/JavaScript checks.
- Review build/release integrity, update authenticity and Code Signing before production promotion.
- Audit access and sensitive support actions.
- Run a specific threat review: "If an attacker obtains the complete POS repository/source, exactly what can they do, and which Cloud/server controls still prevent them from impersonating Sharawla, issuing trusted licenses/snapshots, accessing customer data, or controlling production?"

Closure rule:
- RC1 must not be declared ready until this gate has documented evidence/Acceptance.
- Do not weaken Canonical Fingerprint, signed Runtime Snapshot, anti-rollback, licensing, business isolation or Production boundaries to satisfy this gate.

## B — Sharawla Support Center — Intelligent Diagnosis & Remote Resolution

STATUS: APPROVED PRODUCT/ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: provide a Sharawla-branded support experience inside the product where a customer can report a problem, receive safe diagnosis and resolution, and where Sharawla retains full commercial control over whether that support is free or paid.

### Customer Experience

- Customer enters a `Sharawla Support Center` / technical-support experience rather than a generic chatbot product.
- The service may use automation/AI internally, but it must not falsely impersonate a named human employee or claim a human performed an action when that is not true.
- If a real support employee takes over, the system may show the real support identity according to the final UX policy.
- The customer reports the problem in normal language.
- The system gathers only approved diagnostic context relevant to that Business/device/user and attempts to identify the exact failure point.
- It should provide a clear status such as diagnosing, issue identified, resolution available, action completed, unresolved/escalated.
- If automation cannot safely solve the issue, create/escalate a support case with the approved diagnostics so human support does not start from zero.

### Diagnostic Scope Direction

Potential approved diagnostic domains include, subject to permissions and later implementation gates:
- POS/version/runtime health
- Internet/Cloud connectivity
- Business Connection
- License/device status
- Offline/Sync/Outbox health
- Backup/update health
- Printing/printer health
- Shift/order operational blockers
- Website/order integration health
- Capability/entitlement availability

The exact diagnostic/action catalog must be explicitly defined before implementation. The support engine must not receive unrestricted database/device access.

### Safe Action Model

Target flow:
`Customer problem → scoped diagnostics → identified resolution → commercial policy → user approval where required → allow-listed action → verification → audit/result`

- Support actions must go through a controlled Sharawla Support Gateway/action layer rather than unrestricted AI-generated database/system commands.
- Every executable action must be allow-listed, permission-checked, Business-scoped and auditable.
- High-risk actions such as Reset/Rebind, Canonical Fingerprint replacement, privileged database mutation, signing-key access or equivalent security-sensitive operations are not autonomous support actions.
- Business isolation is mandatory; one Business must never expose another Business's diagnostics or data.
- User role/permissions must constrain what support information/actions are available.
- Private keys, passwords, service-role secrets and equivalent credentials must not be exposed to the AI/support conversation.

### Commercial / Payment Policy

The payment model is intentionally NOT fixed in code at this stage.

Sharawla Admin/Cloud should ultimately be able to configure support commercially, for example:
- Free support.
- Paid support per incident/resolution.
- Payment before resolution.
- Payment after a verified successful resolution where the payment method/process safely supports it.
- Included support in a Package/plan.
- Customer-specific exemption/discount/promotion.
- Different pricing by support service/problem class.
- Human escalation as free or paid according to policy.

Commercial policy must be configurable and separated from the diagnostic engine so Sharawla can change pricing/business rules without rebuilding the support architecture.

Where a charge depends on successful resolution, the final implementation must define objective success/verification and refund/no-charge behavior. Product defects attributable to Sharawla should have an explicit policy rather than automatically charging customers for every reported failure.

### Architecture Placement

This direction does NOT create Roadmap Point 18.
- Commercial/payment/package integration belongs with Point 3 commercial Package / Entitlement work where appropriate.
- Support permissions/actions must align with Point 13 Permissions Final Closure.
- Offline/Sync support actions must respect Point 15 Offline / Sync Final Closure.
- Security of Support Gateway/actions/secrets is part of the required pre-RC Security / Source Protection Gate.
- A minimum safe support architecture/decision set must be reviewed before RC1; full advanced automation may be delivered incrementally if it is not required for V1 acceptance.

### Core Rule

Sharawla sells/supports the outcome and service experience; AI/automation is an internal implementation tool. Commercial configuration stays under Sharawla's control, while customer-facing representations must not falsely claim that an automated response/action came from a specific human employee.

## C — Sharawla Smart Catalog Import & Migration Engine

STATUS: APPROVED PRODUCT DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: make onboarding a new Business much faster by reducing manual entry of menus, products and catalogs into Sharawla.

Target input direction may include:
- Menu/product images and screenshots.
- PDF menus/catalogs.
- Excel/CSV product sheets.
- Exports from a customer's previous POS/system.
- Profile-specific structured imports where appropriate.

Target behavior:
`Customer source → extraction/mapping → Sharawla profile/catalog structure → validation → preview → customer/operator review → explicit approval → import`

Core safety rule:
- Imported/extracted data must NOT be written directly into the live catalog merely because automated extraction succeeded.
- Show a Preview/Validation stage first, including detected categories, products, prices, variants/sizes, add-ons and other supported fields.
- Flag uncertain/invalid/conflicting rows for review.
- Require explicit approval before final import.
- Import must be Business-scoped and auditable, with protection against duplicate or partial destructive imports.

Profile direction:
- Restaurant: categories, menu items, prices, sizes/variants and add-ons where supported.
- Retail/Supermarket: products, barcode/SKU, cost, sale price, stock and related supported catalog fields.
- Clothing: products plus supported size/color/variant structure.
- Other profiles should receive their own validated mapping rules rather than forcing one generic restaurant import format.

Migration direction:
- Sharawla should support controlled migration from previous POS systems when an export or readable data source is available.
- Do not build permanent one-off customer forks for migration; use reusable adapters/mappings where practical.
- Migration/import must respect the target profile, capability readiness, permissions and Business isolation.

Commercial direction:
- Pricing is intentionally undecided.
- Sharawla may later choose to make simple imports free, charge for advanced migration, include migration in a Package, or price it per customer/data complexity.
- Commercial policy must not be hard-coded into the import engine.

Roadmap placement:
- This does NOT create Roadmap Point 18.
- Final implementation should be placed in the appropriate onboarding/catalog/profile work and commercial package/add-on model when scheduled.
- Recording this direction must not interrupt the current Point 3B Offline Authentication work or modify Production.

## D — Sharawla Proactive Health Monitoring

STATUS: APPROVED PRODUCT/ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: allow Sharawla to detect operational problems and warning signs before the customer reports them, while preserving Business isolation, privacy, permissions and safe-action boundaries.

Target monitoring direction may include:
- Offline/Sync/Outbox backlog or repeated sync failures.
- Backup failures or stale backups.
- Cloud/Business Connection health.
- Repeated printer/printing failures where reliable telemetry is available.
- Failed or unhealthy updates.
- Device/runtime health signals.
- Website/order integration health.
- License/service expiry warnings where applicable.
- Other explicitly approved health signals added through controlled monitoring contracts.

Target flow:
`Health signal → scoped detection → severity/status → diagnosis → Support Center → safe resolution or support case → verification/audit`

Sharawla Admin direction:
- Provide an operational health view across customers/businesses/devices according to admin permissions.
- Show healthy, warning, critical and unresolved states using objective system-health rules.
- Allow support staff to identify affected Business/device/version and the safe diagnostic evidence without exposing unrelated customer data.
- Track whether an issue was automatically resolved, requires customer action, or needs human escalation.

Integration with Sharawla Support Center:
- Proactive Health Monitoring detects and raises the problem.
- Support Center performs the approved diagnosis/resolution workflow.
- Detection does NOT automatically grant permission to execute a sensitive action.
- Any corrective action must still pass the Support Gateway, permissions, Business scope, allow-list, confirmation requirements and Audit rules.

Privacy / Security rules:
- Monitor system/operational health only through explicitly defined telemetry contracts; do not treat monitoring as unrestricted access to customer business data.
- Tenant isolation is mandatory.
- Do not transmit private keys, passwords, service-role secrets or equivalent credentials through monitoring/support telemetry.
- High-risk actions such as Reset/Rebind, Canonical Fingerprint replacement or privileged database mutation must never be triggered merely because a health alert fired.
- Monitoring must be rate-limited and designed so telemetry failure cannot break POS selling/offline operation.

Commercial direction:
- Pricing is intentionally undecided and must remain configurable.
- Sharawla may later provide basic health monitoring free, include advanced proactive support in a Package, sell it as an Add-on, or apply customer-specific commercial policies.
- Commercial policy must remain separate from the core detection/health architecture.

Roadmap placement:
- This does NOT create Roadmap Point 18.
- Commercial/package mapping belongs with the Point 3 entitlement/package model where appropriate.
- Permissions and monitoring access must align with Point 13.
- Offline/Sync health behavior must align with Point 15.
- Security/privacy/action boundaries must be reviewed as part of the pre-RC security/support gates.
- Recording this direction must not interrupt Point 3B or modify Production.