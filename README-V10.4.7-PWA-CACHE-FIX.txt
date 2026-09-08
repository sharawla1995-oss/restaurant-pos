Top Burger POS V10.4.7 — PWA cache consistency fix

- Service Worker cache bumped to V10.4.7.
- app.js and styles.css cache-busters bumped to 10.4.7.
- Removed unconditional Service Worker unregister/cache deletion.
- Registers sw.js with updateViaCache:none and explicitly checks for updates.
- Network-first strategy for navigation/app.js/styles.css prevents stale UI after releases while retaining offline fallback.
- Version checker now validates PWA asset/cache versions too.
