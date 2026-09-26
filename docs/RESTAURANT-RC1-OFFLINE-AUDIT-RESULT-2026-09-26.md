# Sharawla POS — Exhaustive Offline / Restaurant RC1 Audit Result

Date: 2026-09-26 (Africa/Cairo)
Branch: `beta56-offline-ownership-consolidation`
Authoritative starting SHA: `9be6b390fffa931efc501eff8bf2dc3badf04841`
Inventory commit: `e277aa9ae44b1fa5c08dd201faca84aa6b4bc323`
Source-fix commit: `1aea3d8`
Candidate: `10.5.4-beta.58.30`

## Decision

**Restaurant RC1 is NOT READY.** The exhaustive inventory contains 231 actions: **71 PASS, 53 ONLINE_ONLY_OK, 81 MANUAL, 26 FAIL**. Source fixes close the three reproduced practical UI/routing defects at code level, but device proof is still required and five material blocker families remain open.

No Production device, database, license, updater, printer, profile, feature, or business data was touched. No SQL was deployed. Canonical Stock and Cutover remain OFF. Seq293/304/316 were not retried, deleted, reset, or cleaned.

## Open blocker families

| Blocker | Affected actions | Why it blocks RC1 |
|---|---|---|
| Official bon/invoice continuity | P038, O009, B016 | Offline still displays `OFF-*`; no collision-safe official reservation/reconciliation contract exists. |
| Return of a brand-new pending Offline sale | O010, O011 | Parent order/item server mapping is unavailable before ACK. |
| Driver cash custody projection | D015 | Pending delivered operations do not form a complete local custody/settlement view. |
| Coherent inventory snapshot | I001, I010, I011 | Inventory and attachment/storage scopes lack a complete reliable local/fail-closed contract. |
| Raw storage and multi-step administration atomicity | W011, M002–M008, M010–M012, B005, B006 | Some image/storage and multi-call Cloud flows still lack comprehensive preflight/atomicity and DNS/fetch proof. |

The exact 26 failing rows are: `P024`, `P025`, `P026`, `P028`, `P038`, `O009`, `O010`, `O011`, `D015`, `I001`, `I010`, `I011`, `W011`, `M002`, `M003`, `M004`, `M005`, `M006`, `M007`, `M008`, `M010`, `M011`, `M012`, `B005`, `B006`, `B016`. The payment rows stay FAIL only because the required SH-0007 practical proof has not yet been produced; source routing is fixed.

## End-to-end ownership traced

Every action was classified before source modification and traced through the applicable chain:

`UI control → renderer/handler → final loader/wrapper → router/RPC owner → Offline V2 adapter → native IndexedDB event/cache/projection → sync → explicit server ACK → client_tx_id reconciliation → UI refresh`.

The trace covered `index.html` loader order, `app.js`, later runtime takeovers/hardening, permissions routers, Offline V2 native store/transport/takeover, recovery caches, acceptance owners, SQL transport source contracts, and current automated gates. An automated PASS was not treated as proof that an unrelated UI path was covered.

## Implemented source corrections

| Area | Correction |
|---|---|
| Durable local success | Added `commitRpcLocal` so a committed local customer/address/driver operation returns success instead of surfacing `Failed to fetch`. |
| Local projections | Project sales, returns, expenses, shifts, customers, addresses, and drivers immediately into operational read state. |
| Delivery/Kitchen/Orders | Merge cached, native-pending, and acknowledged rows; support local detail/status/driver flows and deduplicate by `client_tx_id`. |
| Cache recovery | Warm operational entities and derive sorted/filtered/offset query results from entity rows. |
| Reconciliation | Consume native outbox/receipts and replace local/ACK duplicates without weakening explicit ACK/idempotency. |
| Offline/stale UX | Show visible Arabic Offline/stale context on operational pages. |
| Online-only boundaries | Unregistered RPC/REST mutations and customer bulk import fail closed; Online Orders no longer looks like a legitimate empty list Offline. |
| Focused regression proof | Added `scripts/check-beta58-30-offline-practical-rc1.js` with static and VM runtime-route checks and wired it into runtime syntax verification. |

The customer dependency rewrite in `supabase-beta45-offline-v2-transport-v1.sql` is source-only. It was **not deployed**; backend alignment on the isolated test environment is a separate authorized action before chained customer → address reconnect proof.

## Automated verification

| Verification | Result |
|---|---|
| `npm run check` on candidate | **SUCCESS** — full repository chain completed, including Point-15 closure, Offline V2 storage/sync/transport/safety, runtime acceptance, owner routing, Restaurant acceptance, Online Orders, version and customer/delivery owner design. |
| Practical RC1 focused gate | **PASS**, with official numbering emitted as an explicit known blocker. |
| Matrix integrity | **PASS** — 231 unique action IDs; every ID exists in the final-verdict table and practical script. |
| `git diff --check` | **PASS**. |
| GitHub Actions Windows x64 build | Pending push/run; must be SUCCESS before candidate artifact use. |
| SH-0007 practical acceptance | **MANUAL / NOT RUN** — native device access is unavailable in this workspace. |

## Deliverable map

| Deliverable | File |
|---|---|
| Pre-change exhaustive UI/action inventory and classification | `RESTAURANT-RC1-OFFLINE-ACTION-MATRIX-2026-09-26.md` |
| Defect ledger with post-fix resolution/proof status | `RESTAURANT-RC1-OFFLINE-DEFECT-LEDGER-2026-09-26.md` |
| Per-action final verdict | `RESTAURANT-RC1-OFFLINE-FINAL-VERDICTS-2026-09-26.md` |
| Intentionally Online-only list | `RESTAURANT-RC1-INTENTIONALLY-ONLINE-ONLY-2026-09-26.md` |
| Exact SH-0007 device procedure | `RESTAURANT-RC1-SH0007-PRACTICAL-OFFLINE-ACCEPTANCE-2026-09-26.md` |

## Release rule

Do not declare Restaurant RC1 ready while any `OFFLINE_REQUIRED` row is FAIL, any durable local success is displayed as a network failure, any critical cached operational screen disappears only because the network is unavailable, or the official numbering contract remains unresolved. The Windows installer is an SH-0007 audit candidate, not a Restaurant RC1 release.
