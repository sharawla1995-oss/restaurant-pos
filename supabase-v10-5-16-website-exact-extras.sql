-- V10.5.16 Exact Extras Website E2E
alter table public.website_order_item_modifiers
  add column if not exists quantity integer not null default 1;
alter table public.website_order_item_modifiers
  drop constraint if exists website_order_item_modifiers_quantity_ck;
alter table public.website_order_item_modifiers
  add constraint website_order_item_modifiers_quantity_ck check (quantity >= 1);

-- Patch the active 11-argument website RPC in-place by transforming its current body.
do $$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='create_website_order'
   and pg_get_function_identity_arguments(p.oid)='p_branch_id bigint, p_customer_name text, p_customer_phone text, p_customer_address text, p_customer_notes text, p_items jsonb, p_payment_method_code text, p_payment_reference text, p_payment_receipt_path text, p_order_type text, p_promo_code text, p_delivery_zone_id bigint';
 if v_def is null then raise exception 'active website RPC signature not found'; end if;
 v_def:=replace(v_def,'v_promo_discount numeric(12,2):=0;','v_promo_discount numeric(12,2):=0;'||E'\n  v_modifier_qty integer;');
 v_def:=replace(v_def,'v_extras:=v_extras+coalesce(v_mod.price,0);','v_modifier_qty:=greatest(1,coalesce(nullif(v_modifier->>''quantity'','''')::integer,1));'||E'\n      v_extras:=v_extras+coalesce(v_mod.price,0)*v_modifier_qty;');
 v_def:=replace(v_def,'modifier_name,\n        price\n      )','modifier_name,\n        price,\n        quantity\n      )');
 v_def:=replace(v_def,'v_mod.name,\n        v_mod.price\n      );','v_mod.name,\n        v_mod.price,\n        greatest(1,coalesce(nullif(v_modifier->>''quantity'','''')::integer,1))\n      );');
 execute v_def;
end $$;

-- Patch current website acceptance owner: preserve all current behavior, add exact qty transfer/display.
do $$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='accept_website_order'
   and pg_get_function_identity_arguments(p.oid)='p_website_order_id bigint';
 if v_def is null then raise exception 'accept website RPC not found'; end if;
 v_def:=replace(v_def,'string_agg(btrim(x.modifier_name), '' + '' order by x.id)','string_agg(btrim(x.modifier_name) || case when coalesce(x.quantity,1)>1 then '' ×'' || x.quantity::text else '''' end, '' + '' order by x.id)');
 v_def:=replace(v_def,'modifier_name,\n        price\n      )','modifier_name,\n        price,\n        quantity\n      )');
 v_def:=replace(v_def,'wm.modifier_name,\n        wm.price\n      );','wm.modifier_name,\n        wm.price,\n        greatest(1,coalesce(wm.quantity,1))\n      );');
 execute v_def;
end $$;

revoke all on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint) from public;
grant execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint) to anon,authenticated;
revoke all on function public.accept_website_order(bigint) from public;
grant execute on function public.accept_website_order(bigint) to authenticated;
