'use strict';
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};
must(src.includes("const CUSTODY_KEY_PREFIX='sharawlaDriverCustodyV2:'"),'custody snapshot key missing');
must(src.includes('async function custodyReadModel(bid,degraded=false){'),'offline/degraded custody read model missing');
must(src.includes('const row=projectedCustodyRow(o);if(row)byOrder.set(key,row);'),'local order projection must overlay custody snapshot');
must(src.includes("if(method!=='cash'||!['delivered','completed'].includes(status)||o.driver_id==null||o.driver_settled_at!=null)return null"),'cash/delivered/driver/unsettled custody contract missing');
must(src.includes("if(model.offline||!isOnline())return toastLocal('تسوية عهدة المناديب تحتاج اتصال إنترنت مباشر')"),'settlement must remain fail-closed on Offline/degraded network');
must(src.includes('وضع Offline: آخر Snapshot للعهدة + الحركات المحلية المعلقة'),'delivery custody stale semantics missing');
must(src.includes('وضع Offline: العهدة من آخر Snapshot + العمليات المحلية المعلقة'),'settings custody stale semantics missing');
must(!/async function enhanceDeliveryOrdersSettlement\(\)\{\s*if\(!isOnline\(\)\)return;/.test(src),'custody view must not disappear Offline');
must(src.includes('const c=projectedCustodyRow(o);if(c)unsettled+=num(c.custody_amount);'),'shift custody metric must consume projected custody');
must(src.includes("catch(err){console.warn('delivery_driver_pending_v2',err);return custodyReadModel(bid,true)}"),'DNS/fetch failure must degrade to labelled local custody');

const mem=new Map();
mem.set('sharawlaDriverCustodyV2:1',JSON.stringify({cached_at:'2026-09-26T10:00:00Z',rows:[
 {order_id:101,driver_id:1,source_shift_id:7,custody_amount:50},
 {order_id:102,driver_id:1,source_shift_id:7,custody_amount:25}
]}));
const ctx={
 console, navigator:{onLine:false},
 localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v))},
 document:{addEventListener(){},querySelector(){return null}},
 CustomEvent:function(){}, crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
 setTimeout(){},clearTimeout(){}, state:{activeBranchId:1,drivers:[]}, currentBranchId:()=>1,
 topBurgerDesktop:{},
 odbGet:async k=>k==='cachedOrders'?[
  {order:{id:101,branch_id:1,order_type:'delivery',status:'delivered',payment_method:'cash',driver_id:1,driver_settled_at:'2026-09-26T10:01:00Z',total:50}},
  {order:{id:'offline-sale-a',branch_id:1,shift_id:7,order_type:'delivery',status:'delivered',payment_method:'cash',driver_id:2,driver_settled_at:null,total:70,_offline:true,_offline_status_pending:true,client_tx_id:'sale-a'}},
  {order:{id:'offline-sale-wallet',branch_id:1,shift_id:7,order_type:'delivery',status:'delivered',payment_method:'wallet',driver_id:2,total:90,_offline:true}}
 ]:[], dispatchEvent(){},
};
ctx.window=ctx;vm.runInNewContext(src,ctx,{filename:'beta55-delivery-settlement-shift-cash.js'});
(async()=>{
 const api=ctx.__SharawlaDeliverySettlementShiftCashV55;must(api,'custody runtime export missing');
 must(api.projectedCustodyRow({id:'x',order_type:'delivery',status:'delivered',payment_method:'cash',driver_id:9,total:12}).custody_amount===12,'delivered cash must create custody');
 must(api.projectedCustodyRow({id:'x',order_type:'delivery',status:'delivered',payment_method:'wallet',driver_id:9,total:12})===null,'non-cash must not create custody');
 must(api.projectedCustodyRow({id:'x',order_type:'delivery',status:'delivered',payment_method:'cash',driver_id:9,total:12,driver_settled_at:'x'})===null,'settled order must not create custody');
 const model=await api.custodyReadModel(1);const ids=model.rows.map(x=>String(x.order_id)).sort();
 must(model.offline===true,'offline model must be labelled stale');
 must(!ids.includes('101'),'newer settled local projection must remove stale cached custody');
 must(ids.includes('102'),'unmodified cached custody must remain readable');
 must(ids.includes('offline-sale-a'),'pending delivered local cash must enter custody view');
 must(!ids.includes('offline-sale-wallet'),'pending non-cash delivery must not enter custody view');
 const local=model.rows.find(x=>String(x.order_id)==='offline-sale-a');
 must(local.custody_amount===70&&local.driver_id===2&&String(local.source_shift_id)==='7','local custody economics mismatch');
 const degraded=await api.custodyReadModel(1,true);must(degraded.offline===true&&degraded.degraded===true,'degraded network must force stale/fail-closed state');
 console.log('RC1 driver custody local projection runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
