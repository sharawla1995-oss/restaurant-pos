# Sharawla Beta Multi-Tenant V1 — Unique/FK Cutover Plan

Status: **SOURCE PREP / NOT DEPLOYED**

The live Beta audit found:
- 591 public foreign keys.
- 55 natural/non-`id` primary keys.
- 187 non-primary unique indexes in the live schema query used for this gate, including 147 constraint-backed and 40 standalone indexes.

The cutover draft does not run until three explicit session guards are present. Its sequence is:

1. Prove every tenant-to-tenant legacy FK has a validated `mt1_` business-aware mirror.
2. Prove every global non-primary unique has an `mt1u_` business-scoped shadow.
3. Prove every natural/non-`id` primary key has an `mt1pk_` business-scoped shadow.
4. Drop legacy tenant-to-tenant FKs only after the mirrors are valid.
5. Rebuild natural primary keys as `(business_id, old_pk...)` using the prepared shadow index.
6. Remove legacy global non-primary uniqueness.
7. Prove the only remaining unscoped unique keys are simple surrogate `id` primary keys.

Simple surrogate `id` primary keys remain globally unique by design; tenant isolation is enforced by `business_id`, restrictive RLS and the composite tenant FK mirrors. This avoids renumbering existing rows and preserves SH-0007 references.
