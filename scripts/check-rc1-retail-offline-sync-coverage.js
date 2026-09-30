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
const retailUi=app.slice(app.indexOf('async function renderRetailPurchasing'),app.indexOf('async function renderRetailMarketSettings'));
ok(retailUi.includes("p_supplier_create_tx:supplierTx||null"),'Local Retail Supplier must propagate dependency tx into PO/Return');
ok(retailUi.includes("p_purchase_order_create_tx:poTx||null"),'Local Retail PO must propagate dependency tx into approval');
ok(retailUi.includes("Number.isFinite(supplierServerId)?supplierServerId:null"),'Local Retail Supplier must not be coerced to NaN server id');
ok(retailUi.includes("Number.isFinite(poServerId)?poServerId:null"),'Local Retail PO must not be coerced to NaN server id');
ok(/type==='retail_supplier_save'[\s\S]*retail supplier ACK missing supplier_id/.test(transport),'Retail Supplier ACK unwrap missing');
ok(/type==='retail_po_create'\|\|type==='retail_po_approve'[\s\S]*purchase_order_id/.test(transport),'Retail PO ACK unwrap missing');
ok(/type==='retail_purchase_receive'[\s\S]*goods_receipt_id/.test(transport),'Retail GRN ACK unwrap missing');
ok(/type==='retail_supplier_return'[\s\S]*supplier_return_id/.test(transport),'Retail Supplier Return ACK unwrap missing');
ok(/const retailPurchasingRows=rows\.filter\([\s\S]*?\.sort\(\(a,b\)=>num\(a\?\.device_sequence,0\)-num\(b\?\.device_sequence,0\)\)/.test(transport),'Retail purchasing projections must replay in device sequence order');
ok(transport.includes("offlineV2RetailSuppliers"),'Retail Supplier local projection missing');
ok(transport.includes("offlineV2RetailPurchaseOrders")&&transport.includes("offlineV2RetailPurchaseOrderItems"),'Retail PO local projection/items missing');
ok(transport.includes("offlineV2RetailGoodsReceipts")&&transport.includes("offlineV2RetailSupplierReturns"),'Retail GRN/Return local projection missing');
ok(app.includes("retailSuppliersCloudCache")&&app.includes("retailPurchaseOrdersCloudCache:")&&app.includes("retailPurchaseOrderItemsCloudCache"),'Retail purchasing Cloud baseline cache missing');
ok(app.includes("mergeOperational(suppliers,localSuppliers)")&&app.includes("mergeOperational(orders,localOrders)")&&/mergeOperational\(items,\(localItems\|\|\[\]\)\.filter\(x=>!cloudItemPoIds\.has\(String\(x\.purchase_order_id\)\)\)\)/.test(app),'Retail purchasing operational merge missing');
ok(app.includes("cloudItemPoIds")&&app.includes("!cloudItemPoIds.has(String(x.purchase_order_id))"),'Authoritative Retail PO lines must replace local placeholders after sync');
ok(app.includes("!o._offline&&oi.every(x=>!x._offline)"),'GRN must fail closed until authoritative PO line IDs exist');
const onlineOnlyRetail=[
 ['retail_inventory_set_policy','حفظ سياسة مخزون Retail'],
 ['retail_inventory_adjust','تسوية مخزون Retail'],
 ['retail_inventory_set_item_policy','تحديث سياسة صنف Retail'],
 ['retail_set_product_settings','حفظ إعدادات صنف Retail'],
 ['retail_offer_save','حفظ عرض Retail'],
 ['retail_post_stock_count','ترحيل جرد Retail'],
 ['retail_transfer_create','إنشاء تحويل مخزون Retail'],
 ['retail_transfer_receive','استلام تحويل مخزون Retail']
];
for(const [rpcName,label] of onlineOnlyRetail){
 const pos=app.indexOf("rpc('"+rpcName+"'");
 ok(pos>=0,'Retail mutation missing from UI: '+rpcName);
 const guardPos=app.lastIndexOf("rc1RequireCloudOnline('"+label+"')",pos);
 ok(guardPos>=0&&pos-guardPos<500,'Unsupported Retail mutation must fail closed before RPC: '+rpcName);
 ok(!transport.includes("rpc_name:'"+rpcName+"'"),'Online-only Retail mutation must not be falsely registered in Offline V2: '+rpcName);
}
if(gaps.length){console.error('RC1 retail offline sync coverage: OPEN\n- '+gaps.join('\n- '));process.exit(2)}
console.log('RC1 retail offline sync coverage: PASS');
