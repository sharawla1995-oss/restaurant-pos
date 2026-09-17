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
), transfer_findings as (
 select count(*) filter(where l.dispatched_value<>l.received_value+l.damaged_value+l.shortage_value+l.in_transit_value) value_mismatch,
  count(*) filter(where o.lifecycle_state='RECEIVED' and l.quantity_in_transit<>0) received_still_in_transit,
  count(*) filter(where o.ownership_state='CANONICAL_ACTIVE' and (so.id is null or si.id is null)) missing_stock_effect
 from public.inventory_transfer_operations_v2 o join public.inventory_transfer_lines_v2 l on l.transfer_operation_id=o.id
 left join public.inventory_stock_movements_v2 so on so.source_document_type='canonical_transfer' and so.source_document_id=o.id::text and so.line_key='out:'||l.line_key
 left join public.inventory_stock_movements_v2 si on si.source_document_type='canonical_transfer' and si.source_document_id=o.id::text and si.line_key='in:'||l.line_key
), ap_findings as (
 select
  (select count(*) from public.supplier_payables_v1 p where p.outstanding_amount<>p.original_amount-p.settled_amount-p.credited_amount) payable_math_mismatch,
  (select count(*) from public.supplier_payments_v1 p left join lateral(select coalesce(sum(a.amount),0) total from public.supplier_payment_allocations_v1 a where a.payment_id=p.id) a on true where p.allocated_amount<>a.total or p.unallocated_amount<>p.payment_amount-a.total) allocation_mismatch,
  (select count(*) from public.supplier_payables_v1 p left join lateral(select coalesce(sum(a.amount),0) total from public.supplier_payment_allocations_v1 a where a.payable_id=p.id) a on true left join lateral(select coalesce(sum(c.credit_amount),0) total from public.supplier_payable_credits_v1 c where c.payable_id=p.id) c on true where p.settled_amount<>a.total or p.credited_amount<>c.total) settlement_mismatch
), journal_findings as (
 select count(*) filter(where x.debit<=0 or x.debit<>x.credit) unbalanced,
  count(*) filter(where e.reversal_of_event_id is not null and r.id is null) orphan_reversal,
  count(*) filter(where l.stock_movement_id is not null and sm.id is null) orphan_stock_line,
  count(*) filter(where l.transfer_operation_id is not null and t.id is null) orphan_transfer_line,
  count(*) filter(where l.payable_id is not null and p.id is null) orphan_payable_line
 from public.finance_journal_events_v1 e
 left join lateral(select coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit from public.finance_journal_lines_v1 where event_id=e.id) x on true
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
