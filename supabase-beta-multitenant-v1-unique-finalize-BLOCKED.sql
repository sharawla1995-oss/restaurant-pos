-- Sharawla POS — Beta Multi-Tenant V1 unique-scope final cutover
-- SOURCE PREPARATION ONLY. Intentionally blocked until callsites are proven.
--
-- Precondition:
--   SET sharawla.multitenant_unique_callsites_ready = 'yes';
--
-- This file only performs proof. Actual legacy unique removal will be generated
-- from the final proven schema so FK dependencies and ON CONFLICT owners cannot
-- be guessed.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
  if current_setting('sharawla.multitenant_unique_callsites_ready', true) is distinct from 'yes' then
    raise exception 'MULTITENANT_V1_UNIQUE_CALLSITES_NOT_READY';
  end if;
end
$guard$;

do $proof_shadow_exists$
declare bad text;
begin
  with global_unique as (
    select i.indexrelid,idx.relname index_name,tbl.relname table_name
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    where i.indisunique
      and not i.indisprimary
      and idx.relname not like 'mt1u_%'
      and tbl.relname not in (
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(
        select 1 from pg_attribute b
        where b.attrelid=i.indrelid and b.attname='business_id'
          and b.attnum>0 and not b.attisdropped
      )
      and not exists(
        select 1 from unnest(i.indkey) k
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k
        where a.attname='business_id'
      )
  )
  select string_agg(g.table_name||'.'||g.index_name,', ')
  into bad
  from global_unique g
  where to_regclass(
    'public.'||
    (left('mt1u_'||g.index_name,53)||'_'||substr(md5(g.index_name),1,8))
  ) is null;

  if bad is not null then
    raise exception 'MULTITENANT_V1 missing business-scoped unique shadow: %',bad;
  end if;
end
$proof_shadow_exists$;

-- Hard stop by design: dropping legacy unique indexes is generated only after
-- source-level ON CONFLICT ownership mapping is complete.
raise exception 'MULTITENANT_V1_UNIQUE_FINALIZATION_GENERATOR_REQUIRED';

rollback;
