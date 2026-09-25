# Point4 Collision Scan Scope Correction

The 46-contract manifest checker previously scanned every root SQL file in the repository.
That made unrelated later acceptance/deployment-history artifacts appear as unresolved
collisions even though the manifest's own final-definition simulation remained exact.

Collision discovery is now scoped to the manifest's declared provenance universe:
each accepted effective owner plus the files explicitly listed in its `supersedes` chain.
This preserves collision detection for the frozen Point4 contract while preventing unrelated
future SQL artifacts from changing a historical gate merely by existing in the repository.

No contract, owner, blob, deployment plan, database object, or production runtime is changed.
