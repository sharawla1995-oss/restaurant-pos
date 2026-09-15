# Sharawla — Profile-Specific Primary Workflows

Status: APPROVED ARCHITECTURE DIRECTION / DEFERRED IMPLEMENTATION
Recorded: 2026-09-15

This document records an approved product/architecture direction. It does not interrupt the current Point 3B work and does not create a new numbered roadmap point.

## Canonical Principle

Sharawla remains one platform / one POS architecture, but a Business Profile is not merely a different menu or a set of hidden/visible pages.

Some profiles have a fundamentally different primary business workflow. The profile must shape navigation, dashboard, primary entities, operational states, actions, reports and customer-facing flows around that workflow while still reusing Sharawla Core services.

Canonical model:

`Sharawla Core → Business Profile → Primary Business Workflow → Profile Capabilities → Business Entitlements → Permissions → Runtime`

Shared Core can include identity/licensing, branches, users, permissions, payments, expenses, reports, offline/sync, audit and updates. Profile-specific workflows must not be forced into a Retail/Restaurant sales model when the business domain is fundamentally different.

## Logistics / Shipping Profile

Logistics is a distinct operational workflow. Its primary entity is the Shipment, not a retail sale/order.

Target primary flow:

`Business Client → Pickup Request → Shipment Creation → Waybill → Zone/Pricing → Pickup/Hub Handling → Driver Assignment → Out for Delivery → Tracking Events → Delivered / Failed / Rescheduled / Returned → COD → Driver Settlement → Client Settlement`

The Logistics profile should be designed around concepts such as:
- Shipment / tracking number.
- Sender and receiver.
- Pickup and delivery addresses.
- Weight, pieces and shipment attributes.
- Zones and pricing.
- Pickup driver / delivery driver assignment where applicable.
- Waybill / shipment barcode and printing.
- Delivery attempts and failure reasons.
- Reschedule / return-to-sender workflows.
- COD collection.
- Driver settlements.
- Client/company settlements.
- Shipment status history and audit.

### Tracking is a Core Logistics Experience

Tracking is not a cosmetic add-on to Logistics. It is a primary customer-facing workflow.

Conceptual tracking progression may include states such as:
`Shipment Created → Picked Up → At Hub/Warehouse → Out for Delivery → Delivered`
with appropriate failed/rescheduled/returned branches.

A Tracking Portal should be treated as a first-class Logistics experience during Beta58 design. It may reuse the shared Sharawla Website Engine infrastructure technically, but it must remain profile-aware and commercially/capability-mapped as a Logistics workflow rather than being forced into a Retail/Restaurant storefront model.

Notifications such as SMS/WhatsApp/API events may be designed later through controlled integrations/capabilities; they are not declared implemented by this document.

Current canonical Logistics capabilities already represented in the capability architecture include shipment/tracking/waybill/driver/COD/zones-pricing/client-settlement related features. Their existence in the catalog does not mean the full Logistics product workflow is closed or production-ready.

Official implementation/acceptance remains Roadmap Point 8 — Beta58 Logistics.

## Membership / Gym Profile

Membership/Gym is also a distinct primary workflow. Its primary entity is the Member/Subscription relationship, not a retail sale or shipment.

Target primary flow:

`Member → Membership Plan → Subscription → Payment → Check-in / Usage → Renewal / Freeze / Expiry`

Profile-specific concepts can include:
- Members.
- Plans.
- Subscriptions.
- Renewals.
- Freeze/unfreeze rules.
- Check-in and visit history.
- Classes.
- Trainers.
- Bookings.
- Expiry and membership status.

The Gym dashboard/navigation should therefore center on members, active/expiring subscriptions, check-ins, renewals, classes/bookings and related operational reports rather than exposing irrelevant Retail/Restaurant navigation as the main experience.

Current Membership capabilities in the capability architecture do not mean the complete Gym product is closed or production-ready.

Official implementation/acceptance remains Roadmap Point 9 — Beta59 Membership / Gym.

## Profile-Driven Navigation and Dashboard

Profile selection must affect more than feature visibility. It should determine the user's primary operational experience.

Examples:
- Restaurant centers on orders, kitchen, delivery/pickup and restaurant operations.
- Retail centers on products, checkout, variants/barcodes and stock-aware commerce.
- Logistics centers on shipments, pickup/delivery operations, tracking, drivers and settlements.
- Membership/Gym centers on members, subscriptions, check-ins, renewals and bookings.
- Warehouse profile centers on warehouse/distribution operations when its roadmap stage is reached.
- Service profile centers on jobs/appointments/assets/service workflows when its roadmap stage is reached.

Irrelevant workflows should not clutter the normal navigation for a profile unless explicitly enabled as a valid cross-profile capability.

## Architecture Rules

- One Sharawla platform; do not create separate permanent applications per industry.
- Do not model every industry as Retail with renamed menu items.
- Reuse Sharawla Core where the behavior is genuinely shared.
- Keep profile-specific primary entities/workflows explicit.
- Capabilities and commercial entitlements determine optional functionality within the profile.
- Permissions still determine what an individual user can do after the Business is entitled to a capability.
- Backend enforcement remains required for sensitive operations; hiding UI is not authorization.
- Offline/sync semantics must be designed for each profile's transactional workflows where applicable.
- Every profile-specific workflow requires its own runtime Acceptance before production readiness.
- Existing Production SH-0005/SH-0006 and Top Burger remain read-only and must not be modified by this design work.

## Website / Portal Relationship

The approved Multi-Tenant Website Engine may provide shared infrastructure for customer-facing profile experiences, but the business workflow remains profile-specific.

Examples:
- Restaurant: ordering/tracking storefront experience.
- Retail: catalog/cart/commerce.
- Logistics: shipment tracking portal and later permitted client shipment services.
- Membership: plans/bookings/member-facing experiences where enabled.

A shared engine must not flatten these into one generic storefront workflow.

## Roadmap Placement

This direction does not add an 18th roadmap point.

- Logistics workflow implementation and Acceptance: Point 8 — Beta58.
- Membership/Gym workflow implementation and Acceptance: Point 9 — Beta59.
- Shared cross-profile validation remains Point 12 — Beta62.
- Commercial entitlement mapping remains under Point 3.

Do not mark Logistics or Membership/Gym complete merely because capabilities or schema foundations exist. Closure requires the relevant full workflow implementation and Acceptance.