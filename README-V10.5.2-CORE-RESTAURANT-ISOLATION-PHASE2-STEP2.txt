Sharawla POS V10.5.2 — Core / Restaurant Isolation Phase 2 Step 2
==================================================================

Purpose
-------
Continue the safe physical separation started in V10.5.1 without rewriting any
stable Restaurant business function.

What changed
------------
1. Restaurant Engine now owns Restaurant-specific navigation metadata:
   - page titles
   - all Restaurant page IDs
   - default role page sets
   - permission definitions / groups
   - operational setting gates for Delivery / Kitchen / Inventory

2. Sharawla Runtime Core gained generic engine metadata APIs.
   It still contains no Restaurant page names or Restaurant permission rules.

3. app.js now asks the active POS Profile engine for those rules instead of
   carrying Restaurant-specific constants itself.

4. No database migration is required.
   V10.5.0 Runtime Config RPC remains unchanged.

Intentionally unchanged
-----------------------
- Activation / Verify / Business Connection / Support Code RPC contracts.
- Canonical Fingerprint / Device ID / license_hash.
- com.topburger.pos, topBurgerDesktop and legacy local storage/database paths.
- All Restaurant renderers and business operations: POS, orders, returns,
  kitchen, delivery, website, promo codes, expenses, reports, customers.
- Restaurant V2 features are still NOT included.

Upgrade test
------------
Upgrade one Top Burger device first from V10.5.1. It must open without
reactivation, retain the same data and Support Code, and show exactly the same
navigation/permissions. Inventory and Tables remain disabled according to the
current Top Burger module configuration. Then repeat on the second device.
