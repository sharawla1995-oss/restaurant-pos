# Permissions V2 — Beta Pre-Deployment Verification Contract

Status: PRE-DEPLOYMENT GATE / NO DB WRITE
Target: isolated SH-0007 Beta only
Expected operational Profile: restaurant
Expected Runtime: 10.5.4-beta.58.29

Before applying artifact 1, collect READ-ONLY evidence and require all of the following:

- exact source HEAD matches the authorized deployment commit;
- target is the isolated Beta operational backend, never Production;
- trusted Cloud Business identity is the experimental Business and resolves to Profile restaurant;
- public.permission_actions_v2 exists;
- public.employee_action_permissions_v2 exists;
- public.employees / employee_permissions / branches / orders / website_orders / delivery_drivers / delivery_zones / shifts / expenses / customers / customer_addresses exist;
- public.current_employee_id(), current_employee_role(), is_admin(), has_permission(text), has_branch_access(bigint) exist;
- delivery_mark_delivered_v2(bigint,text,text) exists before Offline order-status owner;
- historical orders_branch_update is present before F5E closure;
- Canonical Stock and Cutover remain OFF;
- no prerequisite mismatch is repaired ad-hoc during deployment.

Binding/entitlement rows are deployment inputs, not invented by SQL artifacts. PV2-B deliberately creates no binding row and PV2-C creates no feature entitlement rows. The deployment must provision the exact trusted Beta Business/Profile binding and the enabled feature projection from authoritative Cloud evidence before PV2-E/owner acceptance.

Fail closed on any mismatch. Do not start artifact 1 until the read-only gate is PASS.
