-- Sharawla POS — Point 4B-4 Legacy writer hook/barrier contract
-- SOURCE ONLY. Declares contracts from the authoritative 4B-3A inventory.
-- It does not edit a Legacy writer, activate a hook, or execute cutover.

begin;

create table if not exists public.inventory_stock_cutover_hook_contracts_v2 (
  plan_digest text not null,
  function_signature text not null,
  contract_kind text not null check (contract_kind in (
    'DIRECT_PHYSICAL_WRITER','TRANSITIVE_STOCK_CALLER','DOCUMENT_WORKFLOW_BARRIER'
  )),
  original_definition_digest text not null
    check (original_definition_digest~'^[0-9a-f]{64}$'),
  direct_root_signatures jsonb not null default '[]'::jsonb
    check (jsonb_typeof(direct_root_signatures)='array'),
  required_guard text not null check (required_guard in (
    'inventory_stock_assert_legacy_write_allowed_v2',
    'inventory_stock_assert_document_workflow_allowed_v2'
  )),
  contract_digest text not null check (contract_digest~'^[0-9a-f]{64}$'),
  installation_state text not null default 'DECLARED_NOT_INSTALLED'
    check (installation_state in (
      'DECLARED_NOT_INSTALLED','VERIFIED_NOT_ACTIVE','ACTIVATED_AFTER_CONCURRENCY'
    )),
  verified_definition_digest text
    check (verified_definition_digest is null or verified_definition_digest~'^[0-9a-f]{64}$'),
  verified_at timestamptz,
  primary key(plan_digest,function_signature),
  foreign key(plan_digest,function_signature)
    references public.inventory_stock_cutover_boundaries_v2(plan_digest,function_signature)
    on delete restrict,
  constraint inventory_stock_cutover_hook_installation_proof_v2 check (
    installation_state='DECLARED_NOT_INSTALLED'
    or (verified_definition_digest is not null and verified_at is not null)
  )
);

alter table public.inventory_stock_cutover_hook_contracts_v2 enable row level security;
revoke all on public.inventory_stock_cutover_hook_contracts_v2
  from public,anon,authenticated;

-- Current routing remains Legacy because no ownership row exists before a
-- committed cutover. Balance existence is never used as ownership evidence.
create or replace function public.inventory_stock_resolve_cutover_route_v2(
  p_location_id bigint,p_item_kind text,p_item_id bigint
) returns text
language plpgsql stable security definer set search_path=''
as $$
declare
  v_owner text;
  v_protected boolean;
  v_committed_candidate boolean;
  v_canonical_committed boolean;
begin
  v_owner:=public.inventory_stock_resolve_operational_owner_v2(
    p_location_id,p_item_kind,p_item_id
  );
  select exists(
    select 1
    from public.inventory_stock_cutover_plans_v2 p
    join public.inventory_stock_cutover_candidates_v2 c using(plan_digest)
    where c.location_id=p_location_id and c.item_kind=lower(trim(p_item_kind))
      and c.item_id=p_item_id
      and p.status in ('CUTOVER_PROTECTED','FORWARD_RECOVERY_REQUIRED')
  ) into v_protected;
  select exists(
    select 1 from public.inventory_stock_cutover_plans_v2 p
    join public.inventory_stock_cutover_candidates_v2 c using(plan_digest)
    where c.location_id=p_location_id and c.item_kind=lower(trim(p_item_kind))
      and c.item_id=p_item_id and p.status='CANONICAL_COMMITTED'
  ) into v_committed_candidate;
  select exists(
    select 1 from public.inventory_stock_ownership_v2 o
    join public.inventory_stock_cutover_plans_v2 p using(plan_digest)
    where o.location_id=p_location_id and o.item_kind=lower(trim(p_item_kind))
      and o.item_id=p_item_id and p.status='CANONICAL_COMMITTED'
      and o.ownership_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE')
  ) into v_canonical_committed;

  if v_owner='NOT_CUT_OVER' and not v_protected and not v_committed_candidate then
    return 'LEGACY_ONLY';
  end if;
  if v_owner='CANONICAL_V2' and v_canonical_committed then
    if not public.inventory_stock_point4b2_concurrency_closed_v2() then
      raise exception 'INVENTORY_STOCK_ROUTE_CONCURRENCY_GATE_REQUIRED';
    end if;
    return 'CANONICAL_ONLY';
  end if;
  if v_owner='FAIL_CLOSED_FORWARD_RECOVERY' or v_protected then
    raise exception 'INVENTORY_STOCK_ROUTE_MANUAL_RECOVERY_REQUIRED';
  end if;
  raise exception 'INVENTORY_STOCK_ROUTE_UNKNOWN_OWNERSHIP';
end;
$$;

-- Build the contract only from the immutable approved_auditor_evidence already
-- stored by 4B-3B. No independent writer list is accepted as input.
create or replace function public.inventory_stock_declare_cutover_hooks_v2(
  p_plan_digest text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_plan public.inventory_stock_cutover_plans_v2%rowtype;
  v_writer jsonb;
  v_barrier jsonb;
  v_kind text;
  v_roots jsonb;
  v_contract_digest text;
  v_direct integer:=0;
  v_transitive integer:=0;
  v_documents integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('point4-stock-hooks-v2:'||p_plan_digest,0)
  );
  select * into strict v_plan
  from public.inventory_stock_cutover_plans_v2 p
  where p.plan_digest=p_plan_digest for update;
  if v_plan.source_digest<>'44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc'
    or v_plan.auditor_candidate_plan_digest<>'d54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d'
    or v_plan.legacy_writer_inventory_digest<>'26e720760b6b4d2ddf6d45470b6092dab81c15a4fb1e98c5e76043551fb0d88d'
    or jsonb_array_length(v_plan.approved_auditor_evidence->'legacy_writer_inventory')<>50
    or jsonb_array_length(v_plan.approved_auditor_evidence->'document_workflow_mutators')<>6
  then raise exception 'INVENTORY_STOCK_HOOKS_APPROVED_INVENTORY_REQUIRED'; end if;

  for v_writer in
    select value from jsonb_array_elements(
      v_plan.approved_auditor_evidence->'legacy_writer_inventory'
    ) order by value->>'signature'
  loop
    v_kind:=case when coalesce((v_writer->>'is_direct_stock_mutator')::boolean,false)
      then 'DIRECT_PHYSICAL_WRITER' else 'TRANSITIVE_STOCK_CALLER' end;
    v_roots:=coalesce(v_writer->'reaches_direct_writers','[]'::jsonb);
    if v_kind='DIRECT_PHYSICAL_WRITER' then
      v_direct:=v_direct+1;
      if not (v_roots ? (v_writer->>'signature')) then
        raise exception 'INVENTORY_STOCK_HOOKS_DIRECT_ROOT_INVALID';
      end if;
    else
      v_transitive:=v_transitive+1;
      if jsonb_array_length(v_roots)=0 then
        raise exception 'INVENTORY_STOCK_HOOKS_TRANSITIVE_ROOT_REQUIRED';
      end if;
    end if;
    v_contract_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'schema_version',1,'plan_digest',p_plan_digest,
        'function_signature',v_writer->>'signature','contract_kind',v_kind,
        'original_definition_digest',v_writer->>'definition_digest',
        'direct_root_signatures',v_roots,
        'required_guard','inventory_stock_assert_legacy_write_allowed_v2'
      )::text,'UTF8'),'sha256'),'hex');
    insert into public.inventory_stock_cutover_hook_contracts_v2(
      plan_digest,function_signature,contract_kind,original_definition_digest,
      direct_root_signatures,required_guard,contract_digest
    ) values(
      p_plan_digest,v_writer->>'signature',v_kind,v_writer->>'definition_digest',
      v_roots,'inventory_stock_assert_legacy_write_allowed_v2',v_contract_digest
    ) on conflict(plan_digest,function_signature) do update set
      contract_kind=excluded.contract_kind,
      original_definition_digest=excluded.original_definition_digest,
      direct_root_signatures=excluded.direct_root_signatures,
      required_guard=excluded.required_guard,
      contract_digest=excluded.contract_digest
    where inventory_stock_cutover_hook_contracts_v2.installation_state='DECLARED_NOT_INSTALLED';
  end loop;

  for v_barrier in
    select value from jsonb_array_elements(
      v_plan.approved_auditor_evidence->'document_workflow_mutators'
    ) order by value->>'signature'
  loop
    v_documents:=v_documents+1;
    v_contract_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      jsonb_build_object(
        'schema_version',1,'plan_digest',p_plan_digest,
        'function_signature',v_barrier->>'signature',
        'contract_kind','DOCUMENT_WORKFLOW_BARRIER',
        'original_definition_digest',v_barrier->>'definition_digest',
        'direct_root_signatures','[]'::jsonb,
        'required_guard','inventory_stock_assert_document_workflow_allowed_v2'
      )::text,'UTF8'),'sha256'),'hex');
    insert into public.inventory_stock_cutover_hook_contracts_v2(
      plan_digest,function_signature,contract_kind,original_definition_digest,
      direct_root_signatures,required_guard,contract_digest
    ) values(
      p_plan_digest,v_barrier->>'signature','DOCUMENT_WORKFLOW_BARRIER',
      v_barrier->>'definition_digest','[]'::jsonb,
      'inventory_stock_assert_document_workflow_allowed_v2',v_contract_digest
    ) on conflict(plan_digest,function_signature) do update set
      contract_kind=excluded.contract_kind,
      original_definition_digest=excluded.original_definition_digest,
      direct_root_signatures=excluded.direct_root_signatures,
      required_guard=excluded.required_guard,
      contract_digest=excluded.contract_digest
    where inventory_stock_cutover_hook_contracts_v2.installation_state='DECLARED_NOT_INSTALLED';
  end loop;

  if v_direct<>35 or v_transitive<>15 or v_documents<>6 then
    raise exception 'INVENTORY_STOCK_HOOKS_INVENTORY_COUNT_MISMATCH';
  end if;
  return jsonb_build_object(
    'plan_digest',p_plan_digest,'direct_physical_writers',v_direct,
    'transitive_stock_callers',v_transitive,'document_workflow_barriers',v_documents,
    'activated',false,'concurrency_closed',false
  );
end;
$$;

-- Verification/activation is a separate future operation. It cannot even
-- inspect-and-mark hooks while 4B-2 concurrency remains open. For each exact
-- function it verifies the deployed definition digest and required guard text;
-- transitive callers remain guard-only and never apply a physical effect.
create or replace function public.inventory_stock_verify_cutover_hooks_v2(
  p_plan_digest text
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_contract public.inventory_stock_cutover_hook_contracts_v2%rowtype;
  v_definition text;
  v_digest text;
  v_count integer:=0;
begin
  if not public.inventory_stock_point4b2_concurrency_closed_v2() then
    raise exception 'INVENTORY_STOCK_HOOKS_POINT4B2_CONCURRENCY_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('point4-stock-hooks-v2:'||p_plan_digest,0)
  );
  if (select count(*) from public.inventory_stock_cutover_hook_contracts_v2
      where plan_digest=p_plan_digest)<>56
    or (select count(*) from public.inventory_stock_cutover_hook_contracts_v2
      where plan_digest=p_plan_digest and contract_kind='DIRECT_PHYSICAL_WRITER')<>35
    or (select count(*) from public.inventory_stock_cutover_hook_contracts_v2
      where plan_digest=p_plan_digest and contract_kind='TRANSITIVE_STOCK_CALLER')<>15
    or (select count(*) from public.inventory_stock_cutover_hook_contracts_v2
      where plan_digest=p_plan_digest and contract_kind='DOCUMENT_WORKFLOW_BARRIER')<>6
  then raise exception 'INVENTORY_STOCK_HOOKS_COVERAGE_INCOMPLETE'; end if;
  if exists(
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind in ('f','p')
      and p.proname not like 'inventory_stock_%_v2'
      and pg_catalog.pg_get_functiondef(p.oid)~* (
        '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+public[.]'
        ||'(retail_inventory_balances|retail_inventory_movements|'
        ||'retail_variant_inventory_balances|retail_variant_inventory_movements|'
        ||'ingredient_stock|stock_movements|retail_stock_reservations)'
      )
      and not exists(
        select 1 from public.inventory_stock_cutover_hook_contracts_v2 c
        where c.plan_digest=p_plan_digest
          and c.function_signature in (
            p.oid::regprocedure::text,
            regexp_replace(p.oid::regprocedure::text,'^public[.]','')
          )
      )
  ) then raise exception 'INVENTORY_STOCK_HOOKS_UNKNOWN_DIRECT_WRITER'; end if;

  for v_contract in select * from public.inventory_stock_cutover_hook_contracts_v2
    where plan_digest=p_plan_digest order by function_signature
  loop
    select pg_catalog.pg_get_functiondef(p.oid) into v_definition
    from pg_catalog.pg_proc p
    where p.oid=coalesce(
      pg_catalog.to_regprocedure(v_contract.function_signature),
      pg_catalog.to_regprocedure('public.'||v_contract.function_signature)
    );
    if v_definition is null then
      raise exception 'INVENTORY_STOCK_HOOKS_FUNCTION_MISSING: %',v_contract.function_signature;
    end if;
    if v_contract.contract_kind='DOCUMENT_WORKFLOW_BARRIER' then
      if v_definition!~* 'inventory_stock_assert_document_workflow_allowed_v2[[:space:]]*[(]'
      then raise exception 'INVENTORY_STOCK_HOOKS_DOCUMENT_GUARD_MISSING: %',v_contract.function_signature;
      end if;
    elsif v_definition!~* 'inventory_stock_assert_legacy_write_allowed_v2[[:space:]]*[(]' then
      raise exception 'INVENTORY_STOCK_HOOKS_LEGACY_GUARD_MISSING: %',v_contract.function_signature;
    end if;
    v_digest:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(v_definition,'UTF8'),'sha256'
    ),'hex');
    update public.inventory_stock_cutover_hook_contracts_v2
    set installation_state='ACTIVATED_AFTER_CONCURRENCY',
      verified_definition_digest=v_digest,verified_at=now()
    where plan_digest=p_plan_digest and function_signature=v_contract.function_signature;
    update public.inventory_stock_cutover_boundaries_v2
    set hook_verified=true,verified_definition_digest=v_digest
    where plan_digest=p_plan_digest and function_signature=v_contract.function_signature;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('verified',v_count,'activated',true);
end;
$$;

revoke all on function public.inventory_stock_resolve_cutover_route_v2(bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_declare_cutover_hooks_v2(text)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_verify_cutover_hooks_v2(text)
  from public,anon,authenticated;

comment on table public.inventory_stock_cutover_hook_contracts_v2 is
  'Point 4B-4 contracts derived only from the approved 4B-3A inventory; declarations are not runtime activation.';
comment on function public.inventory_stock_verify_cutover_hooks_v2(text) is
  'Future internal activation gate; impossible while Point 4B-2 concurrency is false.';

commit;
