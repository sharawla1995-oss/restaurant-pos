# Permissions V2 — Controlled Beta Deployment Order

Status: PRE-DEPLOYMENT PLAN ONLY — NO DATABASE WRITE AUTHORIZED BY THIS FILE
Target: isolated SH-0007 Beta operational backend only
Production SH-0005 / SH-0006: forbidden
Runtime baseline: 10.5.4-beta.58.29

## Dependency-safe order

1. permissions-v2-profile-feature-applicability.sql
2. permissions-v2-trusted-profile-binding.sql
3. permissions-v2-effective-evaluator.sql
4. permissions-v2-ui-filtering.sql
5. permissions-v2-role-defaults.sql
6. permissions-v2-owner-customers-create.sql
7. permissions-v2-owner-customers-edit-address.sql
8. permissions-v2-owner-shifts-expenses.sql
9. permissions-v2-owner-delivery-settings.sql
10. permissions-v2-owner-order-fulfillment.sql
11. permissions-v2-owner-order-driver-assignment.sql
12. permissions-v2-owner-website-payment-review.sql
13. permissions-v2-offline-order-status-owner.sql
14. permissions-v2-orders-privilege-closure.sql — MUST BE LAST

## Hard gates

Before first DB write: verify Beta backend identity, trusted Restaurant profile, prerequisite tables/functions, exact source HEAD, and accepted Runtime baseline.
After each artifact: verify created/replaced definitions and required grants without continuing on mismatch.
The Orders privilege closure is last because direct authenticated UPDATE must remain available until all specialized owners and Offline order-status owner exist.
No Cloud mutation, Canonical Stock activation, Cutover, Production access, device identity change, updater change, or printing change is part of this deployment.

## Roll-forward rule

Stop on the first failed prerequisite or post-deploy verification. Do not compensate by weakening a guard or restoring broad table authority without a separately reviewed recovery artifact.
