(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
const RUNTIME_KEY='sharawlaRuntimeConfigV1';
const text=v=>String(v??'').trim();
const eq=(a,b,eps=.0005)=>Math.abs(Number(a||0)-Number(b||0))<=eps;
const branch=()=>Number(global.currentBranchId?.()||0);
const R=()=>global.__SharawlaAcceptanceRegistry;
const tx=(run,s)=>`${run}-${s}`;
const marker=run=>`SHARAWLA_ACCEPTANCE:${run}`;
function cfg(){try{return JSON.parse(localStorage.getItem(RUNTIME_KEY)||'{}')||{}}catch{return{}}}
function enabled(code){return (cfg().enabled_features||[]).map(x=>String(x||'').toLowerCase()).includes(String(code||'').toLowerCase())}
function ensure(){if(typeof global.rpc!=='function'||typeof global.rest!=='function')throw new Error('Runtime RPC/REST unavailable');if(!branch())throw new Error('Active branch missing')}
async function productCatalog(){ensure();const rows=await global.rest('products','select=id,name,price,cost,active&active=eq.true&order=id');return Array.isArray(rows)?rows:[]}
async function safePurchasingFixture(){
 ensure();const suppliers=await global.rest('retail_suppliers','select=id,name,active&active=eq.true&order=id&limit=1');if(!suppliers?.[0])throw new Error('No active supplier fixture');
 const bals=await global.rest('retail_inventory_balances',`select=branch_id,product_id,quantity,average_unit_cost,last_purchase_cost,track_inventory&branch_id=eq.${branch()}&track_inventory=eq.true&quantity=gt.0&order=product_id`);
 for(const b of bals||[]){
  if(!eq(b.average_unit_cost,b.last_purchase_cost,.00005))continue;
  const p=await global.rest('products',`select=id,name,active&id=eq.${b.product_id}&active=eq.true&limit=1`);
  if(p?.[0])return {supplier:suppliers[0],product:p[0],balance:{...b,quantity:Number(b.quantity),average_unit_cost:Number(b.average_unit_cost||0),last_purchase_cost:Number(b.last_purchase_cost||0)}};
 }
 throw new Error('No safe purchasing fixture with stock > 0 and stable cost basis');
}
async function balance(productId){const r=await global.rest('retail_inventory_balances',`select=quantity,average_unit_cost,last_purchase_cost&branch_id=eq.${branch()}&product_id=eq.${productId}&limit=1`);return r?.[0]||null}
async function cleanupV3(run){const out=await global.rpc('sharawla_acceptance_cleanup_v3',{p_run_id:run});if(out?.ok!==true)throw new Error(`Acceptance cleanup V3 failed: ${JSON.stringify(out?.after||out)}`);const scan=await global.rpc('sharawla_acceptance_scan_v3',{p_run_id:run});if(Number(scan?.total||0)!==0)throw new Error(`Acceptance residue=${scan?.total}`);return {out,scan}}
async function variantsContract(){
 ensure();if(!enabled('commerce.variants'))return {status:'SKIPPED',detail:'commerce.variants disabled'};
 const api=global.__SharawlaRetailVariantsRuntimeV1;if(!api||api.operational?.()!==true)throw new Error('Retail variants runtime bridge is not operational');
 const rows=await global.rest('product_variants','select=id,product_id,name,sku,barcode,active,is_stock_unit&active=eq.true&order=id');if(!Array.isArray(rows))throw new Error('Variant catalog query failed');
 const products=await productCatalog();if(!products.length)throw new Error('No active product for variant matrix contract');
 const candidate=rows.find(v=>products.some(p=>String(p.id)===String(v.product_id)))||null;
 const productId=Number(candidate?.product_id||products[0].id);const matrix=await global.rpc('retail_variant_matrix_get_v1',{p_product_id:productId});
 if(!matrix||Number(matrix.product_id)!==productId||!Array.isArray(matrix.axes)||!Array.isArray(matrix.variants))throw new Error('Variant matrix contract mismatch');
 const stockUnits=rows.filter(v=>v.is_stock_unit===true).length,legacy=rows.filter(v=>v.is_stock_unit!==true).length;
 return {status:'PASS',detail:`bridge=operational; catalog=${rows.length}; stock_units=${stockUnits}; legacy=${legacy}; matrix_axes=${matrix.axes.length}; matrix_variants=${matrix.variants.length}`,evidence:{product_id:productId,stock_units:stockUnits,legacy,matrix_axes:matrix.axes.length,matrix_variants:matrix.variants.length}};
}
async function productsContract(){
 const rows=await productCatalog();if(!rows.length)throw new Error('No active Retail products');
 const bad=rows.filter(x=>!Number.isFinite(Number(x.price??0))||!Number.isFinite(Number(x.cost??0)));if(bad.length)throw new Error(`Invalid product numeric fields=${bad.length}`);
 return {status:'PASS',detail:`active_products=${rows.length}; numeric_price_cost=ok`};
}
async function purchasingRoundtrip(ctx){
 ensure();const run=ctx.run_id,f=await safePurchasingFixture(),productId=Number(f.product.id),supplierId=Number(f.supplier.id),before=f.balance,cost=before.average_unit_cost;
 const poTx=tx(run,'AP-PO'),grnTx=tx(run,'AP-GRN'),retTx=tx(run,'AP-SRET'),compTx=tx(run,'AP-COMP');let po=null,grn=null,sret=null,received=false,returned=false,originalError=null;
 try{
  const items=[{product_id:productId,variant_id:null,quantity:1,unit_cost:cost}];
  const po1=Number(await global.rpc('retail_purchase_order_create_v2',{p_branch_id:branch(),p_supplier_id:supplierId,p_notes:marker(run),p_items:items,p_client_tx_id:poTx,p_po_number:null,p_expected_at:null}));
  const po2=Number(await global.rpc('retail_purchase_order_create_v2',{p_branch_id:branch(),p_supplier_id:supplierId,p_notes:marker(run),p_items:items,p_client_tx_id:poTx,p_po_number:null,p_expected_at:null}));
  if(!po1||po1!==po2)throw new Error('PO idempotency failed');po=po1;
  await global.rpc('retail_purchase_order_approve',{p_purchase_order_id:po});
  const lines=await global.rest('retail_purchase_order_items',`select=id,product_id,variant_id,quantity_ordered,quantity_received,unit_cost&purchase_order_id=eq.${po}&order=id`);if(lines?.length!==1)throw new Error(`PO line mismatch=${lines?.length||0}`);
  const recvItems=[{purchase_order_item_id:Number(lines[0].id),quantity:1}];
  const g1=Number(await global.rpc('retail_purchase_receive_v2',{p_purchase_order_id:po,p_items:recvItems,p_client_tx_id:grnTx}));const g2=Number(await global.rpc('retail_purchase_receive_v2',{p_purchase_order_id:po,p_items:recvItems,p_client_tx_id:grnTx}));if(!g1||g1!==g2)throw new Error('GRN idempotency failed');grn=g1;received=true;
  const afterReceive=await balance(productId);if(!afterReceive||!eq(afterReceive.quantity,before.quantity+1))throw new Error(`Receive stock mismatch ${before.quantity}->${afterReceive?.quantity}`);
  const retItems=[{product_id:productId,variant_id:null,quantity:1,unit_cost:cost}];
  const r1=Number(await global.rpc('retail_supplier_return_create_v2',{p_branch_id:branch(),p_supplier_id:supplierId,p_notes:marker(run),p_items:retItems,p_client_tx_id:retTx}));const r2=Number(await global.rpc('retail_supplier_return_create_v2',{p_branch_id:branch(),p_supplier_id:supplierId,p_notes:marker(run),p_items:retItems,p_client_tx_id:retTx}));if(!r1||r1!==r2)throw new Error('Supplier return idempotency failed');sret=r1;returned=true;
  const afterReturn=await balance(productId);if(!afterReturn||!eq(afterReturn.quantity,before.quantity)||!eq(afterReturn.average_unit_cost,before.average_unit_cost,.00005)||!eq(afterReturn.last_purchase_cost,before.last_purchase_cost,.00005))throw new Error('Purchasing roundtrip did not restore stock/cost basis');
 }catch(e){originalError=e}
 if(received&&!returned){
  try{const b=await balance(productId);if(b&&Number(b.quantity)>before.quantity+.0005){await global.rpc('retail_supplier_return_create_v2',{p_branch_id:branch(),p_supplier_id:supplierId,p_notes:`${marker(run)} COMPENSATION`,p_items:[{product_id:productId,variant_id:null,quantity:1,unit_cost:cost}],p_client_tx_id:compTx});returned=true}}catch(e){if(!originalError)originalError=e}
 }
 const bBeforeCleanup=await balance(productId);if(bBeforeCleanup&&!eq(bBeforeCleanup.quantity,before.quantity))throw originalError||new Error(`Unsafe stock residue before cleanup=${bBeforeCleanup.quantity}`);
 await cleanupV3(run);
 const finalBal=await balance(productId);if(!finalBal||!eq(finalBal.quantity,before.quantity)||!eq(finalBal.average_unit_cost,before.average_unit_cost,.00005)||!eq(finalBal.last_purchase_cost,before.last_purchase_cost,.00005))throw new Error('Post-cleanup stock/cost basis drift');
 if(originalError)throw originalError;
 return {status:'PASS',detail:`supplier=${supplierId}; product=${productId}; PO=${po}; GRN=${grn}; SRET=${sret}; stock=${before.quantity}->${before.quantity+1}->${finalBal.quantity}; cleanup=zero`,evidence:{supplier_id:supplierId,product_id:productId,po_id:po,grn_id:grn,supplier_return_id:sret,stock_before:before.quantity,stock_final:Number(finalBal.quantity)}};
}
async function replenishmentContract(){
 ensure();const rows=await global.rest('retail_reorder_suggestions_v1',`select=rule_id,branch_id,product_id,current_quantity,min_stock,target_stock,reorder_quantity,suggested_quantity,lead_time_days&branch_id=eq.${branch()}&order=product_id`);if(!Array.isArray(rows))throw new Error('Replenishment read model unavailable');
 const bad=rows.filter(x=>Number(x.branch_id)!==branch()||Number(x.suggested_quantity||0)<0||Number(x.reorder_quantity||0)<0);if(bad.length)throw new Error(`Invalid replenishment rows=${bad.length}`);
 return {status:'PASS',detail:`suggestions=${rows.length}; positive=${rows.filter(x=>Number(x.suggested_quantity||0)>0).length}; schema=ok`};
}
async function transferGuard(ctx){
 ensure();const id=tx(ctx.run_id,'TRANSFER-GUARD');let err=null;try{await global.rpc('retail_transfer_create',{p_from_branch_id:branch(),p_to_branch_id:branch(),p_items:[],p_notes:marker(ctx.run_id),p_client_tx_id:id})}catch(e){err=text(e?.message||e)}
 if(!err||!/فرعين مختلفين|different branches/i.test(err))throw new Error(`Transfer guard did not reject same branch: ${err||'no error'}`);
 const rows=await global.rest('retail_transfers',`select=id&client_tx_id=eq.${encodeURIComponent(id)}`);if(rows?.length)throw new Error('Transfer guard left residue');
 return {status:'PASS',detail:'same-branch transfer rejected atomically; residue=0'};
}
async function stockCountRollbackGuard(ctx){
 ensure();const products=await productCatalog();if(!products.length)throw new Error('No product for stock-count guard');const note=`${marker(ctx.run_id)} STOCKCOUNT-GUARD`;let err=null;
 try{await global.rpc('retail_post_stock_count',{p_branch_id:branch(),p_notes:note,p_items:[{product_id:Number(products[0].id),counted_qty:-1}]})}catch(e){err=text(e?.message||e)}
 if(!err||!/سالبة|negative/i.test(err))throw new Error(`Stock-count negative guard did not fire: ${err||'no error'}`);
 const rows=await global.rest('retail_stock_counts',`select=id&notes=eq.${encodeURIComponent(note)}`);if(rows?.length)throw new Error('Rejected stock count was not rolled back');
 return {status:'PASS',detail:'negative count rejected; transaction rollback residue=0'};
}
function register(){const reg=R();if(!reg||global.__SharawlaRetailCoverageV53Registered)return false;global.__SharawlaRetailCoverageV53Registered=true;reg.registerMany([
 {id:'retail.products-live-catalog',name:'Retail Products Live Catalog Contract',pack:'retail-coverage',profile:'retail',level:'full',mode:'readonly',features:['commerce.products'],run:productsContract},
 {id:'retail.variants-runtime-contract',name:'Retail Variants Runtime + Matrix Contract',pack:'retail-coverage',profile:'retail',level:'full',mode:'readonly',features:['commerce.variants'],run:variantsContract},
 {id:'retail.purchasing-roundtrip',name:'PO → Approve → GRN → Supplier Return → Cleanup',pack:'retail-coverage',profile:'retail',level:'full',mode:'write',features:['inventory.suppliers','inventory.purchase_orders','inventory.receiving','inventory.supplier_returns'],run:purchasingRoundtrip},
 {id:'retail.replenishment-read-model',name:'Retail Replenishment Suggestions Contract',pack:'retail-coverage',profile:'retail',level:'full',mode:'readonly',features:['inventory.replenishment'],run:replenishmentContract},
 {id:'retail.transfer-atomic-guard',name:'Retail Transfer Same-Branch Atomic Guard',pack:'retail-coverage',profile:'retail',level:'full',mode:'write',features:['inventory.transfers'],run:transferGuard},
 {id:'retail.stock-count-rollback-guard',name:'Retail Stock Count Transaction Rollback Guard',pack:'retail-coverage',profile:'retail',level:'full',mode:'write',features:['inventory.count'],run:stockCountRollbackGuard}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaRetailCoverageV53=Object.freeze({version:VERSION,register});
})(window);
