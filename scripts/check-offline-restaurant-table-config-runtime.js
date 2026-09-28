const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'..','beta45-offline-v2-transport-runtime.js'),'utf8');
const store=new Map(),events=new Map();let seq=0;const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function tx(){return '20000000-0000-4000-8000-'+String(++seq).padStart(12,'0')}
function runtime(branch=1,online=false){
 const takeover={registerOperation:()=>true,takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true})};
 const offlineV2={takeoverState:takeover.takeoverState,event:async id=>clone(events.get(id)||null),commitOperation:async c=>{if(!events.has(c.client_tx_id))events.set(c.client_tx_id,{...clone(c),envelope:{payload:clone(c.payload)},status:'pending',server_ack:null});return{ok:true}},outbox:async()=>[...events.values()].map(clone),syncNow:async()=>({ok:true})};
 const c={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(t,o){this.type=t;this.detail=o?.detail},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},crypto:{randomUUID:tx},uuid:tx,SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},state:{activeBranchId:branch,employee:{id:7}},currentBranchId:()=>branch,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},rpc:async()=>{throw new Error('canonical rpc called offline')},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'t'}};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(source,c);return c;
}
(async()=>{
 let r=runtime(1,false),ftx=tx(),ttx=tx();
 await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_floor_save_v1',{p_floor_id:null,p_branch_id:1,p_name:'Floor Offline',p_sort_order:10,p_active:true,p_client_tx_id:ftx});
 assert.strictEqual(store.get('offlineV2RestaurantFloors').length,1);assert.strictEqual(store.get('offlineV2RestaurantFloors')[0].id,'offline-floor-'+ftx);
 await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_table_save_v1',{p_table_id:null,p_branch_id:1,p_floor_id:null,p_name:'Table Offline',p_code:'T1',p_capacity:4,p_active:true,p_client_tx_id:ttx});
 assert.strictEqual(store.get('offlineV2RestaurantTables').length,1);
 // unresolved local parent must fail closed before durable commit
 const bad=tx();await assert.rejects(()=>r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_table_save_v1',{p_table_id:null,p_branch_id:1,p_floor_id:'offline-floor-'+ftx,p_name:'Bad Child',p_capacity:2,p_active:true,p_client_tx_id:bad}),e=>e&&e.code==='OFFLINE_V2_LOCAL_DEPENDENCY_UNRESOLVED');assert(!events.has(bad));
 // cold restart
 r=runtime(1,false);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2RestaurantFloors').length,1);assert.strictEqual(store.get('offlineV2RestaurantTables').length,1);
 const ui=fs.readFileSync(path.join(__dirname,'..','beta55-restaurant-closure-ui.js'),'utf8');assert(ui.includes("local.filter(x=>Number(x.branch_id)===Number(b))"),'branch scoped restaurant config projection missing');assert(ui.includes("startsWith('offline-floor-')"),'pending floor dependency guard missing');
 // ACK and reconcile twice
 let e=events.get(ftx);e.status='synced';e.server_ack={result:{ok:true,floor_id:301,client_tx_id:ftx,idempotent_replay:true}};events.set(ftx,e);
 e=events.get(ttx);e.status='synced';e.server_ack={result:{ok:true,table_id:401,client_tx_id:ttx,idempotent_replay:true}};events.set(ttx,e);
 r=runtime(1,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 const fsx=store.get('offlineV2RestaurantFloors'),tsx=store.get('offlineV2RestaurantTables');assert.strictEqual(fsx.length,1);assert.strictEqual(tsx.length,1);assert.strictEqual(fsx[0].id,301);assert.strictEqual(tsx[0].id,401);assert.strictEqual(fsx[0]._offline,false);assert.strictEqual(tsx[0]._offline,false);
 const replay=await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_floor_save_v1',{p_floor_id:null,p_branch_id:1,p_name:'Floor Offline',p_sort_order:10,p_active:true,p_client_tx_id:ftx});assert.strictEqual(replay.result,301);assert.strictEqual(events.size,2);
 console.log('Offline floor/table restart ACK dependency isolation runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
