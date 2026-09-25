'use strict';

// Sharawla Offline Engine V2 — Phase 7 durable Inbox / cloud projection store.
// Shares the Native SQLite database with the Outbox. Server event receipt is
// durable before renderer-side cache work; V2 projections + applied marker are
// committed atomically and server_event_id makes replay exactly-once.
const {app,ipcMain}=require('electron');
const path=require('path');
const sqlite3=require('sqlite3');

const PROTOCOL_VERSION=2;
const SCHEMA_VERSION=2;
let db=null,readyPromise=null,writeChain=Promise.resolve(),installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function parseJson(v,f=null){try{return v==null?f:JSON.parse(v)}catch{return f}}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function normalizePhone(v){
  let s=text(v).replace(/\D/g,'');
  if(s.startsWith('20')&&s.length>=12)s=s.slice(2);
  if(s.length===10&&s.startsWith('1'))s=`0${s}`;
  return s;
}
function run(sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(err){if(err)reject(err);else resolve({changes:this.changes,lastID:this.lastID})}))}
function get(sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)))}
function all(sql,params=[]){return new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows||[])))}
function exec(sql){return new Promise((resolve,reject)=>db.exec(sql,err=>err?reject(err):resolve(true)))}
function serial(fn){const next=writeChain.then(fn,fn);writeChain=next.catch(()=>{});return next}

async function openDb(){
  if(db)return db;
  await app.whenReady();
  db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,err=>err?reject(err):resolve(d))});
  await exec(`
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS offline_v2_order_events(
  server_event_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  branch_id INTEGER,
  event_type TEXT NOT NULL,
  source TEXT,
  status TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_v2_order_events_order_idx ON offline_v2_order_events(order_id,created_at,server_event_id);
CREATE TABLE IF NOT EXISTS offline_v2_order_projection(
  server_order_id TEXT PRIMARY KEY,
  branch_id INTEGER,
  status TEXT,
  source TEXT,
  payload_json TEXT NOT NULL,
  last_server_event_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offline_v2_customer_projection(
  server_customer_id TEXT PRIMARY KEY,
  normalized_phone TEXT,
  payload_json TEXT NOT NULL,
  last_server_event_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_v2_customer_phone_idx ON offline_v2_customer_projection(normalized_phone);
CREATE TABLE IF NOT EXISTS offline_v2_customer_address_projection(
  server_address_id TEXT PRIMARY KEY,
  server_customer_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  payload_json TEXT NOT NULL,
  last_server_event_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_v2_customer_address_customer_idx ON offline_v2_customer_address_projection(server_customer_id,deleted);
`);
  return db;
}
function ready(){if(!readyPromise)readyPromise=openDb();return readyPromise}

function validateEvent(event){
  const id=text(event?.event_id||event?.server_event_id);
  const type=text(event?.event_type),entityType=text(event?.entity_type),entityId=text(event?.entity_id);
  if(!id||!type||!entityType||!entityId){const e=new Error('Offline V2 Inbox event contract incomplete');e.code='OFFLINE_V2_INBOX_EVENT_INVALID';throw e}
  if(event?.payload!=null&&typeof event.payload!=='object'){const e=new Error('Offline V2 Inbox payload must be an object');e.code='OFFLINE_V2_INBOX_PAYLOAD_INVALID';throw e}
  return {id,type,entityType,entityId};
}

async function receiveUnsafe(event){
  const meta=validateEvent(event),now=nowIso();
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const existing=await get('SELECT * FROM offline_v2_inbox WHERE server_event_id=?',[meta.id]);
    if(existing){
      await exec('COMMIT');
      return {ok:true,duplicate:true,status:existing.status,server_event_id:meta.id,applied:existing.status==='applied'};
    }
    await run(`INSERT INTO offline_v2_inbox(server_event_id,status,payload_json,protocol_version,schema_version,received_at,applied_at,last_error)
      VALUES(?,?,?,?,?,?,NULL,NULL)`,[meta.id,'received',JSON.stringify(clone(event)),PROTOCOL_VERSION,SCHEMA_VERSION,now]);
    await exec('COMMIT');
    return {ok:true,duplicate:false,status:'received',server_event_id:meta.id,applied:false};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function receive(event){await ready();return serial(()=>receiveUnsafe(clone(event||{})))}

async function applyUnsafe(serverEventId){
  const id=text(serverEventId),now=nowIso();if(!id)throw new Error('server_event_id is required');
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get('SELECT * FROM offline_v2_inbox WHERE server_event_id=?',[id]);
    if(!row)throw Object.assign(new Error(`Offline V2 Inbox event not found: ${id}`),{code:'OFFLINE_V2_INBOX_EVENT_NOT_FOUND'});
    if(row.status==='applied'){
      await exec('COMMIT');return {ok:true,duplicate:true,applied:true,server_event_id:id};
    }
    if(row.status!=='received')throw Object.assign(new Error(`Offline V2 Inbox apply rejected from ${row.status}`),{code:'OFFLINE_V2_INBOX_STATE_REJECTED'});
    const event=parseJson(row.payload_json,null),meta=validateEvent(event),payload=clone(event.payload||{});

    if(meta.entityType==='order'){
      const branchId=event.branch_id==null?num(payload.branch_id,0):num(event.branch_id,0);
      await run(`INSERT OR IGNORE INTO offline_v2_order_events(server_event_id,order_id,branch_id,event_type,source,status,payload_json,created_at)
        VALUES(?,?,?,?,?,?,?,?)`,[id,meta.entityId,branchId||null,meta.type,text(event.source)||null,text(payload.status)||null,JSON.stringify(payload),text(event.created_at)||row.received_at]);
      await run(`INSERT INTO offline_v2_order_projection(server_order_id,branch_id,status,source,payload_json,last_server_event_id,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(server_order_id) DO UPDATE SET
          branch_id=excluded.branch_id,status=excluded.status,source=excluded.source,payload_json=excluded.payload_json,
          last_server_event_id=excluded.last_server_event_id,updated_at=excluded.updated_at`,
        [meta.entityId,branchId||null,text(payload.status)||null,text(event.source)||null,JSON.stringify(payload),id,text(event.created_at)||now]);
    }else if(meta.entityType==='customer'){
      await run(`INSERT INTO offline_v2_customer_projection(server_customer_id,normalized_phone,payload_json,last_server_event_id,updated_at)
        VALUES(?,?,?,?,?) ON CONFLICT(server_customer_id) DO UPDATE SET
          normalized_phone=excluded.normalized_phone,payload_json=excluded.payload_json,last_server_event_id=excluded.last_server_event_id,updated_at=excluded.updated_at`,
        [meta.entityId,normalizePhone(payload.phone)||null,JSON.stringify(payload),id,text(event.created_at)||now]);
    }else if(meta.entityType==='customer_address'){
      const deleted=meta.type==='customer_address.deleted'?1:0;
      await run(`INSERT INTO offline_v2_customer_address_projection(server_address_id,server_customer_id,deleted,payload_json,last_server_event_id,updated_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(server_address_id) DO UPDATE SET
          server_customer_id=excluded.server_customer_id,deleted=excluded.deleted,payload_json=excluded.payload_json,
          last_server_event_id=excluded.last_server_event_id,updated_at=excluded.updated_at`,
        [meta.entityId,text(payload.customer_id)||null,deleted,JSON.stringify(payload),id,text(event.created_at)||now]);
    }else{
      // Unknown future event types remain durable and can be consumed by a later
      // activity adapter without corrupting current projections.
    }

    const changed=await run(`UPDATE offline_v2_inbox SET status='applied',applied_at=?,last_error=NULL WHERE server_event_id=? AND status='received'`,[now,id]);
    if(changed.changes!==1)throw new Error(`Offline V2 Inbox applied marker rejected: ${id}`);
    await exec('COMMIT');return {ok:true,duplicate:false,applied:true,server_event_id:id};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function apply(serverEventId){await ready();return serial(()=>applyUnsafe(serverEventId))}

async function markErrorUnsafe(serverEventId,error){
  const id=text(serverEventId);if(!id)throw new Error('server_event_id is required');
  const r=await run(`UPDATE offline_v2_inbox SET last_error=? WHERE server_event_id=? AND status='received'`,[text(error?.message||error)||'Inbox apply error',id]);
  return {ok:true,updated:r.changes};
}
async function markError(serverEventId,error){await ready();return serial(()=>markErrorUnsafe(serverEventId,error))}

async function listInbox(status=null,limit=200){
  await ready();const n=Math.max(1,Math.min(1000,num(limit,200)));
  const rows=status?await all(`SELECT * FROM offline_v2_inbox WHERE status=? ORDER BY received_at DESC LIMIT ?`,[text(status),n]):await all(`SELECT * FROM offline_v2_inbox ORDER BY received_at DESC LIMIT ?`,[n]);
  return rows.map(r=>({...r,payload:parseJson(r.payload_json,null)}));
}
async function stats(){
  await ready();const rows=await all(`SELECT status,COUNT(*) count FROM offline_v2_inbox GROUP BY status`);const counts={};for(const r of rows)counts[r.status]=num(r.count);
  const orderEvents=await get('SELECT COUNT(*) count FROM offline_v2_order_events');
  const customers=await get('SELECT COUNT(*) count FROM offline_v2_customer_projection');
  const addresses=await get('SELECT COUNT(*) count FROM offline_v2_customer_address_projection WHERE deleted=0');
  return {ok:true,counts,order_events:num(orderEvents?.count),customers:num(customers?.count),customer_addresses:num(addresses?.count)};
}
async function orderEvents(orderId=null,limit=200){
  await ready();const n=Math.max(1,Math.min(1000,num(limit,200)));
  const rows=orderId==null?await all(`SELECT * FROM offline_v2_order_events ORDER BY created_at DESC,server_event_id DESC LIMIT ?`,[n]):await all(`SELECT * FROM offline_v2_order_events WHERE order_id=? ORDER BY created_at,server_event_id LIMIT ?`,[text(orderId),n]);
  return rows.map(r=>({...r,payload:parseJson(r.payload_json,{})}));
}
async function orderProjection(orderId){await ready();const r=await get('SELECT * FROM offline_v2_order_projection WHERE server_order_id=?',[text(orderId)]);return r?{...r,payload:parseJson(r.payload_json,{})}:null}
async function customerProjection(input={}){
  await ready();let r=null;
  if(text(input?.customer_id))r=await get('SELECT * FROM offline_v2_customer_projection WHERE server_customer_id=?',[text(input.customer_id)]);
  else if(normalizePhone(input?.phone))r=await get('SELECT * FROM offline_v2_customer_projection WHERE normalized_phone=? ORDER BY updated_at DESC LIMIT 1',[normalizePhone(input.phone)]);
  return r?{...r,payload:parseJson(r.payload_json,{})}:null;
}
async function customerAddresses(customerId){
  await ready();const rows=await all('SELECT * FROM offline_v2_customer_address_projection WHERE server_customer_id=? AND deleted=0 ORDER BY updated_at DESC',[text(customerId)]);
  return rows.map(r=>({...r,payload:parseJson(r.payload_json,{})}));
}

function installOfflineV2InboxStore(){
  if(installed)return {ready,receive,apply,markError,listInbox,stats,orderEvents,orderProjection,customerProjection,customerAddresses};
  installed=true;
  ipcMain.handle('offline-v2:inbox-receive',(_e,event)=>receive(event));
  ipcMain.handle('offline-v2:inbox-apply',(_e,id)=>apply(id));
  ipcMain.handle('offline-v2:inbox-error',(_e,id,error)=>markError(id,error));
  ipcMain.handle('offline-v2:inbox-list',(_e,status=null,limit=200)=>listInbox(status,limit));
  ipcMain.handle('offline-v2:inbox-stats',()=>stats());
  ipcMain.handle('offline-v2:order-events',(_e,id=null,limit=200)=>orderEvents(id,limit));
  ipcMain.handle('offline-v2:order-projection',(_e,id)=>orderProjection(id));
  ipcMain.handle('offline-v2:customer-projection',(_e,input)=>customerProjection(input||{}));
  ipcMain.handle('offline-v2:customer-addresses',(_e,id)=>customerAddresses(id));
  ready().catch(e=>console.error('Offline V2 inbox store init failed',e));
  return {ready,receive,apply,markError,listInbox,stats,orderEvents,orderProjection,customerProjection,customerAddresses};
}

module.exports={installOfflineV2InboxStore,PROTOCOL_VERSION,SCHEMA_VERSION};
