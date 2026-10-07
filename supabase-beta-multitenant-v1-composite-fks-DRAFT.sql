-- Sharawla POS — Beta Multi-Tenant V1 composite parent FKs
-- SOURCE PREPARATION ONLY.
-- Requires Foundation to have business_id and (id,business_id) unique candidate keys.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

-- For every existing single-column FK that points at parent.id, add a second
-- FK binding the child business_id to the same parent business_id.
-- Existing legacy FK stays in place for compatibility.
do $add_composite_fks$
declare
  r record;
  cname text;
begin
  for r in
    select fk.oid,
           fk.conname,
           child.relname child_table,
           parent.relname parent_table,
           ca.attname child_col,
           pa.attname parent_col
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=fk.conkey[1]
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=fk.confkey[1]
    where fk.contype='f'
      and array_length(fk.conkey,1)=1
      and array_length(fk.confkey,1)=1
      and pa.attname='id'
      and exists(
        select 1 from pg_attribute x
        where x.attrelid=child.oid and x.attname='business_id'
          and x.attnum>0 and not x.attisdropped
      )
      and exists(
        select 1 from pg_attribute x
        where x.attrelid=parent.oid and x.attname='business_id'
          and x.attnum>0 and not x.attisdropped
      )
  loop
    cname:=left('mt1_'||r.conname,63);
    if not exists(
      select 1 from pg_constraint c
      where c.conrelid=format('public.%I',r.child_table)::regclass
        and c.conname=cname
    ) then
      execute format(
        'alter table public.%I add constraint %I '||
        'foreign key (%I,business_id) references public.%I(id,business_id) not valid',
        r.child_table,cname,r.child_col,r.parent_table
      );
    end if;
  end loop;
end
$add_composite_fks$;

-- Validate only the constraints created by this migration.
do $validate_composite_fks$
declare r record;
begin
  for r in
    select c.conrelid::regclass rel,c.conname
    from pg_constraint c
    join pg_namespace n on n.oid=(select relnamespace from pg_class where oid=c.conrelid)
    where n.nspname='public'
      and c.contype='f'
      and c.conname like 'mt1_%'
      and not c.convalidated
  loop
    execute format('alter table %s validate constraint %I',r.rel,r.conname);
  end loop;
end
$validate_composite_fks$;

-- Core graph proof: each relationship below must now have a composite tenant FK.
do $core_fk_proof$
declare missing text;
begin
  with required(child_table,parent_table) as (
    values
      ('customer_addresses','customers'),
      ('employee_branches','employees'),
      ('employee_branches','branches'),
      ('shifts','branches'),
      ('shifts','employees'),
      ('expenses','branches'),
      ('expenses','employees'),
      ('expenses','shifts'),
      ('delivery_drivers','branches'),
      ('delivery_zones','branches'),
      ('orders','branches'),
      ('orders','employees'),
      ('orders','customers'),
      ('orders','shifts'),
      ('order_items','orders'),
      ('order_items','products'),
      ('order_payments','orders'),
      ('purchase_items','purchases'),
      ('return_items','returns'),
      ('return_payments','returns'),
      ('website_order_items','website_orders'),
      ('food_recipe_versions','food_recipe_headers'),
      ('food_recipe_lines','food_recipe_versions')
  ),
  bad as (
    select r.*
    from required r
    where not exists(
      select 1
      from pg_constraint c
      join pg_class ch on ch.oid=c.conrelid
      join pg_class pa on pa.oid=c.confrelid
      join pg_namespace n on n.oid=ch.relnamespace and n.nspname='public'
      where c.contype='f'
        and c.conname like 'mt1_%'
        and ch.relname=r.child_table
        and pa.relname=r.parent_table
    )
  )
  select string_agg(child_table||'->'||parent_table,', ')
  into missing from bad;

  if missing is not null then
    raise exception 'MULTITENANT_V1 core composite FK missing: %',missing;
  end if;
end
$core_fk_proof$;

commit;
