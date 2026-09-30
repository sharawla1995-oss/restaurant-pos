-- Sharawla RC1 HR action-profile applicability corrective patch
-- Beta-only deployment candidate. Additive/idempotent; no destructive DDL.
begin;

insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
select a.code,p.profile_code,null,true
from (values
 ('hr.attendance.view'),('hr.attendance.manage'),('hr.attendance.adjust'),
 ('hr.schedules.view'),('hr.schedules.manage'),('hr.geofence.manage'),
 ('hr.staff_accounts.manage'),('hr.deduction_rules.view'),('hr.deduction_rules.manage'),
 ('hr.leave.view'),('hr.leave.manage'),('hr.reports.view'),('hr.settings.manage')
) as a(code)
cross join (
 select distinct profile_code
 from public.permission_action_profiles_v2
 where action_code='hr.employees.view' and active=true
) p
on conflict(action_code,profile_code) do update
set required_feature_code=excluded.required_feature_code,active=true;

commit;
