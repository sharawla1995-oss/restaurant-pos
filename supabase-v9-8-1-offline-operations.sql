-- Top Burger POS V9.8.1 - Offline Operations
-- Run after V9.8.0. Safe to re-run.

alter table public.returns add column if not exists client_tx_id text;
create unique index if not exists returns_client_tx_id_uidx on public.returns(client_tx_id) where client_tx_id is not null;

alter table public.expenses add column if not exists client_tx_id text;
create unique index if not exists expenses_client_tx_id_uidx on public.expenses(client_tx_id) where client_tx_id is not null;

create or replace function public.create_order_return_idempotent(
  p_order_id bigint, p_reason text, p_notes text, p_items jsonb, p_payments jsonb, p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select id into v_id from public.returns where client_tx_id=v_key limit 1;
  if v_id is not null then return v_id; end if;
  v_id:=public.create_order_return(p_order_id,p_reason,p_notes,p_items,p_payments);
  update public.returns set client_tx_id=v_key where id=v_id;
  return v_id;
end; $$;
revoke all on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) from public;
grant execute on function public.create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.create_pos_expense_idempotent(
  p_shift_id bigint, p_description text, p_amount numeric, p_client_tx_id text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_emp bigint; v_branch bigint; v_row public.expenses%rowtype; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
  if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
  if nullif(trim(coalesce(p_description,'')),'') is null then raise exception 'بيان المصروف مطلوب'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'قيمة المصروف غير صحيحة'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_row from public.expenses where client_tx_id=v_key limit 1;
  if found then return to_jsonb(v_row); end if;
  select branch_id into v_branch from public.shifts where id=p_shift_id and employee_id=v_emp and status='open' and closed_at is null;
  if v_branch is null then raise exception 'الوردية غير مفتوحة أو غير مطابقة للموظف'; end if;
  if not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
  insert into public.expenses(branch_id,employee_id,shift_id,description,amount,client_tx_id)
  values(v_branch,v_emp,p_shift_id,trim(p_description),p_amount,v_key) returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.create_pos_expense_idempotent(bigint,text,numeric,text) from public;
grant execute on function public.create_pos_expense_idempotent(bigint,text,numeric,text) to authenticated;

notify pgrst,'reload schema';
