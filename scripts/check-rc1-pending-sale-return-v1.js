'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const rt=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const sync=fs.readFileSync('beta45-offline-v2-sync.js','utf8');
const sql=fs.readFileSync('supabase-rc1-offline-outer-consolidated-v3.sql','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};

must(app.includes('async function rc1PendingSaleLineIndexMap(order){'),'pending sale return line-map helper missing');
must(app.includes("['create_pos_order_atomic','create_food_pos_order_atomic_v1'].includes(rpcName)"),'Restaurant parent RPC scope missing');
must(app.includes('source_order_item_index:sourceIndex'),'return source index metadata missing');
must(app.includes('source_sale_line_uid:saleLineUid'),'return source line identity metadata missing');
must(app.includes("p_order_id:localPendingSale?String(o.id):Number(o.id)"),'local parent order id must remain textual before ACK');
must(app.includes("sourceOrderId=String(o?.id||'').startsWith('offline-')?String(o.id):Number(o.id)"),'offline return durable job must preserve local parent id');
must(!app.includes("if(String(o.id).startsWith('offline-'))throw new Error('مرتجع فاتورة أوفلاين جديدة يتم بعد مزامنة الفاتورة أولًا')"),'old generic pending-sale return hard block must be removed');
must(app.includes("if(localPendingSale&&profile!=='restaurant')return toast('مرتجع فاتورة Retail أوفلاين جديدة يتم بعد مزامنة الفاتورة أولًا')"),'Retail must remain fail-closed until separately proved');

must(rt.includes("if(type==='return')return !numericServerId(payload?.p_order_id)&&!localOrderTx(payload?.p_order_id)"),'transport must accept dependency-identified local Restaurant return parent');
must(rt.includes("if(type==='return'||type==='order_status'||type==='delivery_assign_driver')return localOrderTx(payload?.p_order_id)"),'return dependency TX extraction missing');
must(sync.includes('dependency_mapping:dependencyMapping?clone(dependencyMapping):null'),'parent ACK mapping must remain in outbound envelope');

for(const [sig,md5] of [
  ['create_pos_order_atomic(jsonb,jsonb,jsonb)','a677482d9944aa8ae40003408506c7c1'],
  ['create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb)','c6de3f95f85c6bb2f9d4854c1d7c5a8c'],
  ['create_order_return(bigint,text,text,jsonb,jsonb)','3fe18445ec4e05799bd8bebdeeb716c9'],
  ['create_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)','8fb379d606004c895befb2b0f9787586']
]){
  must(sql.includes(sig),`server dependency contract signature missing: ${sig}`);
  must(sql.includes(md5),`server dependency contract MD5 pin missing: ${sig}`);
}
must(sql.includes("r.operation_type='sale'"),'dependent return must bind to a sale receipt');
must(sql.includes("r.rpc_name in ('create_pos_order_atomic','create_food_pos_order_atomic_v1')"),'dependent return must bind only to proved Restaurant parent owners');
must(sql.includes("coalesce(x.item->>'source_order_item_index','') !~ '^[1-9][0-9]*$'"),'source index validation missing');
must(sql.includes("count(distinct (x.item->>'source_order_item_index')::integer)"),'duplicate source index guard missing');
must(sql.includes("row_number() over(order by oi.id)::integer as source_index"),'deterministic server line-index mapping missing');
must(sql.includes("x.item - 'source_order_item_index' - 'source_sale_line_uid'"),'transport-only return mapping metadata must be stripped before economic RPC');
must(sql.includes("v_payload := jsonb_set(v_payload,'{p_items}',v_rewritten_items,true)"),'rewritten server item ids must feed return owner');
const replay=sql.indexOf("'idempotent_replay',true"),mapping=sql.indexOf('RC1 pending-sale -> return line mapping');
must(replay>=0&&mapping>replay,'full replay must precede dependent return item remapping');
must(sql.indexOf("v_payload := jsonb_set(v_payload,'{p_order_id}',to_jsonb(v_dep_server_id::bigint),true)")<replay,'stable parent order-id dependency rewrite must remain before replay as existing Outer contract');
must(!sql.includes('CREATE OR REPLACE FUNCTION public.sharawla_offline_v2_apply_event_core_v1'),'Point4 Core must remain untouched');

console.log('RC1 pending Offline sale -> Return dependency gate PASS');
