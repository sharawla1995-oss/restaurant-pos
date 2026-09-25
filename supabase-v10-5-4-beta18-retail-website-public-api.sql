-- Sharawla POS V10.5.4-beta.18 candidate
-- Retail Website public read API (BETA ONLY)
-- Additive. Restaurant website RPCs/tables are untouched.

begin;

-- One safe bootstrap RPC for hosted Sharawla sites or a customer's own frontend.
-- The browser receives only website-safe branch/payment/delivery/theme metadata.
create or replace function public.retail_website_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path=public
stable
as $$
declare
  v_site jsonb;
  v_branches jsonb;
  v_payments jsonb;
  v_zones jsonb;
begin
  select coalesce(to_jsonb(w),'{}'::jsonb)
    into v_site
  from public.website_settings w
  where w.id=1;
  if v_site is null then v_site:='{}'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'phone',b.phone,
    'address',b.address,
    'location_url',b.location_url,
    'whatsapp',b.whatsapp,
    'sort_order',b.sort_order,
    'orders_open',public.is_branch_website_open(b.id,now()),
    'prep_min',coalesce(s.prep_min,30),
    'prep_max',coalesce(s.prep_max,45)
  ) order by coalesce(b.sort_order,b.id),b.id),'[]'::jsonb)
  into v_branches
  from public.branches b
  left join public.branch_website_settings s on s.branch_id=b.id
  where b.active=true and coalesce(b.website_visible,true)=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id',bpm.branch_id,
    'code',pm.code,
    'name',pm.name,
    'kind',pm.kind,
    'payment_account',bpm.payment_account,
    'payment_instructions',bpm.payment_instructions,
    'allow_reference',coalesce(bpm.allow_reference,true),
    'allow_receipt_upload',coalesce(bpm.allow_receipt_upload,false)
  ) order by bpm.branch_id,pm.sort_order,pm.id),'[]'::jsonb)
  into v_payments
  from public.branch_payment_methods bpm
  join public.payment_methods pm on pm.id=bpm.payment_method_id
  join public.branches b on b.id=bpm.branch_id
  where b.active=true and coalesce(b.website_visible,true)=true
    and pm.active=true and bpm.active=true and coalesce(bpm.website_enabled,false)=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,'branch_id',z.branch_id,'name',z.name,'delivery_fee',z.delivery_fee
  ) order by z.branch_id,z.name,z.id),'[]'::jsonb)
  into v_zones
  from public.delivery_zones z
  join public.branches b on b.id=z.branch_id
  where z.active=true and b.active=true and coalesce(b.website_visible,true)=true;

  return jsonb_build_object(
    'ok',true,
    'site',v_site,
    'branches',v_branches,
    'payment_methods',v_payments,
    'delivery_zones',v_zones,
    'server_time',now()
  );
end $$;
revoke all on function public.retail_website_bootstrap() from public;
grant execute on function public.retail_website_bootstrap() to anon,authenticated;

-- Website catalog with presentation metadata. Inventory availability is calculated
-- server-side after subtracting live Retail website reservations.
create or replace function public.retail_website_catalog(p_branch_id bigint)
returns table(
  product_id bigint,
  name text,
  barcode text,
  price numeric,
  category_id bigint,
  category_name text,
  image_url text,
  unit_type text,
  allow_decimal boolean,
  qty_step numeric,
  min_qty numeric,
  available_qty numeric,
  online_enabled boolean
)
language sql
security definer
set search_path=public
stable
as $$
  select
    p.id,
    p.name,
    p.barcode,
    coalesce(bp.price_override,p.price)::numeric,
    p.category_id,
    c.name,
    p.image_url,
    coalesce(ps.unit_type,'piece'),
    coalesce(ps.allow_decimal,false),
    coalesce(ps.qty_step,1)::numeric,
    coalesce(ps.min_qty,1)::numeric,
    greatest(
      0,
      coalesce(b.quantity,0)-coalesce((
        select sum(r.quantity)
        from public.retail_stock_reservations r
        where r.branch_id=p_branch_id
          and r.product_id=p.id
          and r.status='active'
          and r.expires_at>now()
      ),0)
    )::numeric,
    coalesce(ps.online_enabled,true)
  from public.products p
  left join public.categories c on c.id=p.category_id
  join public.branch_products bp on bp.product_id=p.id and bp.branch_id=p_branch_id
  left join public.retail_product_settings ps on ps.product_id=p.id
  left join public.retail_inventory_balances b on b.product_id=p.id and b.branch_id=p_branch_id
  where p.active=true
    and bp.active=true
    and coalesce(p.website_visible,true)=true
    and coalesce(bp.website_paused_until,'-infinity'::timestamptz)<=now()
    and coalesce(ps.online_enabled,true)=true
    and (c.id is null or (c.active=true and coalesce(c.website_visible,true)=true))
  order by coalesce(c.website_sort_order,999999),coalesce(p.website_sort_order,999999),p.name,p.id;
$$;
revoke all on function public.retail_website_catalog(bigint) from public;
grant execute on function public.retail_website_catalog(bigint) to anon,authenticated;

notify pgrst,'reload schema';
commit;
