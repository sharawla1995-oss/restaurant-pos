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

Core direction:
- Safe scoped diagnostics for POS/runtime, connectivity, Business Connection, license/device, Offline/Sync/Outbox, backup/update, printing, shifts/orders, website integration and entitlements.
- Executable support actions go only through a controlled Sharawla Support Gateway: allow-listed, permission-checked, Business-scoped and audited.
- No autonomous Reset/Rebind, Canonical Fingerprint replacement, privileged database mutation, signing-key access or unrestricted AI database/device access.
- Tenant isolation and secret protection are mandatory.
- Commercial support policy remains configurable: free, paid, package, per incident, before/after verified resolution, discounts/exemptions or human escalation.
- This does not create Roadmap Point 18.

## C — Sharawla Smart Catalog Import & Migration Engine

STATUS: APPROVED PRODUCT DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: reduce manual catalog/menu entry during onboarding.

Target flow:
`Customer source → extraction/mapping → Sharawla profile/catalog structure → validation → preview → review → explicit approval → import`

Inputs may include images/screenshots, PDF, Excel/CSV, previous POS exports and profile-specific structured sources.

Safety:
- Never write automated extraction directly to the live catalog without Preview/Validation and explicit approval.
- Flag uncertain/conflicting rows.
- Business-scoped, auditable and protected against duplicate/partial destructive imports.
- Profile-specific mappings for Restaurant, Retail/Supermarket, Clothing and future profiles.
- Commercial pricing remains configurable and separate from the import engine.
- This does not create Roadmap Point 18 or interrupt current Point 3B.

## D — Sharawla Proactive Health Monitoring

STATUS: APPROVED PRODUCT/ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: detect operational problems and warning signs before the customer reports them.

Target signals include Offline/Sync/Outbox failures, backup health, Cloud/Business Connection, printing telemetry where reliable, update health, device/runtime health, website/order integration and license/service warnings.

Target flow:
`Health signal → scoped detection → severity/status → diagnosis → Support Center → safe resolution or support case → verification/audit`

Rules:
- Monitoring does not grant permission for sensitive actions.
- Corrective actions still require Support Gateway, permissions, scope, allow-list and audit.
- Operational telemetry only through defined contracts; tenant isolation and secret protection mandatory.
- Telemetry failure must never break POS selling/offline operation.
- Commercial policy remains configurable.
- This does not create Roadmap Point 18.

## E — Sharawla Auto Onboarding

STATUS: APPROVED PRODUCT DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: let a new customer reach operational readiness with minimal manual Sharawla intervention.

Target flow:
`Register Business → choose activity/profile → create branches → Smart Catalog Import → add employees → configure printers/devices → readiness checks → start operation`

Direction:
- Sharawla Admin can show onboarding progress and the exact incomplete/blocking step.
- Smart Catalog Import should be part of onboarding where appropriate.
- If onboarding gets stuck, route the customer to Sharawla Support Center with safe scoped context.
- After activation, Proactive Health Monitoring can watch operational health.
- All setup remains Business-scoped, permission-controlled and auditable.
- This does not create Roadmap Point 18 and must not interrupt current Point 3B.

## F — Sharawla Business Coach / Business Insights

STATUS: APPROVED PRODUCT DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: turn permitted business data into useful operational insights and recommendations, distinct from technical support.

Examples may include:
- Sales trends versus prior periods.
- Strong/weak products and categories.
- Peak selling hours.
- Branch comparisons using supported sales/expense data.
- Slow-moving inventory where inventory capabilities exist.
- Customer retention/reactivation opportunities.

Core rule:
- The Coach may explain and recommend actions, but must not autonomously execute discounts, campaigns, purchases, price changes or other commercial decisions.
- Recommendations must be grounded in the customer's own permitted data and respect permissions/profile/capability availability.
- Standard reporting versus advanced smart insights may later be mapped to Core/Package/Add-on policy; pricing is intentionally undecided.
- This does not create Roadmap Point 18.

## G — Sharawla Customer Engagement & Campaigns

STATUS: APPROVED PRODUCT/ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION.

Purpose: allow a Business to turn customer insights into controlled, measurable customer re-engagement campaigns without depending on a single messaging provider or phone number.

Target flow:
`Customer data → consent/eligibility → segmentation → Business Coach insight or manual campaign → offer/promo → owner approval → approved channel → delivery/result tracking → attributed sales/ROI`

Target channels are modular/provider-based and may include:
- Website/PWA Push Notifications.
- SMS.
- Official WhatsApp/business messaging integrations where available and policy-compliant.
- Email.
- Future approved messaging providers through adapters/plugins.

Examples of segmentation may include inactive customers, frequent customers, product/category affinity, high-value customers and other Business-defined/permission-approved segments.

### Sender / Channel Continuity

- Sharawla may support multiple configured sender identities/providers/channels for a Business.
- Each sender/provider should have an explicit operational state such as Active, Limited, Disconnected or Unavailable according to provider signals available to Sharawla.
- A failed/unavailable channel must not stop the entire engagement engine; an owner-configured compliant alternative such as Push/SMS/email or another properly authorized sender may be used according to policy.
- The system must NOT be designed to rotate disposable phone numbers or automatically replace blocked WhatsApp numbers in order to evade provider enforcement or continue prohibited bulk messaging.
- Provider rules, customer consent/opt-out and sending limits must be respected.

### Safety / Control

- Sharawla must not send marketing campaigns autonomously merely because the Coach detected an opportunity; campaign/send approval remains under the Business's control unless a future explicitly approved automation policy defines otherwise.
- Maintain consent/opt-out/suppression controls where required.
- Keep tenant isolation and permissions.
- Campaign actions and important state changes should be auditable.
- Credentials/tokens for messaging providers must be protected and not exposed to client-side AI/chat surfaces.

### Measurement

Where provider/data contracts allow, Sharawla should measure useful campaign outcomes such as delivery/interaction signals, redeemed promo codes, resulting orders/revenue and campaign cost/ROI, while clearly distinguishing measured attribution from estimates.

### Commercial Direction

Pricing is intentionally undecided. Campaign capabilities, messaging consumption and advanced targeting may later be Core, Package, Add-on, usage-based or customer-specific. Commercial policy must remain separate from the engagement engine.

### Roadmap Placement

- This does NOT create Roadmap Point 18.
- Package/entitlement mapping belongs with Point 3 where appropriate.
- Permissions must align with Point 13.
- Reliable delivery/offline behavior must align with Point 15 where applicable.
- Provider integrations should use controlled adapters/plugins rather than coupling Sharawla to one provider.
- Recording this direction must not interrupt the current Point 3B or modify Production.
