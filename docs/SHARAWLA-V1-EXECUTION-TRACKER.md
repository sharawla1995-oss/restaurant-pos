# Sharawla POS V1 — 22-Step Execution Tracker

Branch: `beta36-multi-engine-integration`
Production safety: SH-0005 / SH-0006 / Top Burger are read-only until final owner acceptance.
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
15. Offline V2 — existing idempotent queue preserved; new engines must pass separate gates
16. Printing V2 — existing direct print preserved; new documents IN PROGRESS
17. Full Regression — static + automated suite IN PROGRESS
18. Final Beta Release — IN PROGRESS (target beta.36 candidate)
19. Production Migration Plan — DOCUMENTATION ONLY until owner runtime acceptance
20. Sharawla Admin Production — NO MERGE until preview/UI acceptance
21. Documentation + Support — IN PROGRESS
22. Production V1 Freeze — BLOCKED until manual beta acceptance

## Non-negotiable gates
- No write to Top Burger / SH-0005 / SH-0006 before final acceptance.
- No automatic canonical fingerprint changes.
- No regression to Restaurant sale/printing/reports/offline/update safety.
- New capabilities default off unless inherited/explicitly assigned.
- Planned/unimplemented features cannot be activated.
- Any new sale/inventory/return flow must be idempotent and offline-safe before Production.
