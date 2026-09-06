-- V8.7.3: allow authenticated staff to read only branches they can access.
-- Safe to run more than once.

grant usage on schema public to authenticated;
grant select on table public.branches to authenticated;

alter table public.branches enable row level security;

drop policy if exists branches_staff_read on public.branches;
create policy branches_staff_read
on public.branches
for select
to authenticated
using (
  public.is_admin()
  or public.has_branch_access(id)
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.active = true
      and e.branch_id = branches.id
  )
);

notify pgrst, 'reload schema';
