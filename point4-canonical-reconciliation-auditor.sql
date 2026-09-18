-- Sharawla POS — Point 4F-1 deterministic read-only reconciliation auditor.
-- SOURCE ONLY. Creates a read function; the function performs SELECTs only.
begin;
create or replace function public.point4_canonical_reconciliation_audit_v1()
returns jsonb language sql stable security definer set search_path='' as $$
with
movement_totals as (
 select location_id,item_kind,item_id,sum(quantity_delta) quantity,sum(reserved_quantity_delta) reserved,max(id) last_id
 from public.inventory_stock_movements_v2 group by location_id,item_kind,item_id
), stock_findings as (
 select count(*) filter(where b.quantity_on_hand<>coalesce(m.quantity,0) or b.quantity_reserved<>coalesce(m.reserved,0)) balance_ledger_mismatch,
  count(*) filter(where lm.id is null or lm.balance_version_after<>b.balance_version or lm.average_unit_cost_after<>b.average_unit_cost or lm.last_unit_cost_after<>b.last_unit_cost) snapshot_mismatch
 from public.inventory_stock_balances_v2 b left join movement_totals m using(location_id,item_kind,item_id)
 left join public.inventory_stock_movements_v2 lm on lm.id=m.last_id
), transfer_effect_candidates as (
 select el.event_id,el.line_uid,el.transfer_operation_id,el.transfer_line_uid,e.operation_type,e.client_tx_id,
  o.source_document_id,el.stock_effect_line_key,el.quantity,l.unit_cost_snapshot,m.id movement_id,m.quantity_delta,m.value_delta,
  (m.id is not null and m.client_tx_id=e.client_tx_id
   and m.movement_type=case when e.operation_type='DISPATCH' then 'transfer_out' else 'transfer_in' end
   and m.location_id=case when e.operation_type='DISPATCH' then o.source_location_id else o.destination_location_id end
   and m.item_kind=l.item_kind and m.item_id=l.item_id) exact_effect
 from public.inventory_transfer_event_lines_v2 el
 join public.inventory_transfer_events_v2 e on e.id=el.event_id
 join public.inventory_transfer_operations_v2 o on o.id=e.transfer_operation_id
 join public.inventory_transfer_lines_v2 l on l.transfer_operation_id=el.transfer_operation_id and l.line_uid=el.transfer_line_uid
 left join public.inventory_stock_movements_v2 m on m.source_document_type='inventory_transfer'
  and m.source_document_id=o.source_document_id and m.line_key=el.stock_effect_line_key
 where e.operation_type in('DISPATCH','RECEIVE')
), transfer_effect_evidence as (
 select event_id,line_uid,transfer_operation_id,transfer_line_uid,operation_type,client_tx_id,
  source_document_id,stock_effect_line_key,quantity,unit_cost_snapshot,
  count(movement_id) candidate_effect_count,
  count(movement_id) filter(where exact_effect) effect_count,
  count(movement_id) filter(where not exact_effect) unexpected_effect_count,
  count(movement_id) filter(where exact_effect and value_delta is null) missing_valuation_count,
  sum(quantity_delta) filter(where exact_effect) actual_quantity_delta,
  sum(value_delta) filter(where exact_effect) actual_value_delta
 from transfer_effect_candidates
 group by event_id,line_uid,transfer_operation_id,transfer_line_uid,operation_type,client_tx_id,source_document_id,stock_effect_line_key,quantity,unit_cost_snapshot
), transfer_slice_totals as (
 select el.transfer_operation_id,el.transfer_line_uid,
  coalesce(sum(el.quantity) filter(where e.operation_type='DISPATCH'),0) dispatched,
  coalesce(sum(el.quantity) filter(where e.operation_type='RECEIVE'),0) received,
  coalesce(sum(el.quantity_damaged) filter(where e.operation_type='RECEIVE'),0) damaged,
  coalesce(sum(el.quantity_shortage) filter(where e.operation_type='RECEIVE'),0) shortage
 from public.inventory_transfer_event_lines_v2 el join public.inventory_transfer_events_v2 e on e.id=el.event_id
 where e.operation_type in('DISPATCH','RECEIVE') group by el.transfer_operation_id,el.transfer_line_uid
), transfer_findings as (
 select
  (select count(*) from public.inventory_transfer_lines_v2 l where l.dispatched_value<>l.received_value+l.damaged_value+l.shortage_value+l.in_transit_value) value_mismatch,
  (select count(*) from public.inventory_transfer_operations_v2 o join public.inventory_transfer_lines_v2 l on l.transfer_operation_id=o.id where o.lifecycle_state='RECEIVED' and l.quantity_in_transit<>0) received_still_in_transit,
  (select count(*) from transfer_effect_evidence x join public.inventory_transfer_operations_v2 o on o.id=x.transfer_operation_id where o.ownership_state='CANONICAL_ACTIVE' and x.effect_count<>1) missing_or_duplicate_stock_effect,
  (select count(*) from transfer_effect_evidence where candidate_effect_count>1) duplicate_stock_effect,
  (select count(*) from transfer_effect_evidence where unexpected_effect_count>0) unexpected_stock_effect,
  (select count(*) from transfer_effect_evidence where effect_count=1 and missing_valuation_count>0) missing_valuation_evidence,
  (select count(*) from transfer_effect_evidence where effect_count=1 and actual_quantity_delta<>case when operation_type='DISPATCH' then -quantity else quantity end) quantity_effect_mismatch,
  (select count(*) from transfer_effect_evidence where effect_count=1 and actual_value_delta is not null and actual_value_delta<>case when operation_type='DISPATCH' then -round(quantity*unit_cost_snapshot,4) else round(quantity*unit_cost_snapshot,4) end) value_effect_mismatch,
  (select count(*) from public.inventory_transfer_lines_v2 l left join transfer_slice_totals s on s.transfer_operation_id=l.transfer_operation_id and s.transfer_line_uid=l.line_uid where l.quantity_dispatched<>coalesce(s.dispatched,0)) dispatch_slice_aggregate_mismatch,
  (select count(*) from public.inventory_transfer_lines_v2 l left join transfer_slice_totals s on s.transfer_operation_id=l.transfer_operation_id and s.transfer_line_uid=l.line_uid where l.quantity_received<>coalesce(s.received,0) or l.quantity_damaged<>coalesce(s.damaged,0) or l.quantity_shortage<>coalesce(s.shortage,0)) receipt_slice_aggregate_mismatch
), ap_findings as (
 select
  (select count(*) from public.supplier_payables_v1 p where p.outstanding_amount<>p.original_amount-p.settled_amount-p.credited_amount) payable_math_mismatch,
  (select count(*) from public.supplier_payables_v1 p join public.retail_supplier_invoices i on i.id=p.supplier_invoice_id where i.status<>'approved' or p.branch_id<>i.branch_id or p.supplier_id<>i.supplier_id or p.original_amount<>i.total_amount or upper(p.currency_code)<>upper(coalesce(i.currency_code,'EGP'))) invoice_payable_mismatch,
  (select count(*) from public.supplier_payments_v1 p left join lateral(select coalesce(sum(a.amount),0) total from public.supplier_payment_allocations_v1 a where a.payment_id=p.id) a on true where p.allocated_amount<>a.total or p.unallocated_amount<>p.payment_amount-a.total) allocation_mismatch,
  (select count(*) from public.supplier_payment_allocations_v1 a join public.supplier_payments_v1 y on y.id=a.payment_id join public.supplier_payables_v1 p on p.id=a.payable_id where y.supplier_id<>p.supplier_id or y.branch_id<>p.branch_id or upper(y.currency_code)<>upper(p.currency_code)) allocation_scope_mismatch,
  (select count(*) from public.supplier_payables_v1 p left join lateral(select coalesce(sum(a.amount),0) total from public.supplier_payment_allocations_v1 a where a.payable_id=p.id) a on true left join lateral(select coalesce(sum(c.credit_amount),0) total from public.supplier_payable_credits_v1 c where c.payable_id=p.id) c on true where p.settled_amount<>a.total or p.credited_amount<>c.total) settlement_mismatch
), journal_findings as (
 select count(distinct e.id) filter(where x.debit<=0 or x.debit<>x.credit) unbalanced,
  count(distinct e.id) filter(where x.line_count=0) orphan_event_without_lines,
  count(distinct e.id) filter(where e.reversal_of_event_id is not null and r.id is null) orphan_reversal,
  count(*) filter(where l.stock_movement_id is not null and sm.id is null) orphan_stock_line,
  count(*) filter(where l.transfer_operation_id is not null and t.id is null) orphan_transfer_line,
  count(*) filter(where l.payable_id is not null and p.id is null) orphan_payable_line
 from public.finance_journal_events_v1 e
 left join lateral(select count(*) line_count,coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit from public.finance_journal_lines_v1 where event_id=e.id) x on true
 left join public.finance_journal_events_v1 r on r.id=e.reversal_of_event_id
 left join public.finance_journal_lines_v1 l on l.event_id=e.id
 left join public.inventory_stock_movements_v2 sm on sm.id=l.stock_movement_id
 left join public.inventory_transfer_operations_v2 t on t.id=l.transfer_operation_id
 left join public.supplier_payables_v1 p on p.id=l.payable_id
), evidence as (
 select jsonb_build_object(
  'schema_version',1,
  'stock',to_jsonb(s),'transfer',to_jsonb(t),'purchasing_ap',to_jsonb(a),'journal',to_jsonb(j),
  'activation',jsonb_build_object(
   'point4b2_concurrency_closed',public.inventory_stock_point4b2_concurrency_closed_v2(),
   'transfer_allowed',public.inventory_transfer_point4c_activation_allowed_v2(),
   'ap_allowed',public.supplier_ap_point4d_activation_allowed_v1(),
   'journal_allowed',public.finance_journal_point4e_activation_allowed_v1()),
  'runtime_reconciliation_accepted',false
 ) payload from stock_findings s cross join transfer_findings t cross join ap_findings a cross join journal_findings j
)
select payload||jsonb_build_object('evidence_digest',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(payload::text,'UTF8'),'sha256'),'hex')) from evidence
$$;
revoke all on function public.point4_canonical_reconciliation_audit_v1() from public,anon,authenticated;
comment on function public.point4_canonical_reconciliation_audit_v1() is 'Read-only structural reconciliation evidence; never marks runtime acceptance.';
commit;
