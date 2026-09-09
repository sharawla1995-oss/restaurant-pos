Sharawla POS V10.4.18 SAFE FINAL hardening
- Change License blocked if Offline Queue has pending operations.
- Change License clears only shared business connection/session/login and common offline business caches; backup files are not deleted.
- Sharawla Cloud RPC gets a 15-second timeout. Operational business fetch/sync behavior is unchanged.
- Weekly Hours UI adds explicit 24-hour option per day using existing open_time = close_time semantics.
- main.js, preload.js, update-config.json and manifest.json remain unchanged from the prior V10.4.18 build.
