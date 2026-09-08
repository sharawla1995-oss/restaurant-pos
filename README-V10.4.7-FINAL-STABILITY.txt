Top Burger POS V10.4.7 — Reports Runtime Fix & Stability

- Fixes the V10.4.6 reports runtime failure seen on mobile.
- Expanded branch-only reports: collected sales, returns, net sales, expenses, payment methods, sales channels, website orders, products net of returns, peak hours, delivery zones/fees/drivers, promos, return reasons, employees, expenses and shifts by shift number.
- Shift report remains printable on 80mm.
- Keeps pickup distinct from takeaway.
- Keeps manual POS delivery fee editable per order; website delivery fee remains zone-driven/server-validated.
- Keeps device-local Windows printer and Auto Print settings.
- Keeps order details, copy marking, silent direct print, offline queue safeguards and GitHub auto-update.

Validation performed before packaging:
- node --check app.js/main.js/preload.js
- scripts/check-version.js => V10.4.7 consistent
- GitHub workflow retains --publish never
- required critical functions checked
- ZIP integrity checked

Runtime acceptance still requires the mobile smoke test and the physical Windows/XP-80C print test before branch deployment.
