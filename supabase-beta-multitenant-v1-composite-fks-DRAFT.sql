-- Sharawla POS — Beta Multi-Tenant V1 composite parent FKs
-- SOURCE PREPARATION ONLY.
-- Requires Foundation + tenant unique-shadow phase first.
--
-- Every legacy tenant-owned FK is mirrored by a business-aware FK:
--   (business_id, child_fk...) -> (business_id, parent_key...)
-- This prevents a valid ID/code from another tenant being used as a parent.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

do $add_composite_fks$
declare
  r record;
  cname text;
begin
  for r in
    select
      fk.oid,
      fk.conname,
      child.relname child_table,
      parent.relname parent_table,
      string_agg(quote_ident(ca.attname),',' order by u.ord) child_cols,
      string_agg(quote_ident(pa.attname),',' order by u.ord) parent_cols
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    cross join lateral unnest(fk.conkey,fk.confkey) with ordinality u(catt,patt,ord)
    join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=u.catt
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=u.patt
    where fk.contype='f'
      and fk.conname not like 'mt1_%'
      and not exists(
        select 1
        from unnest(fk.conkey) k
        join pg_attribute ka on ka.attrelid=fk.conrelid and ka.attnum=k
        where ka.attname='business_id'
      )
      and child.relname not in (
        'business_auth_memberships',
        'business_device_bindings'
      )
      and parent.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
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
    group by fk.oid,fk.conname,child.relname,parent.relname
  loop
    cname:=left('mt1_'||r.conname,63);
    if not exists(
      select 1 from pg_constraint c
      where c.conrelid=format('public.%I',r.child_table)::regclass
        and c.conname=cname
    ) then
      execute format(
        'alter table public.%I add constraint %I '||
        'foreign key (business_id,%s) references public.%I(business_id,%s) not valid',
        r.child_table,cname,r.child_cols,r.parent_table,r.parent_cols
      );
    end if;
  end loop;
end
$add_composite_fks$;

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

-- Every original tenant-to-tenant FK must now have its mt1_ mirror.
do $all_fk_proof$
declare missing text;
begin
  with legacy as (
    select fk.conrelid,fk.confrelid,fk.conname,
           child.relname child_table,parent.relname parent_table
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    where fk.contype='f'
      and fk.conname not like 'mt1_%'
      and child.relname not in ('business_auth_memberships','business_device_bindings')
      and parent.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute x where x.attrelid=child.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
      and exists(select 1 from pg_attribute x where x.attrelid=parent.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
  ),
  bad as (
    select l.*
    from legacy l
    where not exists(
      select 1 from pg_constraint c
      where c.conrelid=l.conrelid
        and c.confrelid=l.confrelid
        and c.contype='f'
        and c.conname=left('mt1_'||l.conname,63)
        and c.convalidated
    )
  )
  select string_agg(child_table||'.'||conname||'->'||parent_table,', ' order by child_table,conname)
  into missing from bad;

  if missing is not null then
    raise exception 'MULTITENANT_V1 composite FK mirror missing: %',missing;
  end if;
end
$all_fk_proof$;

-- Core graph proof stays explicit so accidental schema drift cannot hide in the generic loop.
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
        and c.convalidated
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
