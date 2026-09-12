# Sharawla POS — Support & Recovery Guide V1

## Fast identification
Use the device Support Code first (for example SH-0007). Confirm business, branch, device id, license status, POS version, OS architecture and Last Seen before changing anything.

## Identity rules
- If local `device_fingerprint` exists, it is the only verification identity.
- Never use MachineGuid fallback.
- Never replace the canonical fingerprint automatically.
- Legacy fingerprint migration is allowed only when the local canonical value is absent.
- Rebind is an explicit administrative recovery flow, not a troubleshooting shortcut.

## Startup failure order
1. Read the on-screen license/business/runtime error exactly.
2. Confirm internet if cloud verification is required.
3. Verify license/device/business active state in Sharawla Admin/Cloud.
4. Verify Business Connection exists and points to the intended operational backend.
5. Verify local cached business/runtime config belongs to the same business id.
6. Never clear business state while offline operations are pending.

## Offline issues
- Existing sale/return/expense/shift queue and Beta36 Engine Action queue are separate but both must clear before update.
- Do not manually replay an operation that has a client transaction id until its queue status is known.
- A failed non-network operation stays visible for investigation; do not loop it blindly.

## Update issues
- Manual “Check Updates” is check-only.
- Any pending offline operation blocks update.
- Installer SHA-256 integrity must pass.
- Pre-update backup is fail-closed.
- Gate C checks the queue again immediately before installer spawn.
- Post-update health must resolve before another update transaction.

## Printing
- Use configured direct printer by exact device name.
- Test direct HTML printing before changing templates.
- Customer receipt/prep receipt are legacy protected paths; Beta36 Print Center is additive.

## Database recovery
- Prefer verified backups and additive recovery.
- Do not delete business/device/license rows to fix operational data.
- Do not restore a backup from another business/device without explicit migration procedure.
- After restore verify branch, users, products, orders, settings and pending queues before opening a shift.

## Escalation record
Capture: Support Code, version, profile, branch, exact timestamp, exact message, online/offline state, pending queue counts, last backup, last update health, and the smallest reproducible action sequence.
