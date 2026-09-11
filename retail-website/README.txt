Sharawla Retail Hosted Website — Beta18 Foundation

Purpose
- Generic hosted Retail/Supermarket storefront for Sharawla POS.
- Can also serve as the API contract reference for a customer's existing website.
- Restaurant website flow is separate and is not replaced by this package.

Deployment
1. Apply the Beta18 Retail website SQL files to the isolated Beta operational Supabase only.
2. Copy config.example.js to config.js.
3. Set ONLY the business operational Supabase URL and Publishable key.
4. Optionally set displayName, logoUrl, heroTitle, defaultBranchId and currency.
5. Host this folder on a static HTTPS host or the customer's domain.

Security rules
- Never place service_role or Secret keys in config.js.
- Browser writes are RPC-only.
- Product price, offers, delivery fee and stock are revalidated server-side.
- Website orders are staged and reserve stock for a short TTL.
- POS acceptance requires authenticated staff + branch access + open shift.
- POS acceptance routes through create_retail_pos_order_atomic(), preserving the Retail inventory ledger.
- Customer cancellation is allowed only while the staged order is still pending.

Public RPC contract
- retail_website_bootstrap()
- retail_website_catalog(p_branch_id)
- retail_website_quote(p_branch_id,p_order_type,p_delivery_zone_id,p_items)
- retail_create_website_order(...)
- track_retail_website_order(p_order_code,p_customer_phone)
- cancel_retail_website_order_customer(p_order_code,p_customer_phone)

Authenticated POS RPC contract
- retail_website_order_details(p_retail_website_order_id)
- accept_retail_website_order(p_retail_website_order_id)
- reject_retail_website_order(p_retail_website_order_id,p_reason)

Beta status
- Source foundation only until SQL is applied and full SH-0007 runtime acceptance passes.
- Do not point this frontend at Production during Beta testing.
