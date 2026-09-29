# Bon Numbering Runtime Policy Read

Status: SOURCE WIRING / BRANCH ACTIVATION BLOCKED / DEPLOYMENT 0

The POS now treats the server branch policy as the source of the Bon numbering mode when that source exists. Bootstrap caches the policy for offline continuity. A missing table, missing row, or unknown value resolves to legacy SHIFT.

Checkout stamps the resolved mode into the durable sale payload. This removes the previous implicit renderer-only default and gives Native/transport a frozen scope hint.

This commit deliberately adds no settings button and no policy write path. BRANCH remains a known source value but is not presented as an enabled product feature while Trusted Device acquisition and authorized migration are blocked. No database is changed.
