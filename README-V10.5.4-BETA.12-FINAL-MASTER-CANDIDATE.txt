Sharawla POS V10.5.4-beta.12 FINAL MASTER CANDIDATE

Purpose
-------
This is the final source candidate for the V10.5.4 Update Infrastructure work.
It remains a Beta release until the last runtime regression / ia32 checks pass.

What changed from beta.11
-------------------------
- Added Previous Last Known Good history.
- Current LKG remains the latest fully healthy build.
- Previous LKG stores the immediately previous fully healthy build.
- Rollback automatically resolves the correct healthy target:
  * if current build failed health -> current LKG
  * if current build is healthy -> Previous LKG
- Update Center shows Current LKG + Previous LKG.
- Rollback button shows the exact target version.

Preserved unchanged
-------------------
- Gate A / B / C
- Hardened Pre-Update Backup
- Exact GitHub Asset size + SHA-256
- Two-Phase Health Check
- Canonical identity protection
- Update Log
- Explicit user-confirmed rollback
- Offline guards during rollback
- Fresh backup before rollback
- Manual Login after restart/update
- Compact non-obstructive indicators
- Cashier / Delivery / Payments / Printing behavior
- Restaurant Engine / Runtime Core business logic
- Canonical Fingerprint / Licensing contracts
