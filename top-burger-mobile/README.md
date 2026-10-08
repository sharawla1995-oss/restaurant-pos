# Top Burger POS Mobile — 10.5.15 parity

Source baseline: immutable desktop stable tag `v10.5.15`.

This folder is the browser/PWA adaptation of Top Burger Production POS and carries the same
10.5.15 restaurant runtime/UI behavior for cashier, orders, returns/approvals, customers,
delivery, shifts, reports, HR, Notifications/Summary V2, recipe UI, exact internal-extra
quantities and receipt/prep printing.

Browser/PWA differences only:
- no Windows/Electron device fingerprint or Windows auto-updater;
- Supabase Project URL + Publishable key remain browser-local setup values;
- runtime profile keeps the 10.5.15 restaurant entitlement snapshot:
  modules customers/delivery/expenses/kitchen/pickup/pos/promocodes/reports/returns/website;
  features food.ingredients + food.recipes;
- Multi-Tenant compatibility requires a canonical Sharawla Cloud Business UUID in browser setup;
- the UUID is a selector only; backend membership/RLS remains authoritative;
- every REST/RPC request carries `X-Sharawla-Business`;
- Business/Website Settings are tenant-local; Website Settings save through `update_website_settings_v1` instead of legacy `id=1`;
- browser printing uses the browser print dialog; silent Windows printer selection is desktop-only;
- PWA cache is `top-burger-mobile-10.5.15-mt1-1` on the compatibility candidate.

No Production SQL migration is applied by this mobile sync. The PWA consumes the same
Production backend already upgraded for 10.5.15.


## Multi-Tenant compatibility candidate

Source/test preparation only. No Top Chicken UUID is embedded. Do not deploy a Top Chicken cutover until Sharawla Cloud issues its canonical business UUID and the Beta tenant smoke suite is PASS.
