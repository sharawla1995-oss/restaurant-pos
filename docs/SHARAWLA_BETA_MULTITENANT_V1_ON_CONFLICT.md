# Sharawla Beta Multi-Tenant V1 — ON CONFLICT ownership mapping

Status: **SOURCE PREP / NOT DEPLOYED**

Live Beta contains **65** public functions with `ON CONFLICT`.

This generated draft:
- excludes `update_business_settings`, which is already replaced by the dedicated tenant settings draft;
- excludes `retail_create_website_order`, which is replaced by the dedicated retail public RPC draft;
- patches **59** live function definitions that contain explicit conflict targets;
- rewrites **73** explicit conflict targets to include `business_id`;
- observes **6** targetless `ON CONFLICT DO NOTHING` occurrences in the non-excluded set and deliberately does not guess a target.

The tenant-scoped conflict targets depend on the shadow unique phase, including the newly added shadows for natural/non-surrogate primary keys.

Targetless DO NOTHING remains acceptable only after old global non-primary unique indexes are removed or proven surrogate/parent-id safe. The final unique cutover therefore remains blocked until that proof is complete.
