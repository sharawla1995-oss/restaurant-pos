-- Sharawla DFR-04 — Safe Activity Log read model
-- SOURCE ONLY. Raw audit_logs.details is never returned.
-- Baseline: 40511daacf42b8aed6201bd610f99f6d015d1a23

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order)
values('audit.activity.view','عرض سجل النشاط','audit','reports',820)
on conflict(code) do update set name_ar=excluded.name_ar,domain=excluded.domain,legacy_permission=excluded.legacy_permission,sort_order=excluded.sort_order,active=true;

create or replace function public.activity_log_read_v1(
  p_branch_id bigint,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 300
)
returns table(
  audit_id bigint,
  created_at timestamptz,
  employee_id bigint,
  employee_name text,
  action text,
  entity_type text,
  entity_id bigint,
  safe_summary jsonb
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not public.has_action_permission_v2('audit.activity.view') then raise exception 'ليس لديك صلاحية سجل النشاط'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'الفترة غير صحيحة'; end if;

  return query
  select a.id,
         a.created_at,
         a.employee_id,
         case when a.employee_id is null then null else coalesce(e.name,'موظف #'||a.employee_id::text) end,
         a.action,
         a.entity_type,
         a.entity_id,
         case a.action
           when 'create_order' then jsonb_strip_nulls(jsonb_build_object(
             'invoice_number',a.details->>'invoice_number',
             'bon_number',a.details->>'bon_number',
             'total',a.details->>'total',
             'payment',a.details->>'payment'
           ))
           else null
         end safe_summary
  from public.audit_logs a
  left join public.employees e on e.id=a.employee_id
  where a.branch_id=p_branch_id
    and a.created_at>=p_from and a.created_at<p_to
  order by a.created_at desc,a.id desc
  limit greatest(1,least(coalesce(p_limit,300),1000));
end;
$$;

revoke all on function public.activity_log_read_v1(bigint,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.activity_log_read_v1(bigint,timestamptz,timestamptz,integer) to authenticated;

commit;