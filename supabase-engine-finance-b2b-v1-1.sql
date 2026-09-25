-- Finance/B2B V1.1 — admin pricing RPCs
begin;

create or replace function public.commerce_price_tier_save_v2(p_tier_id bigint,p_code text,p_name text,p_priority integer,p_active boolean)
returns public.commerce_price_tiers
language plpgsql security definer set search_path=public
as $$
declare r public.commerce_price_tiers%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة فئات الأسعار للمدير فقط';end if;
 if nullif(trim(coalesce(p_code,'')),'') is null or nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'الكود والاسم مطلوبان';end if;
 if p_tier_id is null then
  insert into public.commerce_price_tiers(code,name,priority,active) values(lower(trim(p_code)),trim(p_name),coalesce(p_priority,0),coalesce(p_active,true)) returning * into r;
 else
  update public.commerce_price_tiers set code=lower(trim(p_code)),name=trim(p_name),priority=coalesce(p_priority,0),active=coalesce(p_active,true),updated_at=now() where id=p_tier_id returning * into r;
  if r.id is null then raise exception 'فئة السعر غير موجودة';end if;
 end if;return r;
end;$$;

create or replace function public.commerce_customer_price_tier_set_v2(p_customer_id bigint,p_tier_id bigint)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة فئات العملاء للمدير فقط';end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'العميل غير موجود';end if;
 if p_tier_id is null then delete from public.commerce_customer_price_tiers where customer_id=p_customer_id;return;end if;
 if not exists(select 1 from public.commerce_price_tiers where id=p_tier_id and active=true) then raise exception 'فئة السعر غير صالحة';end if;
 insert into public.commerce_customer_price_tiers(customer_id,tier_id) values(p_customer_id,p_tier_id) on conflict(customer_id) do update set tier_id=excluded.tier_id,updated_at=now();
end;$$;

create or replace function public.commerce_price_tier_price_save_v2(p_price_id bigint,p_tier_id bigint,p_product_id bigint,p_variant_id bigint,p_min_quantity numeric,p_unit_price numeric,p_starts_at timestamptz,p_ends_at timestamptz,p_active boolean)
returns public.commerce_price_tier_prices
language plpgsql security definer set search_path=public
as $$
declare r public.commerce_price_tier_prices%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة أسعار الجملة للمدير فقط';end if;
 if coalesce(p_min_quantity,0)<=0 or coalesce(p_unit_price,-1)<0 then raise exception 'الكمية/السعر غير صحيح';end if;
 if p_variant_id is not null and not exists(select 1 from public.product_variants where id=p_variant_id and product_id=p_product_id) then raise exception 'Variant لا ينتمي للصنف';end if;
 if p_price_id is null then
  insert into public.commerce_price_tier_prices(tier_id,product_id,variant_id,min_quantity,unit_price,starts_at,ends_at,active) values(p_tier_id,p_product_id,p_variant_id,round(p_min_quantity,3),round(p_unit_price,2),p_starts_at,p_ends_at,coalesce(p_active,true)) returning * into r;
 else
  update public.commerce_price_tier_prices set tier_id=p_tier_id,product_id=p_product_id,variant_id=p_variant_id,min_quantity=round(p_min_quantity,3),unit_price=round(p_unit_price,2),starts_at=p_starts_at,ends_at=p_ends_at,active=coalesce(p_active,true),updated_at=now() where id=p_price_id returning * into r;
  if r.id is null then raise exception 'سعر الفئة غير موجود';end if;
 end if;return r;
end;$$;

grant execute on function public.commerce_price_tier_save_v2(bigint,text,text,integer,boolean) to authenticated;
grant execute on function public.commerce_customer_price_tier_set_v2(bigint,bigint) to authenticated;
grant execute on function public.commerce_price_tier_price_save_v2(bigint,bigint,bigint,bigint,numeric,numeric,timestamptz,timestamptz,boolean) to authenticated;
commit;
