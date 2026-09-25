-- Sharawla POS — Finance / B2B Engine V1
-- Price tiers, credit limits, receivables, collections and aging.

begin;

create table if not exists public.commerce_price_tiers (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_price_tiers_code_not_blank check (trim(code)<>''),
  constraint commerce_price_tiers_name_not_blank check (trim(name)<>'')
);

create table if not exists public.commerce_customer_price_tiers (
  customer_id bigint primary key references public.customers(id) on delete cascade,
  tier_id bigint not null references public.commerce_price_tiers(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_price_tier_prices (
  id bigserial primary key,
  tier_id bigint not null references public.commerce_price_tiers(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  variant_id bigint references public.product_variants(id) on delete cascade,
  min_quantity numeric(14,3) not null default 1 check (min_quantity>0),
  unit_price numeric(14,2) not null check (unit_price>=0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_price_tier_price_dates check (ends_at is null or starts_at is null or ends_at>starts_at),
  unique(tier_id,product_id,variant_id,min_quantity)
);
create index if not exists commerce_price_tier_prices_lookup_idx on public.commerce_price_tier_prices(tier_id,product_id,variant_id,min_quantity desc);

create table if not exists public.finance_customer_accounts (
  customer_id bigint primary key references public.customers(id) on delete cascade,
  credit_limit numeric(14,2) not null default 0 check (credit_limit>=0),
  payment_terms_days integer not null default 0 check (payment_terms_days>=0),
  credit_hold boolean not null default false,
  notes text,
  updated_by_employee_id bigint references public.employees(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_receivables (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  document_kind text not null default 'invoice' check (document_kind in ('invoice','debit_note')),
  source_type text not null check (source_type in ('order','order_document','manual')),
  source_order_id bigint references public.orders(id) on delete set null,
  source_order_document_id bigint references public.commerce_order_documents(id) on delete set null,
  document_number text,
  issue_date date not null default current_date,
  due_date date not null default current_date,
  original_amount numeric(14,2) not null check (original_amount>0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount>=0),
  status text not null default 'open' check (status in ('open','partial','paid','void')),
  client_tx_id text not null unique,
  notes text,
  created_by_employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);
create index if not exists finance_receivables_customer_due_idx on public.finance_receivables(customer_id,due_date,status);
create index if not exists finance_receivables_branch_due_idx on public.finance_receivables(branch_id,due_date,status);

create table if not exists public.finance_collections (
  id bigserial primary key,
  branch_id bigint not null references public.branches(id) on delete restrict,
  customer_id bigint not null references public.customers(id) on delete restrict,
  amount numeric(14,2) not null check (amount>0),
  method text not null,
  reference text,
  client_tx_id text not null unique,
  notes text,
  employee_id bigint references public.employees(id),
  created_at timestamptz not null default now()
);

create table if not exists public.finance_collection_allocations (
  id bigserial primary key,
  collection_id bigint not null references public.finance_collections(id) on delete cascade,
  receivable_id bigint not null references public.finance_receivables(id) on delete restrict,
  amount numeric(14,2) not null check (amount>0),
  created_at timestamptz not null default now(),
  unique(collection_id,receivable_id)
);

create or replace function public.commerce_resolve_price_v2(p_customer_id bigint,p_product_id bigint,p_variant_id bigint,p_quantity numeric)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare tid bigint; tname text; price numeric; base numeric;
begin
 select case when p_variant_id is null then p.price else v.price end into base
 from public.products p left join public.product_variants v on v.id=p_variant_id and v.product_id=p.id
 where p.id=p_product_id;
 select t.id,t.name into tid,tname from public.commerce_customer_price_tiers ct join public.commerce_price_tiers t on t.id=ct.tier_id and t.active=true where ct.customer_id=p_customer_id;
 if tid is not null then
  select pp.unit_price into price from public.commerce_price_tier_prices pp
  where pp.tier_id=tid and pp.product_id=p_product_id and pp.variant_id is not distinct from p_variant_id and pp.active=true and pp.min_quantity<=greatest(coalesce(p_quantity,1),0)
    and (pp.starts_at is null or pp.starts_at<=now()) and (pp.ends_at is null or pp.ends_at>now())
  order by pp.min_quantity desc limit 1;
 end if;
 return jsonb_build_object('customer_id',p_customer_id,'tier_id',tid,'tier_name',tname,'product_id',p_product_id,'variant_id',p_variant_id,'quantity',p_quantity,'unit_price',coalesce(price,base,0),'source',case when price is null then 'base' else 'price_tier' end);
end;$$;

create or replace function public.finance_customer_account_set_v2(p_customer_id bigint,p_credit_limit numeric,p_payment_terms_days integer,p_credit_hold boolean,p_notes text)
returns public.finance_customer_accounts
language plpgsql security definer set search_path=public
as $$
declare r public.finance_customer_accounts%rowtype; e bigint;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'إدارة الائتمان للمدير فقط'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception 'العميل غير موجود'; end if;
 e:=public.current_employee_id();
 insert into public.finance_customer_accounts(customer_id,credit_limit,payment_terms_days,credit_hold,notes,updated_by_employee_id)
 values(p_customer_id,greatest(coalesce(p_credit_limit,0),0),greatest(coalesce(p_payment_terms_days,0),0),coalesce(p_credit_hold,false),nullif(trim(coalesce(p_notes,'')),''),e)
 on conflict(customer_id) do update set credit_limit=excluded.credit_limit,payment_terms_days=excluded.payment_terms_days,credit_hold=excluded.credit_hold,notes=excluded.notes,updated_by_employee_id=e,updated_at=now()
 returning * into r; return r;
end;$$;

create or replace function public.finance_credit_check_v2(p_branch_id bigint,p_customer_id bigint,p_proposed_amount numeric)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare a public.finance_customer_accounts%rowtype; due numeric; avail numeric; proposed numeric:=greatest(coalesce(p_proposed_amount,0),0);
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 select * into a from public.finance_customer_accounts where customer_id=p_customer_id;
 if not found then return jsonb_build_object('configured',false,'allowed',true,'outstanding',0,'credit_limit',0,'available',null,'credit_hold',false); end if;
 select coalesce(sum(outstanding_amount),0) into due from public.finance_receivables where customer_id=p_customer_id and branch_id=p_branch_id and status in ('open','partial');
 avail:=greatest(a.credit_limit-due,0);
 return jsonb_build_object('configured',true,'allowed',not a.credit_hold and (a.credit_limit=0 or proposed<=avail),'outstanding',round(due,2),'credit_limit',a.credit_limit,'available',case when a.credit_limit=0 then null else round(avail,2) end,'credit_hold',a.credit_hold,'terms_days',a.payment_terms_days,'proposed',proposed);
end;$$;

create or replace function public.finance_receivable_create_v2(p_branch_id bigint,p_customer_id bigint,p_amount numeric,p_source_type text,p_source_id bigint,p_document_number text,p_due_date date,p_notes text,p_client_tx_id text)
returns bigint
language plpgsql security definer set search_path=public
as $$
declare idv bigint; e bigint; k text:=nullif(trim(coalesce(p_client_tx_id,'')),''); terms integer:=0; due date;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('orders')) then raise exception 'ليس لديك صلاحية حسابات العملاء'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if coalesce(p_amount,0)<=0 then raise exception 'قيمة المديونية غير صحيحة'; end if;
 if p_source_type not in ('order','order_document','manual') then raise exception 'مصدر المديونية غير صحيح'; end if;
 if k is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-recv:'||k,0));
 select id into idv from public.finance_receivables where client_tx_id=k;if idv is not null then return idv;end if;
 select payment_terms_days into terms from public.finance_customer_accounts where customer_id=p_customer_id;terms:=coalesce(terms,0);due:=coalesce(p_due_date,current_date+terms);
 e:=public.current_employee_id();
 insert into public.finance_receivables(branch_id,customer_id,source_type,source_order_id,source_order_document_id,document_number,due_date,original_amount,outstanding_amount,client_tx_id,notes,created_by_employee_id)
 values(p_branch_id,p_customer_id,p_source_type,case when p_source_type='order' then p_source_id else null end,case when p_source_type='order_document' then p_source_id else null end,nullif(trim(coalesce(p_document_number,'')),''),due,round(p_amount,2),round(p_amount,2),k,nullif(trim(coalesce(p_notes,'')),''),e) returning id into idv;
 return idv;
end;$$;

create or replace function public.finance_collection_create_v2(p_branch_id bigint,p_customer_id bigint,p_amount numeric,p_method text,p_reference text,p_allocations jsonb,p_notes text,p_client_tx_id text)
returns bigint
language plpgsql security definer set search_path=public
as $$
declare cid bigint; e bigint; k text:=nullif(trim(coalesce(p_client_tx_id,'')),''); remain numeric:=round(coalesce(p_amount,0),2); rec record; alloc numeric;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not (public.is_admin() or public.has_permission('orders')) then raise exception 'ليس لديك صلاحية التحصيل'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 if remain<=0 then raise exception 'قيمة التحصيل غير صحيحة'; end if;
 if k is null then raise exception 'معرف الحركة مطلوب'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-collection:'||k,0));
 select id into cid from public.finance_collections where client_tx_id=k;if cid is not null then return cid;end if;
 e:=public.current_employee_id();
 insert into public.finance_collections(branch_id,customer_id,amount,method,reference,client_tx_id,notes,employee_id) values(p_branch_id,p_customer_id,remain,trim(p_method),nullif(trim(coalesce(p_reference,'')),''),k,nullif(trim(coalesce(p_notes,'')),''),e) returning id into cid;
 if jsonb_typeof(coalesce(p_allocations,'[]'::jsonb))='array' and jsonb_array_length(coalesce(p_allocations,'[]'::jsonb))>0 then
  for rec in select * from jsonb_to_recordset(p_allocations) as x(receivable_id bigint,amount numeric) loop
   select least(round(rec.amount,2),outstanding_amount,remain) into alloc from public.finance_receivables where id=rec.receivable_id and customer_id=p_customer_id and branch_id=p_branch_id and status in ('open','partial') for update;
   if coalesce(alloc,0)>0 then insert into public.finance_collection_allocations(collection_id,receivable_id,amount) values(cid,rec.receivable_id,alloc);update public.finance_receivables set outstanding_amount=round(outstanding_amount-alloc,2),status=case when outstanding_amount-alloc<=0.009 then 'paid' else 'partial' end where id=rec.receivable_id;remain:=remain-alloc;end if;
   exit when remain<=0.009;
  end loop;
 else
  for rec in select id,outstanding_amount from public.finance_receivables where customer_id=p_customer_id and branch_id=p_branch_id and status in ('open','partial') order by due_date,id for update loop
   alloc:=least(rec.outstanding_amount,remain);if alloc>0 then insert into public.finance_collection_allocations(collection_id,receivable_id,amount) values(cid,rec.id,alloc);update public.finance_receivables set outstanding_amount=round(outstanding_amount-alloc,2),status=case when outstanding_amount-alloc<=0.009 then 'paid' else 'partial' end where id=rec.id;remain:=remain-alloc;end if;exit when remain<=0.009;
  end loop;
 end if;
 if remain>0.01 then raise exception 'قيمة التحصيل أكبر من المديونية المفتوحة بمقدار %',remain;end if;
 return cid;
end;$$;

create or replace function public.finance_aging_v2(p_branch_id bigint,p_as_of date default current_date)
returns table(customer_id bigint,customer_name text,current_due numeric,days_1_30 numeric,days_31_60 numeric,days_61_90 numeric,days_over_90 numeric,total_due numeric,credit_limit numeric,available_credit numeric,credit_hold boolean)
language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 return query select c.id,c.name,
  round(coalesce(sum(r.outstanding_amount) filter(where r.due_date>=p_as_of),0),2),
  round(coalesce(sum(r.outstanding_amount) filter(where p_as_of-r.due_date between 1 and 30),0),2),
  round(coalesce(sum(r.outstanding_amount) filter(where p_as_of-r.due_date between 31 and 60),0),2),
  round(coalesce(sum(r.outstanding_amount) filter(where p_as_of-r.due_date between 61 and 90),0),2),
  round(coalesce(sum(r.outstanding_amount) filter(where p_as_of-r.due_date>90),0),2),
  round(coalesce(sum(r.outstanding_amount),0),2),coalesce(a.credit_limit,0),
  case when coalesce(a.credit_limit,0)=0 then null else greatest(a.credit_limit-coalesce(sum(r.outstanding_amount),0),0) end,
  coalesce(a.credit_hold,false)
 from public.customers c join public.finance_receivables r on r.customer_id=c.id and r.branch_id=p_branch_id and r.status in ('open','partial') left join public.finance_customer_accounts a on a.customer_id=c.id
 group by c.id,c.name,a.credit_limit,a.credit_hold order by coalesce(sum(r.outstanding_amount),0) desc;
end;$$;

-- Enforce credit policy when approving B2B sales orders.
create or replace function public.commerce_order_document_decide_v2(p_document_id bigint,p_approve boolean,p_note text)
returns public.commerce_order_documents
language plpgsql security definer set search_path=public
as $$
declare v public.commerce_order_documents%rowtype; e bigint; ns text; ck jsonb;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;if not public.is_admin() then raise exception 'اعتماد المستند للمدير فقط'; end if;
 select * into v from public.commerce_order_documents where id=p_document_id for update;if not found or not public.has_branch_access(v.branch_id) then raise exception 'المستند غير موجود أو غير مصرح';end if;if v.status not in ('submitted','confirmed') then raise exception 'المستند غير جاهز للاعتماد';end if;
 if p_approve and v.document_type='sales_order' and v.customer_id is not null then ck:=public.finance_credit_check_v2(v.branch_id,v.customer_id,greatest(v.total_amount-v.deposit_paid,0));if coalesce((ck->>'allowed')::boolean,true)=false then raise exception 'تجاوز حد الائتمان أو العميل موقوف ائتمانيًا';end if;end if;
 e:=public.current_employee_id();ns:=case when p_approve then 'approved' else 'rejected' end;update public.commerce_order_documents set status=ns,approved_by_employee_id=case when p_approve then e else null end,approved_at=case when p_approve then now() else null end,updated_at=now() where id=v.id returning * into v;insert into public.commerce_order_document_events(document_id,from_status,to_status,event_type,note,employee_id) values(v.id,'submitted',ns,'decision',nullif(trim(coalesce(p_note,'')),''),e);return v;
end;$$;

alter table public.commerce_price_tiers enable row level security;alter table public.commerce_customer_price_tiers enable row level security;alter table public.commerce_price_tier_prices enable row level security;alter table public.finance_customer_accounts enable row level security;alter table public.finance_receivables enable row level security;alter table public.finance_collections enable row level security;alter table public.finance_collection_allocations enable row level security;

drop policy if exists commerce_price_tiers_select_v1 on public.commerce_price_tiers;create policy commerce_price_tiers_select_v1 on public.commerce_price_tiers for select to authenticated using(active=true);
drop policy if exists commerce_customer_price_tiers_select_v1 on public.commerce_customer_price_tiers;create policy commerce_customer_price_tiers_select_v1 on public.commerce_customer_price_tiers for select to authenticated using(true);
drop policy if exists commerce_price_tier_prices_select_v1 on public.commerce_price_tier_prices;create policy commerce_price_tier_prices_select_v1 on public.commerce_price_tier_prices for select to authenticated using(active=true);
drop policy if exists finance_customer_accounts_select_v1 on public.finance_customer_accounts;create policy finance_customer_accounts_select_v1 on public.finance_customer_accounts for select to authenticated using(true);
drop policy if exists finance_receivables_select_v1 on public.finance_receivables;create policy finance_receivables_select_v1 on public.finance_receivables for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists finance_collections_select_v1 on public.finance_collections;create policy finance_collections_select_v1 on public.finance_collections for select to authenticated using(public.has_branch_access(branch_id));
drop policy if exists finance_collection_allocations_select_v1 on public.finance_collection_allocations;create policy finance_collection_allocations_select_v1 on public.finance_collection_allocations for select to authenticated using(exists(select 1 from public.finance_collections c where c.id=collection_id and public.has_branch_access(c.branch_id)));

revoke insert,update,delete on public.commerce_price_tiers,public.commerce_customer_price_tiers,public.commerce_price_tier_prices,public.finance_customer_accounts,public.finance_receivables,public.finance_collections,public.finance_collection_allocations from authenticated;
grant select on public.commerce_price_tiers,public.commerce_customer_price_tiers,public.commerce_price_tier_prices,public.finance_customer_accounts,public.finance_receivables,public.finance_collections,public.finance_collection_allocations to authenticated;
grant execute on function public.commerce_resolve_price_v2(bigint,bigint,bigint,numeric) to authenticated;grant execute on function public.finance_customer_account_set_v2(bigint,numeric,integer,boolean,text) to authenticated;grant execute on function public.finance_credit_check_v2(bigint,bigint,numeric) to authenticated;grant execute on function public.finance_receivable_create_v2(bigint,bigint,numeric,text,bigint,text,date,text,text) to authenticated;grant execute on function public.finance_collection_create_v2(bigint,bigint,numeric,text,text,jsonb,text,text) to authenticated;grant execute on function public.finance_aging_v2(bigint,date) to authenticated;

commit;
