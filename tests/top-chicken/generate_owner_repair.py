"""Generate source-only TC patches; keep every non-TC INSERT literally unchanged."""
from pathlib import Path
import hashlib,re
root=Path(__file__).resolve().parents[2]
source=(root/'evidence/top-chicken/deployed-owner-snapshot.sql').read_text()
tc='5358328c-9724-49aa-affc-1bce8be90f92'
out=['-- CANDIDATE ONLY: TC-specific authority/ID repair, original ELSE bodies preserved.\nBEGIN;',"DO $tc_preflight$ BEGIN IF NOT sharawla_internal.top_chicken_binding_ready_v1() THEN RAISE EXCEPTION 'TOP_CHICKEN_OPERATIONAL_PROFILE_BINDING_REQUIRED'; END IF; END $tc_preflight$;"]
pattern=r'insert into public\.(audit_logs|order_payments|delivery_payment_events)\(([\s\S]*?)\)\s*values\(([\s\S]*?)\);'
for name in ('order_assign_driver_v2','order_fulfillment_transition_v2','delivery_mark_delivered_v2'):
 original=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\([\s\S]*?AS \$function\$[\s\S]*?\$function\$\n',source).group(0)
 def scoped(m):
  table,columns,values=m.groups()
  fixed=f"insert into public.{table}(id,business_id,{columns})\n values(nextval('public.{table}_id_seq'::regclass),v_order.business_id,{values});"
  return f"if v_order.business_id='{tc}'::uuid then\n {fixed}\nelse\n {m.group(0)}\nend if;"
 fixed,n=re.subn(pattern,scoped,original);assert n==(3 if name=='delivery_mark_delivered_v2' else 1)
 if name in ('order_assign_driver_v2','order_fulfillment_transition_v2'):
  anchor="if not found then raise exception 'ORDER_NOT_FOUND'; end if;"
  feature="not sharawla_internal.top_chicken_transaction_feature_v1('commerce.orders')"
  if name=='order_assign_driver_v2':feature+=" or not sharawla_internal.top_chicken_transaction_feature_v1('commerce.delivery')"
  else:feature+=" or (v_target='completed' and v_order.order_type='pickup' and not sharawla_internal.top_chicken_transaction_feature_v1('commerce.pickup'))"
  fixed=fixed.replace(anchor,anchor+f"\n if v_order.business_id='{tc}'::uuid and ({feature}) then raise exception 'TC_CLOUD_REQUIRED' using errcode='42501';end if;",1)
 else:
  anchor="if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;"
  condition=" or ".join(f"not sharawla_internal.top_chicken_transaction_feature_v1('{f}')" for f in ['commerce.orders','commerce.delivery','core.payments'])
  fixed=fixed.replace(anchor,anchor+f"\n  if public.current_business_id()='{tc}'::uuid and ({condition}) then raise exception 'TC_CLOUD_REQUIRED' using errcode='42501';end if;",1)
 signature={'order_assign_driver_v2':'bigint,bigint','order_fulfillment_transition_v2':'bigint,text','delivery_mark_delivered_v2':'bigint,text,text'}[name]
 digest=hashlib.md5(original.encode()).hexdigest()
 out.append(f"DO $guard$ BEGIN IF md5(pg_get_functiondef('public.{name}({signature})'::regprocedure)) <> '{digest}' THEN RAISE EXCEPTION 'OWNER_DEFINITION_DRIFT: {name}'; END IF; END $guard$;")
 out.append(fixed.rstrip()+';')
out.append('COMMIT;');(root/'supabase/top-chicken-canonical-owner-ids-CANDIDATE.sql').write_text('\n\n'.join(out)+'\n')
