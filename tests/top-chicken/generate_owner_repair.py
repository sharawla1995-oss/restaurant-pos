"""Generate reviewed Beta candidate from pinned deployed owners; never executes SQL."""
from pathlib import Path
import hashlib, re
root = Path(__file__).resolve().parents[2]
source = (root/'evidence/top-chicken/deployed-owner-snapshot.sql').read_text()
tc = "5358328c-9724-49aa-affc-1bce8be90f92"
out = ['-- CANDIDATE ONLY: preserve canonical owners; guarded Top Chicken ID allocation.\nBEGIN;']
for name in ('order_assign_driver_v2', 'order_fulfillment_transition_v2', 'delivery_mark_delivered_v2'):
    original = re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\([\s\S]*?AS \$function\$[\s\S]*?\$function\$\n', source).group(0)
    fixed = original
    # Explicit IDs only for Top Chicken; preserve pre-existing behavior elsewhere.
    prefix = f"case when v_order.business_id='{tc}'::uuid then "
    audit = prefix+"nextval('public.audit_logs_id_seq'::regclass) else null end,v_order.business_id,"
    fixed = fixed.replace('public.audit_logs(employee_id,branch_id', 'public.audit_logs(id,business_id,employee_id,branch_id')
    fixed = fixed.replace('values(v_emp,v_order.branch_id', 'values('+audit+'v_emp,v_order.branch_id')
    if name == 'delivery_mark_delivered_v2':
        fixed = fixed.replace('public.order_payments(order_id,method,amount)', 'public.order_payments(id,business_id,order_id,method,amount)')
        fixed = fixed.replace('values(v_order.id,v_method,', 'values('+prefix+"nextval('public.order_payments_id_seq'::regclass) else null end,v_order.business_id,v_order.id,v_method,")
        fixed = fixed.replace('public.delivery_payment_events(\n    order_id,', 'public.delivery_payment_events(\n    id,business_id,order_id,')
        fixed = fixed.replace('    v_order.id,v_order.branch_id,v_order.driver_id,v_emp,v_key,v_event,', '    '+prefix+"nextval('public.delivery_payment_events_id_seq'::regclass) else null end,v_order.business_id,v_order.id,v_order.branch_id,v_order.driver_id,v_emp,v_key,v_event,")
    # Existing definitions are pinned; reject drift rather than replacing a newer owner.
    signature = {'order_assign_driver_v2':'bigint,bigint','order_fulfillment_transition_v2':'bigint,text','delivery_mark_delivered_v2':'bigint,text,text'}[name]
    digest = hashlib.md5(original.encode()).hexdigest()
    out.append(f"DO $guard$ BEGIN IF md5(pg_get_functiondef('public.{name}({signature})'::regprocedure)) <> '{digest}' THEN RAISE EXCEPTION 'OWNER_DEFINITION_DRIFT: {name}'; END IF; END $guard$;")
    out.append(fixed.rstrip()+';')
out.append('COMMIT;')
(root/'supabase/top-chicken-canonical-owner-ids-CANDIDATE.sql').write_text('\n\n'.join(out)+'\n')
