Sharawla POS V10.4.12

- System/product name is now Sharawla POS.
- Business identity remains configurable from business settings and is used on receipts/reports.
- Every fresh app launch requires employee login; an open shift is not closed.
- Offline restart remains possible for the last successfully authenticated user using a local PBKDF2-SHA256 password verifier; plaintext passwords are never stored.
- Explicit Logout clears the cached offline login verifier and resume session.
- Production package excludes README, SQL, legacy SQL, GitHub workflow and build scripts.
- appId and legacy local database/backup paths intentionally remain unchanged for safe in-place upgrade and data continuity.
- All V10.4.11 printing, updater progress, offline queue, backups, website flow and reporting behavior retained.
