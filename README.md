# Top Burger POS V8.3

- Cache-busted V8.3 assets so the new JS/CSS actually load.
- Receipt is no longer mounted under application pages; printing uses an isolated hidden iframe removed after printing.
- No automatic receipt preview after checkout. Reprint remains available from Orders.
- Customer lookup runs while typing (debounced) and fills saved name/address/area when available.
- Compact delivery rows + filters/search are active in this build.
- Dashboard receives the approved dark/gold accent styling.
- No SQL changes required.

User creation is intentionally NOT faked in this static build: secure Supabase Auth account creation needs a server-side Edge Function/service-role secret and will be added as a separate secured backend step.
