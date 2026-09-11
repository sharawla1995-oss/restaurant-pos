Sharawla POS V10.5.4-beta.18 CANDIDATE
Retail Website Integration Foundation
============================================================
STATUS: SOURCE BRANCH ONLY / NOT RELEASED / NOT APPLIED TO PRODUCTION
BASE: V10.5.4-beta.17
BRANCH: beta18-website-integration-foundation

GOAL
----
One Retail Website API contract must support BOTH commercial cases:
1) Sharawla-hosted website/template for a customer who has no website.
2) Existing customer website (React/WordPress/custom/etc.) integrating with Sharawla.

The browser/site does not write POS orders, payments or inventory tables directly.
It uses the business operational Supabase publishable/anon client and only the
approved RPC surface.

BOUNDARY
--------
Retail staging is intentionally separate from Restaurant website_orders.
Restaurant variants/modifiers and Retail decimal/weight/inventory reservation
have different semantics. Restaurant RPCs are not replaced.

PUBLIC WEBSITE API
------------------
Existing beta.17:
- retail_catalog(branch_id)
  Catalog / branch price / online-enabled Retail products / available stock.

Beta.18 foundation:
- retail_create_website_order(...)
  Idempotent staged order creation. Server validates branch availability,
  website payment method, delivery zone/fee, product availability, decimal
  quantity step/minimum, branch price, Retail website offers and inventory.
  Creates short-lived stock reservations in the same database transaction.
- track_retail_website_order(order_code, phone)
  Safe customer status/financial tracking surface.
- cancel_retail_website_order_customer(order_code, phone)
  Customer cancellation only while still pending; releases reservation.

The beta.17 direct retail_reserve_stock endpoint is revoked from public website
roles by the beta.18 finalizer. Reservation must be tied to an actual staged order.

POS / STAFF API
---------------
- retail_website_order_details(id)
- accept_retail_website_order(id)
- reject_retail_website_order(id, reason)

Acceptance is authenticated, branch-scoped and requires an open shift.
It converts the staged Website order using create_retail_pos_order_atomic(), so
normal Retail order/payment/inventory-ledger behavior remains authoritative.
Repeated acceptance is idempotent. The inventory reservation is consumed only
once the Retail POS order is successfully created.

SECURITY / MONEY RULES
----------------------
- RLS enabled on Retail website staging tables.
- anon has NO direct staging table policy or write grant.
- Pricing/discount/delivery/stock are recalculated on server; browser totals are
  never accepted as authoritative.
- First matching Retail offer by priority/id is used, matching beta.17 POS logic.
- Website foundation does not stack a client manual discount or client promo with
  Retail offers.
- Public order submission has idempotency + reservation keys and a coarse limit
  of 3 live pending orders per branch/phone in 10 minutes.
- Reservation TTL is 15 minutes in this candidate.
- Stronger gateway-level abuse protection (WAF/rate limit/CAPTCHA if needed) is a
  deployment layer, not a reason to expose direct DB writes.

SCHEDULE
--------
Retail website availability reuses the existing authoritative
is_branch_website_open(branch_id, at) weekly-hours/manual-pause logic, then adds
branch active + website_visible checks. No duplicate schedule implementation is
used after the finalizer.

FILES / APPLY ORDER (BETA BACKEND ONLY)
---------------------------------------
1) supabase-v10-5-4-beta18-retail-website-integration.sql
2) supabase-v10-5-4-beta18-retail-website-integration-finalize.sql

DO NOT APPLY TO PRODUCTION while beta acceptance is pending.

HOSTED WEBSITE VS EXISTING WEBSITE
----------------------------------
This migration defines the per-Business operational API contract. A Sharawla
hosted multi-tenant frontend can sit above this same API. An existing customer
site can call the same public RPCs using that Business's public connection.

A true multi-tenant hosted site that automatically resolves
customer.sharawla.com or a custom domain to the correct Business/backend requires
a separate Sharawla Cloud domain/bootstrap resolver. That Control Plane change is
NOT silently added here and MUST be designed/tested separately from production.

CURRENT ACCEPTANCE
------------------
Static design/source: IN PROGRESS
Beta database apply: PENDING (connector permission currently denied)
Retail website runtime order: PENDING
POS acceptance -> Retail sale -> inventory movement: PENDING
Restaurant regression: REQUIRED
Production: UNTOUCHED
Stable 10.5.3: UNTOUCHED
