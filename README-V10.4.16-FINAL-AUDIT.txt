Sharawla POS V10.4.16 — AUDITED STABILITY RELEASE

Built from V10.4.15 after full source-level audit.

Targeted fixes:
1) Manual delivery fee field is always visible in Delivery mode.
   - Selecting a zone fills its configured fee.
   - Cashier can override that fee for the current order only.
   - No selected zone still permits manual fee entry.
   - Negative/invalid manual fees are normalized to zero.
   - Switching customers/addresses cannot leave a stale zone fee behind.
2) Delivery cashier layout is compacted into two columns on desktop.
   - Cart items can shrink/scroll correctly.
   - Account summary/payment footer cannot be flex-compressed.
   - Mobile stays single-column.
3) Sidebar behavior:
   - Removed V10.4.15 floating yellow restore button.
   - Existing menu/open button remains unchanged.
   - Added close button inside the opened sidebar.
4) Return quantities are normalized to whole numbers and capped at remaining returnable quantity before submission.
5) Expenses require non-empty description and amount > 0; invalid date ranges are rejected.
6) Shift opening/closing cash cannot be negative or invalid.
7) Promo administration validates discount values, percentages, usage limits, and start/end dates.
8) Product/modifier and delivery-zone numeric inputs are validated before save.
9) Hardened dynamic UI text escaping in cashier/orders/kitchen/inventory/admin rendering.

Regression protection:
- Sharawla Cloud licensing functions are byte-for-byte unchanged from V10.4.15.
- main.js, preload.js, manifest.json and update-config.json are unchanged from V10.4.15.
- Windows 7 stack unchanged: Electron 22.3.27, electron-builder 22.10.5, sql.js 1.8.0.
- appId remains com.topburger.pos for update/data continuity.
- Offline/local-first sales, shifts, queue, backups, printing, website flow and reports were not redesigned.

Audit results before ZIP:
- JS syntax checks: PASS
- Version consistency check: PASS
- 68 static/invariant checks: 68 PASS / 0 FAIL
- 10 deterministic cart calculation scenarios: PASS
- 1000 randomized cart calculation scenarios: PASS
- All app RPC references found in included SQL migration history: PASS
- No duplicate named JS functions: PASS
- No duplicate static HTML IDs: PASS

Real-hardware acceptance still required for printer output, Windows installer/update and final visual fit on the branch monitor, because those require the actual branch device/peripherals.
