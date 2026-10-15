# Top Chicken SH-0008 rc.9 — Independent Approval Manifest

**State: NO-GO / source reviewed, Windows and synthetic PG17 CI PASS, no Cloud deploy.**
Prepared 2026-10-15 on branch `codex/top-chicken-sh0008-rc9-prelaunch-no-deploy`. The branch descends from source-only repair PR #45; Windows RC9 draft PR #46 remains unmerged. This manifest is for reviewing *specific* artifacts, **not approval for any operation**.

## Immutable review targets (Git blob SHA-1, not SHA-256)

| Payload | Reviewed Git blob SHA-1 |
| --- | --- |
| `review-only/top-chicken-sh0008-staff-create-NO-DEPLOY.sql` | `9208b2387d33f7d2dde739be881cca4676a855d6` |
| `review-only/top-chicken-sh0008-staff-manage-NO-DEPLOY.sql` | `9caa952bb3c5793643d277ddee8bf5950342e84a` |
| `review-only/top-chicken-sh0008-tenant-feature-owner-NO-DEPLOY.sql` | `28b784c2b0a202f88ded8a190575a199b43b0c33` |
| `review-only/top-chicken-sh0008-quantity-additive-NO-DEPLOY.sql` | `9f9a435dcd66acc38372cd4a090376690fcc9de8` |
| `supabase/functions/top-chicken-staff/index.ts` | `f61d0d6612a2040392f9e581f57daef65c78c77d` |
| `supabase/functions/top-chicken-staff/staff-domain.mjs` | `10da9940245229e807d0be2d24a0ee59fb2b50f7` |
| `review-only/top-chicken-sh0008-beta-live-readonly-preflight.sql` | `1ff85ca6e24a975ea962ddee205ef2cdda10bcae` |

**Never mistake Git blobs for authorization.** Before any future independently approved apply, operator must retrieve exact review commit, compute SHA-256 of the bytes actually being submitted, compare with a separately approved manifest, verify the live Beta schema fingerprints and replay tested candidate on an **actual isolated PG17 restore** (not synthetic PG17 fixture), then obtain fresh independent SQL/Edge/entitlement/device approvals. Any content drift voids prior review.

## Recorded read-only live Beta baseline

- Project: `xihcxydjnzemflhedzor`, PostgreSQL 17.6; Top Chicken business `5358328c-9724-49aa-affc-1bce8be90f92`, branch 22; legacy Beta singleton business `91826502-590e-4afa-8826-2c0f4b99c490` **unaltered**.
- `review-only/top-chicken-sh0008-beta-live-readonly-preflight.sql` was executed as SELECT and `baseline_unchanged_read_only=true`, each individual check true.
- Base public-column MD5 `5a71a81c355c402584779bc2b94a20dc`; 7 owner-function MD5 `533f9fcba11cc581b4fa28f7cc30933d`; 15 RLS-policy MD5 `4b88fb8cc418e7568f003a8c50ec36a8`. Fingerprints describe a **still-unpatched** state.
- Two Top Chicken employees, two memberships, zero tenant feature grants. Staff create/manage receipts absent; `order_item_modifiers.quantity` absent; `top-chicken-staff` Edge absent; real website intake OFF. No employee, order, entitlement, or queue was changed in this review.

## Evidence

- Dedicated Windows x64 `10.5.19-rc.9` CI **SUCCESS**: [run 38675218014](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38675218014), fresh process/in-place `10.5.15 → rc.8 → rc.9`, preserved synthetic SQLite.
- Windows installer (test artifact ONLY): `Top-Chicken-SH0008-Primary-10.5.19-rc.9.exe`, byte size 75,221,246; installer SHA-256 `f82a63ea6509aadf36855330a974f8633d8dbcaa9de86b461c4bc0c4a9a4c927`. GitHub Actions artifact 11946000881, temporary, not an approved release/feed.
- Synthetic PostgreSQL17 after new corrections **SUCCESS**: [run 38677377435](https://github.com/sharawla1995-oss/restaurant-pos/actions/runs/38677377435), both staff and quantity/feature tests. Inactive new staff membership fails closed; unsigned/unresolved authenticated tenant cannot borrow legacy entitlements. Verified legacy tenant parity was preserved by tests.
- Existing system's verified **non-Top-Chicken** business behavior still follows the pre-existing legacy singleton fallback in the candidate; this is not proof of complete multi-tenant authorization on every historical path. No shared Restaurant Profile replacement.

## Independently approved order of operations

1. **Backup and restore:** operator with approved credentials performs encrypted PG17 logical Beta backup, restores it into isolated PG17, demonstrates data/schema/RLS/function/receipt parity and performs rollback rehearsal. Never put credentials or customer data in GitHub logs/chat. Do not overwrite a live database.
2. **SQL authorization:** after exact SHA-256 validation and restored-copy tests, separately approve explicit ordered SQL patches; check impact on shared tables/functions and accepted other-tenant owners. No re-running already applied migrations.
3. **Cloud entitlements authorization:** review individual Top Chicken feature codes and revocation/expiration behavior; authenticated + audited Central Admin control plane only, never direct SQL entitlements, never blindly clone 36 legacy grants. Apply exactly reviewed tenant codes, preserve other businesses/devices.
4. **Dedicated Edge authorization:** deploy `top-chicken-staff` **Beta only** after SQL/entitlements; ensure JWT verification and backend service-role isolation. Never modify existing `smart-function` or HR for other tenants as a shortcut.
5. **Hosted test authorization:** create disposable employee with approved test email, prove real login/permissions and cross-tenant denials; exercise website→POS pickup+delivery from disabled/public intake to isolated test mode; keep real orders OFF. Staff password reset remains intentionally FAIL-CLOSED until separately implemented.
6. **Local queue/device authorization:** inspect SH-0008's pending durable offline receipt and secure actual local SQLite backup; never wipe/replay until proven idempotent. After read-only diagnostic and backup verification, independently approve device update plus dedicated release manifest. Never modify SH-0005/06/07 or Top Burger Production.

**No authorized operator backup/restore facility was available in this tool session. There is NO real Beta backup, restored-copy test, SQL/Edge apply, entitlement grant, new real user, website E2E, physical SH-0008 installation, approved GitHub Release, or updater-feed promotion. Do NOT install or offer this candidate as live.**
