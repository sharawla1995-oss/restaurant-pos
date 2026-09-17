-- Sharawla POS — Point 4B-3B Controlled Canonical Opening/Cutover contract
-- SOURCE ONLY. This file is not deployed by this change and performs no cutover.
-- 4B-2 committed concurrency acceptance is deliberately hard-closed below.

begin;

-- An approved 4B-3A snapshot is stored verbatim. The canonical plan payload is
-- independently digested so the same approved plan replays and any changed
-- payload under the same auditor identity fails closed.
create table if not exists public.inventory_stock_cutover_plans_v2 (
  plan_digest text primary key
    check (plan_digest~'^[0-9a-f]{64}$'),
  source_digest text not null check (source_digest~'^[0-9a-f]{64}$'),
  auditor_candidate_plan_digest text not null
    check (auditor_candidate_plan_digest~'^[0-9a-f]{64}$'),
  legacy_writer_inventory_digest text not null
    check (legacy_writer_inventory_digest~'^[0-9a-f]{64}$'),
  auditor_schema_version integer not null check (auditor_schema_version=1),
  candidate_count integer not null check (candidate_count>0),
  status text not null default 'APPROVED_PENDING'
    check (status in (
      'APPROVED_PENDING','CUTOVER_PROTECTED','CANONICAL_COMMITTED',
      'FORWARD_RECOVERY_REQUIRED','CANCELLED_PRE_COMMIT'
    )),
  canonical_plan jsonb not null check (jsonb_typeof(canonical_plan)='array'),
  approved_auditor_evidence jsonb not null
    check (jsonb_typeof(approved_auditor_evidence)='object'),
  approved_by bigint references public.employees(id) on delete restrict,
  approved_at timestamptz not null default now(),
  committed_at timestamptz,
  recovery_reason text,
  unique(source_digest,auditor_candidate_plan_digest)
);

create table if not exists public.inventory_stock_cutover_candidates_v2 (
  plan_digest text not null references public.inventory_stock_cutover_plans_v2(plan_digest)
    on delete restrict,
  location_id bigint not null references public.branches(id) on delete restrict,
  item_kind text not null check (item_kind in ('product','variant','ingredient')),
  item_id bigint not null check (item_id>0),
  readiness text not null check (readiness='READY'),
  readiness_blockers jsonb not null default '[]'::jsonb
    check (readiness_blockers='[]'::jsonb),
  historical_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(historical_warnings)='array'),
  source_quantity numeric not null,
  source_reserved_quantity numeric not null check (source_reserved_quantity=0),
  average_unit_cost numeric,
  last_unit_cost numeric,
  source_quantity_scale integer not null,
  source_cost_scale integer,
  active_reservation_count integer not null check (active_reservation_count=0),
  in_flight_document_count integer not null check (in_flight_document_count=0),
  source_watermark jsonb not null check (jsonb_typeof(source_watermark)='object'),
  lineage jsonb not null check (jsonb_typeof(lineage)='object'),
  candidate_digest text not null check (candidate_digest~'^[0-9a-f]{64}$'),
  ownership_id text not null,
  opening_required boolean generated always as (source_quantity>0) stored,
  opening_client_tx_id text not null,
  opening_line_key text not null,
  primary key(plan_digest,location_id,item_kind,item_id),
  unique(ownership_id),
  unique(opening_client_tx_id,opening_line_key),
  constraint inventory_stock_cutover_quantity_precision_v2
    check (source_quantity=round(source_quantity,3) and source_quantity>=0),
  constraint inventory_stock_cutover_cost_precision_v2
    check (
      (average_unit_cost is null or average_unit_cost=round(average_unit_cost,4))
      and (last_unit_cost is null or last_unit_cost=round(last_unit_cost,4))
    ),
  constraint inventory_stock_cutover_positive_cost_v2
    check (source_quantity=0 or (average_unit_cost is not null and average_unit_cost>=0))
);

-- Workflow signatures are taken from the approved 4B-3A inventory. Physical
-- writers and document barriers are separate: both must be hook-verified, but
-- only physical writers own stock effects.
create table if not exists public.inventory_stock_cutover_boundaries_v2 (
  plan_digest text not null references public.inventory_stock_cutover_plans_v2(plan_digest)
    on delete restrict,
  function_signature text not null,
  boundary_kind text not null
    check (boundary_kind in ('PHYSICAL_STOCK_WRITER','DOCUMENT_WORKFLOW_BARRIER')),
  definition_digest text not null check (definition_digest~'^[0-9a-f]{64}$'),
  hook_verified boolean not null default false,
  verified_definition_digest text
    check (verified_definition_digest is null or verified_definition_digest~'^[0-9a-f]{64}$'),
  state text not null default 'LEGACY_ACTIVE'
    check (state in ('LEGACY_ACTIVE','FROZEN','CANONICAL_ACTIVE','FORWARD_RECOVERY_REQUIRED')),
  primary key(plan_digest,function_signature),
  constraint inventory_stock_cutover_hook_proof_v2 check (
    not hook_verified or verified_definition_digest is not null
  )
);

-- This control-plane row, not balance existence, owns routing. No row means
-- NOT_CUT_OVER. CUT_OVER_ZERO deliberately has no balance or physical movement.
create table if not exists public.inventory_stock_ownership_v2 (
  location_id bigint not null references public.branches(id) on delete restrict,
  item_kind text not null check (item_kind in ('product','variant','ingredient')),
  item_id bigint not null check (item_id>0),
  ownership_state text not null
    check (ownership_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE','FORWARD_RECOVERY_REQUIRED')),
  plan_digest text not null references public.inventory_stock_cutover_plans_v2(plan_digest)
    on delete restrict,
  candidate_digest text not null check (candidate_digest~'^[0-9a-f]{64}$'),
  ownership_id text not null unique,
  source_digest text not null check (source_digest~'^[0-9a-f]{64}$'),
  source_quantity numeric(18,3) not null,
  source_average_unit_cost numeric(18,4),
  source_last_unit_cost numeric(18,4),
  opening_movement_id bigint unique
    references public.inventory_stock_movements_v2(id) on delete restrict,
  source_watermark jsonb not null,
  lineage jsonb not null,
  historical_warnings jsonb not null default '[]'::jsonb,
  ownership_version bigint not null default 1 check (ownership_version>0),
  cut_over_at timestamptz not null default now(),
  primary key(location_id,item_kind,item_id),
  constraint inventory_stock_ownership_shape_v2 check (
    (ownership_state='CUT_OVER_ZERO' and source_quantity=0 and opening_movement_id is null)
    or
    (ownership_state='CANONICAL_ACTIVE' and source_quantity>0 and opening_movement_id is not null)
    or
    ownership_state='FORWARD_RECOVERY_REQUIRED'
  )
);

create table if not exists public.inventory_stock_ownership_events_v2 (
  id bigint generated by default as identity primary key,
  ownership_id text not null,
  plan_digest text not null,
  candidate_digest text not null,
  event_type text not null
    check (event_type in ('CUT_OVER_ZERO','CANONICAL_OPENING','FORWARD_RECOVERY_REQUIRED')),
  evidence jsonb not null check (jsonb_typeof(evidence)='object'),
  recorded_at timestamptz not null default now(),
  unique(ownership_id,event_type)
);

create or replace function public.inventory_stock_ownership_event_immutable_v2()
returns trigger language plpgsql security definer set search_path=''
as $$ begin raise exception 'INVENTORY_STOCK_OWNERSHIP_EVENT_IMMUTABLE'; end $$;

drop trigger if exists inventory_stock_ownership_events_v2_immutable
  on public.inventory_stock_ownership_events_v2;
create trigger inventory_stock_ownership_events_v2_immutable
before update or delete on public.inventory_stock_ownership_events_v2
for each row execute function public.inventory_stock_ownership_event_immutable_v2();

alter table public.inventory_stock_cutover_plans_v2 enable row level security;
alter table public.inventory_stock_cutover_candidates_v2 enable row level security;
alter table public.inventory_stock_cutover_boundaries_v2 enable row level security;
alter table public.inventory_stock_ownership_v2 enable row level security;
alter table public.inventory_stock_ownership_events_v2 enable row level security;

revoke all on public.inventory_stock_cutover_plans_v2 from public,anon,authenticated;
revoke all on public.inventory_stock_cutover_candidates_v2 from public,anon,authenticated;
revoke all on public.inventory_stock_cutover_boundaries_v2 from public,anon,authenticated;
revoke all on public.inventory_stock_ownership_v2 from public,anon,authenticated;
revoke all on public.inventory_stock_ownership_events_v2 from public,anon,authenticated;

-- This is intentionally false in the current source. It may only be replaced
-- by separately reviewed evidence after genuine two-session committed tests.
create or replace function public.inventory_stock_point4b2_concurrency_closed_v2()
returns boolean language sql stable security definer set search_path=''
as $$ select false $$;

-- Routing never infers ownership from a balance row. CUT_OVER_ZERO routes to
-- Canonical V2; recovery states fail closed and an absent row is NOT_CUT_OVER.
create or replace function public.inventory_stock_resolve_operational_owner_v2(
  p_location_id bigint,p_item_kind text,p_item_id bigint
) returns text language plpgsql stable security definer set search_path=''
as $$
declare v_state text;
begin
  select o.ownership_state into v_state
  from public.inventory_stock_ownership_v2 o
  where o.location_id=p_location_id and o.item_kind=lower(trim(p_item_kind))
    and o.item_id=p_item_id;
  if not found then return 'NOT_CUT_OVER'; end if;
  if v_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE') then return 'CANONICAL_V2'; end if;
  return 'FAIL_CLOSED_FORWARD_RECOVERY';
end;
$$;

-- Future Legacy hooks must call this before every physical mutation. Merely
-- installing this function freezes nothing; all 50 approved signatures must
-- be definition-digest verified before the coordinator can proceed.
create or replace function public.inventory_stock_assert_legacy_write_allowed_v2(
  p_location_id bigint,p_item_kind text,p_item_id bigint
) returns void language plpgsql volatile security definer set search_path=''
as $$
declare v_owner text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'point4-stock-owner-v2:'||p_location_id||':'||lower(trim(p_item_kind))||':'||p_item_id,0
  ));
  v_owner:=public.inventory_stock_resolve_operational_owner_v2(
    p_location_id,p_item_kind,p_item_id
  );
  if v_owner<>'NOT_CUT_OVER' then
    raise exception 'INVENTORY_STOCK_V2_LEGACY_OWNER_DENIED';
  end if;
  if exists(
    select 1 from public.inventory_stock_cutover_plans_v2 p
    join public.inventory_stock_cutover_candidates_v2 c using(plan_digest)
    where p.status='CUTOVER_PROTECTED' and c.location_id=p_location_id
      and c.item_kind=lower(trim(p_item_kind)) and c.item_id=p_item_id
  ) then raise exception 'INVENTORY_STOCK_V2_CUTOVER_PROTECTED'; end if;
end;
$$;

-- The six document-only mutators use a separate protection lock. They do not
-- own physical stock, but no new in-flight document may cross the watermark.
create or replace function public.inventory_stock_assert_document_workflow_allowed_v2(
  p_function_signature text
) returns void language plpgsql volatile security definer set search_path=''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('point4-stock-document-barrier-v2',0)
  );
  if exists(
    select 1 from public.inventory_stock_cutover_boundaries_v2 b
    join public.inventory_stock_cutover_plans_v2 p using(plan_digest)
    where b.function_signature=p_function_signature
      and b.boundary_kind='DOCUMENT_WORKFLOW_BARRIER'
      and p.status in ('CUTOVER_PROTECTED','CANONICAL_COMMITTED','FORWARD_RECOVERY_REQUIRED')
  ) then raise exception 'INVENTORY_STOCK_V2_DOCUMENT_WORKFLOW_BLOCKED'; end if;
end;
$$;

-- Future workflow adapters call this before the 4B-2 writer. A zero-cutover
-- identity is Canonical V2 even though no balance/movement exists yet.
create or replace function public.inventory_stock_assert_canonical_write_allowed_v2(
  p_location_id bigint,p_item_kind text,p_item_id bigint
) returns void language plpgsql stable security definer set search_path=''
as $$
begin
  if public.inventory_stock_resolve_operational_owner_v2(
    p_location_id,p_item_kind,p_item_id
  )<>'CANONICAL_V2' then
    raise exception 'INVENTORY_STOCK_V2_CANONICAL_OWNER_REQUIRED';
  end if;
end;
$$;

-- Plans are staged only by a privileged, reviewed control-plane operation.
-- The input is the verbatim result of committed 4B-3A; warnings are retained.
create or replace function public.inventory_stock_stage_cutover_plan_v2(
  p_auditor_result jsonb,p_approved_by bigint
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_source_digest text:=p_auditor_result#>>'{digests,source}';
  v_auditor_plan_digest text:=p_auditor_result#>>'{digests,candidate_plan}';
  v_writer_digest text:=p_auditor_result#>>'{digests,legacy_writer_inventory}';
  v_plan jsonb;
  v_plan_digest text;
  v_existing public.inventory_stock_cutover_plans_v2%rowtype;
  v_candidate jsonb;
  v_candidate_digest text;
  v_location_id bigint;
  v_item_kind text;
  v_item_id bigint;
  v_quantity numeric;
  v_expected_tx text;
begin
  if p_auditor_result#>>'{auditor,mode}'<>'READ_ONLY'
    or p_auditor_result#>>'{auditor,history_strategy}'<>'legacy_history_remains_historical'
    or coalesce((p_auditor_result#>>'{summary,quarantined_count}')::integer,-1)<>0
    or coalesce((p_auditor_result#>>'{summary,identities_with_active_reservations}')::integer,-1)<>0
    or coalesce((p_auditor_result#>>'{summary,identities_with_in_flight_documents}')::integer,-1)<>0
  then raise exception 'INVENTORY_STOCK_CUTOVER_AUDITOR_NOT_READY'; end if;
  if v_source_digest<>'44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc'
    or v_auditor_plan_digest<>'d54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d'
    or v_writer_digest<>'26e720760b6b4d2ddf6d45470b6092dab81c15a4fb1e98c5e76043551fb0d88d'
    or jsonb_array_length(coalesce(p_auditor_result->'candidate_evidence','[]'::jsonb))<>3
    or jsonb_array_length(coalesce(p_auditor_result->'legacy_writer_inventory','[]'::jsonb))<>50
    or jsonb_array_length(coalesce(p_auditor_result->'document_workflow_mutators','[]'::jsonb))<>6
  then raise exception 'INVENTORY_STOCK_CUTOVER_APPROVED_PLAN_REQUIRED'; end if;
  if v_source_digest!~'^[0-9a-f]{64}$' or v_auditor_plan_digest!~'^[0-9a-f]{64}$'
    or v_writer_digest!~'^[0-9a-f]{64}$'
  then raise exception 'INVENTORY_STOCK_CUTOVER_DIGEST_INVALID'; end if;

  select jsonb_agg(jsonb_build_object(
    'location_id',(c->>'location_id')::bigint,'item_kind',c->>'item_kind',
    'item_id',(c->>'item_id')::bigint,'readiness',c->>'readiness',
    'blockers',c->'readiness_blockers','historical_warnings',c->'historical_warnings',
    'source_quantity',c->'source_quantity','source_reserved_quantity',c->'reserved_quantity',
    'average_unit_cost',c->'average_unit_cost','last_unit_cost',c->'last_unit_cost',
    'source_quantity_scale',c->'source_quantity_scale','source_cost_scale',c->'source_cost_scale',
    'active_reservation_count',c->'active_reservation_count',
    'in_flight_document_count',c->'in_flight_document_count',
    'source_watermark',jsonb_build_object(
      'source_digest',v_source_digest,'source_evidence',c->'source_evidence',
      'latest_balance_after',c->'latest_balance_after','latest_movement_at',c->'latest_movement_at'
    ),
    'lineage',c->'proposed_lineage',
    'opening_client_tx_id',c->'proposed_opening_client_tx_id',
    'opening_line_key',c->'proposed_opening_line_key'
  ) order by (c->>'location_id')::bigint,c->>'item_kind',(c->>'item_id')::bigint)
  into v_plan
  from jsonb_array_elements(p_auditor_result->'candidate_evidence') c;
  v_plan:=coalesce(v_plan,'[]'::jsonb);
  v_plan_digest:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(jsonb_build_object(
      'cutover_schema_version',1,'source_digest',v_source_digest,
      'auditor_candidate_plan_digest',v_auditor_plan_digest,
      'legacy_writer_inventory_digest',v_writer_digest,'candidates',v_plan
    )::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_plan_digest,0));

  select * into v_existing from public.inventory_stock_cutover_plans_v2
  where source_digest=v_source_digest and auditor_candidate_plan_digest=v_auditor_plan_digest;
  if found then
    if v_existing.plan_digest<>v_plan_digest or v_existing.canonical_plan<>v_plan then
      raise exception 'INVENTORY_STOCK_CUTOVER_PLAN_CONFLICT';
    end if;
    return jsonb_build_object('reused',true,'plan_digest',v_plan_digest);
  end if;

  insert into public.inventory_stock_cutover_plans_v2(
    plan_digest,source_digest,auditor_candidate_plan_digest,legacy_writer_inventory_digest,
    auditor_schema_version,candidate_count,canonical_plan,approved_auditor_evidence,approved_by
  ) values(
    v_plan_digest,v_source_digest,v_auditor_plan_digest,v_writer_digest,1,
    jsonb_array_length(v_plan),v_plan,p_auditor_result,p_approved_by
  );

  for v_candidate in select value from jsonb_array_elements(v_plan) loop
    v_location_id:=(v_candidate->>'location_id')::bigint;
    v_item_kind:=v_candidate->>'item_kind';
    v_item_id:=(v_candidate->>'item_id')::bigint;
    v_quantity:=(v_candidate->>'source_quantity')::numeric;
    if v_candidate->>'readiness'<>'READY' or v_candidate->'blockers'<>'[]'::jsonb then
      raise exception 'INVENTORY_STOCK_CUTOVER_CANDIDATE_NOT_READY';
    end if;
    if v_candidate#>>'{lineage,legacy_history}'<>'historical_read_only_not_copied'
      or v_candidate#>>'{lineage,source_digest}'<>v_source_digest
    then raise exception 'INVENTORY_STOCK_CUTOVER_LINEAGE_INVALID'; end if;
    if v_quantity<>round(v_quantity,3) or v_quantity<0 then
      raise exception 'INVENTORY_STOCK_CUTOVER_QUANTITY_PRECISION_OR_SIGN';
    end if;
    if coalesce((v_candidate->>'source_reserved_quantity')::numeric,0)<>0
      or coalesce((v_candidate->>'active_reservation_count')::integer,0)<>0
    then raise exception 'INVENTORY_STOCK_CUTOVER_ACTIVE_RESERVATION'; end if;
    if coalesce((v_candidate->>'in_flight_document_count')::integer,0)<>0 then
      raise exception 'INVENTORY_STOCK_CUTOVER_IN_FLIGHT_DOCUMENT';
    end if;
    v_expected_tx:='point4-stock-cutover-v1:opening:'||v_location_id||':'||v_item_kind||':'||v_item_id||':'||left(v_source_digest,24);
    if v_candidate->>'opening_client_tx_id'<>v_expected_tx
      or v_candidate->>'opening_line_key'<>'opening:'||v_item_kind||':'||v_item_id
    then raise exception 'INVENTORY_STOCK_CUTOVER_DETERMINISTIC_ID_MISMATCH'; end if;
    v_candidate_digest:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(v_candidate::text,'UTF8'),'sha256'),'hex');
    insert into public.inventory_stock_cutover_candidates_v2(
      plan_digest,location_id,item_kind,item_id,readiness,readiness_blockers,
      historical_warnings,source_quantity,source_reserved_quantity,
      average_unit_cost,last_unit_cost,source_quantity_scale,source_cost_scale,
      active_reservation_count,in_flight_document_count,source_watermark,lineage,
      candidate_digest,ownership_id,opening_client_tx_id,opening_line_key
    ) values(
      v_plan_digest,v_location_id,v_item_kind,v_item_id,'READY','[]'::jsonb,
      coalesce(v_candidate->'historical_warnings','[]'::jsonb),v_quantity,
      coalesce((v_candidate->>'source_reserved_quantity')::numeric,0),
      (v_candidate->>'average_unit_cost')::numeric,(v_candidate->>'last_unit_cost')::numeric,
      (v_candidate->>'source_quantity_scale')::integer,
      nullif(v_candidate->>'source_cost_scale','')::integer,0,0,
      v_candidate->'source_watermark',v_candidate->'lineage',v_candidate_digest,
      'point4-stock-ownership-v1:'||v_location_id||':'||v_item_kind||':'||v_item_id,
      v_expected_tx,v_candidate->>'opening_line_key'
    );
  end loop;

  insert into public.inventory_stock_cutover_boundaries_v2(
    plan_digest,function_signature,boundary_kind,definition_digest
  )
  select v_plan_digest,w->>'signature','PHYSICAL_STOCK_WRITER',w->>'definition_digest'
  from jsonb_array_elements(p_auditor_result->'legacy_writer_inventory') w
  union all
  select v_plan_digest,w->>'signature','DOCUMENT_WORKFLOW_BARRIER',w->>'definition_digest'
  from jsonb_array_elements(p_auditor_result->'document_workflow_mutators') w;
  return jsonb_build_object('reused',false,'plan_digest',v_plan_digest);
end;
$$;

-- Revalidate each candidate directly from the same Legacy source tables used
-- by 4B-3A. This is called both before and after protection/freeze.
create or replace function public.inventory_stock_revalidate_cutover_candidate_v2(
  p_plan_digest text,p_location_id bigint,p_item_kind text,p_item_id bigint
) returns boolean language plpgsql stable security definer set search_path=''
as $$
declare
  v_candidate public.inventory_stock_cutover_candidates_v2%rowtype;
  v_sources jsonb;
  v_latest_balance numeric;
  v_latest_at timestamptz;
  v_reservations integer:=0;
  v_in_flight integer:=0;
begin
  select * into strict v_candidate from public.inventory_stock_cutover_candidates_v2 c
  where c.plan_digest=p_plan_digest and c.location_id=p_location_id
    and c.item_kind=p_item_kind and c.item_id=p_item_id;

  if p_item_kind='product' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'table',s.source_table,'key',s.source_key,'quantity',s.quantity,
      'track_inventory',s.track_inventory,'average_unit_cost',s.average_unit_cost,
      'last_unit_cost',s.last_unit_cost,'quantity_scale',s.quantity_scale,
      'cost_scale',s.cost_scale
    ) order by s.source_table,s.source_key),'[]'::jsonb) into v_sources
    from (
      select 'retail_inventory_balances'::text source_table,
        b.branch_id||':product:'||b.product_id source_key,b.quantity,
        b.track_inventory,b.average_unit_cost,b.last_purchase_cost last_unit_cost,
        3 quantity_scale,4 cost_scale
      from public.retail_inventory_balances b
      where b.branch_id=p_location_id and b.product_id=p_item_id
      union all
      select 'inventory',b.id::text,b.quantity,true,null::numeric,null::numeric,3,null::integer
      from public.inventory b
      where b.branch_id=p_location_id and b.product_id=p_item_id
    ) s;
    select m.balance_after,m.created_at into v_latest_balance,v_latest_at
    from public.retail_inventory_movements m
    where m.branch_id=p_location_id and m.product_id=p_item_id
    order by m.created_at desc,m.id desc limit 1;
    select count(*) into v_reservations from public.retail_stock_reservations r
    where r.branch_id=p_location_id and r.product_id=p_item_id and r.status='active';
  elsif p_item_kind='variant' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'table','retail_variant_inventory_balances','key',b.branch_id||':variant:'||b.variant_id,
      'quantity',b.quantity,'track_inventory',b.track_inventory,
      'average_unit_cost',b.average_unit_cost,'last_unit_cost',b.last_purchase_cost,
      'quantity_scale',3,'cost_scale',4
    ) order by b.branch_id,b.variant_id),'[]'::jsonb) into v_sources
    from public.retail_variant_inventory_balances b
    where b.branch_id=p_location_id and b.variant_id=p_item_id;
    select m.balance_after,m.created_at into v_latest_balance,v_latest_at
    from public.retail_variant_inventory_movements m
    where m.branch_id=p_location_id and m.variant_id=p_item_id
    order by m.created_at desc,m.id desc limit 1;
  elsif p_item_kind='ingredient' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'table','ingredient_stock','key',b.branch_id||':ingredient:'||b.ingredient_id,
      'quantity',b.quantity,'track_inventory',i.track_inventory,
      'average_unit_cost',b.average_unit_cost,'last_unit_cost',b.last_purchase_cost,
      'quantity_scale',6,'cost_scale',6
    ) order by b.branch_id,b.ingredient_id),'[]'::jsonb) into v_sources
    from public.ingredient_stock b left join public.ingredients i on i.id=b.ingredient_id
    where b.branch_id=p_location_id and b.ingredient_id=p_item_id;
    select null::numeric,m.created_at into v_latest_balance,v_latest_at
    from public.stock_movements m
    where m.branch_id=p_location_id and m.ingredient_id=p_item_id
    order by m.created_at desc,m.id desc limit 1;
  else return false;
  end if;

  select count(*) into v_in_flight from (
    select 1 from public.retail_transfers t join public.retail_transfer_items i on i.transfer_id=t.id
      where p_item_kind='product' and t.from_branch_id=p_location_id and i.product_id=p_item_id
        and t.status not in ('received','cancelled')
    union all select 1 from public.stock_transfers t join public.stock_transfer_items i on i.transfer_id=t.id
      where p_item_kind='ingredient' and t.from_branch_id=p_location_id and i.ingredient_id=p_item_id
        and coalesce(t.status,'UNKNOWN') not in ('received','cancelled')
    union all select 1 from public.inventory_supply_requests r
      join public.inventory_supply_request_items i on i.request_id=r.id
      where r.source_location_id=p_location_id and i.item_type=p_item_kind
        and coalesce(i.product_id,i.ingredient_id)=p_item_id
        and r.status not in ('received','cancelled','rejected')
    union all select 1 from public.retail_purchase_orders o
      join public.retail_purchase_order_items i on i.purchase_order_id=o.id
      where p_item_kind in ('product','variant') and o.branch_id=p_location_id
        and ((p_item_kind='variant' and i.variant_id=p_item_id)
          or (p_item_kind='product' and i.variant_id is null and i.product_id=p_item_id))
        and o.status in ('approved','partially_received') and i.quantity_received<i.quantity_ordered
    union all select 1 from public.purchases p join public.purchase_items i on i.purchase_id=p.id
      where p_item_kind='ingredient' and p.branch_id=p_location_id and i.ingredient_id=p_item_id
        and p.status in ('approved','partially_received') and i.received_quantity<i.quantity
    union all select 1 from public.retail_stock_counts c
      join public.retail_stock_count_items i on i.stock_count_id=c.id
      where p_item_kind='product' and c.branch_id=p_location_id and i.product_id=p_item_id
        and c.status='draft'
    union all select 1 from public.food_waste_events w
      where p_item_kind='ingredient' and w.branch_id=p_location_id and w.ingredient_id=p_item_id
        and w.status='draft'
  ) pending;

  return v_sources=v_candidate.source_watermark->'source_evidence'
    and coalesce(to_jsonb(v_latest_balance),'null'::jsonb)
      is not distinct from v_candidate.source_watermark->'latest_balance_after'
    and coalesce(to_jsonb(v_latest_at),'null'::jsonb)
      is not distinct from v_candidate.source_watermark->'latest_movement_at'
    and v_reservations=0 and v_in_flight=0;
end;
$$;

-- SOURCE CONTRACT for the future one-transaction coordinator. It cannot pass
-- its first gate in current source. Later approval must replace only the
-- evidence gate and install verified hooks on every staged boundary.
create or replace function public.inventory_stock_execute_cutover_v2(
  p_plan_digest text,p_revalidated_source_digest text,p_employee_id bigint
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_plan public.inventory_stock_cutover_plans_v2%rowtype;
  v_candidate public.inventory_stock_cutover_candidates_v2%rowtype;
  v_opening jsonb;
  v_movement_id bigint;
begin
  if not public.inventory_stock_point4b2_concurrency_closed_v2() then
    raise exception 'INVENTORY_STOCK_CUTOVER_POINT4B2_CONCURRENCY_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_plan_digest,0));
  select * into strict v_plan from public.inventory_stock_cutover_plans_v2
  where plan_digest=p_plan_digest for update;
  if v_plan.status='CANONICAL_COMMITTED' then
    return jsonb_build_object('reused',true,'plan_digest',v_plan.plan_digest);
  end if;
  if v_plan.status<>'APPROVED_PENDING' then
    raise exception 'INVENTORY_STOCK_CUTOVER_PLAN_STATE_INVALID';
  end if;
  if p_revalidated_source_digest<>v_plan.source_digest then
    raise exception 'INVENTORY_STOCK_CUTOVER_STALE_WATERMARK';
  end if;
  if exists(select 1 from public.inventory_stock_cutover_candidates_v2 c
    where c.plan_digest=p_plan_digest and (
      c.readiness<>'READY' or c.readiness_blockers<>'[]'::jsonb
      or c.active_reservation_count<>0 or c.in_flight_document_count<>0
      or c.source_quantity<>round(c.source_quantity,3)
      or coalesce(c.average_unit_cost,0)<>round(coalesce(c.average_unit_cost,0),4)
    )) then raise exception 'INVENTORY_STOCK_CUTOVER_CANDIDATE_GATE_FAILED'; end if;
  if exists(
    select 1
    from public.inventory_stock_cutover_boundaries_v2 b
    left join lateral (
      select pg_catalog.pg_get_functiondef(p.oid) as definition
      from pg_catalog.pg_proc p
      where p.oid=coalesce(
        pg_catalog.to_regprocedure(b.function_signature),
        pg_catalog.to_regprocedure('public.'||b.function_signature)
      )
    ) deployed on true
    where b.plan_digest=p_plan_digest and (
      not b.hook_verified or b.verified_definition_digest is null
      or deployed.definition is null
      or pg_catalog.encode(extensions.digest(
        pg_catalog.convert_to(deployed.definition,'UTF8'),'sha256'
      ),'hex')<>b.verified_definition_digest
      or (b.boundary_kind='PHYSICAL_STOCK_WRITER'
        and deployed.definition!~* 'inventory_stock_assert_legacy_write_allowed_v2[[:space:]]*[(]')
      or (b.boundary_kind='DOCUMENT_WORKFLOW_BARRIER'
        and deployed.definition!~* 'inventory_stock_assert_document_workflow_allowed_v2[[:space:]]*[(]')
    )
  )
  then raise exception 'INVENTORY_STOCK_CUTOVER_BOUNDARY_HOOK_REQUIRED'; end if;
  if exists(select 1 from public.inventory_stock_cutover_candidates_v2 c
    join public.inventory_stock_ownership_v2 o using(location_id,item_kind,item_id)
    where c.plan_digest=p_plan_digest)
    or exists(select 1 from public.inventory_stock_cutover_candidates_v2 c
      join public.inventory_stock_balances_v2 b using(location_id,item_kind,item_id)
      where c.plan_digest=p_plan_digest)
    or exists(select 1 from public.inventory_stock_cutover_candidates_v2 c
      join public.inventory_stock_movements_v2 m using(location_id,item_kind,item_id)
      where c.plan_digest=p_plan_digest)
  then raise exception 'INVENTORY_STOCK_CUTOVER_V2_CONFLICT'; end if;

  -- Identity locks serialize against every future Legacy writer hook. A writer
  -- already in flight commits first and is caught by this revalidation; a later
  -- writer waits and then observes CUTOVER_PROTECTED/CANONICAL ownership.
  for v_candidate in select * from public.inventory_stock_cutover_candidates_v2
    where plan_digest=p_plan_digest order by location_id,item_kind,item_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'point4-stock-owner-v2:'||v_candidate.location_id||':'||v_candidate.item_kind||':'||v_candidate.item_id,0
    ));
    if not public.inventory_stock_revalidate_cutover_candidate_v2(
      p_plan_digest,v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id
    ) then raise exception 'INVENTORY_STOCK_CUTOVER_STALE_WATERMARK'; end if;
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('point4-stock-document-barrier-v2',0)
  );

  -- acquire cutover protection -> freeze exact physical writers and document
  -- barriers -> revalidate the same approved watermark under protection.
  update public.inventory_stock_cutover_plans_v2 set status='CUTOVER_PROTECTED'
  where plan_digest=p_plan_digest;
  update public.inventory_stock_cutover_boundaries_v2 set state='FROZEN'
  where plan_digest=p_plan_digest and state='LEGACY_ACTIVE';
  for v_candidate in select * from public.inventory_stock_cutover_candidates_v2
    where plan_digest=p_plan_digest order by location_id,item_kind,item_id
  loop
    if not public.inventory_stock_revalidate_cutover_candidate_v2(
      p_plan_digest,v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id
    ) then raise exception 'INVENTORY_STOCK_CUTOVER_STALE_WATERMARK_AFTER_FREEZE'; end if;
  end loop;

  for v_candidate in select * from public.inventory_stock_cutover_candidates_v2
    where plan_digest=p_plan_digest order by location_id,item_kind,item_id
  loop
    -- Foundation validation remains authoritative for product/variant identity.
    perform public.inventory_stock_validate_cutover_item_v2(
      v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id
    );
    if v_candidate.source_quantity=0 then
      -- CUT_OVER_ZERO is control-plane lineage only: no balance and no movement.
      insert into public.inventory_stock_ownership_v2(
        location_id,item_kind,item_id,ownership_state,plan_digest,candidate_digest,
        ownership_id,source_digest,source_quantity,opening_movement_id,
        source_average_unit_cost,source_last_unit_cost,source_watermark,lineage,historical_warnings
      ) values(
        v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id,'CUT_OVER_ZERO',
        p_plan_digest,v_candidate.candidate_digest,v_candidate.ownership_id,v_plan.source_digest,
        0,null,v_candidate.average_unit_cost,v_candidate.last_unit_cost,
        v_candidate.source_watermark,v_candidate.lineage,v_candidate.historical_warnings
      );
      insert into public.inventory_stock_ownership_events_v2(
        ownership_id,plan_digest,candidate_digest,event_type,evidence
      ) values(v_candidate.ownership_id,p_plan_digest,v_candidate.candidate_digest,
        'CUT_OVER_ZERO',jsonb_build_object('quantity',0,'lineage',v_candidate.lineage,
          'historical_warnings',v_candidate.historical_warnings));
    else
      v_opening:=public.inventory_stock_apply_movement_v2(
        v_candidate.opening_client_tx_id,v_candidate.opening_line_key,
        v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id,'opening',
        v_candidate.source_quantity,0,v_candidate.average_unit_cost,null,
        'legacy_cutover',p_plan_digest,null,null,now(),0,p_employee_id,null,
        jsonb_build_object('candidate_digest',v_candidate.candidate_digest,
          'lineage',v_candidate.lineage,'historical_warnings',v_candidate.historical_warnings)
      );
      v_movement_id:=(v_opening#>>'{movement,id}')::bigint;
      insert into public.inventory_stock_ownership_v2(
        location_id,item_kind,item_id,ownership_state,plan_digest,candidate_digest,
        ownership_id,source_digest,source_quantity,opening_movement_id,
        source_average_unit_cost,source_last_unit_cost,source_watermark,lineage,historical_warnings
      ) values(
        v_candidate.location_id,v_candidate.item_kind,v_candidate.item_id,'CANONICAL_ACTIVE',
        p_plan_digest,v_candidate.candidate_digest,v_candidate.ownership_id,v_plan.source_digest,
        v_candidate.source_quantity,v_movement_id,v_candidate.average_unit_cost,
        v_candidate.last_unit_cost,v_candidate.source_watermark,
        v_candidate.lineage,v_candidate.historical_warnings
      );
      insert into public.inventory_stock_ownership_events_v2(
        ownership_id,plan_digest,candidate_digest,event_type,evidence
      ) values(v_candidate.ownership_id,p_plan_digest,v_candidate.candidate_digest,
        'CANONICAL_OPENING',jsonb_build_object('movement_id',v_movement_id,
          'quantity',v_candidate.source_quantity,'lineage',v_candidate.lineage,
          'historical_warnings',v_candidate.historical_warnings));
    end if;
  end loop;

  if exists(select 1 from public.inventory_stock_cutover_candidates_v2 c
    left join public.inventory_stock_ownership_v2 o using(location_id,item_kind,item_id)
    where c.plan_digest=p_plan_digest and (
      o.ownership_id is null or o.candidate_digest<>c.candidate_digest
      or (c.source_quantity=0 and (o.ownership_state<>'CUT_OVER_ZERO'
        or o.opening_movement_id is not null))
      or (c.source_quantity>0 and (o.ownership_state<>'CANONICAL_ACTIVE'
        or o.opening_movement_id is null))
    )) then raise exception 'INVENTORY_STOCK_CUTOVER_VERIFY_FAILED'; end if;

  -- Exact workflow ownership switches only after every ownership/opening check.
  update public.inventory_stock_cutover_boundaries_v2 set state='CANONICAL_ACTIVE'
  where plan_digest=p_plan_digest and state='FROZEN';
  update public.inventory_stock_cutover_plans_v2
  set status='CANONICAL_COMMITTED',committed_at=now()
  where plan_digest=p_plan_digest;
  return jsonb_build_object('reused',false,'plan_digest',p_plan_digest,
    'status','CANONICAL_COMMITTED');
exception when others then
  -- PostgreSQL rolls back every row/movement/state change from this invocation.
  -- Before commit Legacy stays authoritative. No immutable V2 row is deleted.
  raise;
end;
$$;

-- A separately approved operator may mark a post-commit incident fail-closed.
-- This is forward recovery, never rollback to Legacy and never ledger deletion.
create or replace function public.inventory_stock_mark_forward_recovery_v2(
  p_plan_digest text,p_reason text
) returns void language plpgsql security definer set search_path=''
as $$
begin
  if trim(coalesce(p_reason,''))='' then
    raise exception 'INVENTORY_STOCK_CUTOVER_RECOVERY_REASON_REQUIRED';
  end if;
  update public.inventory_stock_cutover_plans_v2
  set status='FORWARD_RECOVERY_REQUIRED',recovery_reason=trim(p_reason)
  where plan_digest=p_plan_digest and status='CANONICAL_COMMITTED';
  if not found then raise exception 'INVENTORY_STOCK_CUTOVER_RECOVERY_STATE_INVALID'; end if;
  update public.inventory_stock_ownership_v2
  set ownership_state='FORWARD_RECOVERY_REQUIRED',ownership_version=ownership_version+1
  where plan_digest=p_plan_digest;
  update public.inventory_stock_cutover_boundaries_v2
  set state='FORWARD_RECOVERY_REQUIRED' where plan_digest=p_plan_digest;
  insert into public.inventory_stock_ownership_events_v2(
    ownership_id,plan_digest,candidate_digest,event_type,evidence
  ) select ownership_id,plan_digest,candidate_digest,'FORWARD_RECOVERY_REQUIRED',
    jsonb_build_object('reason',trim(p_reason))
  from public.inventory_stock_ownership_v2 where plan_digest=p_plan_digest
  on conflict(ownership_id,event_type) do nothing;
end;
$$;

-- Deliberate source-only dependency: item validation is implemented locally so
-- the 4B-1/4B-2 contracts remain byte-for-byte unchanged.
create or replace function public.inventory_stock_validate_cutover_item_v2(
  p_location_id bigint,p_item_kind text,p_item_id bigint
) returns void language plpgsql stable security definer set search_path=''
as $$
declare v_parent_product_id bigint;
begin
  if not exists(select 1 from public.branches b where b.id=p_location_id
    and b.active=true and b.location_type in ('branch','central_warehouse'))
  then raise exception 'INVENTORY_STOCK_CUTOVER_LOCATION_INVALID'; end if;
  if p_item_kind='product' then
    if not exists(select 1 from public.products p where p.id=p_item_id)
      or exists(select 1 from public.product_variants v
        where v.product_id=p_item_id and v.is_stock_unit=true)
    then raise exception 'INVENTORY_STOCK_CUTOVER_PRODUCT_OWNERSHIP_CONFLICT'; end if;
  elsif p_item_kind='variant' then
    select v.product_id into v_parent_product_id from public.product_variants v
    join public.products p on p.id=v.product_id
    where v.id=p_item_id and v.is_stock_unit=true;
    if not found then raise exception 'INVENTORY_STOCK_CUTOVER_VARIANT_OWNERSHIP_INVALID'; end if;
    if exists(select 1 from public.inventory_stock_ownership_v2 o
      where o.location_id=p_location_id and o.item_kind='product'
        and o.item_id=v_parent_product_id)
    then raise exception 'INVENTORY_STOCK_CUTOVER_PRODUCT_VARIANT_CONFLICT'; end if;
  elsif p_item_kind='ingredient' then
    if not exists(select 1 from public.ingredients i where i.id=p_item_id)
    then raise exception 'INVENTORY_STOCK_CUTOVER_ITEM_NOT_FOUND'; end if;
  else raise exception 'INVENTORY_STOCK_CUTOVER_ITEM_KIND_INVALID';
  end if;
end;
$$;

revoke all on function public.inventory_stock_point4b2_concurrency_closed_v2()
  from public,anon,authenticated;
revoke all on function public.inventory_stock_resolve_operational_owner_v2(bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_assert_legacy_write_allowed_v2(bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_assert_document_workflow_allowed_v2(text)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_assert_canonical_write_allowed_v2(bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_stage_cutover_plan_v2(jsonb,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_revalidate_cutover_candidate_v2(text,bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_execute_cutover_v2(text,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_mark_forward_recovery_v2(text,text)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_validate_cutover_item_v2(bigint,text,bigint)
  from public,anon,authenticated;
revoke all on function public.inventory_stock_ownership_event_immutable_v2()
  from public,anon,authenticated;

comment on table public.inventory_stock_ownership_v2 is
  'Point 4B-3B control-plane ownership. CUT_OVER_ZERO is canonical ownership without fake stock.';
comment on function public.inventory_stock_execute_cutover_v2(text,text,bigint) is
  'Internal future coordinator. Current source always refuses until genuine 4B-2 concurrency closes.';

commit;
