-- Batch1 M0507 SOURCE ONLY. Load before the final dispatcher; no runtime deployment.
-- No financial writer: the only expense mutation delegates expense_update_v2.
begin;
create or replace function public.offline_expense_update_v1(p_event jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $expense_edit$
declare
 e jsonb:=p_event; p jsonb:=p_event#>'{payload,rpc_payload}';
 tx text:=nullif(trim(e->>'client_tx_id'),''); d text:=nullif(trim(e->>'payload_digest'),'');
 device text:=nullif(trim(e->>'device_id'),''); seq bigint:=(e->>'device_sequence')::bigint;
 branch bigint:=(e->>'branch_id')::bigint; actor bigint:=(e->>'employee_id')::bigint;
 parent_tx text:=nullif(trim(p->>'p_expense_parent_tx'),''); entity text:=p->>'p_expense_id';
 r public.offline_v2_server_receipts%rowtype; parent public.offline_v2_server_receipts%rowtype;
 expense public.expenses%rowtype; shift public.shifts%rowtype; shift_id bigint; result jsonb; event_id text;
begin
 if auth.uid() is null or public.current_employee_id() is distinct from actor then
  raise exception using errcode='42501',message='EXPENSE_EDIT_ACTOR_MISMATCH';end if;
 if coalesce((e->>'protocol_version')::integer,0)<>2 or tx is null or d is null or device is null
  or coalesce(seq,0)<=0 or coalesce(branch,0)<=0 or coalesce(actor,0)<=0
  or e->>'operation_type' is distinct from 'expense_update'
  or e#>>'{payload,rpc_name}' is distinct from 'offline_expense_update_v1'
  or p->>'p_client_tx_id' is distinct from tx then
  raise exception using errcode='22023',message='EXPENSE_EDIT_ENVELOPE_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||tx,0));
 select * into r from public.offline_v2_server_receipts where client_tx_id=tx;
 if found then
  if r.payload_digest is distinct from d or r.operation_type is distinct from 'expense_update'
   or r.rpc_name is distinct from 'offline_expense_update_v1' or r.device_id is distinct from device
   or r.device_sequence is distinct from seq or r.branch_id is distinct from branch
   or r.employee_id is distinct from actor or r.auth_user_id is distinct from auth.uid() then
   raise exception using errcode='22000',message='EXPENSE_EDIT_REPLAY_MISMATCH';end if;
  if r.result_json->'_offline_v2_expense_request' is distinct from p then
   raise exception using errcode='22000',message='EXPENSE_EDIT_REPLAY_PAYLOAD_MISMATCH';end if;
  return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,
   'client_tx_id',tx,'protocol_version',2,'payload_digest',d,'server_event_id',r.server_event_id,
   'server_entity_id',r.server_entity_id,'server_version',r.server_version,'result',r.result_json-'_offline_v2_expense_request');
 end if;
 if parent_tx is not null then
  select * into parent from public.offline_v2_server_receipts where client_tx_id=parent_tx;
  if not found or parent.operation_type not in ('expense','expense_update')
   or (parent.operation_type='expense' and parent.rpc_name is distinct from 'create_pos_expense_idempotent')
   or (parent.operation_type='expense_update' and parent.rpc_name is distinct from 'offline_expense_update_v1')
   or parent.device_id is distinct from device or parent.branch_id is distinct from branch
   or parent.employee_id is distinct from actor or parent.auth_user_id is distinct from auth.uid()
   or coalesce(parent.server_entity_id,'') !~ '^[1-9][0-9]*$'
   or e->>'depends_on_tx_id' is distinct from parent_tx
   or e#>>'{dependency_mapping,client_tx_id}' is distinct from parent_tx
   or e#>>'{dependency_mapping,server_id}' is distinct from parent.server_entity_id then
   raise exception using errcode='22023',message='EXPENSE_EDIT_PARENT_INVALID';end if;
  if entity is distinct from 'offline-exp-'||parent_tx and entity is distinct from parent.server_entity_id then
   -- A chained edit uses the original expense alias, but the parent receipt owns the same entity.
   if coalesce(entity,'') !~ '^offline-exp-' or parent.operation_type<>'expense_update' then
    raise exception using errcode='22023',message='EXPENSE_EDIT_PARENT_ENTITY_MISMATCH';end if;
   select * into r from public.offline_v2_server_receipts where client_tx_id=substr(entity,13);
   if not found or r.operation_type is distinct from 'expense' or r.server_entity_id is distinct from parent.server_entity_id
    or r.device_id is distinct from device or r.branch_id is distinct from branch or r.employee_id is distinct from actor
    or r.auth_user_id is distinct from auth.uid() then raise exception using errcode='22023',message='EXPENSE_EDIT_ROOT_INVALID';end if;
  end if;
  entity:=parent.server_entity_id;
 elsif e->>'depends_on_tx_id' is not null then
  raise exception using errcode='22023',message='EXPENSE_EDIT_UNEXPECTED_DEPENDENCY';
 end if;
 if coalesce(entity,'') !~ '^[1-9][0-9]*$' then raise exception using errcode='22023',message='EXPENSE_EDIT_PARENT_REQUIRED';end if;
 if not public.has_branch_access(branch) or not public.has_action_permission_v2('expenses.edit') then
  raise exception using errcode='42501',message='EXPENSE_EDIT_DENIED';end if;
 -- Serialize with the existing shift-close lock before locking the expense.
 select x.shift_id into shift_id from public.expenses x where x.id=entity::bigint;
 select * into shift from public.shifts where id=shift_id for update;
 if not found or shift.branch_id is distinct from branch or shift.closed_at is not null or shift.status is distinct from 'open' then
  raise exception using errcode='22023',message='EXPENSE_EDIT_CLOSED_SHIFT';end if;
 select * into expense from public.expenses where id=entity::bigint for update;
 if not found or expense.shift_id is distinct from shift.id or expense.branch_id is distinct from branch then
  raise exception using errcode='22023',message='EXPENSE_EDIT_SCOPE_CHANGED';end if;
 if not (p ? 'p_expected_amount') or not (p ? 'p_expected_description')
  or expense.amount is distinct from (p->>'p_expected_amount')::numeric
  or expense.description is distinct from p->>'p_expected_description' then
  raise exception using errcode='40001',message='EXPENSE_EDIT_REVISION_CONFLICT';end if;
 if coalesce((p->>'p_amount')::numeric,0)<=0 or (p->>'p_amount')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='P0001',message='EXPENSE_EDIT_AMOUNT_INVALID';end if;
 -- Validation and audit of the actual mutation remain in the accepted owner.
 result:=public.expense_update_v2(entity::bigint,p->>'p_description',(p->>'p_amount')::numeric);
 if result->>'id' is distinct from entity then raise exception 'EXPENSE_EDIT_OWNER_ID_MISMATCH';end if;
 event_id:='ov2-'||md5(tx||':'||d);
 insert into public.offline_v2_server_receipts(client_tx_id,server_event_id,protocol_version,payload_digest,
  operation_type,rpc_name,device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json)
 values(tx,event_id,2,d,'expense_update','offline_expense_update_v1',device,seq,branch,actor,auth.uid(),entity,'expense-edit-v1',result||jsonb_build_object('_offline_v2_expense_request',p));
 return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,
  'client_tx_id',tx,'protocol_version',2,'payload_digest',d,'server_event_id',event_id,
  'server_entity_id',entity,'server_version','expense-edit-v1','result',result);
end;$expense_edit$;
revoke all on function public.offline_expense_update_v1(jsonb) from public,anon,authenticated,service_role;
commit;
