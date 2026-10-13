# Top Chicken Beta prelaunch — verified continuation, 2026-10-14

Scope: `sharawla1995-oss/restaurant-pos`, branch `codex/top-chicken-sh0008-prelaunch-fixes`. Starting HEAD: `77d1c29a350419ef9a26401dc5429e557c6caa8b`. Target database only: Beta `xihcxydjnzemflhedzor`, Top Chicken `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22.

**Release is BLOCKED. Source/dependency-fixture and isolated Windows validations passed. Employee provisioning, real website-to-cashier flow, and the correct Top Chicken operational profile binding remain unresolved. No live migration or physical-device installation occurred.**

## Final source behavior

- Status and driver assignment use dedicated durable RPC wrappers. They bind server-owned membership, active employee, explicit branch assignment, action permission, tenant/branch order and driver, expected status and request identity.
- The private receipt binds actor/order/from/to/driver and stores the original result. Exact replay returns it, changed payload or actor rejects, and request/order locks serialize races. Revoked membership cannot replay a prior receipt.
- Mutations remain with `order_fulfillment_transition_v2`, `order_assign_driver_v2` and `delivery_mark_delivered_v2`. The delivery owner continues to finalize payment and cash custody.
- The canonical-owner candidate repairs missing audit/payment IDs only for Top Chicken, with exact deployed definition hashes. Both SQL files fail preflight if the operational identity is not Top Chicken. Runtime checks also fail closed.
- Client retries bind tenant and actor, retain identity through lost response/context restart, verify storage, and clear only after server confirmation. Driver picker has no direct orders PATCH fallback. Modal errors remain visible.
- Separate test Windows build: `Top Chicken Beta TEST`, distinct appId, version `10.5.4-beta.17`, x64, Electron `22.3.27`. Prelaunch metadata disables all live HTTP/S and generic updater feeds and isolates backups/userData.
- Windows testing exposed EPERM from reuse of a fixed SQLite .tmp path. Unique temporary filenames now apply only to the separately flagged prelaunch build. Existing builds retain their original behavior.

## Executed evidence

| Check | Result | Evidence / limitation |
|---|---|---|
| PostgreSQL16 native | PASS — 32 checks | PostgreSQL16.15 Docker, isolated CI; permissions/scopes, state cycles, replay, audit/receipt rollback, cash payment/custody and two independent connection races |
| Client helper retries | PASS — 8 checks | Actual helper source in Node VM; no real browser/Auth session |
| Synthetic backup/restore | PASS | pg_dump restored into a second isolated database; 9 receipts restored |
| Packaged Windows ZIP runtime | PASS | Process A PID 3140 fully exits; Process B PID 1104 reads same SQLite sentinel |
| NSIS build and isolated installation | PASS | Installed only on fresh ephemeral Windows runner; installer exit code 0 |
| Installed Windows runtime/restart | PASS | Process A PID 6984 → full exit → Process B PID 4940; same SQLite sentinel, updater disabled and live HTTP/S blocked |
| Employee successful creation | FAIL / reproduced | Existing create payload omits required id and business_id; restored dependency schema rejects insert with 23502 |
| Employee tenant authorization | FAIL / reproduced in mocked handler | Exact smart-function v2 source reaches mock Auth creation for another tenant's admin targeting branch22; actor lookup/branch authorization are not tenant-scoped |
| Employee Auth/login/atomic permissions | NOT RUN / NOT PROVEN | No real Auth account created; mock contract tests do not establish live Auth behavior |
| Website pickup/delivery → cashier UI | NOT RUN / BLOCKED | No authenticated isolated POS Beta session or private ingress preserving closed public intake |
| Production / SH-0005/06/07/08 changes | None | No physical device, production, license/fingerprint or operational test-data cleanup action |

The SQL fixture restores **21 deployed table column definitions**, selected PK/check constraints, canonical function definitions and selected real triggers. It adds synthetic membership/Auth claims, businesses, profile and feature data. This is **not a full Beta schema/data clone**, and it does not prove real Supabase Auth/PostgREST or website acceptance/UI behavior.

CI success certifies the checks above; it does **not** certify successful staff provisioning or live prelaunch readiness.

## CI and artifacts

- Native PG16 / Windows ZIP: [run 38482765303](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38482765303), tested application/SQL source `61c40657c75477e61be368b62242791595156570`.
- NSIS installer / installed runtime: [run 38483513742](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38483513742), packaging commit `55d59b4d895c74e09079261952eb8be65d7b228c`. Application code is unchanged from the tested source.
- PG16 artifact: `11858646556`, archive SHA256 `2bc0b12ebe23b6ad053f80525c523093e56aace5f7834418d0815dcdb3308f6a`.
- Windows ZIP evidence artifact: `11857677724`, archive SHA256 `cea00992e65f333fe8192d597a7465f9f47199648b909a506c5b319faef4bc9c`.
- Installer artifact: `11858337897`, archive SHA256 `58bd64a64ba7961a88644ae0e76e1fc385cd8f18ef2133614af644e1c1430601`.
- Installer SHA256: `c2f0801c93fa0aabb0d8f9796cf70fad68372085697ec287a63a9f7b3683e500`; size 75,035,838 bytes. A renamed download retains identical bytes.
- Evidence result files are in the corresponding CI artifacts. No GitHub release/tag or production update feed was published.

## Live state and preserved data

At 2026-10-13 23:24:07 UTC: intake closed, 5,860 customers, 4,838 addresses, 13 existing orders, aggregate order total 2,955; both new RPCs absent.

Inspection found `orders_open=true` from a 2026-10-11 change. Only Top Chicken branch22's setting was closed at 2026-10-13 22:43:29 UTC, per the user's mandatory closed-intake condition. No order/customer/address/product/device row was changed. No import was repeated and no operational test data was deleted.

The live operational profile identity still belongs to another Beta business, not Top Chicken. It was **not rebound**. The new source candidates intentionally fail preflight/runtime until an independently verified, correctly scoped Top Chicken binding is available.

## Commits and exact continuation

1. `0f849d82c19c0f705890d35e1955392c795773bd`: guarded assignment/status wrappers, source retry logic and isolated runners.
2. `65b9618edda96d65732b2e9cf95c41ce66fe564b`: native PG / packaged Electron runner corrections and staff contract reproduction.
3. `61c40657c75477e61be368b62242791595156570`: test-build SQLite temporary-file fix and fail-closed operational-profile gate.
4. `55d59b4d895c74e09079261952eb8be65d7b228c`: isolated NSIS build/install verification workflow.
5. Subsequent documentation-only commit records this final evidence; tested application/SQL bytes remain at commit 3.

Next work is limited to: correct Top Chicken-specific profile/feature authorization without rebinding another activity; atomic tenant-scoped employee/Auth/branches/permissions/membership provisioning with isolated verification; authenticated private website-to-cashier pickup and delivery tests preserving closed intake. Then reconsider Beta migration/deployment eligibility. Physical SH-0008 installation still requires the user's approval after the complete required checks.

No production/device changes, cleanup, counter reset or public-intake opening are authorized by this report.
