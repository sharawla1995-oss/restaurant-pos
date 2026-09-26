(function(global){
'use strict';
const VERSION='10.5.4-beta.58.32';
const R=()=>global.__SharawlaAcceptanceRegistry;
const eq=(a,b,eps=.005)=>Math.abs(Number(a||0)-Number(b||0))<=eps;
const branch=()=>Number(global.currentBranchId?.()||0);
const tx=(run,s)=>`${run}-B55DS-${s}`;
async function unresolved(){try{const h=await global.topBurgerDesktop?.offlineV2?.health?.();return Number(h?.conflicts?.unresolved??h?.unresolved_conflicts??h?.unresolved??NaN)}catch{return NaN}}
async function cleanup(run){const out=await global.rpc('sharawla_beta55_delivery_acceptance_cleanup_v1',{p_run_id:run});if(out?.ok!==true||Number(out?.residue||0)!==0)throw new Error(`Delivery acceptance cleanup failed: ${JSON.stringify(out)}`);return out}
const sum=(rows,key)=>rows.reduce((a,x)=>a+Number(x?.[key]||0),0);

async function deliverySettlementRoundtrip(ctx){
 const run=ctx.run_id,bid=branch();if(!bid)throw new Error('Active branch missing');
 if(!global.__SharawlaDeliverySettlementShiftCashV55?.shiftCashV2)throw new Error('Delivery Settlement + Shift Cash runtime is not loaded');
 const beforeUnresolved=await unresolved();
 let original=null,clean=null,evidence={};
 await cleanup(run);
 try{
  const f=await global.rpc('sharawla_beta55_delivery_acceptance_fixture_v1',{p_run_id:run,p_branch_id:bid});
  if(f?.ok!==true)throw new Error(`Delivery fixture failed: ${JSON.stringify(f)}`);
  const driver=Number(f.driver_id),recv=Number(f.receiving_shift_id),s1=Number(f.source_shift_1),s2=Number(f.source_shift_2);
  const A=Number(f.order_a),B=Number(f.order_b),C=Number(f.order_c),D=Number(f.order_d);
  if(!driver||!recv||!s1||!s2||![A,B,C,D].every(Boolean))throw new Error(`Delivery fixture incomplete: ${JSON.stringify(f)}`);

  const recvBefore=await global.rpc('shift_cash_metrics_v2',{p_shift_id:recv});

  const a1=await global.rpc('delivery_mark_delivered_v2',{p_order_id:A,p_payment_method:'cash',p_client_tx_id:tx(run,'MARK-A')});
  const a2=await global.rpc('delivery_mark_delivered_v2',{p_order_id:A,p_payment_method:'cash',p_client_tx_id:tx(run,'MARK-A')});
  if(!eq(a1?.custody_amount,100)||a2?.idempotent!==true)throw new Error('Delivered cash / mark idempotency failed');
  await global.rpc('delivery_mark_delivered_v2',{p_order_id:B,p_payment_method:'cash',p_client_tx_id:tx(run,'MARK-B')});
  await global.rpc('delivery_mark_delivered_v2',{p_order_id:C,p_payment_method:'cash',p_client_tx_id:tx(run,'MARK-C')});
  await global.rpc('delivery_mark_delivered_v2',{p_order_id:D,p_payment_method:'instapay',p_client_tx_id:tx(run,'MARK-D')});

  const rows=await global.rest('orders',`select=id,payment_method,delivery_cash_custody_amount,driver_settled_at,status&id=in.(${[A,B,C,D].join(',')})`);
  const byId=new Map((rows||[]).map(x=>[Number(x.id),x]));
  if(!eq(byId.get(A)?.delivery_cash_custody_amount,100)||String(byId.get(A)?.payment_method)!=='cash')throw new Error('Cash delivery custody mismatch');
  if(!eq(byId.get(B)?.delivery_cash_custody_amount,80)||String(byId.get(B)?.payment_method)!=='cash')throw new Error('InstaPay → Cash did not create custody');
  if(!eq(byId.get(C)?.delivery_cash_custody_amount,60)||String(byId.get(C)?.payment_method)!=='cash')throw new Error('Second-source cash custody mismatch');
  if(!eq(byId.get(D)?.delivery_cash_custody_amount,0)||String(byId.get(D)?.payment_method)!=='instapay')throw new Error('Cash → InstaPay still created custody');

  let pending=(await global.rpc('delivery_driver_pending_v2',{p_branch_id:bid})||[]).filter(x=>Number(x.driver_id)===driver);
  if(pending.length!==3||!eq(sum(pending,'custody_amount'),240))throw new Error(`Pending custody mismatch before settlement: ${JSON.stringify(pending)}`);

  const s1Before=await global.rpc('shift_cash_metrics_v2',{p_shift_id:s1}),s2Before=await global.rpc('shift_cash_metrics_v2',{p_shift_id:s2});
  if(!eq(s1Before.cash_sales_gross,180)||!eq(s1Before.delivery_cash_originated,180)||!eq(s1Before.driver_custody_unsettled,180)||!eq(s1Before.expected_drawer_cash,0))throw new Error(`Source shift 1 cash-presence mismatch: ${JSON.stringify(s1Before)}`);
  if(!eq(s2Before.cash_sales_gross,60)||!eq(s2Before.delivery_cash_originated,60)||!eq(s2Before.driver_custody_unsettled,60)||!eq(s2Before.expected_drawer_cash,0))throw new Error(`Source shift 2 cash-presence mismatch: ${JSON.stringify(s2Before)}`);

  const one1=await global.rpc('delivery_driver_settle_v2',{p_driver_id:driver,p_order_ids:[A],p_client_tx_id:tx(run,'SET-ONE')});
  const one2=await global.rpc('delivery_driver_settle_v2',{p_driver_id:driver,p_order_ids:[A],p_client_tx_id:tx(run,'SET-ONE')});
  if(!one1?.settlement_id||Number(one1.settlement_id)!==Number(one2?.settlement_id)||one2?.idempotent!==true||!eq(one1.amount,100)||Number(one1.orders_count)!==1)throw new Error('Per-order settlement idempotency failed');
  pending=(await global.rpc('delivery_driver_pending_v2',{p_branch_id:bid})||[]).filter(x=>Number(x.driver_id)===driver);
  if(pending.length!==2||!eq(sum(pending,'custody_amount'),140))throw new Error('Partial settlement pending balance mismatch');
  const recvOne=await global.rpc('shift_cash_metrics_v2',{p_shift_id:recv});
  if(!eq(Number(recvOne.driver_settlements_received)-Number(recvBefore.driver_settlements_received),100)||!eq(Number(recvOne.expected_drawer_cash)-Number(recvBefore.expected_drawer_cash),100))throw new Error('Per-order settlement did not enter receiving shift drawer');

  const all1=await global.rpc('delivery_driver_settle_v2',{p_driver_id:driver,p_order_ids:null,p_client_tx_id:tx(run,'SET-ALL')});
  const all2=await global.rpc('delivery_driver_settle_v2',{p_driver_id:driver,p_order_ids:null,p_client_tx_id:tx(run,'SET-ALL')});
  if(!all1?.settlement_id||Number(all1.settlement_id)!==Number(all2?.settlement_id)||all2?.idempotent!==true||!eq(all1.amount,140)||Number(all1.orders_count)!==2)throw new Error('Settle-all idempotency/amount failed');
  pending=(await global.rpc('delivery_driver_pending_v2',{p_branch_id:bid})||[]).filter(x=>Number(x.driver_id)===driver);
  if(pending.length!==0)throw new Error('Driver still has pending custody after settle-all');

  const recvAfter=await global.rpc('shift_cash_metrics_v2',{p_shift_id:recv});
  if(!eq(Number(recvAfter.driver_settlements_received)-Number(recvBefore.driver_settlements_received),240)||!eq(Number(recvAfter.expected_drawer_cash)-Number(recvBefore.expected_drawer_cash),240))throw new Error(`Cross-shift settlement drawer mismatch: ${JSON.stringify({before:recvBefore,after:recvAfter})}`);
  const s1After=await global.rpc('shift_cash_metrics_v2',{p_shift_id:s1}),s2After=await global.rpc('shift_cash_metrics_v2',{p_shift_id:s2});
  if(!eq(s1After.expected_drawer_cash,0)||!eq(s2After.expected_drawer_cash,0)||!eq(s1After.driver_custody_unsettled,0)||!eq(s2After.driver_custody_unsettled,0))throw new Error('Source shift changed after later-shift settlement');

  const settlements=await global.rest('driver_settlements',`select=id,orders_count,amount,receiving_shift_id,client_tx_id&driver_id=eq.${driver}&order=id`);
  const settlementIds=(settlements||[]).map(x=>Number(x.id));
  const items=settlementIds.length?await global.rest('driver_settlement_items',`select=id,settlement_id,order_id,source_shift_id,amount&settlement_id=in.(${settlementIds.join(',')})`):[];
  if(settlements?.length!==2||items?.length!==3||new Set(items.map(x=>Number(x.order_id))).size!==3)throw new Error('Settlement ledger/item uniqueness mismatch');

  evidence={driver_id:driver,source_shifts:[s1,s2],receiving_shift:recv,cash_to_instapay_order:D,instapay_to_cash_order:B,per_order_amount:100,settle_all_amount:140,total_received:240,settlements:settlements.length,settlement_items:items.length};
 }catch(e){original=e}
 try{clean=await cleanup(run)}catch(e){if(!original)original=e}
 const afterUnresolved=await unresolved();
 if(Number.isFinite(beforeUnresolved)&&Number.isFinite(afterUnresolved)&&beforeUnresolved!==afterUnresolved&&!original)original=new Error(`Offline unresolved changed ${beforeUnresolved}->${afterUnresolved}`);
 if(original)throw original;
 return {status:'PASS',detail:'Delivered cash custody + payment switch + settle-one + settle-all + idempotency + cross-shift drawer cash all PASS; cleanup=zero',evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0,offline_unresolved_before:beforeUnresolved,offline_unresolved_after:afterUnresolved}};
}

function register(){const reg=R();if(!reg||global.__SharawlaBeta55DeliverySettlementAcceptanceRegistered)return false;global.__SharawlaBeta55DeliverySettlementAcceptanceRegistered=true;reg.register({id:'beta55.delivery-settlement-shift-cash',name:'Delivery cash custody → Driver settlement → Receiving shift drawer cash',pack:'beta55-restaurant',profile:'restaurant',level:'full',mode:'write',critical:true,features:['commerce.delivery','core.shifts'],dependsOn:['beta55.restaurant-runtime-contract'],run:deliverySettlementRoundtrip});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55DeliverySettlementAcceptanceV55=Object.freeze({version:VERSION,register,cleanup});
})(window);
