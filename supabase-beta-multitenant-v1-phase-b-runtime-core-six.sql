-- Sharawla POS — Phase B tenant-safe runtime definers core six
begin;
-- automotive_part_search_v1
CREATE OR REPLACE FUNCTION public.automotive_part_search_v1(p_query text, p_vehicle_model_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(product_id bigint, product_name text, barcode text, matched_reference text, fitment_match boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select distinct p.id,p.name,p.barcode,cr.reference_code,
   case when p_vehicle_model_id is null then false else exists(select 1 from public.automotive_product_fitments_v1 f where f.business_id=public.current_business_id() and f.product_id=p.id and f.vehicle_model_id=p_vehicle_model_id) end
 from public.products p left join public.automotive_cross_references_v1 cr on cr.business_id=public.current_business_id() and cr.product_id=p.id
 where p.business_id=public.current_business_id() and p.active is distinct from false and (
   lower(p.name) like '%'||lower(trim(p_query))||'%' or lower(coalesce(p.barcode,''))=lower(trim(p_query)) or lower(coalesce(cr.reference_code,''))=lower(trim(p_query))
 ) and (p_vehicle_model_id is null or exists(select 1 from public.automotive_product_fitments_v1 f where f.business_id=public.current_business_id() and f.product_id=p.id and f.vehicle_model_id=p_vehicle_model_id))
 order by p.name limit 100;
$function$;


-- commerce_resolve_price_v2
CREATE OR REPLACE FUNCTION public.commerce_resolve_price_v2(p_customer_id bigint, p_product_id bigint, p_variant_id bigint, p_quantity numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_business_id uuid:=public.current_business_id(); tid bigint; tname text; price numeric; base numeric;
begin
 select case when p_variant_id is null then p.price else v.price end into base
 from public.products p left join public.product_variants v on v.business_id=v_business_id and v.id=p_variant_id and v.product_id=p.id
 where p.business_id=v_business_id and p.id=p_product_id;
 select t.id,t.name into tid,tname from public.commerce_customer_price_tiers ct join public.commerce_price_tiers t on t.business_id=v_business_id and t.id=ct.tier_id and t.active=true where ct.business_id=v_business_id and ct.customer_id=p_customer_id;
 if tid is not null then
  select pp.unit_price into price from public.commerce_price_tier_prices pp
  where pp.business_id=v_business_id and pp.tier_id=tid and pp.product_id=p_product_id and pp.variant_id is not distinct from p_variant_id and pp.active=true and pp.min_quantity<=greatest(coalesce(p_quantity,1),0)
    and (pp.starts_at is null or pp.starts_at<=now()) and (pp.ends_at is null or pp.ends_at>now())
  order by pp.min_quantity desc limit 1;
 end if;
 return jsonb_build_object('customer_id',p_customer_id,'tier_id',tid,'tier_name',tname,'product_id',p_product_id,'variant_id',p_variant_id,'quantity',p_quantity,'unit_price',coalesce(price,base,0),'source',case when price is null then 'base' else 'price_tier' end);
end;$function$;


-- logistics_quote_v1
CREATE OR REPLACE FUNCTION public.logistics_quote_v1(p_zone_id bigint, p_weight_kg numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$select round(base_fee+greatest(coalesce(p_weight_kg,0)-1,0)*extra_kg_fee,2) from public.logistics_zones_v1 where business_id=public.current_business_id() and id=p_zone_id and active=true$function$;


-- membership_book_class_v1
CREATE OR REPLACE FUNCTION public.membership_book_class_v1(p_class_id bigint, p_member_id bigint, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare v_business_id uuid:=public.current_business_id();idv bigint;c public.membership_classes_v1%rowtype;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');cnt integer;begin if auth.uid() is null then raise exception 'غير مصرح';end if;if v_business_id is null then raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;if not exists(select 1 from public.membership_members_v1 where business_id=v_business_id and id=p_member_id) then raise exception 'العضو غير موجود';end if;perform pg_advisory_xact_lock(hashtextextended('membership-book:'||v_business_id::text||':'||k,0));select id into idv from public.membership_bookings_v1 where business_id=v_business_id and client_tx_id=k;if idv is not null then return idv;end if;select * into c from public.membership_classes_v1 where business_id=v_business_id and id=p_class_id for update;if c.status not in('scheduled','open') then raise exception 'الحصة غير متاحة';end if;select count(*) into cnt from public.membership_bookings_v1 where business_id=v_business_id and class_id=c.id and status='booked';if cnt>=c.capacity then raise exception 'الحصة مكتملة';end if;insert into public.membership_bookings_v1(business_id,class_id,member_id,client_tx_id) values(v_business_id,c.id,p_member_id,k) returning id into idv;return idv;end;$function$;


-- membership_subscribe_v1
CREATE OR REPLACE FUNCTION public.membership_subscribe_v1(p_member_id bigint, p_plan_id bigint, p_starts_on date, p_paid_amount numeric, p_client_tx_id text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$declare v_business_id uuid:=public.current_business_id();idv bigint;p public.membership_plans_v1%rowtype;k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');begin if auth.uid() is null then raise exception 'غير مصرح';end if;if v_business_id is null then raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';end if;if k is null then raise exception 'معرف الحركة مطلوب';end if;if not exists(select 1 from public.membership_members_v1 where business_id=v_business_id and id=p_member_id) then raise exception 'العضو غير موجود';end if;perform pg_advisory_xact_lock(hashtextextended('membership-sub:'||v_business_id::text||':'||k,0));select id into idv from public.membership_subscriptions_v1 where business_id=v_business_id and client_tx_id=k;if idv is not null then return idv;end if;select * into p from public.membership_plans_v1 where business_id=v_business_id and id=p_plan_id and active=true;if not found then raise exception 'الخطة غير موجودة';end if;insert into public.membership_subscriptions_v1(business_id,member_id,plan_id,starts_on,ends_on,paid_amount,client_tx_id) values(v_business_id,p_member_id,p.id,coalesce(p_starts_on,current_date),coalesce(p_starts_on,current_date)+p.duration_days-1,greatest(coalesce(p_paid_amount,0),0),k) returning id into idv;return idv;end;$function$;


-- redeem_promo_code
CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_promo_id bigint, p_code text, p_branch_id bigint, p_channel text, p_customer_phone text, p_discount numeric, p_order_id bigint DEFAULT NULL::bigint, p_website_order_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id bigint; v_business_id uuid;
begin
  v_business_id:=coalesce(public.current_business_id(),public.request_business_id());
  if v_business_id is null then raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if p_channel='pos' and auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business_id) then raise exception 'MULTITENANT_BRANCH_MISMATCH' using errcode='42501'; end if;
  if not exists(select 1 from public.promo_codes where id=p_promo_id and business_id=v_business_id) then raise exception 'MULTITENANT_PROMO_MISMATCH' using errcode='42501'; end if;
  insert into public.promo_redemptions(business_id,promo_code_id,code,branch_id,channel,customer_phone,discount_amount,order_id,website_order_id)
  values(v_business_id,p_promo_id,p_code,p_branch_id,p_channel,nullif(trim(coalesce(p_customer_phone,'')),''),greatest(0,coalesce(p_discount,0)),p_order_id,p_website_order_id)
  returning id into v_id;
  return v_id;
end;
$function$;

commit;
