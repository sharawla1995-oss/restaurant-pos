-- Sharawla POS 10.5.4-beta.54
-- Acceptance cleanup for Shared Core customer + manual treasury fixtures.
-- Exact ACC run only; admin only. Sandbox use only.

begin;

create or replace function public.sharawla_beta54_customer_acceptance_cleanup_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 marker text;
 ids bigint[]:=array[]::bigint[];
 d_audit integer:=0;
 d_customers integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح'; end if;
 marker:='SHARAWLA_ACCEPTANCE:'||r;

 select coalesce(array_agg(id),array[]::bigint[]) into ids
 from public.customers
 where name='Acceptance Customer '||r and notes=marker;

 delete from public.audit_logs
 where entity_type='customer' and entity_id=any(ids);
 get diagnostics d_audit=row_count;

 delete from public.customers
 where id=any(ids) and name='Acceptance Customer '||r and notes=marker;
 get diagnostics d_customers=row_count;

 return jsonb_build_object(
  'ok',true,'run_id',r,
  'deleted',jsonb_build_object('customers',d_customers,'audit',d_audit),
  'residue',(select count(*) from public.customers where name='Acceptance Customer '||r and notes=marker)
 );
end;$$;

grant execute on function public.sharawla_beta54_customer_acceptance_cleanup_v1(text) to authenticated;

create or replace function public.sharawla_beta54_treasury_acceptance_cleanup_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 ids bigint[]:=array[]::bigint[];
 d_audit integer:=0;
 d_treasury integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح'; end if;

 select coalesce(array_agg(id),array[]::bigint[]) into ids
 from public.treasury_movements
 where client_tx_id like r||'-%'
   and movement_type in ('cash_in','cash_out')
   and reference=r
   and notes='SHARAWLA_ACCEPTANCE:'||r;

 delete from public.audit_logs
 where entity_type='treasury_movement' and entity_id=any(ids);
 get diagnostics d_audit=row_count;

 delete from public.treasury_movements
 where id=any(ids)
   and client_tx_id like r||'-%'
   and movement_type in ('cash_in','cash_out')
   and reference=r
   and notes='SHARAWLA_ACCEPTANCE:'||r;
 get diagnostics d_treasury=row_count;

 return jsonb_build_object(
  'ok',true,'run_id',r,
  'deleted',jsonb_build_object('treasury',d_treasury,'audit',d_audit),
  'residue',(select count(*) from public.treasury_movements where client_tx_id like r||'-%' and movement_type in ('cash_in','cash_out') and reference=r and notes='SHARAWLA_ACCEPTANCE:'||r)
 );
end;$$;

grant execute on function public.sharawla_beta54_treasury_acceptance_cleanup_v1(text) to authenticated;

commit;
