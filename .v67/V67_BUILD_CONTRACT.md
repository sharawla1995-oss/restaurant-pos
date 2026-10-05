# SH-0007 V67 exact candidate build contract

Target: SH-0007 only. No merge, release, production, Supabase, migration, or device action.

Base source: Root-Cause candidate commit `2d174feff680c4ffc0dd6972036590d259f75626`.
Materialization order:
1. Three Offline Source Fixes packet.
2. Offline Closure Batch1 cumulative packet.
3. Batch1 Final Source Gaps packet.
4. V65 PostgreSQL-discovered dispatcher CASE parse fix.

Before build, every one of the 1036 V67 candidate files must match `V67_CANDIDATE_SHA256SUMS.txt` exactly. Extra build-control files under `.v67/` and the dedicated workflow are excluded from the source identity comparison.

Installer internal application version remains `10.5.4-beta.58.32` to keep the tested candidate source byte-identical. The artifact filename is suffixed `V67-SH0007` to prevent confusion with the old official baseline 58.32 installer.