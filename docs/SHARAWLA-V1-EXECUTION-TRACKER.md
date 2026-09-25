# Sharawla POS V1 — 22-Step Execution Tracker

Branch: `beta52-acceptance-coverage-closure`
Production safety: SH-0005 / SH-0006 / Top Burger remain read-only until final owner acceptance.
Experimental target: SH-0007 / business `تجريبي` only.

Legend: DONE / IN PROGRESS / READY FOR ACCEPTANCE / BLOCKED BY MANUAL RUNTIME / PLANNED V1.1

1. Variants Engine — IN PROGRESS
   - Foundation schema: DONE
   - CRUD / matrix API: DONE
   - SKU + barcode + unique combination: DONE
   - Variant stock by branch: DONE
   - variant-aware sale/return RPC path: DONE
   - POS/Barcode/Offline bridge: DONE
   - Cloud capability graduated to implemented add-on: DONE
   - SH-0007 moved to Retail + variants override: DONE
   - Manual end-to-end device acceptance: BLOCKED BY MANUAL RUNTIME

2. Advanced Purchasing — IN PROGRESS
   - Existing PO/GRN/weighted average/supplier returns preserved
   - Purchase request / approvals / supplier invoice / 3-way match / replenishment / landed cost foundation: DONE
   - UI/runtime completion and acceptance: IN PROGRESS

3. Recipe Basic — IN PROGRESS
   - Units + conversions + recipe versions + variant recipes + modifier/removal mappings: DONE
   - POS consumption / returns / offline integration: IN PROGRESS

4. Recipe Advanced / Food Cost — IN PROGRESS
   - Prep / production / yield / waste / sale cost snapshots foundation: DONE
   - Operational runtime + reports: IN PROGRESS

5. Orders Engine V2 — IN PROGRESS
6. Reports Engine V2 — IN PROGRESS
7. Finance / B2B Engine — IN PROGRESS
8. Service Engine — IN PROGRESS
9. Specialized add-ons — schema/capability roadmap established; deep connectors remain capability-gated
10. Capability distribution — IN PROGRESS; no Production category/profile writes
11. Admin Capability Matrix clarity — IN PROGRESS on isolated Admin branch
12. Profile rollout — Restaurant/Retail/Pharmacy implemented baseline; Warehouse/Service/Membership/Logistics stay disabled until runtime-ready
13. Website/PWA per profile — existing Restaurant/Retail foundations preserved; capability-gated expansion IN PROGRESS
14. Permissions & Roles V2 — IN PROGRESS
15. Offline V2 — DONE / ACCEPTED ON SH-0007
   - Beta51 accepted runtime SHA: `5aca3a591c7210d8dd292148b77c639998f54c83`
   - Full Sandbox: READY_FOR_RC / 100%
   - Deep Chaos automated checks: PASS
   - Lost ACK exactly-once: PASS
   - Guided crash after local commit + restart + resume + return + reconciliation: PASS
   - Two historical legacy conflicts intentionally preserved
   - Beta52 changes crash acceptance evidence/reporting only; no Offline V2 sale/sync semantic change
16. Printing V2 — existing direct print preserved; new documents IN PROGRESS
17. Full Regression — static + automated suite IN PROGRESS; Beta52 closes enabled-feature acceptance coverage
18. Final Beta Release — IN PROGRESS (`10.5.4-beta.52` acceptance coverage closure)
19. Production Migration Plan — DOCUMENTATION ONLY until broader owner/runtime acceptance
20. Sharawla Admin Production — NO MERGE until preview/UI acceptance and Cloud permission hardening
21. Documentation + Support — IN PROGRESS
22. Production V1 Freeze — BLOCKED until enabled-feature coverage, Cloud hardening, profile acceptance, and production pilot gates are complete

## Non-negotiable gates
- No write to Top Burger / SH-0005 / SH-0006 before final acceptance.
- No automatic canonical fingerprint changes.
- No regression to Restaurant sale/printing/reports/offline/update safety.
- New capabilities default off unless inherited/explicitly assigned.
- Planned/unimplemented features cannot be activated.
- Any new sale/inventory/return flow must be idempotent and offline-safe before Production.
