'use strict';
const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const need=(src,t,msg=t)=>{if(!src.includes(t))throw new Error(`Beta45 Phase 7 gate missing: ${msg}`)};
const forbid=(src,t,msg=t)=>{if(src.toLowerCase().includes(t.toLowerCase()))throw new Error(`Beta45 Phase 7 gate forbidden: ${msg}`)};

const backend=read('supabase-beta45-offline-v2-inbox-events-v1.sql');
const hardening=read('supabase-beta45-offline-v2-inbox-events-v1-hardening.sql');
const store=read('beta45-offline-v2-inbox-store.js');
const runtime=read('beta45-offline-v2-inbox-runtime.js');
const preload=read('preload.js');
const main=read('main-beta44.js');
const pkg=JSON.parse(read('package.json'));

new Function(store);new Function(runtime);new Function(preload);

for(const t of [
  'offline_v2_domain_events','offline_v2_customer_merge_receipts','offline_v2_pull_events_v1',
  'trg_offline_v2_order_event','trg_offline_v2_customer_event','trg_offline_v2_customer_address_event',
  "'website.order_created'","'order.status_changed'","'customer.upsert'","'customer_address.upsert'",
  'offline_v2_merge_customer_v1','offline_v2_update_order_status_v1','sharawla_offline_v2_apply_event_core_v1',
  "v_operation not in ('customer_merge','order_status')"
])need(backend,t);

for(const t of [
  'depends_on_tx_id','dependency_mapping','v_dep_server_id','v_dep_map_tx','v_dep_tx',
  "jsonb_set(v_payload,'{p_order_id}'","revoke all on function public.sharawla_offline_v2_apply_event_core_v1(jsonb) from public, anon, authenticated",
  'revoke all on function public.offline_v2_update_order_status_v1(bigint,bigint,text,bigint,text,text) from public, anon, authenticated'
])need(hardening,t);

for(const t of [
  'sharawla-offline-v2.sqlite','offline_v2_order_events','offline_v2_order_projection','offline_v2_customer_projection',
  'offline_v2_customer_address_projection','server_event_id TEXT PRIMARY KEY',"status='applied'",
  "VALUES(?,?,?,?,?,?,NULL,NULL)",'BEGIN IMMEDIATE TRANSACTION','INSERT OR IGNORE INTO offline_v2_order_events',
  "ipcMain.handle('offline-v2:inbox-receive'","ipcMain.handle('offline-v2:inbox-apply'",
  "ipcMain.handle('offline-v2:inbox-stats'","ipcMain.handle('offline-v2:order-events'"
])need(store,t);
forbid(store,'DELETE FROM offline_v2_inbox','Inbox audit rows must never be pruned');
forbid(store,'DELETE FROM offline_v2_order_events','Order event ledger must never be pruned');

for(const t of [
  'sharawlaOfflineV2InboxCursor','offline_v2_pull_events_v1','website.order_created','customer_address.deleted',
  "event.entity_type==='customer'","event.entity_type==='customer_address'",
  'inboxReceive(event)','inboxApply(event.event_id)','queueCustomerMerge','queueOrderStatus','customer_merge','order_status',
  'offline_v2_merge_customer_v1','offline_v2_update_order_status_v1','OFFLINE_V2_CUSTOMER_PENDING',
  'depends_on_tx_id:dependsOnTx','function orderDependency','function restV2'
])need(runtime,t);
const applyAt=runtime.indexOf('await a.inboxApply(event.event_id)');
const cursorAt=runtime.indexOf('saveCursor(st.business_id,branch,event)',applyAt);
if(!(applyAt>=0&&cursorAt>applyAt))throw new Error('Beta45 Phase 7 cursor must advance only after durable Inbox apply');
const recvAt=runtime.indexOf('await a.inboxReceive(event)');
if(!(recvAt>=0&&recvAt<applyAt))throw new Error('Beta45 Phase 7 must durably receive before applying compatibility caches');
const customerCommit=runtime.indexOf("type:'customer_merge'");
const customerPending=runtime.indexOf("throw deferredError('OFFLINE_V2_CUSTOMER_PENDING')");
if(!(customerCommit>=0&&customerPending>customerCommit))throw new Error('Customer fallback must remain durable without writing local text customer_id into order');

need(main,"require('./beta45-offline-v2-inbox-store.js').installOfflineV2InboxStore()");
for(const t of [
  'inboxReceive:e=>ipcRenderer.invoke','inboxApply:id=>ipcRenderer.invoke','inboxStats:()=>ipcRenderer.invoke',
  'orderEvents:(id,l)=>ipcRenderer.invoke','customerProjection:x=>ipcRenderer.invoke',
  'beta45-offline-v2-inbox-runtime.js','data-offline-v2-phase7-inbox'
])need(preload,t);
const transportAt=preload.indexOf('beta45-offline-v2-transport-runtime.js');
const inboxAt=preload.indexOf('beta45-offline-v2-inbox-runtime.js');
const diagAt=preload.indexOf('beta45-offline-v2-diagnostics.js');
if(!(transportAt>=0&&inboxAt>transportAt&&diagAt>inboxAt))throw new Error('Phase 7 Inbox runtime must load after transport and before diagnostics');

if(!String(pkg.scripts?.check||'').includes('check-beta45-offline-v2-inbox.js'))throw new Error('package check pipeline missing Phase 7 gate');
console.log('Beta45 Offline V2 Phase 7 Inbox / Customers / Website / Order Events gate PASS');
