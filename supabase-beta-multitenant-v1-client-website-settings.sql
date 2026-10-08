-- Sharawla POS — Beta Multi-Tenant V1 client compatibility
-- Tenant-local Website Settings owner. Beta only.

begin;

create or replace function public.update_website_settings_v1(
  p_theme_name text,
  p_page_background text,
  p_surface_color text,
  p_text_color text,
  p_card_radius integer,
  p_show_contact boolean,
  p_show_locations boolean,
  p_show_track_order boolean,
  p_show_cancel_order boolean,
  p_allow_customer_cancel boolean,
  p_show_whatsapp boolean,
  p_whatsapp_url text,
  p_show_facebook boolean,
  p_facebook_url text,
  p_show_instagram boolean,
  p_instagram_url text,
  p_show_payment_reference boolean,
  p_show_payment_receipt_upload boolean,
  p_show_payment_status boolean
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $function$
declare
  v_business_id uuid;
  v_row public.website_settings%rowtype;
begin
  v_business_id:=public.current_business_id();
  if v_business_id is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;

  if not (
    public.current_employee_role()='admin'
    or public.has_permission('websiteAppearance')
  ) then
    raise exception 'ليس لديك صلاحية تصميم الموقع' using errcode='42501';
  end if;

  if coalesce(p_theme_name,'') not in ('topburger','dark','light','custom') then
    raise exception 'WEBSITE_THEME_INVALID';
  end if;

  if coalesce(p_page_background,'') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(p_surface_color,'') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(p_text_color,'') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'WEBSITE_COLOR_INVALID';
  end if;

  if p_card_radius is null or p_card_radius<0 or p_card_radius>40 then
    raise exception 'WEBSITE_CARD_RADIUS_INVALID';
  end if;

  insert into public.website_settings(
    business_id,theme_name,page_background,surface_color,text_color,card_radius,
    show_contact,show_locations,show_track_order,show_cancel_order,allow_customer_cancel,
    show_whatsapp,whatsapp_url,show_facebook,facebook_url,show_instagram,instagram_url,
    show_payment_reference,show_payment_receipt_upload,show_payment_status,updated_at
  ) values (
    v_business_id,p_theme_name,p_page_background,p_surface_color,p_text_color,p_card_radius,
    coalesce(p_show_contact,true),coalesce(p_show_locations,true),coalesce(p_show_track_order,true),
    coalesce(p_show_cancel_order,true),coalesce(p_allow_customer_cancel,true),
    coalesce(p_show_whatsapp,false),nullif(trim(coalesce(p_whatsapp_url,'')),''),
    coalesce(p_show_facebook,false),nullif(trim(coalesce(p_facebook_url,'')),''),
    coalesce(p_show_instagram,false),nullif(trim(coalesce(p_instagram_url,'')),''),
    coalesce(p_show_payment_reference,true),coalesce(p_show_payment_receipt_upload,true),
    coalesce(p_show_payment_status,true),now()
  )
  on conflict(business_id) do update set
    theme_name=excluded.theme_name,
    page_background=excluded.page_background,
    surface_color=excluded.surface_color,
    text_color=excluded.text_color,
    card_radius=excluded.card_radius,
    show_contact=excluded.show_contact,
    show_locations=excluded.show_locations,
    show_track_order=excluded.show_track_order,
    show_cancel_order=excluded.show_cancel_order,
    allow_customer_cancel=excluded.allow_customer_cancel,
    show_whatsapp=excluded.show_whatsapp,
    whatsapp_url=excluded.whatsapp_url,
    show_facebook=excluded.show_facebook,
    facebook_url=excluded.facebook_url,
    show_instagram=excluded.show_instagram,
    instagram_url=excluded.instagram_url,
    show_payment_reference=excluded.show_payment_reference,
    show_payment_receipt_upload=excluded.show_payment_receipt_upload,
    show_payment_status=excluded.show_payment_status,
    updated_at=now()
  returning * into v_row;

  return to_jsonb(v_row);
end
$function$;

revoke all on function public.update_website_settings_v1(
  text,text,text,text,integer,boolean,boolean,boolean,boolean,boolean,
  boolean,text,boolean,text,boolean,text,boolean,boolean,boolean
) from public,anon;

grant execute on function public.update_website_settings_v1(
  text,text,text,text,integer,boolean,boolean,boolean,boolean,boolean,
  boolean,text,boolean,text,boolean,text,boolean,boolean,boolean
) to authenticated,service_role;

commit;
