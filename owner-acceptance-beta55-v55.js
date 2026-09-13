(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const R=()=>global.__SharawlaAcceptanceRegistry;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const eq=(a,b,eps=.005)=>Math.abs(Number(a||0)-Number(b||0))<=eps;
const tx=(run,s)=>`${run}-B55-${s}`;
async function cleanup(run){const out=await global.rpc('sharawla_beta55_supply_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Beta55 supply cleanup failed: ${JSON.stringify(out)}`);return out}
async function offlineUnresolved(){try{const h=await global.topBurgerDesktop?.offlineV2?.health?.();return Number(h?.conflicts?.unresolved??h?.unresolved_conflicts??h?.unresolved??NaN)}catch{return NaN}}

async function runtimeContract(){
 const missing=[];
 if(!global.__SharawlaBeta55UiWorkflow)missing.push('beta55-ui-workflow');
 if(!global.__SharawlaBeta55CentralWarehouse)missing.push('beta55-central-warehouse');
 if(!global.__SharawlaBeta55CentralWarehouseV2)missing.push('beta55-central-warehouse-v2');
 if(typeof global.rpc!=='function'||typeof global.rest!=='function')missing.push('rpc/rest');
 if(missing.length)throw new Error(`Beta55 runtime missing: ${missing.join(', ')}`);
 global.__SharawlaBeta55UiWorkflow.reconcile?.();
 await global.__SharawlaBeta55CentralWarehouseV2.refreshPermissions?.();
 return {status:'PASS',detail:'Beta55 runtime + workflow + Warehouse V2 globals loaded',evidence:{version:VERSION,warehouse_v2:global.__SharawlaBeta55CentralWarehouseV2.version}};
}

async function uiWorkflowContract(){
 if(typeof global.showPage!=='function')return {status:'MANUAL',detail:'showPage unavailable for UI contract'};
 global.showPage('purchasing');await sleep(450);global.__SharawlaBeta55UiWorkflow?.reconcile?.();await sleep(100);
 const panels=[...document.querySelectorAll('#page [data-advanced-purchasing]')];
 if(panels.length>1)throw new Error(`Advanced purchasing duplicated: ${panels.length}`);
 const po=await global.__SharawlaBeta55UiWorkflow?.openPurchaseOrderWorkspace?.();await sleep(150);
 const modal=document.querySelector('.beta55-po-modal');
 if(!modal)throw new Error('Large PO workspace did not open');
 const required=['[data-b55-supplier]','[data-b55-search]','[data-b55-item-row]','[data-b55-q]','[data-b55-c]','[data-b55-save]'];
 for(const sel of required)if(!modal.querySelector(sel)){modal.remove();throw new Error(`PO workspace missing ${sel}`)}
 const poRows=modal.querySelectorAll('[data-b55-item-row]').length;modal.remove();
 global.__SharawlaBeta55UiWorkflow?.reconcile?.();await sleep(50);
 const group=document.querySelector('[data-beta55-hr-group]'),children=[...document.querySelectorAll('button[data-beta54-page="employees"],button[data-beta54-page="advances"],button[data-beta54-page="adjustments"],button[data-beta54-page="payroll"]')];
 if(children.length&&(!group||children.some(b=>!group.contains(b))))throw new Error('HR child buttons are not grouped under Employees parent');
 const treasury=document.querySelector('button[data-beta54-page="treasury"]');if(treasury&&group?.contains(treasury))throw new Error('Treasury must remain outside HR group');
 return {status:'PASS',detail:`single advanced panel; large PO workspace rows=${poRows}; HR grouped; Treasury separate`,evidence:{advanced_panels:panels.length,po_rows:poRows,hr_children:children.length,treasury_separate:!treasury||!group?.contains(treasury)}};
}

async function warehouseRoundtrip(ctx){
 const run=ctx.run_id,beforeUnresolved=await offlineUnresolved();let original=null,evidence=null,clean=null;
 await cleanup(run);
 try{
   const f=await global.rpc('sharawla_beta55_supply_acceptance_fixture_v1',{p_run_id:run});
   if(f?.ok!==true)throw new Error(`Fixture failed: ${JSON.stringify(f)}`);
   const wh=Number(f.warehouse_id),br=Number(f.branch_id),product=Number(f.product_id),route=Number(f.route_id),catalog=Number(f.catalog_item_id);
   let shortages=await global.rpc('inventory_supply_shortages_v1',{p_source_location_id:wh});
   const s=(shortages||[]).find(x=>Number(x.catalog_item_id)===catalog);
   if(!s||!eq(s.branch_quantity,2)||!eq(s.reorder_min_qty,4)||!eq(s.target_stock_qty,10)||!eq(s.shortage_qty,8)||!eq(s.internal_suggested_qty,8)||!eq(s.purchase_shortage_qty,0))throw new Error(`Initial shortage calculation mismatch: ${JSON.stringify(s)}`);

   const createTx=tx(run,'REQ1');
   const payload={p_route_id:route,p_items:[{catalog_item_id:catalog,quantity:8,line_note:'acceptance'}],p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:createTx};
   const r1=Number(await global.rpc('inventory_supply_shortage_request_create_v1',payload));
   const r1b=Number(await global.rpc('inventory_supply_shortage_request_create_v1',payload));
   if(!r1||r1!==r1b)throw new Error('Shortage request idempotency failed');
   let lines=await global.rest('inventory_supply_request_items',`select=*&request_id=eq.${r1}&order=id`);if(lines?.length!==1)throw new Error('Request line missing');const line=lines[0];
   await global.rpc('inventory_supply_request_decide_v1',{p_request_id:r1,p_approve:true,p_approved_items:[{item_id:Number(line.id),quantity:8}],p_note:'Acceptance reserve'});
   lines=await global.rest('inventory_supply_request_items',`select=*&request_id=eq.${r1}&order=id`);if(!eq(lines[0]?.quantity_reserved,8))throw new Error(`Reservation mismatch=${lines[0]?.quantity_reserved}`);

   const r2=Number(await global.rpc('inventory_supply_shortage_request_create_v1',{p_route_id:route,p_items:[{catalog_item_id:catalog,quantity:5,line_note:'reservation guard'}],p_notes:`SHARAWLA_ACCEPTANCE:${run}`,p_client_tx_id:tx(run,'REQ2')}));
   const l2=await global.rest('inventory_supply_request_items',`select=*&request_id=eq.${r2}&order=id`);let guardBlocked=false;try{await global.rpc('inventory_supply_request_decide_v1',{p_request_id:r2,p_approve:true,p_approved_items:[{item_id:Number(l2[0].id),quantity:5}],p_note:'must fail'})}catch(e){guardBlocked=true}
   if(!guardBlocked)throw new Error('Reservation overcommit guard did not block second approval');
   await global.rpc('inventory_supply_request_cancel_v1',{p_request_id:r2,p_note:'Acceptance cleanup of blocked request'});

   await global.rpc('inventory_supply_request_dispatch_v1',{p_request_id:r1,p_items:[{item_id:Number(line.id),quantity:6}],p_note:'Acceptance partial dispatch',p_client_tx_id:tx(run,'DISP')});
   const [sourceAfterDispatch,lineAfterDispatch,qAfterDispatch]=await Promise.all([
     global.rest('retail_inventory_balances',`select=quantity&branch_id=eq.${wh}&product_id=eq.${product}&limit=1`),
     global.rest('inventory_supply_request_items',`select=quantity_dispatched,quantity_backordered,quantity_reserved&request_id=eq.${r1}&limit=1`),
     global.rest('inventory_supply_requests',`select=status&id=eq.${r1}&limit=1`)
   ]);
   if(!eq(sourceAfterDispatch?.[0]?.quantity,4)||!eq(lineAfterDispatch?.[0]?.quantity_dispatched,6)||!eq(lineAfterDispatch?.[0]?.quantity_backordered,2)||!eq(lineAfterDispatch?.[0]?.quantity_reserved,0)||qAfterDispatch?.[0]?.status!=='in_transit')throw new Error(`Dispatch/backorder mismatch: ${JSON.stringify({sourceAfterDispatch,lineAfterDispatch,qAfterDispatch})}`);

   const receiveTx=tx(run,'REC');
   const recPayload={p_request_id:r1,p_items:[{item_id:Number(line.id),quantity_received:5,quantity_damaged:1,quantity_shortage:0,notes:'Acceptance variance'}],p_final:true,p_note:'Acceptance receive',p_client_tx_id:receiveTx};
   const rr1=Number(await global.rpc('inventory_supply_request_receive_v1',recPayload));
   const rr2=Number(await global.rpc('inventory_supply_request_receive_v1',recPayload));
   if(rr1!==r1||rr2!==r1)throw new Error(`Receive idempotency mismatch ${rr1}/${rr2}/${r1}`);
   const [destFinal,lineFinal,qFinal,audits]=await Promise.all([
     global.rest('retail_inventory_balances',`select=quantity&branch_id=eq.${br}&product_id=eq.${product}&limit=1`),
     global.rest('inventory_supply_request_items',`select=quantity_received,quantity_damaged,quantity_shortage,quantity_backordered&request_id=eq.${r1}&limit=1`),
     global.rest('inventory_supply_requests',`select=status&id=eq.${r1}&limit=1`),
     global.rest('audit_logs',`select=id,action&entity_type=eq.inventory_supply_request&entity_id=eq.${r1}&order=id`)
   ]);
   if(!eq(destFinal?.[0]?.quantity,7)||!eq(lineFinal?.[0]?.quantity_received,5)||!eq(lineFinal?.[0]?.quantity_damaged,1)||!eq(lineFinal?.[0]?.quantity_shortage,0)||!eq(lineFinal?.[0]?.quantity_backordered,2)||qFinal?.[0]?.status!=='received')throw new Error(`Receive/final stock mismatch: ${JSON.stringify({destFinal,lineFinal,qFinal})}`);
   if((audits||[]).length<3)throw new Error(`Audit evidence too small=${audits?.length||0}`);
   evidence={warehouse_id:wh,branch_id:br,product_id:product,request_id:r1,source_start:10,source_after_dispatch:4,branch_start:2,branch_final:7,backorder:2,damaged:1,reservation_guard_blocked:guardBlocked,audit_rows:audits.length};
 }catch(e){original=e}
 try{clean=await cleanup(run)}catch(e){if(!original)original=e}
 const afterUnresolved=await offlineUnresolved();
 if(Number.isFinite(beforeUnresolved)&&Number.isFinite(afterUnresolved)&&beforeUnresolved!==afterUnresolved&&!original)original=new Error(`Offline unresolved changed ${beforeUnresolved}->${afterUnresolved}`);
 if(original)throw original;
 return {status:'PASS',detail:`reserve guard PASS; dispatch 6/backorder 2; receive 5 + damaged 1; stock 10→4 / 2→7; cleanup=zero`,evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0,offline_unresolved_before:beforeUnresolved,offline_unresolved_after:afterUnresolved}};
}

function register(){const reg=R();if(!reg||global.__SharawlaBeta55AcceptanceRegistered)return false;global.__SharawlaBeta55AcceptanceRegistered=true;reg.registerMany([
 {id:'beta55.runtime-contract',name:'Beta55 runtime modules loaded',pack:'beta55',profile:'retail',level:'quick',mode:'readonly',critical:true,features:['inventory.multi_warehouse'],run:runtimeContract},
 {id:'beta55.ui-workflow-contract',name:'Beta55 PO / purchasing dedupe / HR grouping UI',pack:'beta55',profile:'retail',level:'full',mode:'readonly',critical:true,features:['inventory.purchase_orders'],run:uiWorkflowContract},
 {id:'beta55.warehouse-shortage-roundtrip',name:'Central Warehouse shortage → reserve → partial dispatch → receive → cleanup',pack:'beta55',profile:'retail',level:'full',mode:'write',critical:true,features:['inventory.multi_warehouse'],run:warehouseRoundtrip}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55AcceptanceV55=Object.freeze({version:VERSION,register,cleanup});
})(window);
