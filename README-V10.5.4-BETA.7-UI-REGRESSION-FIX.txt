Sharawla POS 10.5.4-beta.7 — UI Regression Fix + Part 3 Candidate

Purpose
- Restore the original cashier/cart/payment/delivery layout used before the beta.6 UI regression.
- Keep only the harmless relocation of updater/offline/sync indicators so they do not sit on checkout controls.
- Preserve the beta.6 pre-update backup EPERM hardening and Gate A/B/C unchanged.

UI rule
- No beta.6 cart sizing/overflow overrides.
- No forced .cart/.cart-items/.cart-foot/.delivery-fields/.pay-actions layout changes.
- Payment methods and checkout layout remain on the original baseline.

Update safety remains
Gate A before download -> download -> Gate B -> pre-update backup -> Install Now -> Gate C immediately before spawn().

Release
Version: 10.5.4-beta.7
Channel: beta / Pre-release only.
