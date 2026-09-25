-- Sharawla POS Point 4
-- Gate 2: Transitive Context Primitives V1
-- SOURCE-ONLY. No deployment, cutover, canonical activation, or public RPC replacement.
--
-- Gate 2 contract:
--   resolve/recover/offline preparation are read-only;
--   persist is a post-guard primitive and refuses an absent guard proof;
--   execution consumes frozen evidence only and never resolves a current Recipe;
--   Offline preparation is classification only; Core locked replay verification remains authoritative.

create or replace function public.food_resolve_operation_stock_context_v1(
  p_client_tx_id text,
  p_branch_id bigint,
  p_items jsonb,
  p_resolution_instant timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_at timestamptz:=p_resolution_instant;
  v_item jsonb;
  v_line_uid uuid;
  v_product_id bigint;
  v_variant_id bigint;
  v_qty numeric;
  v_recipe_version bigint;
  v_output_qty numeric;
  v_effects jsonb;
  v_lines jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_tx is null or p_branch_id is null or p_branch_id<=0 then raise exception 'Frozen Context identity غير مكتملة'; end if;
  if v_at is null then raise exception 'Frozen Context resolution instant مطلوب'; end if;
  if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Frozen Context items غير صالحة'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_line_uid:=nullif(v_item->>'line_uid','')::uuid;
    v_product_id:=nullif(v_item->>'product_id','')::bigint;
    v_variant_id:=nullif(v_item->>'variant_id','')::bigint;
    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
    if v_line_uid is null then raise exception 'line_uid مطلوب لكل Food line'; end if;
    if v_product_id is null or v_qty<=0 then
      v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
        'line_uid',v_line_uid,'product_id',v_product_id,'variant_id',v_variant_id,
        'quantity',v_qty,'recipe_version_id',null,'effects','[]'::jsonb
      ));
      continue;
    end if;

    select rv.id,rv.output_quantity into v_recipe_version,v_output_qty
    from public.food_recipe_headers h
    join public.food_recipe_versions rv on rv.recipe_id=h.id and rv.status='active'
    where h.active=true and h.recipe_kind='sale' and h.product_id=v_product_id
      and (h.variant_id is null or h.variant_id=v_variant_id)
      and (rv.effective_from is null or rv.effective_from<=v_at)
      and (rv.effective_to is null or rv.effective_to>v_at)
    order by case when h.variant_id is not null and h.variant_id=v_variant_id then 0 else 1 end,h.id desc
    limit 1;

    if v_recipe_version is null then
      v_effects:='[]'::jsonb;
    else
      with base_effects as (
        select l.ingredient_id,'base'::text source_kind,null::bigint modifier_id,
          round(l.base_quantity*v_qty/greatest(v_output_qty,0.000001),6) base_quantity,
          coalesce(i.track_inventory,true) track_inventory,
          coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) unit_cost
        from public.food_recipe_lines l
        join public.ingredients i on i.id=l.ingredient_id and i.active is distinct from false
        left join public.ingredient_stock s on s.branch_id=p_branch_id and s.ingredient_id=i.id
        where l.recipe_version_id=v_recipe_version
          and not exists (
            select 1 from public.food_recipe_removal_mappings rm
            where rm.recipe_version_id=v_recipe_version and rm.ingredient_id=l.ingredient_id
              and lower(trim(rm.component_name)) in (
                select lower(trim(x)) from jsonb_array_elements_text(coalesce(v_item->'removed','[]'::jsonb)) x
              )
          )
      ), modifier_effects as (
        select mi.ingredient_id,'modifier'::text source_kind,mi.modifier_id,
          round(mi.base_quantity_delta*v_qty/greatest(v_output_qty,0.000001),6) base_quantity,
          coalesce(i.track_inventory,true) track_inventory,
          coalesce(nullif(s.average_unit_cost,0),coalesce(i.cost_per_unit,0))::numeric(18,6) unit_cost
        from public.food_modifier_recipe_impacts mi
        join public.ingredients i on i.id=mi.ingredient_id and i.active is distinct from false
        left join public.ingredient_stock s on s.branch_id=p_branch_id and s.ingredient_id=i.id
        where mi.recipe_version_id=v_recipe_version
          and mi.modifier_id in (
            select nullif(x->>'id','')::bigint from jsonb_array_elements(coalesce(v_item->'modifiers','[]'::jsonb)) x
          )
      ), effects as (
        select * from base_effects where base_quantity>0
        union all
        select * from modifier_effects where base_quantity>0
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'ingredient_id',ingredient_id,'source_kind',source_kind,'modifier_id',modifier_id,
        'base_quantity',base_quantity,'track_inventory',track_inventory,'unit_cost',unit_cost,
        'branch_id',p_branch_id
      ) order by ingredient_id,source_kind,modifier_id nulls first),'[]'::jsonb)
      into v_effects from effects;
    end if;

    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'line_uid',v_line_uid,'product_id',v_product_id,'variant_id',v_variant_id,
      'quantity',v_qty,'recipe_version_id',v_recipe_version,'effects',v_effects
    ));
  end loop;

  return jsonb_build_object(
    'contract','sharawla.point4.food-frozen-context.v1',
    'client_tx_id',v_tx,'branch_id',p_branch_id,'resolution_instant',v_at,'lines',v_lines
  );
end;
$function$;

create or replace function public.food_recover_operation_frozen_evidence_v1(
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_header public.food_operation_frozen_evidence%rowtype; v_lines jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  select * into v_header from public.food_operation_frozen_evidence
  where client_tx_id=nullif(trim(coalesce(p_client_tx_id,'')),'');
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_tx_id',l.client_tx_id,'line_uid',l.line_uid,'order_item_id',l.order_item_id,
    'order_id',l.order_id,'branch_id',l.branch_id,'line_ordinal',l.line_ordinal,
    'recipe_version_id',l.recipe_version_id,'execution_evidence',l.execution_evidence,
    'evidence_digest',l.evidence_digest
  ) order by l.line_ordinal),'[]'::jsonb) into v_lines
  from public.food_operation_frozen_evidence_lines l where l.client_tx_id=v_header.client_tx_id;
  if jsonb_array_length(v_lines)=0 then raise exception 'Post-contract Frozen Evidence غير مكتملة'; end if;
  return jsonb_build_object(
    'contract_version',v_header.contract_version,'client_tx_id',v_header.client_tx_id,
    'order_id',v_header.order_id,'branch_id',v_header.branch_id,
    'resolution_instant',v_header.resolution_instant,'context_digest',v_header.context_digest,
    'context',v_header.context_json,'lines',v_lines
  );
end;
$function$;

create or replace function public.food_persist_operation_frozen_evidence_v1(
  p_context jsonb,
  p_order_id bigint,
  p_saved_items jsonb,
  p_guards_complete boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_context->>'client_tx_id','')),'');
  v_branch bigint:=nullif(p_context->>'branch_id','')::bigint;
  v_at timestamptz:=nullif(p_context->>'resolution_instant','')::timestamptz;
  v_digest text:=md5(coalesce(p_context::text,''));
  v_pair record; v_line_uid uuid; v_order_item_id bigint; v_recipe bigint; v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if p_guards_complete is distinct from true then raise exception 'Frozen Evidence persistence requires completed ownership guards'; end if;
  if v_tx is null or v_branch is null or v_at is null or p_order_id is null then raise exception 'Frozen Evidence identity غير مكتملة'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and client_tx_id=v_tx and branch_id=v_branch)
    then raise exception 'Frozen Evidence order identity mismatch'; end if;

  insert into public.food_operation_frozen_evidence(
    client_tx_id,contract_version,order_id,branch_id,resolution_instant,context_digest,context_json
  ) values(
    v_tx,'sharawla.point4.food-frozen-evidence.v1',p_order_id,v_branch,v_at,v_digest,p_context
  ) on conflict(client_tx_id) do nothing;

  for v_pair in
    select c.value context_line,s.value saved_item,c.ord::integer line_ordinal
    from jsonb_array_elements(coalesce(p_context->'lines','[]'::jsonb)) with ordinality c(value,ord)
    join jsonb_array_elements(coalesce(p_saved_items,'[]'::jsonb)) with ordinality s(value,ord) using(ord)
  loop
    v_line_uid:=nullif(v_pair.context_line->>'line_uid','')::uuid;
    v_order_item_id:=nullif(v_pair.saved_item->>'id','')::bigint;
    v_recipe:=nullif(v_pair.context_line->>'recipe_version_id','')::bigint;
    if v_line_uid is null or v_order_item_id is null then raise exception 'Frozen Evidence line binding غير مكتمل'; end if;
    if not exists(select 1 from public.order_items where id=v_order_item_id and order_id=p_order_id)
      then raise exception 'Frozen Evidence order item mismatch'; end if;
    insert into public.food_operation_frozen_evidence_lines(
      client_tx_id,line_uid,order_item_id,order_id,branch_id,line_ordinal,recipe_version_id,execution_evidence,evidence_digest
    ) values(
      v_tx,v_line_uid,v_order_item_id,p_order_id,v_branch,v_pair.line_ordinal,v_recipe,
      v_pair.context_line,md5(v_pair.context_line::text)
    ) on conflict(client_tx_id,line_uid) do nothing;
    v_count:=v_count+1;
  end loop;
  if v_count<>jsonb_array_length(coalesce(p_context->'lines','[]'::jsonb))
     or v_count<>jsonb_array_length(coalesce(p_saved_items,'[]'::jsonb))
    then raise exception 'Frozen Evidence line cardinality mismatch'; end if;
  return public.food_recover_operation_frozen_evidence_v1(v_tx);
end;
$function$;

create or replace function public.food_execute_order_consumption_from_evidence_v1(
  p_client_tx_id text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_evidence jsonb; v_line jsonb; v_effect jsonb; v_stock public.ingredient_stock%rowtype;
  v_order_item bigint; v_recipe bigint; v_qty numeric; v_need numeric; v_unit numeric; v_new numeric;
  v_base_cost numeric; v_mod_cost numeric; v_total numeric; v_branch bigint;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_evidence:=public.food_recover_operation_frozen_evidence_v1(p_client_tx_id);
  if v_evidence is null then raise exception 'Frozen Evidence مطلوبة للتنفيذ'; end if;
  v_branch:=(v_evidence->>'branch_id')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('food-consume-order:'||(v_evidence->>'order_id'),0));

  for v_line in select value from jsonb_array_elements(v_evidence->'lines')
  loop
    v_order_item:=(v_line->>'order_item_id')::bigint;
    if exists(select 1 from public.food_order_item_cost_snapshots where order_item_id=v_order_item) then continue; end if;
    v_recipe:=nullif(v_line->>'recipe_version_id','')::bigint;
    v_qty:=coalesce((v_line#>>'{execution_evidence,quantity}')::numeric,0);
    if v_recipe is null or v_qty<=0 then continue; end if;
    v_base_cost:=0; v_mod_cost:=0;
    for v_effect in select value from jsonb_array_elements(coalesce(v_line#>'{execution_evidence,effects}','[]'::jsonb))
    loop
      v_need:=coalesce((v_effect->>'base_quantity')::numeric,0);
      if v_need<=0 then continue; end if;
      v_unit:=coalesce((v_effect->>'unit_cost')::numeric,0);
      if coalesce((v_effect->>'track_inventory')::boolean,true) then
        insert into public.ingredient_stock(branch_id,ingredient_id,quantity)
        values(v_branch,(v_effect->>'ingredient_id')::bigint,0) on conflict(branch_id,ingredient_id) do nothing;
        select * into v_stock from public.ingredient_stock
        where branch_id=v_branch and ingredient_id=(v_effect->>'ingredient_id')::bigint for update;
        v_unit:=coalesce(nullif(v_stock.average_unit_cost,0),v_unit,0);
        if v_stock.quantity<v_need then raise exception 'مخزون الخامة غير كافٍ للخامة %',(v_effect->>'ingredient_id'); end if;
        v_new:=round(v_stock.quantity-v_need,6);
        update public.ingredient_stock set quantity=v_new,updated_at=now() where id=v_stock.id;
        insert into public.stock_movements(branch_id,ingredient_id,movement_type,quantity,reference_type,reference_id,notes)
        values(v_branch,(v_effect->>'ingredient_id')::bigint,'sale',-v_need,'order_item',v_order_item,'Frozen Evidence V1');
      end if;
      insert into public.food_order_item_consumption_snapshots(
        order_item_id,recipe_version_id,ingredient_id,source_kind,modifier_id,base_quantity,unit_cost_snapshot
      ) values(
        v_order_item,v_recipe,(v_effect->>'ingredient_id')::bigint,v_effect->>'source_kind',
        nullif(v_effect->>'modifier_id','')::bigint,v_need,v_unit
      );
      if v_effect->>'source_kind'='modifier' then v_mod_cost:=v_mod_cost+(v_need*v_unit);
      else v_base_cost:=v_base_cost+(v_need*v_unit); end if;
    end loop;
    v_total:=round(v_base_cost+v_mod_cost,6);
    insert into public.food_order_item_cost_snapshots(order_item_id,recipe_version_id,base_recipe_cost,modifier_cost,total_food_cost)
    values(v_order_item,v_recipe,round(v_base_cost,6),round(v_mod_cost,6),v_total)
    on conflict(order_item_id) do nothing;
    update public.order_items set cost=round(v_total/greatest(v_qty,0.000001),6) where id=v_order_item;
  end loop;
  return p_result;
end;
$function$;

create or replace function public.sharawla_offline_v2_prepare_stock_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tx text:=nullif(trim(coalesce(p_event->>'client_tx_id','')),'');
  v_digest text:=nullif(trim(coalesce(p_event->>'payload_digest','')),'');
  v_operation text:=nullif(trim(coalesce(p_event->>'operation_type','')),'');
  v_rpc text:=nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')),'');
  v_protocol integer:=coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device text:=nullif(trim(coalesce(p_event->>'device_id','')),'');
  v_sequence bigint:=coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint:=coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint:=coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_receipt public.offline_v2_server_receipts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='غير مصرح'; end if;
  if v_protocol<>2 or v_tx is null or v_digest is null or v_operation is null or v_rpc is null
     or v_device is null or v_sequence<=0 or v_branch<=0 or v_employee<=0
    then raise exception using errcode='22023',message='Offline V2 preparation contract غير مكتمل'; end if;
  if public.current_employee_id() is distinct from v_employee
    then raise exception using errcode='42501',message='بيانات الموظف غير مطابقة لجلسة المزامنة'; end if;

  select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
  if found then
    if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device
       or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid()
      then raise exception using errcode='22000',message='Offline V2 duplicate TX payload/identity mismatch'; end if;
    return jsonb_build_object(
      'classification','FULL_REPLAY','client_tx_id',v_tx,'payload_digest',v_digest,
      'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,
      'authoritative_for_execution',false
    );
  end if;

  return jsonb_build_object(
    'classification','EXECUTION_REQUIRED','client_tx_id',v_tx,'payload_digest',v_digest,
    'operation_type',v_operation,'rpc_name',v_rpc,'branch_id',v_branch,
    'authoritative_for_execution',false
  );
end;
$function$;
