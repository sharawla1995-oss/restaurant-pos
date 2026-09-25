# Beta56 Corrective — Full Sandbox Acceptance Evidence

Date: 2026-09-23

## Scope
- Device: SH-0007 only
- Business: 91826502-590e-4afa-8826-2c0f4b99c490 (تجريبي)
- Beta backend: xihcxydjnzemflhedzor.supabase.co
- Profile: retail
- App version: 10.5.4-beta.56
- Canonical Stock: OFF
- Cutover: OFF
- Production SH-0005 / SH-0006: untouched

## Corrective source / build provenance
- Corrective branch: beta56-offline-ownership-consolidation
- Corrective build commit: 0278f079b970f38d97ea5a07bf2cce3a794e5c7b
- GitHub Actions run: 35816591208
- Candidate validation: PASS
- Windows x64 build: PASS
- Artifact upload: PASS
- Artifact: sharawla-pos-10.5.4-beta.56-corrective-sh0007-x64
- Artifact id: 10731219359
- Artifact archive digest: sha256:4161400a1a6c0ab38f5f0daa698df8144ac75a6b51e35869422ed53c658e7607

## Runtime acceptance
Run ID: ACC-20260923-070827-PFCEK

Final result:
- Readiness: READY_FOR_RC
- Coverage Score: 100%
- sale-return-stock: PASS — stock 22 -> 21 -> 22
- expense-idempotent: PASS — exactly one row
- offline-sale-sync: PASS — local-first -> synced; stock restored
- warehouse-shortage-roundtrip: PASS — reserve/overcommit/cancel/release/partial dispatch/cancel-after-dispatch block/receive; cleanup zero
- permission-boundary-contract: PASS
- concurrent-idempotency-20x: PASS — 20 calls; orders=1; fulfilled=1; rejected=19; stock 22 -> 21 -> 22
- inventory-reconciliation: PASS — dup=0; drift=0
- advanced.cleanup-final: PASS — residue=0
- migration compatibility: PASS
- recovery checks shown in the run: PASS

Non-blocking coverage notes:
- commerce.variants was SKIPPED because disabled.
- enabled-feature coverage is MANUAL for 9 enabled features.
- backend role impersonation is MANUAL and requires dedicated sandbox users per role.

## Gate conclusion
Full Sandbox Gate: CLOSED / PASS.
The corrective candidate is READY_FOR_RC according to the acceptance harness.

This evidence does NOT authorize:
- Canonical Stock activation
- Cutover activation
- Production deployment
- changes to SH-0005 or SH-0006

Next gate: RC evidence/release decision while preserving Beta-only isolation and stable latest invariants.
