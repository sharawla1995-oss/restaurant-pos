-- Sharawla POS — Beta Multi-Tenant V1 idempotency / replay scope
-- SOURCE PREPARATION ONLY.
-- This migration is intentionally double-guarded: receipt lookup functions must
-- be patched to bind business_id before this file can be applied.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
  if current_setting('sharawla.multitenant_receipts_ready', true) is distinct from 'yes' then
    raise exception 'MULTITENANT_V1_RECEIPTS_NOT_READY: tenant-aware receipt lookups not proven';
  end if;
end
$guard$;

-- Receipt tables whose historical identity was globally client_tx_id.
-- Keep exact-replay semantics, but scope identity by tenant.
do $receipt_pk$
declare t text; pk text;
begin
  foreach t in array array[
    'offline_customer_delivery_receipts_v1',
    'offline_order_status_receipts_v2',
    'offline_restaurant_reference_receipts_v1',
    'offline_v2_customer_merge_receipts',
    'offline_v2_server_receipts',
    'retail_offline_po_approval_receipts',
    'retail_offline_supplier_receipts'
  ]
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    select c.conname into pk
    from pg_constraint c
    where c.conrelid=to_regclass('public.'||t) and c.contype='p'
    limit 1;
    if pk is not null then
      execute format('alter table public.%I drop constraint %I',t,pk);
    end if;
    execute format('alter table public.%I add primary key (business_id,client_tx_id)',t);
  end loop;
end
$receipt_pk$;

-- server_event_id is also tenant-scoped.
alter table public.offline_v2_server_receipts
  drop constraint if exists offline_v2_server_receipts_server_event_id_key;
alter table public.offline_v2_server_receipts
  add constraint offline_v2_server_receipts_business_server_event_key
  unique(business_id,server_event_id);

-- Unique constraints containing client_tx_id become tenant-scoped.
do $unique_constraints$
declare
  r record;
  cols text;
  new_cols text;
  pred text;
begin
  for r in
    select c.oid,c.conrelid,c.conname,t.relname,
           array_agg(a.attname order by u.ord) cols
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace and n.nspname='public'
    cross join lateral unnest(c.conkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum
    where c.contype='u'
      and exists(
        select 1 from unnest(c.conkey) k
        join pg_attribute x on x.attrelid=c.conrelid and x.attnum=k
        where x.attname='client_tx_id'
      )
      and exists(
        select 1 from pg_attribute x
        where x.attrelid=c.conrelid and x.attname='business_id'
          and x.attnum>0 and not x.attisdropped
      )
    group by c.oid,c.conrelid,c.conname,t.relname
  loop
    cols:=array_to_string(r.cols,',');
    if 'business_id'=any(r.cols) then continue; end if;
    new_cols:='business_id,'||cols;
    execute format('alter table public.%I drop constraint %I',r.relname,r.conname);
    execute format('alter table public.%I add constraint %I unique(%s)',r.relname,r.conname,new_cols);
  end loop;
end
$unique_constraints$;

-- Standalone unique indexes (including partial indexes) containing client_tx_id.
do $unique_indexes$
declare
  r record;
  cols text;
  predicate text;
  replacement text;
begin
  for r in
    select i.indexrelid,
           idx.relname index_name,
           tbl.relname table_name,
           i.indrelid,
           pg_get_expr(i.indpred,i.indrelid) predicate,
           array_agg(a.attname order by u.ord) cols
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    cross join lateral unnest(i.indkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
    where i.indisunique
      and not i.indisprimary
      and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)
      and exists(
        select 1 from unnest(i.indkey) k
        join pg_attribute x on x.attrelid=i.indrelid and x.attnum=k
        where x.attname='client_tx_id'
      )
      and exists(
        select 1 from pg_attribute x
        where x.attrelid=i.indrelid and x.attname='business_id'
          and x.attnum>0 and not x.attisdropped
      )
    group by i.indexrelid,idx.relname,tbl.relname,i.indrelid,i.indpred
  loop
    if 'business_id'=any(r.cols) then continue; end if;
    cols:='business_id,'||array_to_string(r.cols,',');
    replacement:=format(
      'create unique index %I on public.%I(%s)%s',
      r.index_name,r.table_name,cols,
      case when r.predicate is null then '' else ' where '||r.predicate end
    );
    execute format('drop index public.%I',r.index_name);
    execute replacement;
  end loop;
end
$unique_indexes$;

-- No tenant-owned unique client_tx identity may remain globally scoped.
do $proof$
declare bad text;
begin
  select string_agg(tbl.relname||'.'||idx.relname,', ' order by tbl.relname,idx.relname)
  into bad
  from pg_index i
  join pg_class idx on idx.oid=i.indexrelid
  join pg_class tbl on tbl.oid=i.indrelid
  join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
  where i.indisunique
    and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
    and exists(
      select 1 from unnest(i.indkey) k
      join pg_attribute x on x.attrelid=i.indrelid and x.attnum=k
      where x.attname='client_tx_id'
    )
    and not exists(
      select 1 from unnest(i.indkey) k
      join pg_attribute x on x.attrelid=i.indrelid and x.attnum=k
      where x.attname='business_id'
    );
  if bad is not null then
    raise exception 'MULTITENANT_V1 global client_tx uniqueness remains: %',bad;
  end if;
end
$proof$;

commit;
