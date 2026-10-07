-- Sharawla POS — Beta Multi-Tenant V1 tenant-unique final cutover
-- SOURCE PREPARATION ONLY. DO NOT APPLY until isolated migration proof is PASS.
--
-- Required explicit session guards:
--   SET sharawla.multitenant_apply = 'beta-only-approved';
--   SET sharawla.multitenant_unique_callsites_ready = 'yes';
--   SET sharawla.multitenant_composite_fks_ready = 'yes';
--
-- Order requirement:
--   Foundation -> Unique Shadow -> Composite FKs -> ON CONFLICT/RPC patches -> THIS FILE.

begin;

do $guards$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
  if current_setting('sharawla.multitenant_unique_callsites_ready', true) is distinct from 'yes' then
    raise exception 'MULTITENANT_V1_UNIQUE_CALLSITES_NOT_READY';
  end if;
  if current_setting('sharawla.multitenant_composite_fks_ready', true) is distinct from 'yes' then
    raise exception 'MULTITENANT_V1_COMPOSITE_FKS_NOT_READY';
  end if;
end
$guards$;

-- Every tenant-to-tenant legacy FK must have a validated mt1_ mirror before we
-- remove the legacy global-parent FK.
do $fk_mirror_proof$
declare bad text;
begin
  with legacy as (
    select fk.oid,fk.conrelid,fk.confrelid,fk.conname,
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
      and exists(select 1 from pg_attribute a where a.attrelid=child.oid and a.attname='business_id' and a.attnum>0 and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=parent.oid and a.attname='business_id' and a.attnum>0 and not a.attisdropped)
  ),
  bad_rows as (
    select l.*
    from legacy l
    where not exists(
      select 1 from pg_constraint m
      where m.conrelid=l.conrelid
        and m.confrelid=l.confrelid
        and m.contype='f'
        and m.conname=left('mt1_'||l.conname,63)
        and m.convalidated
    )
  )
  select string_agg(child_table||'.'||conname||'->'||parent_table,', ' order by child_table,conname)
  into bad from bad_rows;

  if bad is not null then
    raise exception 'MULTITENANT_V1 cannot cut legacy FK without validated tenant mirror: %',bad;
  end if;
end
$fk_mirror_proof$;

-- Every global non-primary unique must already have a business-scoped shadow.
do $unique_shadow_proof$
declare bad text;
begin
  with g as (
    select i.indexrelid,idx.relname index_name,tbl.relname table_name
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    where i.indisunique
      and not i.indisprimary
      and idx.relname not like 'mt1u_%'
      and idx.relname not like 'mt1pk_%'
      and tbl.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
      and not exists(
        select 1 from unnest(i.indkey) k
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k
        where a.attname='business_id'
      )
  )
  select string_agg(table_name||'.'||index_name,', ' order by table_name,index_name)
  into bad
  from g
  where to_regclass(
    'public.'||(left('mt1u_'||index_name,53)||'_'||substr(md5(index_name),1,8))
  ) is null;

  if bad is not null then
    raise exception 'MULTITENANT_V1 missing tenant unique shadow: %',bad;
  end if;
end
$unique_shadow_proof$;

-- Natural/non-id primary keys also need a tenant shadow.
do $natural_pk_shadow_proof$
declare bad text;
begin
  with g as (
    select i.indexrelid,idx.relname index_name,tbl.relname table_name,
           array_agg(a.attname order by u.ord) cols
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    cross join lateral unnest(i.indkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
    where i.indisprimary
      and tbl.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
    group by i.indexrelid,idx.relname,tbl.relname
    having not(count(*)=1 and min(a.attname)='id')
  )
  select string_agg(table_name||'.'||index_name,', ' order by table_name,index_name)
  into bad
  from g
  where to_regclass(
    'public.'||(left('mt1pk_'||index_name,52)||'_'||substr(md5(index_name),1,8))
  ) is null;

  if bad is not null then
    raise exception 'MULTITENANT_V1 missing tenant primary-key shadow: %',bad;
  end if;
end
$natural_pk_shadow_proof$;

-- Switch FK enforcement from legacy global parent keys to tenant-aware mirrors.
do $drop_legacy_tenant_fks$
declare r record;
begin
  for r in
    select fk.conrelid::regclass rel,fk.conname
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
      and exists(select 1 from pg_attribute a where a.attrelid=child.oid and a.attname='business_id' and a.attnum>0 and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=parent.oid and a.attname='business_id' and a.attnum>0 and not a.attisdropped)
  loop
    execute format('alter table %s drop constraint %I',r.rel,r.conname);
  end loop;
end
$drop_legacy_tenant_fks$;

-- Convert every natural/non-id tenant PK to (business_id, old_pk_cols) by
-- reusing its already-built mt1pk_ unique shadow.
do $scope_natural_primary_keys$
declare
  r record;
  shadow_name text;
begin
  for r in
    select i.indexrelid,i.indrelid,idx.relname index_name,tbl.relname table_name,
           c.conname constraint_name,
           array_agg(a.attname order by u.ord) cols
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    join pg_constraint c on c.conindid=i.indexrelid and c.contype='p'
    cross join lateral unnest(i.indkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
    where i.indisprimary
      and tbl.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
    group by i.indexrelid,i.indrelid,idx.relname,tbl.relname,c.conname
    having not(count(*)=1 and min(a.attname)='id')
  loop
    shadow_name:=left('mt1pk_'||r.index_name,52)||'_'||substr(md5(r.index_name),1,8);
    if to_regclass('public.'||shadow_name) is null then
      raise exception 'MULTITENANT_V1 missing shadow % for %.%',shadow_name,r.table_name,r.index_name;
    end if;

    execute format('alter table public.%I drop constraint %I',r.table_name,r.constraint_name);
    execute format(
      'alter table public.%I add constraint %I primary key using index %I',
      r.table_name,r.constraint_name,shadow_name
    );
  end loop;
end
$scope_natural_primary_keys$;

-- Remove old global non-primary uniqueness. The business-scoped mt1u_ shadows
-- remain authoritative.
do $drop_global_nonprimary_unique$
declare
  r record;
begin
  for r in
    select i.indexrelid,i.indrelid,
           idx.relname index_name,tbl.relname table_name,
           c.conname constraint_name
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    left join pg_constraint c on c.conindid=i.indexrelid and c.contype='u'
    where i.indisunique
      and not i.indisprimary
      and idx.relname not like 'mt1u_%'
      and idx.relname not like 'mt1pk_%'
      and tbl.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
      and not exists(
        select 1 from unnest(i.indkey) k
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k
        where a.attname='business_id'
      )
  loop
    if r.constraint_name is not null then
      execute format('alter table public.%I drop constraint %I',r.table_name,r.constraint_name);
    else
      execute format('drop index public.%I',r.index_name);
    end if;
  end loop;
end
$drop_global_nonprimary_unique$;

-- Final proof: only simple global surrogate id PKs may remain unscoped.
do $final_unique_proof$
declare bad text;
begin
  with remaining as (
    select i.indexrelid,idx.relname index_name,tbl.relname table_name,i.indisprimary,
           array_agg(a.attname order by u.ord) cols
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    cross join lateral unnest(i.indkey) with ordinality u(attnum,ord)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
    where i.indisunique
      and tbl.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(select 1 from pg_attribute b where b.attrelid=i.indrelid and b.attname='business_id' and b.attnum>0 and not b.attisdropped)
    group by i.indexrelid,idx.relname,tbl.relname,i.indisprimary
  )
  select string_agg(table_name||'.'||index_name||'('||array_to_string(cols,',')||')',', ' order by table_name,index_name)
  into bad
  from remaining
  where not ('business_id'=any(cols))
    and not (indisprimary and array_length(cols,1)=1 and cols[1]='id');

  if bad is not null then
    raise exception 'MULTITENANT_V1 global tenant uniqueness remains: %',bad;
  end if;
end
$final_unique_proof$;

commit;
