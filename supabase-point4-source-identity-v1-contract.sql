-- Sharawla POS — Point 4 Source Identity V1 shared source-only contract.
-- Validation/canonicalization only: no workflow writer, table mutation, Offline
-- owner, adapter, or deployment is introduced by this file.
begin;

create or replace function public.point4_identity_uuid_v4_v1(p_value text)
returns text language plpgsql immutable set search_path=''
as $$
declare v text:=lower(trim(coalesce(p_value,'')));
begin
  if v!~'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'POINT4_IDENTITY_UUID_V4_REQUIRED';
  end if;
  return v;
end;
$$;

create or replace function public.point4_identity_source_document_id_v1(
  p_source_document_type text,p_source_document_id text,p_offline_capable boolean
) returns text language plpgsql immutable set search_path=''
as $$
declare
  v_type text:=lower(trim(coalesce(p_source_document_type,'')));
  v_id text:=lower(trim(coalesce(p_source_document_id,'')));
  v_uuid text;
begin
  if v_type not in (
    'sale','sale_return','stock_reservation','stock_reservation_release',
    'stock_waste','stock_damage','stock_adjustment','stocktake','purchase_grn',
    'purchase_return','inventory_transfer','supplier_invoice','supplier_payable',
    'payment','supplier_payment','expense','cash_movement','shift_settlement',
    'receivable','collection','stock_opening','reversal'
  ) then raise exception 'POINT4_IDENTITY_SOURCE_DOCUMENT_TYPE_INVALID'; end if;
  if v_id like 'uuid:%' then
    v_uuid:=public.point4_identity_uuid_v4_v1(substr(v_id,6));
    return 'uuid:'||v_uuid;
  end if;
  if v_id~'^db:[1-9][0-9]*$' then
    if coalesce(p_offline_capable,false) then
      raise exception 'POINT4_IDENTITY_OFFLINE_DOCUMENT_DB_ID_FORBIDDEN';
    end if;
    return v_id;
  end if;
  if v_type='stock_opening' and v_id~'^digest:sha256:[0-9a-f]{64}$' then
    return v_id;
  end if;
  raise exception 'POINT4_IDENTITY_SOURCE_DOCUMENT_ID_INVALID';
end;
$$;

create or replace function public.point4_identity_decimal_v1(
  p_value numeric,p_scale integer
) returns text language plpgsql immutable set search_path=''
as $$
declare v numeric;v_text text;v_integer text;v_fraction text;
begin
  if p_value is null or p_scale not between 0 and 4 then
    raise exception 'POINT4_IDENTITY_DECIMAL_INVALID';
  end if;
  if p_value='NaN'::numeric or p_value='Infinity'::numeric or p_value='-Infinity'::numeric then
    raise exception 'POINT4_IDENTITY_DECIMAL_NON_FINITE';
  end if;
  v:=round(p_value,p_scale);
  if v<>p_value then raise exception 'POINT4_IDENTITY_DECIMAL_PRECISION_LOSS'; end if;
  if v=0 then v:=0; end if;
  v_text:=v::text;
  v_integer:=split_part(v_text,'.',1);
  if length(ltrim(ltrim(v_integer,'-'),'0'))>18-p_scale then raise exception 'POINT4_IDENTITY_DECIMAL_OVERFLOW';end if;
  if p_scale=0 then return v_integer;end if;
  v_fraction:=case when position('.' in v_text)>0 then split_part(v_text,'.',2) else '' end;
  v_text:=v_integer||'.'||rpad(v_fraction,p_scale,'0');
  return v_text;
end;
$$;

create or replace function public.point4_identity_bigint_v1(
  p_value jsonb,p_positive boolean default true
) returns text language plpgsql immutable set search_path=''
as $$
declare v_type text;v_text text;v_value bigint;
begin
  if p_value is null or p_value='null'::jsonb then raise exception 'POINT4_IDENTITY_BIGINT_REQUIRED';end if;
  v_type:=jsonb_typeof(p_value);
  if v_type='number' then v_text:=p_value::text;
  elsif v_type='string' then v_text:=p_value#>>'{}';
  else raise exception 'POINT4_IDENTITY_BIGINT_TYPE_INVALID';end if;
  if v_text!~'^-?(0|[1-9][0-9]*)$' then raise exception 'POINT4_IDENTITY_BIGINT_FORMAT_INVALID';end if;
  v_value:=v_text::bigint;
  if coalesce(p_positive,true) and v_value<=0 then raise exception 'POINT4_IDENTITY_BIGINT_POSITIVE_REQUIRED';end if;
  return v_value::text;
end;
$$;

create or replace function public.point4_identity_assert_allowed_keys_v1(
  p_value jsonb,p_allowed text[]
) returns void language plpgsql immutable set search_path=''
as $$
declare v_key text;
begin
  if p_value is null or jsonb_typeof(p_value)<>'object' then raise exception 'POINT4_IDENTITY_OBJECT_REQUIRED';end if;
  select k into v_key from jsonb_object_keys(p_value) k
  where not (k=any(p_allowed)) order by k collate "C" limit 1;
  if found then raise exception 'POINT4_IDENTITY_UNKNOWN_FIELD:%',v_key;end if;
end;
$$;

create or replace function public.point4_identity_effect_line_key_v1(
  p_domain text,p_effect text,p_line_uid text,
  p_subcomponent_kind text default null,p_subcomponent_identity text default null
) returns text language plpgsql immutable set search_path=''
as $$
declare
  v_domain text:=lower(trim(coalesce(p_domain,'')));
  v_effect text:=lower(trim(coalesce(p_effect,'')));
  v_line text:=public.point4_identity_uuid_v4_v1(p_line_uid);
  v_kind text:=lower(trim(coalesce(p_subcomponent_kind,'')));
  v_sub text:=lower(trim(coalesce(p_subcomponent_identity,'')));
  v_key text;
begin
  if v_domain!~'^[a-z][a-z0-9_]*$' or v_effect!~'^[a-z][a-z0-9_]*$' then
    raise exception 'POINT4_IDENTITY_EFFECT_NAMESPACE_INVALID';
  end if;
  if (v_kind='')<>(v_sub='') then raise exception 'POINT4_IDENTITY_SUBCOMPONENT_INCOMPLETE'; end if;
  if v_kind<>'' and (v_kind!~'^[a-z][a-z0-9_]*$' or v_sub!~'^[a-z0-9][a-z0-9_-]*$') then
    raise exception 'POINT4_IDENTITY_SUBCOMPONENT_INVALID';
  end if;
  if v_kind='recipe_component' then
    v_sub:=public.point4_identity_uuid_v4_v1(v_sub);
  end if;
  if v_sub like 'v1:%' then raise exception 'POINT4_IDENTITY_NESTED_LINE_KEY_FORBIDDEN'; end if;
  v_key:='v1:'||v_domain||':'||v_effect||':'||v_line;
  if v_kind<>'' then v_key:=v_key||':'||v_kind||':'||v_sub; end if;
  return v_key;
end;
$$;

create or replace function public.point4_identity_canonical_lines_v1(p_lines jsonb)
returns jsonb language plpgsql immutable set search_path=''
as $$
declare v_result jsonb;v_count bigint;v_distinct bigint;
begin
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then
    raise exception 'POINT4_IDENTITY_LINES_ARRAY_REQUIRED';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_lines) l
    where jsonb_typeof(l)<>'object'
      or nullif(trim(l->>'line_key'),'') is null
      or l->>'line_key' like '%:v1:%'
  ) then raise exception 'POINT4_IDENTITY_LINE_KEY_INVALID'; end if;
  select count(*),count(distinct l->>'line_key') into v_count,v_distinct
  from jsonb_array_elements(p_lines) l;
  if v_count<>v_distinct then raise exception 'POINT4_IDENTITY_DUPLICATE_LINE_KEY'; end if;
  select coalesce(jsonb_agg(l order by (l->>'line_key') collate "C"),'[]'::jsonb) into v_result
  from jsonb_array_elements(p_lines) l;
  return v_result;
end;
$$;

create or replace function public.point4_identity_operation_digest_v1(
  p_operation_type text,p_client_tx_id text,
  p_source_document_type text,p_source_document_id text,p_offline_capable boolean,
  p_branch_id bigint,p_currency_code text,p_intent jsonb,p_lines jsonb,
  p_reversal_of jsonb default null,p_effective_date date default null
) returns text language plpgsql immutable set search_path=''
as $$
declare
  v_operation text:=lower(trim(coalesce(p_operation_type,'')));
  v_tx text:=lower(trim(coalesce(p_client_tx_id,'')));
  v_source_id text;
  v_lines jsonb;
  v_reversal jsonb;
  v_intent jsonb:='{}'::jsonb;
  v_envelope jsonb;
begin
  if v_operation!~'^[a-z][a-z0-9_]*$' or v_tx='' then
    raise exception 'POINT4_IDENTITY_OPERATION_OR_TX_INVALID';
  end if;
  if trim(coalesce(p_client_tx_id,''))<>v_tx then
    raise exception 'POINT4_IDENTITY_CLIENT_TX_NOT_CANONICAL';
  end if;
  if p_branch_id is not null and p_branch_id<=0 then raise exception 'POINT4_IDENTITY_BRANCH_INVALID'; end if;
  if p_intent is null or jsonb_typeof(p_intent)<>'object' then raise exception 'POINT4_IDENTITY_INTENT_OBJECT_REQUIRED'; end if;
  perform public.point4_identity_assert_allowed_keys_v1(
    p_intent,array['amount','destination_location_id','event_line_key','final','source_location_id']
  );
  if p_intent?'amount' then
    v_intent:=v_intent||jsonb_build_object('amount',public.point4_identity_decimal_v1((p_intent->>'amount')::numeric,2));
  end if;
  if p_intent?'source_location_id' then
    v_intent:=v_intent||jsonb_build_object('source_location_id',public.point4_identity_bigint_v1(p_intent->'source_location_id',true));
  end if;
  if p_intent?'destination_location_id' then
    v_intent:=v_intent||jsonb_build_object('destination_location_id',public.point4_identity_bigint_v1(p_intent->'destination_location_id',true));
  end if;
  if p_intent?'event_line_key' then
    if jsonb_typeof(p_intent->'event_line_key')<>'string'
      or nullif(trim(p_intent->>'event_line_key'),'') is null
      or p_intent->>'event_line_key' like '%:v1:%'
    then raise exception 'POINT4_IDENTITY_EVENT_LINE_KEY_INVALID';end if;
    v_intent:=v_intent||jsonb_build_object('event_line_key',trim(p_intent->>'event_line_key'));
  end if;
  if p_intent?'final' then
    if jsonb_typeof(p_intent->'final')<>'boolean' then raise exception 'POINT4_IDENTITY_BOOLEAN_REQUIRED';end if;
    v_intent:=v_intent||jsonb_build_object('final',p_intent->'final');
  end if;
  if p_reversal_of is not null and jsonb_typeof(p_reversal_of)<>'object' then raise exception 'POINT4_IDENTITY_REVERSAL_OBJECT_REQUIRED'; end if;
  if p_reversal_of is not null then
    perform public.point4_identity_assert_allowed_keys_v1(
      p_reversal_of,array['source_document_type','source_document_id','client_tx_id','line_key','operation_digest']
    );
  end if;
  if p_reversal_of is not null and (
    coalesce(p_reversal_of->>'source_document_id','')!~'^(uuid:[0-9a-f-]{36}|digest:sha256:[0-9a-f]{64}|db:[1-9][0-9]*)$'
    or nullif(p_reversal_of->>'client_tx_id','') is null
    or nullif(p_reversal_of->>'line_key','') is null
    or coalesce(p_reversal_of->>'operation_digest','')!~'^[0-9a-f]{64}$'
  ) then raise exception 'POINT4_IDENTITY_REVERSAL_CANONICAL_ID_REQUIRED'; end if;
  if p_reversal_of is not null then
    perform public.point4_identity_source_document_id_v1(
      p_reversal_of->>'source_document_type',p_reversal_of->>'source_document_id',false
    );
    if p_reversal_of->>'line_key' like '%:v1:%' then
      raise exception 'POINT4_IDENTITY_NESTED_LINE_KEY_FORBIDDEN';
    end if;
    v_reversal:=jsonb_build_object(
      'source_document_type',lower(trim(p_reversal_of->>'source_document_type')),
      'source_document_id',lower(trim(p_reversal_of->>'source_document_id')),
      'client_tx_id',lower(trim(p_reversal_of->>'client_tx_id')),
      'line_key',p_reversal_of->>'line_key',
      'operation_digest',lower(trim(p_reversal_of->>'operation_digest'))
    );
  end if;
  v_source_id:=public.point4_identity_source_document_id_v1(
    p_source_document_type,p_source_document_id,p_offline_capable
  );
  if p_currency_code is not null and upper(trim(p_currency_code))!~'^[A-Z]{3}$' then raise exception 'POINT4_IDENTITY_CURRENCY_INVALID';end if;
  v_lines:=public.point4_identity_canonical_lines_v1(p_lines);
  v_envelope:=jsonb_build_object(
    'contract','sharawla.point4.identity','digest_schema_version',1,
    'operation_type',v_operation,'client_tx_id',v_tx,
    'source_document',jsonb_build_object(
      'type',lower(trim(p_source_document_type)),'id',v_source_id
    ),
    'scope',jsonb_build_object(
      'branch_id',case when p_branch_id is null then null else public.point4_identity_bigint_v1(to_jsonb(p_branch_id),true) end,
      'currency',case when p_currency_code is null then null else upper(trim(p_currency_code)) end
    ),
    'effective_date',p_effective_date,'reversal_of',v_reversal,
    'intent',v_intent,'lines',v_lines
  );
  return pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_envelope::text,'UTF8'),'sha256'
  ),'hex');
end;
$$;

create or replace function public.point4_identity_replay_outcome_v1(
  p_existing_digest text,p_incoming_digest text
) returns text language plpgsql immutable set search_path=''
as $$
declare v_existing text:=lower(trim(coalesce(p_existing_digest,'')));v_incoming text:=lower(trim(coalesce(p_incoming_digest,'')));
begin
  if v_incoming!~'^[0-9a-f]{64}$' then raise exception 'POINT4_IDENTITY_DIGEST_INVALID'; end if;
  if v_existing='' then return 'NEW'; end if;
  if v_existing!~'^[0-9a-f]{64}$' then raise exception 'POINT4_IDENTITY_STORED_DIGEST_INVALID'; end if;
  if v_existing=v_incoming then return 'IDEMPOTENT_REPLAY'; end if;
  raise exception 'POINT4_IDENTITY_IDEMPOTENCY_CONFLICT';
end;
$$;

revoke all on function public.point4_identity_uuid_v4_v1(text) from public,anon,authenticated;
revoke all on function public.point4_identity_source_document_id_v1(text,text,boolean) from public,anon,authenticated;
revoke all on function public.point4_identity_decimal_v1(numeric,integer) from public,anon,authenticated;
revoke all on function public.point4_identity_bigint_v1(jsonb,boolean) from public,anon,authenticated;
revoke all on function public.point4_identity_assert_allowed_keys_v1(jsonb,text[]) from public,anon,authenticated;
revoke all on function public.point4_identity_effect_line_key_v1(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.point4_identity_canonical_lines_v1(jsonb) from public,anon,authenticated;
revoke all on function public.point4_identity_operation_digest_v1(text,text,text,text,boolean,bigint,text,jsonb,jsonb,jsonb,date) from public,anon,authenticated;
revoke all on function public.point4_identity_replay_outcome_v1(text,text) from public,anon,authenticated;

comment on function public.point4_identity_operation_digest_v1(text,text,text,text,boolean,bigint,text,jsonb,jsonb,jsonb,date) is
  'Source-only canonical economic digest. It is distinct from Offline V2 transport payload_digest and creates no Offline owner.';
commit;
