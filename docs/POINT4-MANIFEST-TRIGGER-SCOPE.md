# Point4 Manifest Trigger Scope

The Point4 deployment manifest gate is a historical 46-contract stock-ownership gate.
It must run when its contracts, checker, workflow, or Point4 deployment artifacts change.

Unrelated additive SQL source files (for example Permissions V2 / Offline transport work)
must not retrigger the frozen 46-contract blob simulation merely because their filename
starts with `supabase-`.

Trigger scope is therefore narrowed from `supabase-*.sql` to
`supabase-point4-*.sql`. The manifest/checker/contracts triggers remain unchanged.
This changes CI trigger scope only; it does not alter any database artifact or deployment.
