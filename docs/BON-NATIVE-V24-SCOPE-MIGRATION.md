# Native Bon V2.4 Scope Schema Migration

Status: SOURCE FIX / DEPLOYMENT 0

A deployability review found that the original SQLite reservation table declared shift identity columns NOT NULL. BRANCH-scoped reservations intentionally have no shift owner, so an upgraded database could reject a valid BRANCH reservation even though the runtime was scope-aware.

Fresh databases now create those two shift columns nullable. Existing databases are detected with PRAGMA table_info. Only when the legacy NOT NULL shape is present, the Native store rebuilds the reservation and consumption tables inside one BEGIN IMMEDIATE transaction, copies all rows, restores the foreign-key relationship and indexes, and commits. Any error rolls the whole migration back.

No reservation or consumption is intentionally deleted. SHIFT rows remain constrained to valid shift identity; BRANCH rows may keep shift identity null. This is source only and has not been run on SH-0007 or Production.
