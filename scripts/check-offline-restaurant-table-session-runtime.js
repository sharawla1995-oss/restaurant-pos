const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'..','beta45-offline-v2-transport-runtime.js'),'utf8');
const store=new Map(),events=new Map();let seq=0;const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function tx(){return '30000000-0000-4000-8000-'+String(++seq).padStart(12,'0')}
function runtime(branch=1,online=false){
 const takeover={registerOperation:()=>true,takeoverState:async()=>({active:true,migration_verified:true,transport_ready:true})};
 const offlineV2={takeoverState:takeover.takeoverState,event:async id=>clone(events.get(id)||null),commitOperation:async c=>{if(!events.has(c.client_tx_id))events.set(c.client_tx_id,{...clone(c),envelope:{payload:clone(c.payload)},status:'pending',server_ack:null});return{ok:true}},outbox:async()=>[...events.values()].map(clone),syncNow:async()=>({ok:true})};
 const c={console,JSON,Date,Map,Set,Promise,URLSearchParams,CustomEvent:function(t,o){this.type=t;this.detail=o?.detail},navigator:{onLine:online},document:{readyState:'complete'},addEventListener:()=>{},dispatchEvent:()=>true,setInterval:()=>1,setTimeout:()=>1,clearInterval:()=>{},crypto:{randomUUID:tx},uuid:tx,SharawlaOfflineV2Takeover:takeover,SharawlaRuntimeConfig:{current:()=>({pos_profile:'restaurant'})},topBurgerDesktop:{offlineV2},state:{activeBranchId:branch,employee:{id:7}},currentBranchId:()=>branch,loadLicenseState:async()=>({device_id:'SH-0007',business_id:'biz-a',device_fingerprint:'fp-a'}),odbGet:async k=>clone(store.get(k)||null),odbSet:async(k,v)=>{store.set(k,clone(v));return v},rpc:async()=>{throw new Error('canonical rpc called offline')},localStorage:{getItem:()=>JSON.stringify({url:'x',key:'k'})},session:{access_token:'t'}};c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(source,c);return c;
}
(async()=>{
 store.set('offlineV2RestaurantTables',[{id:401,branch_id:1,name:'T1',capacity:4,status:'available',active:true}]);
 let r=runtime(),openTx=tx(),attachTx=tx(),closeTx=tx(),saleTx=tx();
 const localSession=await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_table_session_open_v1',{p_table_id:401,p_guest_count:3,p_notes:'offline',p_client_tx_id:openTx});
 assert.strictEqual(localSession.result,'offline-table-session-'+openTx);assert.strictEqual(events.get(openTx).depends_on_tx_id,null);assert.strictEqual(store.get('offlineV2RestaurantTableSessions')[0].status,'open');assert.strictEqual(store.get('offlineV2RestaurantTables')[0].status,'occupied');
 r=runtime();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2RestaurantTableSessions').length,1);
 await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_table_session_attach_order_v1',{p_session_id:null,p_session_open_tx:openTx,p_order_id:null,p_order_sale_tx:saleTx,p_client_tx_id:attachTx});
 assert.strictEqual(events.get(attachTx).depends_on_tx_id,openTx);assert.strictEqual(store.get('offlineV2RestaurantTableSessionOrders').length,1);
 r=runtime();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2RestaurantTableSessionOrders').length,1);
 await r.SharawlaOfflineV2Transport.commitRpcLocal('restaurant_table_session_close_v1',{p_session_id:null,p_session_open_tx:openTx,p_notes:null,p_client_tx_id:closeTx});
 assert.strictEqual(events.get(closeTx).depends_on_tx_id,openTx);assert.strictEqual(store.get('offlineV2RestaurantTableSessions')[0].status,'closed');assert.strictEqual(store.get('offlineV2RestaurantTables')[0].status,'available');
 r=runtime();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2RestaurantTableSessions')[0].status,'closed');
 let e=events.get(openTx);e.status='synced';e.server_ack={result:{ok:true,session_id:501,client_tx_id:openTx}};events.set(openTx,e);
 e=events.get(attachTx);e.status='synced';e.server_ack={result:{ok:true,session_id:501,order_id:601,client_tx_id:attachTx}};events.set(attachTx,e);
 e=events.get(closeTx);e.status='synced';e.server_ack={result:{ok:true,session_id:501,client_tx_id:closeTx}};events.set(closeTx,e);
 r=runtime(1,true);await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();
 const sessions=store.get('offlineV2RestaurantTableSessions'),links=store.get('offlineV2RestaurantTableSessionOrders');
 assert.strictEqual(sessions.length,1);assert.strictEqual(sessions[0].id,501);assert.strictEqual(sessions[0].status,'closed');assert.strictEqual(sessions[0]._offline,false);
 assert.strictEqual(links.length,1);assert.strictEqual(links[0].session_id,501);assert.strictEqual(links[0].order_id,601);assert.strictEqual(links[0]._offline,false);assert.strictEqual(store.get('offlineV2RestaurantTables')[0].status,'available');
 r=runtime();await r.SharawlaOfflineV2Transport.reconcileCompatibilityProjections();assert.strictEqual(store.get('offlineV2RestaurantTableSessions').length,1);assert.strictEqual(store.get('offlineV2RestaurantTableSessions')[0].status,'closed');
 const ui=fs.readFileSync(path.join(__dirname,'..','beta55-restaurant-closure-ui.js'),'utf8');assert(ui.includes("p_session_open_tx"));assert(ui.includes("p_order_sale_tx"));assert(ui.includes("offlineV2RestaurantTableSessions"));
 console.log('Offline table session open restart attach close ACK no-resurrection runtime gate PASS');
})().catch(e=>{console.error(e);process.exit(1)});
