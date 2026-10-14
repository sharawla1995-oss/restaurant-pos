# Top Chicken Beta: staff and operational identity candidate

Baseline: `a94fdcd4f9cdefdd7a4952f357a45c450d47128c` on `codex/top-chicken-sh0008-prelaunch-fixes`.
Scope: Beta `xihcxydjnzemflhedzor`, business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22. Source and isolated CI only. No hosted SQL/Edge deployment, Cloud license changes, physical device access, deletion, or public intake change is authorized by this candidate.

## Fixes

- Staff handler verifies the bearer with Auth, then service-only SQL independently verifies an active TC administrator, membership and branch 22. The server reserves an Auth UUID and creates exactly one employee/branch/membership and explicit page/action permissions in a single operational transaction.
- A durable actor/body/password HMAC receipt supports retries after lost responses and permission-write failures. No plaintext password is persisted by the receipt; no failed Auth account is deleted. Auth and operational SQL remain separate transactions; a failed completion retains the reservation for safe recovery.
- Username login validates active TC membership before and after password authentication. The TC route supports cashier usernames; other activities retain the original email login path.
- Legacy staff handler fences TC actors, TC targets and branch 22 before Auth mutations. Other activity password/login behavior is checked separately.
- A private Cloud-derived TC operational binding/cache leaves the existing singleton and another activity's binding untouched. Shared accessors select the TC cache only for a server-verified TC request; original fallback bodies are retained with exact-definition drift guards.

## Executed locally before CI

| Check | Result | Evidence / limitation |
|---|---|---|
| Affected order-owner SQL compilation, authority, retry, finance guards | PASS | `evidence/top-chicken/pg16-affected-results.json`: 30 checks on PGlite/PostgreSQL16 WASM, not native or concurrency proof |
| Staff creation, permissions, denial, retry and rollback | PASS | `new-staff-local-results.json`; actual SQL and handler, Auth simulated locally; native role/RLS proof pending CI |
| Administrator creates cashier through POS form; new username login | PASS | Actual Chromium POS UI, loopback SQL adapter |
| Website pickup and delivery through cashier and fulfillment | PASS | Actual storefront snapshot + POS UI; totals 90/100 and delivery custody 100; no physical printing |
| Closed synthetic intake | PASS | Fixture closes intake and has exactly two website orders |
| Legacy TC fences / other activity login and password compatibility | PASS | Six handler tests with mocked service clients |
| Version/source checks | PASS | `npm run check`, Node syntax and whitespace checks |
| Native PG16 + actual local GoTrue | PENDING | New isolated CI job, no hosted credentials |
| Final Windows ZIP + NSIS | PENDING | Build/ASAR/hash checks in isolated Windows CI; no installation |

Storefront snapshot provenance: `sharawla1995-oss/top-burger-website`, branch `codex/top-chicken-multitenant-beta-staging`, commit `fa1537646aa0c5e1177910314b8595c3b2da3af5`. This is read-only source provenance; that repository and hosting were not modified. The DB fixture restores relevant schema, constraints, functions, triggers and RLS from read-only metadata, with synthetic rows and test sequences. It is a dependency subset, not a full live database clone. Browser calls go through a loopback SQL adapter rather than a hosted PostgREST endpoint. Licensing uses only `LOCAL-E2E-SYNTHETIC`; no SH device identity is used.

## Closed tests retained

Native PG16/backup closure: run `38482765303`, commit `61c40657c75477e61be368b62242791595156570`. Windows installer/restart closure: run `38483513742`, commit `55d59b4d895c74e09079261952eb8be65d7b228c`. Only affected order authorization/profile SQL is rerun. Client retry, backup/restore, SQLite process restart and installation are not rerun; `main.js`, `preload.js`, and the prelaunch build config remain unchanged.

## Separate live publication gate

These are source candidates. After CI passes, review the exact commit and evidence before any hosted deployment. The candidate order is TC binding → canonical owner IDs → status/driver RPCs → staff SQL → dedicated staff Edge function and legacy TC fence. Dedicated login config uses `verify_jwt=false`; every privileged operation verifies its bearer inside the handler and its actor again in SQL. SQL drift guards reject changed live owner/profile definitions. No test rows or live records are to be deleted without backup and explicit final approval. Public intake stays closed and SH-0005/6/7/8 are untouched.
