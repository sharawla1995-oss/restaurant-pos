Sharawla POS 10.5.4-beta.3 — FINAL PART 3 LEAN SOURCE

Purpose:
- Part 2 safety hotfix: Manual Check is true checkOnly and returns before asset selection/download/install dialog.
- Part 3: Backup Before Update + Offline Queue Guard.

Update safety flow:
1) Gate A: Offline Queue check before download.
2) Download update.
3) Gate B: Offline Queue check after download.
4) Create fail-closed Pre-Update Backup.
5) User clicks Install Now.
6) Gate C: final instant Offline Queue check immediately before installer spawn.
7) Installer starts only if Gate C is clear.

Protected runtime invariants:
- No Restaurant Engine behavior changes.
- No Runtime Core business logic changes.
- No licensing/canonical fingerprint changes.
- No Business Connection behavior changes.
- No printing/modules changes.

This LEAN package intentionally excludes historical README files, historical SQL migrations,
old patch ZIPs, and the one-off schema-export workflow. It contains only the current runtime,
version validation scripts, and Windows release build workflow needed for beta.3 build/test.

Status:
- Source validation: PASS.
- Runtime Part 3: NOT CLOSED until SH-0007 completes the full Gate A/B/Backup/C/Installer test.
