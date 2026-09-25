-- V9.3.0 - Business identity and global branding
-- Safe to run more than once.

create table if not exists public.business_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Top Burger',
  tagline text,
  phone text,
  address text,
  logo_url text,
  currency_symbol text not null default 'ج.م',
  receipt_footer text not null default 'شكرًا لزيارتكم',
  primary_color text not null default '#b51f2b',
  accent_color text not null default '#f0643d',
  updated_at timestamptz not null default now()
);

insert into public.business_settings(id)
values (1)
on conflict (id) do nothing;

alter table public.business_settings enable row level security;

grant select on public.business_settings to anon, authenticated;

drop policy if exists business_settings_public_read on public.business_settings;
create policy business_settings_public_read
on public.business_settings
for select
to anon, authenticated
using (id = 1);

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
set search_path = public
as $$
begin
  if not (
    public.current_employee_role() = 'admin'
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
    id,business_name,tagline,phone,address,logo_url,currency_symbol,
    receipt_footer,primary_color,accent_color,updated_at
  ) values (
    1,trim(p_business_name),nullif(trim(coalesce(p_tagline,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_address,'')),''),
    nullif(trim(coalesce(p_logo_url,'')),''),coalesce(nullif(trim(p_currency_symbol),''),'ج.م'),
    coalesce(nullif(trim(p_receipt_footer),''),'شكرًا لزيارتكم'),
    p_primary_color,p_accent_color,now()
  )
  on conflict(id) do update set
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

grant execute on function public.update_business_settings(text,text,text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
