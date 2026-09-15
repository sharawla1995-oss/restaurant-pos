# Sharawla Marketplace Integration Architecture

Status: APPROVED ARCHITECTURE DIRECTION / DEFERRED PROVIDER IMPLEMENTATION
Date: 2026-09-15

## Purpose

Sharawla must be able to integrate with external ordering/marketplace platforms without coupling the POS business logic to Talabat or any single provider.

Canonical direction:

`External Provider -> Provider Adapter -> Sharawla Integration Hub -> Normalized Order Contract -> Sharawla Orders -> Kitchen / Delivery / Reports / Accounting`

Examples of providers may include Talabat or any future marketplace/order application that exposes an approved API/webhook/partner integration. Provider availability is external and must never be assumed until the provider grants the required integration access/credentials.

## Current evidence

The Beta operational backend already provides useful foundations:
- `orders.source`
- `orders.client_tx_id`
- branch/customer/delivery/payment/status fields
- order items and modifiers
- website-order conversion flows
- retail website order `idempotency_key`

These are useful foundations but do NOT mean Marketplace Integration is currently implemented or production-ready.

## Required Integration Hub contract

The future provider-neutral integration layer should model at minimum:
- provider / integration identifier
- external order ID
- external store/branch ID
- Sharawla business + branch mapping
- external product/modifier <-> Sharawla product/modifier mapping
- idempotency / duplicate protection
- inbound webhook/event journal
- provider sync status and last error
- normalized payment/delivery/fee/discount fields
- provider order status <-> Sharawla status mapping
- controlled outbound acknowledgements/status updates where provider APIs permit them
- reconciliation/audit evidence

The canonical uniqueness/idempotency boundary should prevent repeated provider callbacks from creating duplicate Sharawla orders.

## Provider Adapter rule

Do not put Talabat-specific or other provider-specific logic throughout Restaurant/POS code.

Each provider must use an Adapter that translates the provider's API/webhook payloads and statuses into/from a stable Sharawla Normalized Order Contract.

Adding a new marketplace should normally mean adding/configuring an Adapter, not redesigning the POS order engine.

## Admin / onboarding direction

Future Admin flow should support a controlled process conceptually like:

`Integrations -> Add Provider -> Authenticate/Connect -> Map Business/Branches -> Map Menu/Catalog -> Test -> Activate`

Credentials/tokens must be stored server-side and scoped securely. Never place provider secrets/service credentials in browser/POS client code.

## Commercial direction

Marketplace integrations should be compatible with Point 3C Package/Entitlement architecture and may be sold/enabled as an Add-on or package capability.

Entitlement alone must never bypass provider authentication, feature readiness, dependencies, permissions, or backend enforcement.

## Reporting / accounting direction

Orders must retain their source/provider identity so Sharawla can report and reconcile channels separately, including where supported:
- gross sales
- provider discounts
- delivery/service fees
- commissions/settlements
- payment ownership/status
- cancellations/refunds

Exact accounting treatment must be defined during Reports & Accounting / Financial Closure rather than guessed inside provider adapters.

## Cross-profile rule

The Integration Hub is platform-level, not Restaurant-only. Restaurant marketplaces are the first obvious use case, but future Retail/other profiles may use the same integration architecture with profile-appropriate normalized contracts/adapters.

## Pre-RC architecture guard

This direction does NOT start provider implementation now and does NOT create an 18th roadmap point.

Before RC, order/domain evolution must not close the door on external integrations. Any material redesign of orders should preserve or deliberately supersede the ability to represent provider identity, external order identity, branch/store mapping, idempotency, event history and sync state.

Do not silently alter the frozen 3A 107-feature baseline merely by recording this design. Any new canonical feature keys must go through the controlled capability/readiness process.

## Current roadmap placement

- Point 3B Runtime Consumer remains the current execution gate and must not be interrupted by provider implementation.
- Commercial entitlement belongs under Point 3C.
- Provider-specific implementation is deferred until the platform foundations are ready and real provider API/partner access is available.
- SH-0005 / SH-0006 Production remain read-only and unaffected.
- Experimental integration work, when eventually started, must be isolated from Production and Acceptance-tested before promotion.
