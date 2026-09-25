# Point 4 — Official Continuation Checkpoint — 2026-09-22

Repository: sharawla1995-oss/restaurant-pos  
Branch: beta56-offline-ownership-consolidation  
Checkpoint base HEAD before this documentation commit: d473b5aa7a15cba8429b29741821042636b06965

## Hard safety boundary

- Production SH-0005 / SH-0006 remains immutable/read-only on 10.5.3 CLEAN.
- SH-0007 is the isolated Beta device/business/backend.
- Canonical Stock: OFF.
- Cutover: OFF.
- Pre-Cutover Guard deployment: 0/46.
- No Supabase deployment, production mutation, activation, migration, rebind, or canonical-fingerprint change is authorized by this checkpoint.

## Point 4 ownership / contracts

Ownership mapping is CLOSED at 61/61:
- Direct: 40/40.
- Transitive: 15/15.
- Document/In-flight Barriers: 6/6.

Pre-Cutover Guard Contracts: 46 total.
- Contract Gate: PASS.
- Pre-Implementation Evidence Gate: PASS.
- Evidence: 46/46 complete.
- This is source/static readiness only; it does not mean the guards are deployed.

## Current Source Acceptance

Official counter: **38/46 SOURCE ACCEPTED**.

Accepted IDs:
1,2,3,4,5,6,7,8,9,10,13,14,15,16,17,18,19,20,21,22,23,24,26,28,29,31,32,33,34,38,39,40,41,42,43,44,45,46.

Formal Deferred exactly:
11,12,35,36,37.

Do not reopen those Deferred contracts unless new contradictory authoritative evidence appears.

Active remaining:
25,27,30.

## FT-5 closure — #14 + #15

#14: food_production_batch_complete_v1(bigint,numeric,jsonb,text,text)  
#15: food_stock_count_post_v1(bigint,text,jsonb,text)

Source implementation commits:
- #15: 2fac4590fe661d25c1eb8df2ef7481283fd696f6
- #14: 51836a35708093d2d22d141ae25bf3c472f373d9
- FT-5 checker: 207fdf56f6104243d03232715137aeec984b04fa
- FT-5 workflow: 66c46e699c3c28ef4d6ab04506c0e34962082eee
- checker syntax fix: d473b5aa7a15cba8429b29741821042636b06965

GitHub Actions:
- Initial FT-5 run 35676189277 failed only because of a JavaScript syntax error in the semantic checker; compile step was skipped.
- Final run **35676408428 = SUCCESS**.
- FT-5 semantic PASS: #14 + #15.
- PostgreSQL 16 compile PASS.
- Effective pg_get_functiondef read-back PASS for both functions.
- Safety Boundary PASS.
- Workflow explicitly confirmed SOURCE-ONLY: no Supabase credentials, deployment, canonical activation, or cutover mutation.

Therefore #14 and #15 are SOURCE ACCEPTED and the official counter is 38/46.

## #25 — retail_landed_cost_post_v1(bigint)

Authoritative full body found in:
supabase-engine-landed-cost-v1-posting.sql

Introduction / only original file-history commit:
1a7838c00caf507563c87674d958e0eb175f328d
(feat: close Landed Cost valuation posting gate safely)

Historical/source behavior:
- authorization / permission.
- loads and locks landed-cost row.
- resolves GRN and branch access.
- replay: if status=posted, returns already_posted.
- requires allocated status and positive allocations.
- iterates positive allocations.
- resolves variant when variant_id is present, otherwise product.
- checks for disallowed outbound/adjustment movements after receipt.
- locks relevant inventory balance.
- updates average_unit_cost.
- inserts retail_inventory_value_adjustments_v1.
- finally marks landed cost posted and writes workflow event.

Point 4 issue:
The legacy body processes allocation identities one-by-one and can reach average-cost mutation without first freezing and guarding the complete actually-affected Product/Variant identity set.

Required structure:
Replay -> read-only validation/precompute -> freeze complete affected Product/Variant set -> deterministic Guard ALL -> first new-execution commitment -> execute exactly the frozen set.

Cross-file negative replacement scan:
- 55/55 SQL files changed/added after the introduction commit were checked.
- 0 later cross-file definitions/replacements of retail_landed_cost_post_v1 were found.

Official #25 status:
- AUTHORITATIVE_SOURCE_PROVENANCE = PASS.
- READY_FOR_IMPLEMENTATION.
- RESTRUCTURE_REQUIRED.
- NOT SOURCE ACCEPTED yet.

## #27 / #30 — discovery remains OPEN

#27:
retail_purchase_receive_v2(bigint,jsonb,text)

#30:
retail_supplier_return_create_v2(bigint,bigint,text,jsonb,text)

Important negative evidence:
- supabase-v10-5-4-beta16-retail-suppliers-purchasing.sql does not contain either V2 function.
- Landed Cost files do not contain either V2 function.
- Default-branch GitHub code search returning no hits is not sufficient evidence because branch-only historical/source files may not be indexed.

Batch6 must NOT be confused with #27/#30.

Commit:
9810b0cb1d38735403ab31db1f534bb7b8c0e870
(feat: guard point4 product-only purchasing writers)

Its patch explicitly says:
"Contracts #28 + #31 only. Product-only purchasing/supplier-return writers."

It implements/guards:
- retail_purchase_receive(...) = contract #28.
- retail_supplier_return_create(...) = contract #31.

Those are the already-accepted Product-only legacy writers. They are NOT authoritative bodies for:
- #27 retail_purchase_receive_v2
- #30 retail_supplier_return_create_v2

Do not alias, infer, or reconstruct #27/#30 from #28/#31.

## Exact continuation point

Continue authoritative historical discovery for the Variant-aware Purchasing V2 family, not generic name search.

Search Git ancestry/file history for the commits/files that introduced Variant Purchasing / Variant Goods Receipt / Variant Supplier Return / Purchasing V2.

For each #27 and #30 require:
1. introduction commit/source;
2. full function body;
3. original file history;
4. cross-file later replacement scan;
5. only then mark AUTHORITATIVE_SOURCE_PROVENANCE PASS / READY_FOR_IMPLEMENTATION.

Do not invent a body if discovery fails.

Once #27/#30 provenance closes:
- implement #25/#27/#30 as the next Retail fast-track group (FT-6);
- preserve replay/idempotency and existing business behavior;
- freeze the complete actually-affected Product/Variant set before first commitment;
- deterministic Guard ALL;
- execute the exact same frozen set;
- accept each function independently only after source semantic gate + PostgreSQL 16 compile + effective pg_get_functiondef read-back.

If all three pass, Source Acceptance would move from 38/46 to 41/46, leaving only the five Formal Deferred contracts.

## Invariants

- Never count source acceptance before source + semantic + PostgreSQL16 compile + effective read-back all PASS.
- No deployment during this source phase.
- Deployment remains 0/46.
- Canonical Stock remains OFF.
- Cutover remains OFF.
- Production remains untouched.
