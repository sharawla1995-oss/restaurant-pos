# Sharawla POS 10.5.4-beta.36 — RC Acceptance

## Scope
Beta36 is the isolated multi-engine release candidate. Manual runtime acceptance is performed on SH-0007 / business `تجريبي` only. SH-0005, SH-0006 and Top Burger remain Production Read-Only.

## Preconditions
- Windows installer must be built from the final Beta36 SHA for both x64 and ia32.
- `npm run check` must pass including Beta36 multi-engine and Landed Cost gates.
- SH-0007 must show Login after restart/update; no persistent auto-resume.
- Canonical fingerprint must remain unchanged.
- Offline queue must be clear before any updater test.

## Stage A — Retail
1. Runtime Profile = Retail and `commerce.variants` enabled only for `تجريبي`.
2. Create Product + Size/Color matrix.
3. Verify unique matrix signature, SKU and barcode lookup.
4. Receive stock for a Variant through PO -> approval -> GRN.
5. Supplier Invoice + 3-Way Match.
6. Replenishment rule -> suggestion -> PR -> PO.
7. Landed Cost allocation and safe posting before outbound movement.
8. Confirm weighted average cost changes and value-adjustment audit.
9. Sell Variant online; verify exact Variant stock deduction and order snapshot.
10. Sell Variant offline; reconnect; verify one sync only.
11. Return part/full quantity; verify same Variant stock restored.
12. Supplier return; verify exact stock unit.
13. Confirm Reports V2 totals and Printing V2 PO/GRN/return/label output.

## Stage B — Restaurant / Recipe
Temporarily change only `تجريبي` to Restaurant and enable Food add-ons for the experiment.
1. Ingredient + base/purchase units + conversion.
2. Recipe Basic for product and Variant.
3. Modifier addition and removal mapping.
4. Sale deducts ingredient stock and creates immutable consumption/cost snapshots.
5. Return reverses the historical snapshot rather than the current recipe.
6. Prep Item -> Recipe -> Production Batch -> actual Yield.
7. Waste posting with reason and cost.
8. Food Cost / theoretical consumption / variance reports.
9. Offline sale + reconnect sync once.

## Stage C — Service
Temporarily change only `تجريبي` to Service.
1. Customer + asset.
2. Appointment.
3. Service Job lifecycle through completion.
4. Package purchase/session consumption.
5. Warranty/installation where enabled.
6. Commission rule and earned entry after job completion.
7. Public Web booking creates a valid appointment without direct anon table writes.
8. Print Service Job.

## Stage D — Membership
Temporarily change only `تجريبي` to Membership.
1. Member -> Plan -> Subscription.
2. Renewal and Freeze rules.
3. Check-in.
4. Trainer/Class/Booking.
5. Web membership request and verified class booking.
6. Offline idempotent subscription/check-in where applicable; reconnect sync once.

## Stage E — Logistics
Temporarily change only `تجريبي` to Logistics.
1. Zone/pricing + driver.
2. Shipment + Waybill.
3. Pickup request.
4. Tracking events.
5. COD collection and settlement.
6. Return shipment flow.
7. Public Web tracking requires tracking number + recipient phone.
8. Public pickup request is idempotent.
9. Print shipment/waybill.

## Stage F — Core regression
- Login/permissions/action overrides.
- Branch access.
- Shift open/close.
- Payments.
- Returns.
- Backup/reset/restore on Beta only.
- Direct printing without dialog.
- Offline grace 7 days.
- Update Center checkOnly does not download.
- Gate A before download, Gate B after download, fail-closed backup, Gate C immediately before spawn.
- Restart/update returns to Login.
- PWA shell works from cache; mutations require network unless explicitly supported.

## PASS rule
No Production rollout is allowed until every applicable stage is PASS or explicitly marked N/A with a reason. Any double-posting, identity change, negative-stock leak, hidden fallback to legacy device identity, or updater safety regression is an automatic FAIL.
