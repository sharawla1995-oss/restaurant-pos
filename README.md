# Restaurant POS V7

V7 adds:
- Branch permissions per employee (`employee_branches`).
- Cashier can be limited to one branch; call center can be granted both branches; admin sees all.
- Separate main page for delivery orders and manager-only delivery settings.
- Driver cash settlement tracking.
- Shift filter in reports.
- Calm, mobile-friendly visual refresh.
- Website-ready catalog fields (`website_visible`, `website_sort_order`) while keeping public website writes closed until a controlled API/Edge Function is added.

## Upgrade
1. Run `supabase-v7.sql` once in Supabase SQL Editor.
2. Upload `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js` to GitHub Pages root, replacing same-name files.
3. Hard refresh/reopen the site.

No need to rerun older SQL files.
