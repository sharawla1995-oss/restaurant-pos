# Sharawla POS 10.5.4-beta.38 — Retail Variants Runtime Hotfix

Scope: isolated SH-0007 Beta only.

Fixes:
- Ensure `retail-variants-startup-hotfix.js` is actually loaded by `retail-engine.js`.
- Retry `retail-variants-ui.js` after Runtime Config resolves Retail + `commerce.variants`.
- Hide legacy Restaurant Single/Double variant controls in Retail UI without deleting legacy data.
- Preserve Restaurant behavior unchanged.
- Add regression checks that verify the hotfix is loaded, cached, and version-synchronized.

Production boundary: Top Burger / SH-0005 / SH-0006 remain read-only and are not targeted by this release.
