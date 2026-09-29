const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function ok(v,m){if(!v)throw new Error(m)}
const owners=read('supabase-rc1-offline-v2-retail-purchasing-owners-v1.sql');
const v2=read('supabase-engine-purchasing-v1-1-runtime.sql');
const transport=read('beta45-offline-v2-transport-runtime.js');
const app=read('app.js');
const dispatcher=read('supabase-rc1-offline-v2-modern-food-final-dispatcher.sql');
ok(/offline_retail_supplier_create_v1/.test(owners),'missing idempotent retail supplier owner');
ok(/retail_offline_supplier_receipts/.test(owners)&&/pg_advisory_xact_lock/.test(owners),'supplier replay guard missing');
ok(/offline_retail_purchase_order_approve_v1/.test(owners),'missing replay-safe PO approval owner');
ok(/retail_offline_po_approval_receipts/.test(owners),'PO approval replay receipt missing');
ok(/retail_purchase_order_create_v2[\s\S]*variant_id bigint/.test(v2),'PO V2 must preserve variant identity');
ok(/retail_purchase_receive_v2[\s\S]*retail_variant_inventory_balances/.test(v2),'GRN V2 variant stock authority missing');
ok(/retail_supplier_return_create_v2[\s\S]*variant_id bigint/.test(v2),'supplier return V2 variant identity missing');
ok(/function commitOptionalTxRpc/.test(transport)&&/if\(!t\)\{if\(offline\)throw onlineOnlyError/.test(transport),'unregistered offline mutation must fail closed');
ok(/sharawla_offline_v2_apply_event_core_v1\(p_event\)/.test(dispatcher),'final dispatcher must preserve core delegation');
for(const token of ["retail_supplier_save","retail_po_create","retail_po_approve","retail_purchase_receive","retail_supplier_return","offline_retail_supplier_create_v1","offline_retail_purchase_order_approve_v1","retail_purchase_order_create_v2","retail_purchase_receive_v2","retail_supplier_return_create_v2"]){ok(dispatcher.includes(token),'dispatcher missing '+token)}
// Client/source gates.
const gaps=[];
if(!/registerOne\('retail_supplier_save'[\s\S]*offline_retail_supplier_create_v1/.test(transport))gaps.push('retail_supplier_save replay-safe transport');
if(!/registerOne\('retail_po_create'/.test(transport))gaps.push('retail_po_create transport');
if(!/registerOne\('retail_po_approve'/.test(transport))gaps.push('retail_po_approve transport');
if(!/registerOne\('retail_purchase_receive'/.test(transport))gaps.push('retail_purchase_receive transport');
if(!/registerOne\('retail_supplier_return'/.test(transport))gaps.push('retail_supplier_return transport');
ok(/retail_supplier_save'[\s\S]*rpc_name:'offline_retail_supplier_create_v1'/.test(transport),'supplier envelope must target replay-safe owner');
ok(/v_operation='retail_supplier_save'[\s\S]*offline_retail_supplier_create_v1/.test(dispatcher),'dispatcher supplier path must invoke replay-safe owner');
ok(/retail_po_create'[\s\S]*p_supplier_create_tx/.test(transport),'retail PO dependency must fail closed or wait for supplier ACK');
ok(/retail_po_approve'\|\|type==='retail_purchase_receive'[\s\S]*p_purchase_order_create_tx/.test(transport),'PO child operations must require server PO or dependency tx');
if(!/variant_id/.test(app.slice(app.indexOf('async function renderRetailPurchasing'),app.indexOf('async function renderRetailMarketSettings'))))gaps.push('Retail purchasing UI variant identity');
if(gaps.length){console.error('RC1 retail offline sync coverage: OPEN\n- '+gaps.join('\n- '));process.exit(2)}
console.log('RC1 retail offline sync coverage: PASS');
