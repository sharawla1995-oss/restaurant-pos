-- Sharawla POS — Point 4B-3A Legacy Stock Reconciliation Read-Only Auditor
-- Discovery only: this statement never mutates Legacy or Canonical Stock V2.
-- Historical movements remain historical. Proposed openings/reservations are
-- deterministic planning evidence only and are never executed here.

with recursive
auditor_contract as materialized (
  select
    1::integer as auditor_schema_version,
    3::integer as v2_quantity_scale,
    4::integer as v2_cost_scale,
    'point4-stock-cutover-v1'::text as id_namespace
),
product_movement_rows as materialized (
  select
    m.branch_id as location_id,'product'::text as item_kind,m.product_id as item_id,
    m.id,m.movement_type,m.quantity_delta,m.balance_after,m.unit_cost,
    nullif(trim(m.client_tx_id),'') as client_tx_id,
    m.reference_type,m.reference_id,m.created_at,
    lag(m.balance_after) over(
      partition by m.branch_id,m.product_id order by m.created_at,m.id
    ) as previous_balance_after
  from public.retail_inventory_movements m
),
variant_movement_rows as materialized (
  select
    m.branch_id as location_id,'variant'::text as item_kind,m.variant_id as item_id,
    m.id,m.movement_type,m.quantity_delta,m.balance_after,m.unit_cost,
    nullif(trim(m.client_tx_id),'') as client_tx_id,
    m.reference_type,m.reference_id,m.created_at,
    lag(m.balance_after) over(
      partition by m.branch_id,m.variant_id order by m.created_at,m.id
    ) as previous_balance_after
  from public.retail_variant_inventory_movements m
),
ingredient_movement_rows as materialized (
  select
    m.branch_id as location_id,'ingredient'::text as item_kind,m.ingredient_id as item_id,
    m.id,m.movement_type,m.quantity as quantity_delta,null::numeric as balance_after,
    null::numeric as unit_cost,null::text as client_tx_id,
    null::text as reference_type,null::text as reference_id,m.created_at,
    null::numeric as previous_balance_after
  from public.stock_movements m
),
movement_rows as materialized (
  select * from product_movement_rows
  union all select * from variant_movement_rows
  union all select * from ingredient_movement_rows
),
client_tx_groups as materialized (
  select
    item_kind,client_tx_id,count(*) as use_count,
    count(distinct location_id) as location_count,
    count(distinct (location_id::text||':'||item_id::text)) as identity_count,
    count(distinct (coalesce(reference_type,'<NULL>')||':'||coalesce(reference_id,'<NULL>')))
      as document_count,
    count(distinct movement_type) as movement_type_count,
    bool_or(reference_type is null or reference_id is null) as has_missing_document_identity
  from movement_rows
  where client_tx_id is not null
  group by item_kind,client_tx_id
  having count(*)>1
),
conflicting_client_keys as materialized (
  select *
  from client_tx_groups
  where use_count<>identity_count
     or location_count<>1
     or document_count<>1
     or movement_type_count<>1
     or has_missing_document_identity
),
legitimate_multiline_client_keys as materialized (
  select *
  from client_tx_groups
  where use_count=identity_count
    and location_count=1
    and document_count=1
    and movement_type_count=1
    and not has_missing_document_identity
),
movement_facts as materialized (
  select
    location_id,item_kind,item_id,count(*) as movement_count,
    coalesce(sum(quantity_delta),0) as movement_quantity_sum,
    (array_agg(balance_after order by created_at desc,id desc)
      filter(where balance_after is not null))[1] as latest_balance_after,
    max(created_at) as latest_movement_at,
    count(*) filter(
      where previous_balance_after is not null
        and round(previous_balance_after+quantity_delta,3)<>round(balance_after,3)
    ) as movement_chain_breaks,
    count(*) filter(where unit_cost is null) as movement_rows_missing_cost,
    count(*) filter(
      where client_tx_id is not null and exists(
        select 1 from conflicting_client_keys a
        where a.item_kind=movement_rows.item_kind
          and a.client_tx_id=movement_rows.client_tx_id
      )
    ) as conflicting_client_tx_rows,
    count(*) filter(
      where client_tx_id is not null and exists(
        select 1 from legitimate_multiline_client_keys a
        where a.item_kind=movement_rows.item_kind
          and a.client_tx_id=movement_rows.client_tx_id
      )
    ) as legitimate_multiline_client_tx_rows,
    array_agg(distinct movement_type order by movement_type) as movement_types,
    array_agg(distinct movement_type order by movement_type) filter(
      where case
        when item_kind in ('product','variant') then movement_type not in (
          'opening','sale','return','waste','purchase','supplier_return',
          'transfer_out','transfer_in'
        )
        else movement_type not in (
          'opening','sale','return','waste','purchase','supplier_return',
          'transfer_out','transfer_in','stock_count','adjustment'
        )
      end
    ) as unmapped_movement_types,
    count(*) filter(where movement_type='adjustment') as unresolved_adjustment_rows
  from movement_rows
  group by location_id,item_kind,item_id
),
active_reservations as materialized (
  select
    branch_id as location_id,'product'::text as item_kind,product_id as item_id,
    count(*) as reservation_count,sum(quantity) as reserved_quantity,
    array_agg(id order by id) as reservation_ids
  from public.retail_stock_reservations
  where status='active'
  group by branch_id,product_id
),
in_flight_documents as materialized (
  select t.from_branch_id as location_id,'product'::text as item_kind,i.product_id as item_id,
         'retail_transfer'::text as document_type,t.id as document_id,t.status
  from public.retail_transfers t join public.retail_transfer_items i on i.transfer_id=t.id
  where t.status not in ('received','cancelled')
  union all
  select t.from_branch_id,'ingredient',i.ingredient_id,'ingredient_transfer',t.id,coalesce(t.status,'UNKNOWN')
  from public.stock_transfers t join public.stock_transfer_items i on i.transfer_id=t.id
  where coalesce(t.status,'UNKNOWN') not in ('received','cancelled')
  union all
  select r.source_location_id,i.item_type,
         case when i.item_type='product' then i.product_id else i.ingredient_id end,
         'central_supply_request',r.id,r.status
  from public.inventory_supply_requests r
  join public.inventory_supply_request_items i on i.request_id=r.id
  where r.status not in ('received','cancelled','rejected')
  union all
  select po.branch_id,case when i.variant_id is null then 'product' else 'variant' end,
         coalesce(i.variant_id,i.product_id),'retail_purchase_order',po.id,po.status
  from public.retail_purchase_orders po
  join public.retail_purchase_order_items i on i.purchase_order_id=po.id
  where po.status in ('approved','partially_received')
    and i.quantity_received<i.quantity_ordered
  union all
  select p.branch_id,'ingredient',i.ingredient_id,'ingredient_purchase_order',p.id,p.status
  from public.purchases p join public.purchase_items i on i.purchase_id=p.id
  where p.status in ('approved','partially_received')
    and i.received_quantity<i.quantity
  union all
  select c.branch_id,'product',i.product_id,'retail_stock_count',c.id,c.status
  from public.retail_stock_counts c
  join public.retail_stock_count_items i on i.stock_count_id=c.id
  where c.status='draft'
  union all
  select w.branch_id,'ingredient',w.ingredient_id,'food_waste',w.id,w.status
  from public.food_waste_events w
  where w.status='draft'
),
in_flight_facts as materialized (
  select location_id,item_kind,item_id,count(*) as document_count,
         jsonb_agg(jsonb_build_object(
           'type',document_type,'id',document_id,'status',status
         ) order by document_type,document_id) as documents
  from in_flight_documents
  where item_id is not null and item_kind in ('product','variant','ingredient')
  group by location_id,item_kind,item_id
),
historical_documents as materialized (
  select c.branch_id as location_id,'product'::text as item_kind,i.product_id as item_id,
         'retail_stock_count'::text as document_type,c.id as document_id,c.created_at as documented_at
  from public.retail_stock_counts c
  join public.retail_stock_count_items i on i.stock_count_id=c.id
  where c.status='posted'
  union all
  select c.branch_id,'ingredient',i.ingredient_id,'food_stock_count',c.id,c.created_at
  from public.food_stock_counts c
  join public.food_stock_count_items i on i.stock_count_id=c.id
  where c.status='posted'
  union all
  select e.branch_id,'ingredient',e.ingredient_id,'ingredient_adjustment',e.id,e.created_at
  from public.food_ingredient_adjustment_events e
  union all
  select w.branch_id,'ingredient',w.ingredient_id,'food_waste',w.id,w.created_at
  from public.food_waste_events w
  where w.status='posted'
  union all
  select r.branch_id,case when i.variant_id is null then 'product' else 'variant' end,
         coalesce(i.variant_id,i.product_id),'retail_goods_receipt',r.id,r.received_at
  from public.retail_goods_receipts r
  join public.retail_goods_receipt_items i on i.goods_receipt_id=r.id
  union all
  select r.branch_id,'ingredient',i.ingredient_id,'food_purchase_receipt',r.id,r.received_at
  from public.food_purchase_receipts r
  join public.food_purchase_receipt_items i on i.receipt_id=r.id
  union all
  select q.destination_branch_id,i.item_type,
         case when i.item_type='product' then i.product_id else i.ingredient_id end,
         'central_supply_receipt',r.id,r.created_at
  from public.inventory_supply_receipts r
  join public.inventory_supply_requests q on q.id=r.request_id
  join public.inventory_supply_receipt_items ri on ri.receipt_id=r.id
  join public.inventory_supply_request_items i on i.id=ri.request_item_id
),
historical_document_facts as materialized (
  select location_id,item_kind,item_id,count(*) as historical_document_count,
         max(documented_at) as latest_document_at,
         jsonb_agg(jsonb_build_object(
           'type',document_type,'id',document_id,'at',documented_at
         ) order by documented_at,document_type,document_id) as historical_documents
  from historical_documents
  where item_id is not null and item_kind in ('product','variant','ingredient')
  group by location_id,item_kind,item_id
),
source_rows as materialized (
  select
    b.branch_id as location_id,'product'::text as item_kind,b.product_id as item_id,
    'retail_inventory_balances'::text as source_table,
    b.branch_id||':product:'||b.product_id as source_key,
    b.quantity::numeric as source_quantity,b.track_inventory,
    b.average_unit_cost::numeric as average_unit_cost,
    b.last_purchase_cost::numeric as last_unit_cost,
    3::integer as source_quantity_scale,4::integer as source_cost_scale
  from public.retail_inventory_balances b
  union all
  select
    b.branch_id,'variant',b.variant_id,'retail_variant_inventory_balances',
    b.branch_id||':variant:'||b.variant_id,b.quantity,b.track_inventory,
    b.average_unit_cost,b.last_purchase_cost,3,4
  from public.retail_variant_inventory_balances b
  union all
  select
    b.branch_id,'ingredient',b.ingredient_id,'ingredient_stock',
    b.branch_id||':ingredient:'||b.ingredient_id,b.quantity,i.track_inventory,
    b.average_unit_cost,b.last_purchase_cost,6,6
  from public.ingredient_stock b
  left join public.ingredients i on i.id=b.ingredient_id
  union all
  select
    b.branch_id,'product',b.product_id,'inventory',
    b.id::text,b.quantity,true,null::numeric,null::numeric,3,null::integer
  from public.inventory b
  where b.branch_id is not null and b.product_id is not null
),
source_duplicates as materialized (
  select source_table,location_id,item_kind,item_id,count(*) as duplicate_count
  from source_rows
  group by source_table,location_id,item_kind,item_id
  having count(*)>1
),
identity_universe as materialized (
  select location_id,item_kind,item_id from source_rows
  union
  select location_id,item_kind,item_id from movement_rows
  union
  select location_id,item_kind,item_id from active_reservations
  union
  select location_id,item_kind,item_id from in_flight_documents
  where item_id is not null and item_kind in ('product','variant','ingredient')
  union
  select location_id,item_kind,item_id from historical_documents
  where item_id is not null and item_kind in ('product','variant','ingredient')
),
identity_sources as materialized (
  select
    u.location_id,u.item_kind,u.item_id,count(s.item_id) as source_count,
    sum(s.source_quantity) as combined_source_quantity,
    bool_and(coalesce(track_inventory,false)) as all_sources_tracked,
    max(average_unit_cost) as average_unit_cost,
    max(last_unit_cost) as last_unit_cost,
    max(source_quantity_scale) as source_quantity_scale,
    max(source_cost_scale) as source_cost_scale,
    coalesce(jsonb_agg(jsonb_build_object(
      'table',source_table,'key',source_key,'quantity',source_quantity,
      'track_inventory',track_inventory,'average_unit_cost',average_unit_cost,
      'last_unit_cost',last_unit_cost,'quantity_scale',source_quantity_scale,
      'cost_scale',source_cost_scale
    ) order by source_table,source_key) filter(where s.item_id is not null),'[]'::jsonb)
      as source_evidence,
    coalesce(array_agg(source_table order by source_table)
      filter(where s.item_id is not null),'{}'::text[]) as source_tables
  from identity_universe u
  left join source_rows s using(location_id,item_kind,item_id)
  group by u.location_id,u.item_kind,u.item_id
),
candidate_base as materialized (
  select
    s.location_id,s.item_kind,s.item_id,s.source_count,s.source_tables,s.source_evidence,
    s.combined_source_quantity as source_quantity,
    coalesce(r.reserved_quantity,0) as reserved_quantity,
    case when s.combined_source_quantity is not null
      then s.combined_source_quantity-coalesce(r.reserved_quantity,0) end as available_quantity,
    case when s.all_sources_tracked then 'tracked' else 'untracked' end as tracking_state,
    coalesce(rs.allow_negative_stock,false) as allow_negative_stock,
    s.average_unit_cost,s.last_unit_cost,s.source_quantity_scale,s.source_cost_scale,
    coalesce(m.movement_count,0) as movement_count,m.latest_balance_after,
    m.latest_movement_at,coalesce(m.movement_quantity_sum,0) as movement_quantity_sum,
    case when s.combined_source_quantity is not null
      then s.combined_source_quantity-coalesce(m.movement_quantity_sum,0) end
      as inferred_preledger_opening_quantity,
    coalesce(m.movement_chain_breaks,0) as movement_chain_breaks,
    coalesce(m.movement_rows_missing_cost,0) as movement_rows_missing_cost,
    coalesce(m.conflicting_client_tx_rows,0) as conflicting_client_tx_rows,
    coalesce(m.legitimate_multiline_client_tx_rows,0)
      as legitimate_multiline_client_tx_rows,
    coalesce(m.unresolved_adjustment_rows,0) as unresolved_adjustment_rows,
    coalesce(m.movement_types,'{}'::text[]) as movement_types,
    coalesce(m.unmapped_movement_types,'{}'::text[]) as unmapped_movement_types,
    coalesce(r.reservation_count,0) as active_reservation_count,
    coalesce(r.reservation_ids,'{}'::bigint[]) as active_reservation_ids,
    coalesce(f.document_count,0) as in_flight_document_count,
    coalesce(f.documents,'[]'::jsonb) as in_flight_documents,
    coalesce(h.historical_document_count,0) as historical_document_count,
    h.latest_document_at,
    coalesce(h.historical_documents,'[]'::jsonb) as historical_documents,
    not exists(select 1 from public.branches b where b.id=s.location_id) as orphan_location,
    case s.item_kind
      when 'product' then not exists(select 1 from public.products p where p.id=s.item_id)
      when 'variant' then not exists(
        select 1 from public.product_variants v
        join public.products p on p.id=v.product_id
        where v.id=s.item_id and v.is_stock_unit=true
      )
      when 'ingredient' then not exists(select 1 from public.ingredients i where i.id=s.item_id)
      else true
    end as orphan_item,
    exists(
      select 1 from source_duplicates d
      where d.location_id=s.location_id and d.item_kind=s.item_kind and d.item_id=s.item_id
    ) as duplicate_source_key,
    case
      when s.item_kind='product' then exists(
        select 1 from public.product_variants v
        join source_rows vs on vs.location_id=s.location_id
          and vs.item_kind='variant' and vs.item_id=v.id
        where v.product_id=s.item_id and v.is_stock_unit=true
      )
      when s.item_kind='variant' then exists(
        select 1 from public.product_variants v
        join source_rows ps on ps.location_id=s.location_id
          and ps.item_kind='product' and ps.item_id=v.product_id
        where v.id=s.item_id and v.is_stock_unit=true
      )
      else false
    end as competing_product_variant_ownership
  from identity_sources s
  left join movement_facts m using(location_id,item_kind,item_id)
  left join active_reservations r using(location_id,item_kind,item_id)
  left join in_flight_facts f using(location_id,item_kind,item_id)
  left join historical_document_facts h using(location_id,item_kind,item_id)
  left join public.retail_inventory_settings rs on rs.branch_id=s.location_id
),
candidate_findings as materialized (
  select b.*,
    array_remove(array[
      case when b.orphan_location then 'ORPHAN_LOCATION' end,
      case when b.orphan_item then 'ORPHAN_ITEM_IDENTITY' end,
      case when b.source_count=0 then 'MISSING_LEGACY_BALANCE' end,
      case when b.duplicate_source_key then 'DUPLICATE_BALANCE_KEY' end,
      case when b.source_count>1 then 'MULTIPLE_LEGACY_BALANCE_OWNERS' end,
      case when b.competing_product_variant_ownership then 'PRODUCT_VARIANT_COMPETING_OWNERSHIP' end,
      case when b.latest_balance_after is not null
        and round(b.latest_balance_after,3)<>round(b.source_quantity,3)
        then 'BALANCE_LATEST_MOVEMENT_MISMATCH' end,
      case when coalesce(b.source_quantity,0)<>0 and coalesce(b.average_unit_cost,0)=0
        then 'MISSING_AVERAGE_COST_EVIDENCE' end,
      case when b.tracking_state<>'tracked' then 'TRACKING_STATE_NOT_TRACKED' end,
      case when b.source_quantity is not null and b.source_quantity<>round(b.source_quantity,3)
        or b.reserved_quantity<>round(b.reserved_quantity,3)
        then 'QUANTITY_PRECISION_EXCEEDS_V2_SCALE_3' end,
      case when coalesce(b.average_unit_cost,0)<>round(coalesce(b.average_unit_cost,0),4)
        or coalesce(b.last_unit_cost,0)<>round(coalesce(b.last_unit_cost,0),4)
        then 'COST_PRECISION_EXCEEDS_V2_SCALE_4' end,
      case when b.conflicting_client_tx_rows>0 then 'CONFLICTING_LEGACY_CLIENT_TX_ID' end,
      case when b.active_reservation_count>0 then 'ACTIVE_RESERVATIONS_REQUIRE_CONVERSION' end,
      case when b.in_flight_document_count>0 then 'IN_FLIGHT_STOCK_DOCUMENTS' end
    ]::text[],null) as readiness_blockers,
    array_remove(array[
      case when b.movement_chain_breaks>0 then 'MOVEMENT_CHAIN_DISCONTINUITY' end,
      case when b.movement_rows_missing_cost>0 then 'MOVEMENT_COST_EVIDENCE_MISSING' end,
      case when cardinality(b.unmapped_movement_types)>0 then 'UNMAPPED_LEGACY_MOVEMENT_TYPE' end,
      case when b.unresolved_adjustment_rows>0 then 'UNRESOLVED_ADJUSTMENT_COSTING' end
    ]::text[],null) as historical_warnings
  from candidate_base b
),
source_projection as materialized (
  select jsonb_agg(jsonb_build_object(
    'location_id',location_id,'item_kind',item_kind,'item_id',item_id,
    'sources',source_evidence,'quantity',source_quantity,'reserved',reserved_quantity,
    'tracking_state',tracking_state,'allow_negative_stock',allow_negative_stock,
    'average_unit_cost',average_unit_cost,'last_unit_cost',last_unit_cost,
    'movement_count',movement_count,'movement_types',movement_types,
    'latest_balance_after',latest_balance_after,'latest_movement_at',latest_movement_at,
    'movement_chain_breaks',movement_chain_breaks,
    'movement_rows_missing_cost',movement_rows_missing_cost,
    'conflicting_client_tx_rows',conflicting_client_tx_rows,
    'legitimate_multiline_client_tx_rows',legitimate_multiline_client_tx_rows,
    'unmapped_movement_types',unmapped_movement_types,
    'unresolved_adjustment_rows',unresolved_adjustment_rows,
    'active_reservation_ids',active_reservation_ids,
    'in_flight_documents',in_flight_documents,
    'historical_documents',historical_documents
  ) order by location_id,item_kind,item_id) as payload
  from candidate_findings
),
source_digest as materialized (
  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(coalesce(payload,'[]'::jsonb)::text,'UTF8'),'sha256'
  ),'hex') as digest
  from source_projection
),
candidate_plan as materialized (
  select
    c.*,
    case when cardinality(c.readiness_blockers)=0 then 'READY' else 'QUARANTINED' end as readiness,
    a.id_namespace||':opening:'||c.location_id||':'||c.item_kind||':'||c.item_id||':'||left(d.digest,24)
      as proposed_opening_client_tx_id,
    'opening:'||c.item_kind||':'||c.item_id as proposed_opening_line_key,
    case when c.active_reservation_count>0 then
      a.id_namespace||':reservation-set:'||c.location_id||':'||c.item_kind||':'||c.item_id||':'||left(d.digest,24)
    end as proposed_reservation_conversion_id,
    jsonb_build_object(
      'strategy','single_opening_at_approved_watermark',
      'legacy_history','historical_read_only_not_copied',
      'source_digest',d.digest,'source_tables',c.source_tables,
      'source_quantity',c.source_quantity,'source_reserved_quantity',c.reserved_quantity,
      'inferred_preledger_opening_quantity',c.inferred_preledger_opening_quantity
    ) as proposed_lineage
  from candidate_findings c cross join source_digest d cross join auditor_contract a
),
plan_projection as materialized (
  select jsonb_agg(jsonb_build_object(
    'location_id',location_id,'item_kind',item_kind,'item_id',item_id,
    'readiness',readiness,'blockers',readiness_blockers,
    'historical_warnings',historical_warnings,
    'opening_client_tx_id',proposed_opening_client_tx_id,
    'opening_line_key',proposed_opening_line_key,
    'reservation_conversion_id',proposed_reservation_conversion_id,
    'lineage',proposed_lineage
  ) order by location_id,item_kind,item_id) as payload
  from candidate_plan
),
plan_digest as materialized (
  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(coalesce(payload,'[]'::jsonb)::text,'UTF8'),'sha256'
  ),'hex') as digest
  from plan_projection
),
deployed_functions as materialized (
  select p.oid,p.proname,p.oid::regprocedure::text as signature,
         pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
),
direct_legacy_writers as materialized (
  select *
  from deployed_functions
  where signature not like 'inventory_stock_%_v2(%'
    and definition~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+public[.](retail_inventory_balances|retail_inventory_movements|retail_variant_inventory_balances|retail_variant_inventory_movements|ingredient_stock|stock_movements|retail_stock_reservations)'
),
writer_closure(oid,proname,signature,definition,root_signature,path) as (
  select oid,proname,signature,definition,signature,array[oid]
  from direct_legacy_writers
  union all
  select caller.oid,caller.proname,caller.signature,caller.definition,
         child.root_signature,child.path||caller.oid
  from writer_closure child
  join deployed_functions caller
    on caller.signature not like 'inventory_stock_%_v2(%'
   and caller.definition~* (
     '(^|[^a-zA-Z0-9_])(?:public[.])?'||child.proname||'[[:space:]]*[(]'
   )
  where not caller.oid=any(child.path)
),
writer_inventory_evidence as materialized (
  select
    w.signature,w.definition,
    pg_catalog.string_agg(distinct root.definition, E'\n' order by root.definition)
      as reachable_definition,
    array_agg(distinct w.root_signature order by w.root_signature) as reaches_direct_writers
  from writer_closure w
  join direct_legacy_writers root on root.signature=w.root_signature
  group by w.signature,w.definition
),
legacy_writer_inventory as materialized (
  select
    signature,
    case
      when signature~* '^sharawla_.*acceptance_(cleanup|fixture)' then 'other'
      when signature~* '(stock_count|adjust|waste)' then 'adjustment/waste/stocktake'
      when signature~* '(transfer|inventory_supply)' then 'transfer'
      when signature~* '(purchase|supplier_return|goods_receipt|landed_cost)' then 'purchasing/receiving'
      when (definition||reachable_definition)~* '(create_.*order|order_return|apply_order_consumption|apply_return_consumption)' then 'sale/return'
      when signature~* '(reserve|reservation|website_order)' then 'reservation'
      when reachable_definition~* 'retail_stock_reservations' then 'reservation'
      when reachable_definition~* 'retail_variant_inventory_(balances|movements)' then 'variant'
      when reachable_definition~* '(ingredient_stock|stock_movements)' then 'ingredient'
      when reachable_definition~* 'retail_inventory_(balances|movements)' then 'product'
      else 'other'
    end as classification,
    array_remove(array[
      case when reachable_definition~* 'retail_inventory_(balances|movements)' then 'product' end,
      case when reachable_definition~* 'retail_variant_inventory_(balances|movements)' then 'variant' end,
      case when reachable_definition~* '(ingredient_stock|stock_movements)' then 'ingredient' end,
      case when reachable_definition~* 'retail_stock_reservations' then 'reservation' end,
      case when reachable_definition~* '(retail_transfers|stock_transfers|inventory_supply_requests)' then 'transfer' end,
      case when definition~* '(retail_goods_receipts|food_purchase_receipts|purchase)' then 'purchasing/receiving' end,
      case when definition~* '(create_.*order|order_return)' then 'sale/return' end,
      case when definition~* '(stock_count|adjust|waste)' then 'adjustment/waste/stocktake' end
    ]::text[],null) as mutation_domains,
    reaches_direct_writers,
    signature=any(reaches_direct_writers) as is_direct_stock_mutator,
    pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(definition,'UTF8'),'sha256'
    ),'hex') as definition_digest
  from writer_inventory_evidence
),
document_workflow_mutators as materialized (
  select
    signature,
    'document/in-flight workflow barrier'::text as classification,
    pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(definition,'UTF8'),'sha256'
    ),'hex') as definition_digest
  from deployed_functions f
  where f.signature not in(select signature from legacy_writer_inventory)
    and f.definition~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+public[.]inventory_supply_requests'
),
writer_inventory_digest as materialized (
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    coalesce(jsonb_agg(jsonb_build_object(
      'signature',signature,'classification',classification,
      'domains',mutation_domains,'reaches_direct_writers',reaches_direct_writers,
      'definition_digest',definition_digest
    ) order by signature),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') as digest
  from legacy_writer_inventory
),
blocker_counts as materialized (
  select reason,count(*) as candidate_count
  from candidate_plan cross join lateral unnest(readiness_blockers) reason
  group by reason
),
warning_counts as materialized (
  select reason,count(*) as candidate_count
  from candidate_plan cross join lateral unnest(historical_warnings) reason
  group by reason
),
readiness_summary as materialized (
  select
    count(*) as candidate_count,
    count(*) filter(where readiness='READY') as ready_count,
    count(*) filter(where readiness='QUARANTINED') as quarantined_count,
    count(*) filter(where in_flight_document_count>0) as identities_with_in_flight_documents,
    count(*) filter(where active_reservation_count>0) as identities_with_active_reservations
  from candidate_plan
)
select jsonb_build_object(
  'auditor',jsonb_build_object(
    'name','Point 4B-3A Legacy Stock Reconciliation Auditor',
    'schema_version',(select auditor_schema_version from auditor_contract),
    'mode','READ_ONLY','history_strategy','legacy_history_remains_historical',
    'cutover_executed',false,'canonical_writer_called',false
  ),
  'digests',jsonb_build_object(
    'source',(select digest from source_digest),
    'candidate_plan',(select digest from plan_digest),
    'legacy_writer_inventory',(select digest from writer_inventory_digest)
  ),
  'summary',(select to_jsonb(readiness_summary) from readiness_summary),
  'blocker_counts',coalesce((
    select jsonb_object_agg(reason,candidate_count order by reason) from blocker_counts
  ),'{}'::jsonb),
  'historical_warning_counts',coalesce((
    select jsonb_object_agg(reason,candidate_count order by reason) from warning_counts
  ),'{}'::jsonb),
  'candidates',coalesce((select payload from plan_projection),'[]'::jsonb),
  'candidate_evidence',coalesce((
    select jsonb_agg(to_jsonb(candidate_plan) order by location_id,item_kind,item_id)
    from candidate_plan
  ),'[]'::jsonb),
  'legacy_writer_inventory',coalesce((
    select jsonb_agg(to_jsonb(legacy_writer_inventory) order by signature)
    from legacy_writer_inventory
  ),'[]'::jsonb),
  'document_workflow_mutators',coalesce((
    select jsonb_agg(to_jsonb(document_workflow_mutators) order by signature)
    from document_workflow_mutators
  ),'[]'::jsonb),
  'cutover_readiness',jsonb_build_object(
    'candidate_state_ready',(
      select quarantined_count=0 and identities_with_in_flight_documents=0
        and identities_with_active_reservations=0
      from readiness_summary
    ),
    'ready_for_cutover',false,
    'blocked_by_point4b2_concurrency',true,
    'requires_point4b2_concurrency_closure',true,
    'quantity_precision_decision_pending',exists(
      select 1 from candidate_plan where source_quantity_scale>3
    ),
    'cost_precision_decision_pending',exists(
      select 1 from candidate_plan where source_cost_scale>4
    ),
    'next_action','review_only_no_backfill_no_cutover'
  )
);
