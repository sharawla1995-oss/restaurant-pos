Sharawla POS V10.4.20

Focused changes over V10.4.19:
1) Canonical device fingerprint:
   - New activations save the exact fingerprint used by Cloud in license state.
   - Existing devices try the strict saved fingerprint first.
   - Legacy migration may try the two historical deterministic candidates (MachineGuid and old fallback) only when Cloud says "unknown device".
   - Once one candidate verifies, that exact fingerprint is pinned locally and reused for verification and Business Connection.
   - Cloud matching remains strict; no server-side security relaxation.
2) Pending website orders:
   - Address is visible on the pending card before accept/reject.
   - "Details & address" review loads items, variants, modifiers, item notes, customer notes, zone, delivery fee and total.
   - Accept and Reject now open the same review first, so the employee can reject an out-of-zone/wrong-address order before accepting it.
3) Developer contact:
   - Visible polished contact button outside the opened sidebar.
   - 01555557202 / 01140642734
   - WhatsApp: 01140642734
4) Version/cache bumped to 10.4.20.

No SQL change is required for these changes.
