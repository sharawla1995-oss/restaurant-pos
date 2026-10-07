-- Sharawla POS — Beta Multi-Tenant V1 unique-scope shadow indexes
-- SOURCE PREPARATION ONLY.
-- Adds business-scoped unique indexes without dropping legacy unique indexes.
-- This is intentionally pre-cutover: old ON CONFLICT callsites remain valid.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

do $shadow_unique$
declare
  r record;
  def text;
  newdef text;
  newname text;
begin
  for r in
    select i.indexrelid,
           i.indrelid,
           idx.relname index_name,
           tbl.relname table_name,
           am.amname access_method,
           pg_get_indexdef(i.indexrelid) indexdef
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
    join pg_am am on am.oid=idx.relam
    where i.indisunique
      and not i.indisprimary
      and tbl.relname not in (
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
      and exists(
        select 1 from pg_attribute b
        where b.attrelid=i.indrelid
          and b.attname='business_id'
          and b.attnum>0
          and not b.attisdropped
      )
      and not exists(
        select 1 from unnest(i.indkey) k
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k
        where a.attname='business_id'
      )
  loop
    if r.access_method <> 'btree' then
      raise exception 'MULTITENANT_V1 unsupported unique index method %.% uses %',
        r.table_name,r.index_name,r.access_method;
    end if;

    newname:=left('mt1u_'||r.index_name,53)||'_'||substr(md5(r.index_name),1,8);

    if to_regclass('public.'||newname) is not null then
      continue;
    end if;

    def:=r.indexdef;
    newdef:=regexp_replace(
      def,
      '^CREATE UNIQUE INDEX [^ ]+ ',
      'CREATE UNIQUE INDEX '||quote_ident(newname)||' '
    );
    newdef:=regexp_replace(
      newdef,
      'USING btree \(',
      'USING btree (business_id, ',
      1,
      1
    );

    if newdef=def or newdef not ilike '%business_id%' then
      raise exception 'MULTITENANT_V1 unable to build shadow unique for %.%',
        r.table_name,r.index_name;
    end if;

    execute newdef;
  end loop;
end
$shadow_unique$;

-- Core uniquenesses needed for a real second tenant.
do $core_unique_proof$
declare bad text;
begin
  with required(table_name,fragment) as (
    values
      ('employees','auth_user_id'),
      ('employees','username'),
      ('app_settings','key'),
      ('payment_methods','code'),
      ('promo_codes','code'),
      ('hr_employees','employee_code'),
      ('retail_website_orders','idempotency_key'),
      ('retail_website_orders','public_order_code'),
      ('retail_website_orders','reservation_key')
  ),
  bad_rows as (
    select r.*
    from required r
    where not exists(
      select 1
      from pg_index i
      join pg_class idx on idx.oid=i.indexrelid
      join pg_class tbl on tbl.oid=i.indrelid
      join pg_namespace n on n.oid=tbl.relnamespace and n.nspname='public'
      where tbl.relname=r.table_name
        and i.indisunique
        and idx.relname like 'mt1u_%'
        and pg_get_indexdef(i.indexrelid) ilike '%business_id%'
        and pg_get_indexdef(i.indexrelid) ilike '%'||r.fragment||'%'
    )
  )
  select string_agg(table_name||':'||fragment,', ')
  into bad
  from bad_rows;

  if bad is not null then
    raise exception 'MULTITENANT_V1 scoped unique shadow missing: %',bad;
  end if;
end
$core_unique_proof$;

-- Do NOT drop legacy unique constraints/indexes here. That is a later cutover
-- after every ON CONFLICT and RPC callsite has been changed to tenant scope.

commit;
