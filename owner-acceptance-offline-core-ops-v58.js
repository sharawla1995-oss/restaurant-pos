(function(global){
'use strict';
// SH-0007 sandbox executable acceptance for existing Offline V2 expense + return owners.
const VERSION='10.5.4-beta.58.29';
const R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const net=()=>global.__SharawlaAcceptanceNetworkLab;
async function ev(tx){for(let i=0;i<40;i++){const r=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(r)return r;await sleep(75)}return null}
async function sync(tx){for(let i=0;i<60;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const r=await ev(tx);if(r?.status==='synced')return r;if(['dead_letter','conflict','blocked'].includes(text(r?.status)))throw new Error(`terminal ${r.status}: ${r.last_error_code||''} ${r.last_error_message||''}`);await sleep(150)}throw new Error('offline event did not sync')}
async function receipt(tx){return await global.rest('offline_v2_server_receipts',`select=client_tx_id,operation_type,rpc_name,server_entity_id&client_tx_id=eq.${encodeURIComponent(tx)}&limit=2`)||[]}
async function openShift(){const b=Number(global.currentBranchId?.()||0),eid=Number(global.state?.employee?.id||0)||Number(await global.rpc('current_employee_id',{}));const r=await global.rest('shifts',`select=*&branch_id=eq.${b}&employee_id=eq.${eid}&status=eq.open&closed_at=is.null&order=id.desc&limit=1`);return r?.[0]||null}
async function expense(ctx){
 const owner=global.SharawlaOfflineV2Takeover?.saveExpense;if(typeof owner!=='function')throw new Error('offline expense owner unavailable');
 const sh=await openShift();if(!sh)throw new Error('open shift required');
 const tx=uuid(),desc=`SHARAWLA_ACCEPTANCE:${ctx.run_id}:OFFEXP`;let local;
 await net().enable('offline',{run_id:ctx.run_id});try{local=await owner(sh,desc,1,tx)}finally{await net().disable('offline-expense-commit')}
 if(text(local?.client_tx_id)!==tx)throw new Error('expense local tx mismatch');const d=await ev(tx);if(!d||!['pending','retryable'].includes(d.status))throw new Error(`expense not durable: ${d?.status||'missing'}`);
 const done=await sync(tx),rows=await global.rest('expenses',`select=id,client_tx_id,shift_id,description,amount&client_tx_id=eq.${encodeURIComponent(tx)}`),tr=await receipt(tx);
 if(rows.length!==1||Number(rows[0].shift_id)!==Number(sh.id)||Number(rows[0].amount)!==1)throw new Error('expense cloud persistence mismatch');
 if(tr.length!==1||text(tr[0].operation_type)!=='expense'||text(tr[0].rpc_name)!=='create_pos_expense_idempotent')throw new Error('expense transport receipt mismatch');
 await global.SharawlaOfflineV2Transport?.syncNow?.();const rows2=await global.rest('expenses',`select=id&client_tx_id=eq.${encodeURIComponent(tx)}`),tr2=await receipt(tx);if(rows2.length!==1||tr2.length!==1)throw new Error('expense replay duplicated');
 return {status:'PASS',detail:`seq=${done.device_sequence}; expense=${rows[0].id}; receipt=1; replay=stable`,evidence:{client_tx_id:tx,device_sequence:done.device_sequence,expense_id:rows[0].id}};
}
async function ret(ctx){
 const owner=global.SharawlaOfflineV2Takeover?.saveReturn;if(typeof owner!=='function')throw new Error('offline return owner unavailable');
 const orders=await global.rest('orders','select=id,branch_id,invoice_number,bon_number,status,total,payment_method&status=in.(completed,delivered)&order=id.desc&limit=20');let o=null,item=null;
 for(const x of orders||[]){const its=await global.rest('order_items',`select=id,order_id,product_name,quantity,total&order_id=eq.${Number(x.id)}&order=id&limit=1`);if(its?.[0]&&Number(its[0].quantity)>0){o=x;item=its[0];break}}
 if(!o||!item)throw new Error('no completed sandbox order available for offline return');
 const tx=uuid(),qty=Math.min(1,Number(item.quantity)),amount=Number(item.total||0)/Math.max(1,Number(item.quantity||1))*qty;
 const selected=[{order_item_id:Number(item.id),quantity:qty,line_uid:uuid(),source_document_id:`uuid:${tx}`,original_source_document_id:`db:${Number(o.id)}`}];
 let local;await net().enable('offline',{run_id:ctx.run_id});try{local=await owner(o,selected,'SHARAWLA ACCEPTANCE',`SHARAWLA_ACCEPTANCE:${ctx.run_id}:OFFRET`,text(o.payment_method)||'cash',amount,[item],tx)}finally{await net().disable('offline-return-commit')}
 const localTx=text(local?.r?.client_tx_id);if(localTx!==tx)throw new Error('return local tx mismatch');const d=await ev(tx);if(!d||!['pending','retryable'].includes(d.status))throw new Error(`return not durable: ${d?.status||'missing'}`);
 const done=await sync(tx),rows=await global.rest('returns',`select=id,client_tx_id,order_id,total&client_tx_id=eq.${encodeURIComponent(tx)}`),tr=await receipt(tx);
 if(rows.length!==1||Number(rows[0].order_id)!==Number(o.id))throw new Error('return cloud persistence mismatch');
 if(tr.length!==1||text(tr[0].operation_type)!=='return')throw new Error('return transport receipt mismatch');
 await global.SharawlaOfflineV2Transport?.syncNow?.();const rows2=await global.rest('returns',`select=id&client_tx_id=eq.${encodeURIComponent(tx)}`),tr2=await receipt(tx);if(rows2.length!==1||tr2.length!==1)throw new Error('return replay duplicated');
 return {status:'PASS',detail:`order=${o.id}; seq=${done.device_sequence}; return=${rows[0].id}; receipt=1; replay=stable`,evidence:{client_tx_id:tx,device_sequence:done.device_sequence,order_id:o.id,return_id:rows[0].id,rpc_name:tr[0].rpc_name}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineCoreOpsAcceptanceRegistered)return false;global.__SharawlaOfflineCoreOpsAcceptanceRegistered=true;r.registerMany([
 {id:'offline.expense-runtime-e2e',name:'Offline Expense → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.expenses'],run:expense},
 {id:'offline.return-runtime-e2e',name:'Offline Return → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.returns'],run:ret}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
})(window);
