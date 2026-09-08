-- Top Burger POS Windows V10.3 - idempotent offline shift sync
alter table public.shifts add column if not exists client_open_tx_id text;
alter table public.shifts add column if not exists client_close_tx_id text;
create unique index if not exists shifts_client_open_tx_uidx on public.shifts(client_open_tx_id) where client_open_tx_id is not null;
create unique index if not exists shifts_client_close_tx_uidx on public.shifts(client_close_tx_id) where client_close_tx_id is not null;

create or replace function public.open_pos_shift_idempotent(p_branch_id bigint,p_opening_cash numeric,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_row public.shifts%rowtype;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 if coalesce(p_opening_cash,0)<0 then raise exception 'عهدة البداية غير صحيحة'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select * into v_row from public.shifts where client_open_tx_id=v_key limit 1; if found then return to_jsonb(v_row); end if;
 if exists(select 1 from public.shifts where employee_id=v_emp and branch_id=p_branch_id and status='open' and closed_at is null) then raise exception 'يوجد وردية مفتوحة بالفعل'; end if;
 insert into public.shifts(branch_id,employee_id,opening_cash,status,client_open_tx_id) values(p_branch_id,v_emp,coalesce(p_opening_cash,0),'open',v_key) returning * into v_row;
 return to_jsonb(v_row);
end $$;

create or replace function public.close_pos_shift_idempotent(p_shift_id bigint,p_closing_cash numeric,p_metrics jsonb,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_emp bigint; v_key text:=nullif(trim(coalesce(p_client_tx_id,'')),''); v_row public.shifts%rowtype;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
 if v_key is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select * into v_row from public.shifts where client_close_tx_id=v_key limit 1; if found then return to_jsonb(v_row); end if;
 select * into v_row from public.shifts where id=p_shift_id and employee_id=v_emp for update;
 if not found then raise exception 'الوردية غير موجودة أو غير مطابقة للموظف'; end if;
 if v_row.status='closed' and v_row.closed_at is not null then return to_jsonb(v_row); end if;
 update public.shifts set closing_cash=p_closing_cash,closed_at=now(),status='closed',closed_by_employee_id=v_emp,
 sales_total=coalesce((p_metrics->>'sales_total')::numeric,0),cash_sales=coalesce((p_metrics->>'cash_sales')::numeric,0),wallet_sales=coalesce((p_metrics->>'wallet_sales')::numeric,0),instapay_sales=coalesce((p_metrics->>'instapay_sales')::numeric,0),expenses_total=coalesce((p_metrics->>'expenses_total')::numeric,0),expected_cash=coalesce((p_metrics->>'expected_cash')::numeric,0),cash_difference=coalesce((p_metrics->>'cash_difference')::numeric,0),orders_count=coalesce((p_metrics->>'orders_count')::integer,0),client_close_tx_id=v_key where id=p_shift_id returning * into v_row;
 return to_jsonb(v_row);
end $$;
revoke all on function public.open_pos_shift_idempotent(bigint,numeric,text) from public;
grant execute on function public.open_pos_shift_idempotent(bigint,numeric,text) to authenticated;
revoke all on function public.close_pos_shift_idempotent(bigint,numeric,jsonb,text) from public;
grant execute on function public.close_pos_shift_idempotent(bigint,numeric,jsonb,text) to authenticated;
notify pgrst,'reload schema';
