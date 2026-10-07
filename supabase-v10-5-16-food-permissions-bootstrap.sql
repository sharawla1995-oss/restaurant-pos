-- V10.5.16 Production — minimal Action Permission V2 bootstrap for Restaurant Food only
begin;

create table if not exists public.permission_actions_v2(
  code text primary key,
  name_ar text not null,
  domain text not null,
  legacy_permission text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint permission_actions_v2_code_not_blank check(trim(code)<>'')
);

create table if not exists public.employee_action_permissions_v2(
  employee_id bigint not null references public.employees(id) on delete cascade,
  action_code text not null references public.permission_actions_v2(code) on delete cascade,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  primary key(employee_id,action_code)
);

create or replace function public.has_action_permission_v2(p_action_code text)
returns boolean language plpgsql stable security definer set search_path=public
as $$
declare e bigint;v boolean;legacy text;
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  e:=public.current_employee_id(); if e is null then return false; end if;
  select allowed into v from public.employee_action_permissions_v2 where employee_id=e and action_code=p_action_code;
  if found then return v; end if;
  select legacy_permission into legacy from public.permission_actions_v2 where code=p_action_code and active=true;
  if legacy is null then return false; end if;
  return public.has_permission(legacy);
end;$$;

create or replace function public.admin_set_employee_action_permission_v2(p_employee_id bigint,p_action_code text,p_allowed boolean)
returns boolean language plpgsql security definer set search_path=public
as $$begin
  if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and active is distinct from false) then raise exception 'الموظف غير موجود أو موقوف'; end if;
  if not exists(select 1 from public.permission_actions_v2 where code=p_action_code and active=true) then raise exception 'الصلاحية غير موجودة'; end if;
  insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
  values(p_employee_id,p_action_code,p_allowed,now())
  on conflict(employee_id,action_code) do update set allowed=excluded.allowed,updated_at=now();
  return true;
end;$$;

create or replace function public.admin_reset_employee_action_permission_v2(p_employee_id bigint,p_action_code text)
returns boolean language plpgsql security definer set search_path=public
as $$begin
  if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
  delete from public.employee_action_permissions_v2 where employee_id=p_employee_id and action_code=p_action_code;
  return true;
end;$$;

alter table public.permission_actions_v2 enable row level security;
alter table public.employee_action_permissions_v2 enable row level security;
drop policy if exists permission_actions_v2_read on public.permission_actions_v2;
create policy permission_actions_v2_read on public.permission_actions_v2 for select to authenticated using(active=true);
drop policy if exists employee_action_permissions_v2_read on public.employee_action_permissions_v2;
create policy employee_action_permissions_v2_read on public.employee_action_permissions_v2 for select to authenticated using(employee_id=public.current_employee_id() or public.is_admin());

revoke all on function public.has_action_permission_v2(text) from public,anon;
revoke all on function public.admin_set_employee_action_permission_v2(bigint,text,boolean) from public,anon;
revoke all on function public.admin_reset_employee_action_permission_v2(bigint,text) from public,anon;
grant select on public.permission_actions_v2,public.employee_action_permissions_v2 to authenticated;
grant execute on function public.has_action_permission_v2(text) to authenticated;
grant execute on function public.admin_set_employee_action_permission_v2(bigint,text,boolean) to authenticated;
grant execute on function public.admin_reset_employee_action_permission_v2(bigint,text) to authenticated;

commit;
