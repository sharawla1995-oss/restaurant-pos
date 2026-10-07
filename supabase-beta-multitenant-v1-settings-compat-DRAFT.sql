-- Sharawla POS — Beta Multi-Tenant V1 settings compatibility
-- SOURCE PREPARATION ONLY.
-- Keeps current Beta settings row unchanged while future tenants receive their own row.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

drop policy if exists business_settings_public_read on public.business_settings;
create policy business_settings_public_read
on public.business_settings
for select
to anon,authenticated
using (business_id=public.request_business_id());

drop policy if exists website_settings_public_read on public.website_settings;
create policy website_settings_public_read
on public.website_settings
for select
to anon,authenticated
using (business_id=public.request_business_id());

create or replace function public.update_business_settings(
  p_business_name text,
  p_tagline text default null,
  p_phone text default null,
  p_address text default null,
  p_logo_url text default null,
  p_currency_symbol text default 'ج.م',
  p_receipt_footer text default 'شكرًا لزيارتكم',
  p_primary_color text default '#b51f2b',
  p_accent_color text default '#f0643d'
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_business_id uuid;
begin
  v_business_id:=public.current_business_id();
  if v_business_id is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;

  if not (
    public.current_employee_role()='admin'
    or public.has_permission('businessSettings')
  ) then
    raise exception 'ليس لديك صلاحية تعديل هوية النشاط';
  end if;

  if nullif(trim(p_business_name),'') is null then
    raise exception 'اسم النشاط مطلوب';
  end if;

  if coalesce(p_primary_color,'') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(p_accent_color,'') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'كود اللون غير صحيح';
  end if;

  insert into public.business_settings(
    business_id,business_name,tagline,phone,address,logo_url,currency_symbol,
    receipt_footer,primary_color,accent_color,updated_at
  ) values (
    v_business_id,trim(p_business_name),nullif(trim(coalesce(p_tagline,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_address,'')),''),
    nullif(trim(coalesce(p_logo_url,'')),''),coalesce(nullif(trim(p_currency_symbol),''),'ج.م'),
    coalesce(nullif(trim(p_receipt_footer,'')),'شكرًا لزيارتكم'),
    p_primary_color,p_accent_color,now()
  )
  on conflict(business_id) do update set
    business_name=excluded.business_name,
    tagline=excluded.tagline,
    phone=excluded.phone,
    address=excluded.address,
    logo_url=excluded.logo_url,
    currency_symbol=excluded.currency_symbol,
    receipt_footer=excluded.receipt_footer,
    primary_color=excluded.primary_color,
    accent_color=excluded.accent_color,
    updated_at=now();
end;
$$;

revoke all on function public.update_business_settings(text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_business_settings(text,text,text,text,text,text,text,text,text) to authenticated;

commit;
