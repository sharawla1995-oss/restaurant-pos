# Restaurant POS Cloud V5 Foundation

This release starts the agreed sales-first rebuild.

Included now:
- Two branches renamed to العشرين and الدقي.
- Cash / Wallet / InstaPay.
- Customer lookup by phone during checkout.
- Customer list.
- Delivery zones and delivery fees.
- Delivery drivers and order assignment.
- Delivery order routing to a branch.
- Preparation receipt + customer receipt.
- Order source / delivery fields / order number foundation.
- Inventory and kitchen disabled by default but can be enabled by admin.
- Branch-specific product availability table and mixed-payment schema foundation.
- Audit log schema foundation.

## Installation
1. Run `supabase-v5.sql` once in Supabase SQL Editor.
2. Upload the six website files at repository root:
   index.html, app.js, styles.css, manifest.json, sw.js, README.md
3. Do not upload the SQL file to GitHub unless you want to keep it as documentation.


## V5.1 Fix
- Forces fresh app.js/styles.css loading.
- Removes stale service-worker caches.
- Fixes delivery page so old POS content cannot remain when delivery data loading fails.
- Confirms payment UI: Cash / Wallet / InstaPay.
- No SQL changes required after V5 SQL succeeded.
