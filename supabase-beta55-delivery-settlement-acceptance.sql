-- Sharawla POS 10.5.4-beta.55
-- Isolated acceptance helpers for Delivery Settlement + Shift Cash.
-- Sandbox test data is tagged by run id and removable without touching real rows.

begin;

create or replace function public.sharawla_beta55_delivery_acceptance_cleanup_v1(p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run text:=nullif(trim(coalesce(p_run_id,'')),'');
  v_marker text;
  v_driver_ids bigint[];
  v_order_ids bigint[];
  v_shift_ids bigint[];
  v_settlement_ids bigint[];
  v_residue integer:=0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Acceptance admin session required'; end if;
  if v_run is null or v_run !~ '^ACC-[A-Za-z0-9-]+$' then raise exception 'Invalid acceptance run id'; end if;
  v_marker:='SHARAWLA_ACCEPTANCE:'||v_run||':B55DS';

  select array_agg(id) into v_driver_ids from public.delivery_drivers where name=v_marker;
  select array_agg(id) into v_order_ids from public.orders where customer_name like v_marker||':%';
  -- Source shifts are stable sandbox fixture infrastructure because operational shift history is immutable.\n  select array_agg(id) into v_shift_ids from public.shifts where close_notes in ('SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S1','SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S2');
  select array_agg(id) into v_settlement_ids from public.driver_settlements
   where client_tx_id like v_run||'-B55DS-%'
      or (v_driver_ids is not null and driver_id=any(v_driver_ids));

  if v_settlement_ids is not null then
    delete from public.driver_settlement_items where settlement_id=any(v_settlement_ids);
    delete from public.driver_settlements where id=any(v_settlement_ids);
  end if;
  if v_order_ids is not null then
    delete from public.delivery_payment_events where order_id=any(v_order_ids);
    delete from public.order_payments where order_id=any(v_order_ids);
    delete from public.order_item_modifiers where order_item_id in (select id from public.order_items where order_id=any(v_order_ids));
    delete from public.order_items where order_id=any(v_order_ids);
    delete from public.orders where id=any(v_order_ids);
  end if;
  delete from public.audit_logs
   where coalesce(details->>'client_tx_id','') like v_run||'-B55DS-%'
      or (entity_type='delivery_driver' and v_driver_ids is not null and entity_id=any(v_driver_ids));
  if v_driver_ids is not null then delete from public.delivery_drivers where id=any(v_driver_ids); end if;
  -- Never DELETE shifts: Permissions V2 intentionally makes shift history immutable.

  select
    (select count(*) from public.delivery_drivers where name=v_marker)
   +(select count(*) from public.orders where customer_name like v_marker||':%')
   +0 -- stable source shifts are fixture infrastructure, not per-run residue
   +(select count(*) from public.driver_settlements where client_tx_id like v_run||'-B55DS-%')
   +(select count(*) from public.delivery_payment_events where client_tx_id like v_run||'-B55DS-%')
  into v_residue;

  return jsonb_build_object('ok',v_residue=0,'residue',v_residue);
end;
$$;

create or replace function public.sharawla_beta55_delivery_acceptance_fixture_v1(
  p_run_id text,
  p_branch_id bigint
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run text:=nullif(trim(coalesce(p_run_id,'')),'');
  v_marker text;
  v_emp bigint;
  v_receiving_shift bigint;
  v_driver bigint;
  v_s1 bigint;
  v_s2 bigint;
  v_a bigint;
  v_b bigint;
  v_c bigint;
  v_d bigint;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Acceptance admin session required'; end if;
  if v_run is null or v_run !~ '^ACC-[A-Za-z0-9-]+$' then raise exception 'Invalid acceptance run id'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'Acceptance branch access required'; end if;
  v_emp:=public.current_employee_id(); if v_emp is null then raise exception 'Acceptance employee missing'; end if;
  v_marker:='SHARAWLA_ACCEPTANCE:'||v_run||':B55DS';

  perform public.sharawla_beta55_delivery_acceptance_cleanup_v1(v_run);

  select id into v_receiving_shift from public.shifts
   where branch_id=p_branch_id and employee_id=v_emp and status='open' and closed_at is null
   order by opened_at desc limit 1;
  if v_receiving_shift is null then raise exception 'Acceptance requires a current open receiving shift'; end if;

  insert into public.delivery_drivers(name,phone,branch_id,active)
  values(v_marker,null,p_branch_id,true) returning id into v_driver;

  select id into v_s1 from public.shifts where branch_id=p_branch_id and close_notes='SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S1' order by id limit 1;
  if v_s1 is null then
    insert into public.shifts(branch_id,employee_id,opening_cash,status,opened_at,closed_at,closed_by_employee_id,close_notes)
    values(p_branch_id,v_emp,0,'closed',now()-interval '4 hours',now()-interval '3 hours',v_emp,'SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S1') returning id into v_s1;
  end if;
  select id into v_s2 from public.shifts where branch_id=p_branch_id and close_notes='SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S2' order by id limit 1;
  if v_s2 is null then
    insert into public.shifts(branch_id,employee_id,opening_cash,status,opened_at,closed_at,closed_by_employee_id,close_notes)
    values(p_branch_id,v_emp,0,'closed',now()-interval '3 hours',now()-interval '2 hours',v_emp,'SHARAWLA_ACCEPTANCE:B55DS:SOURCE:S2') returning id into v_s2;
  end if;

  insert into public.orders(branch_id,employee_id,shift_id,order_type,payment_method,subtotal,total,status,source,payment_status,driver_id,assigned_at,customer_name,notes)
  values(p_branch_id,v_emp,v_s1,'delivery','cash',100,100,'out_for_delivery','pos','confirmed',v_driver,now(),v_marker||':A',v_marker)
  returning id into v_a;
  insert into public.order_payments(order_id,method,amount) values(v_a,'cash',100);

  insert into public.orders(branch_id,employee_id,shift_id,order_type,payment_method,subtotal,total,status,source,payment_status,driver_id,assigned_at,customer_name,notes)
  values(p_branch_id,v_emp,v_s1,'delivery','instapay',80,80,'out_for_delivery','pos','confirmed',v_driver,now(),v_marker||':B',v_marker)
  returning id into v_b;
  insert into public.order_payments(order_id,method,amount) values(v_b,'instapay',80);

  insert into public.orders(branch_id,employee_id,shift_id,order_type,payment_method,subtotal,total,status,source,payment_status,driver_id,assigned_at,customer_name,notes)
  values(p_branch_id,v_emp,v_s2,'delivery','cash',60,60,'out_for_delivery','pos','confirmed',v_driver,now(),v_marker||':C',v_marker)
  returning id into v_c;
  insert into public.order_payments(order_id,method,amount) values(v_c,'cash',60);

  insert into public.orders(branch_id,employee_id,shift_id,order_type,payment_method,subtotal,total,status,source,payment_status,driver_id,assigned_at,customer_name,notes)
  values(p_branch_id,v_emp,v_s2,'delivery','cash',70,70,'out_for_delivery','pos','confirmed',v_driver,now(),v_marker||':D',v_marker)
  returning id into v_d;
  insert into public.order_payments(order_id,method,amount) values(v_d,'cash',70);

  return jsonb_build_object('ok',true,'branch_id',p_branch_id,'employee_id',v_emp,
    'receiving_shift_id',v_receiving_shift,'driver_id',v_driver,'source_shift_1',v_s1,'source_shift_2',v_s2,
    'order_a',v_a,'order_b',v_b,'order_c',v_c,'order_d',v_d);
end;
$$;


create or replace function public.sharawla_beta58_offline_driver_fixture_v1(p_run_id text,p_branch_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $
declare v_run text:=nullif(trim(coalesce(p_run_id,'')),''); v_emp bigint; v_shift bigint; v_driver bigint; v_order bigint; v_marker text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acceptance admin session required'; end if;
 if v_run is null or v_run !~ '^ACC-[A-Za-z0-9-]+
revoke all on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) from public;
grant execute on function public.sharawla_beta55_delivery_acceptance_cleanup_v1(text) to authenticated;
grant execute on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) to authenticated;

notify pgrst,'reload schema';
commit;
 then raise exception 'Invalid acceptance run id'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'Acceptance branch access required'; end if;
 v_emp:=public.current_employee_id(); v_marker:='SHARAWLA_ACCEPTANCE:'||v_run||':B58OD';
 select id into v_shift from public.shifts where branch_id=p_branch_id and employee_id=v_emp and status='open' and closed_at is null order by opened_at desc limit 1;
 if v_shift is null then raise exception 'Acceptance requires open shift'; end if;
 delete from public.delivery_drivers where name=v_marker and not exists(select 1 from public.orders where driver_id=delivery_drivers.id);
 insert into public.delivery_drivers(name,branch_id,active) values(v_marker,p_branch_id,true) returning id into v_driver;
 insert into public.orders(branch_id,employee_id,shift_id,order_type,payment_method,subtotal,total,status,source,payment_status,customer_name,notes)
 values(p_branch_id,v_emp,v_shift,'delivery','cash',1,1,'ready','pos','confirmed',v_marker,v_marker) returning id into v_order;
 return jsonb_build_object('ok',true,'order_id',v_order,'driver_id',v_driver);
end $;
revoke all on function public.sharawla_beta58_offline_driver_fixture_v1(text,bigint) from public;
grant execute on function public.sharawla_beta58_offline_driver_fixture_v1(text,bigint) to authenticated;

revoke all on function public.sharawla_beta55_delivery_acceptance_cleanup_v1(text) from public;
revoke all on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) from public;
grant execute on function public.sharawla_beta55_delivery_acceptance_cleanup_v1(text) to authenticated;
grant execute on function public.sharawla_beta55_delivery_acceptance_fixture_v1(text,bigint) to authenticated;

notify pgrst,'reload schema';
commit;
