Sharawla POS V10.5.4-beta.10 FINAL MERGED

Base: supplied beta.10 Update Safety Bundle.

Merged:
- Compact Offline / Pending / Update indicators.
- Gate A / Gate B / Gate C retained.
- Hardened pre-update backup retained.
- Exact GitHub asset file size + SHA-256 required before install.
- Core health: version, files, SQLite PRAGMA integrity_check, kv/local_operations, canonical license identity.
- Renderer health: license, Runtime Config, Business Connection.
- Renderer success cannot override Core failure.
- Last Known Good only after full health succeeds.
- Explicit rollback: download old LKG release, verify size/SHA-256, fresh backup, queue guards, then launch installer.
- Update log retained.
- No automatic rollback.
- No auto-login after restart/update.
- styles.css, Restaurant Engine, Runtime Core business logic unchanged.
