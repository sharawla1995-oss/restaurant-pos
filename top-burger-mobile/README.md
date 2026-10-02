# Top Burger POS Mobile — V8.8 isolated snapshot

Source snapshot: fbcef28ff85f8a7e47ff0548c35e64163bc56092

Purpose:
- Preserve the historical Top Burger POS V8.8 mobile web experience.
- Keep it separate from the actively developed Sharawla root app.
- Reuse the same GitHub Pages origin so existing browser localStorage (sbUrl / sbKey / sbSession) can remain available when present.

Safety:
- No Supabase SQL or migration.
- No license activation, reset, rebind, or device mutation.
- Does not modify SH-0005 / SH-0006.
- The historical V8.8 global service-worker/cache purge was replaced with a subdirectory-scoped service worker.
- Root Sharawla files are unchanged.

URL:
https://sharawla1995-oss.github.io/restaurant-pos/top-burger-mobile/
