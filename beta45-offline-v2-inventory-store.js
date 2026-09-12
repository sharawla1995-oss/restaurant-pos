'use strict';

// Phase 6 read/projection surface for inventory ledger rows that are committed
// atomically inside offline_v2_records by the native Offline V2 transaction.
const {app,ipcMain}=require('electron');
const path=require('path');
const sqlite3=require('sqlite3');
let db=null,readyPromise=null,installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function parse(v,f=null){try{return v==null?f:JSON.parse(v)}catch{return f}}
function all(sql,params=[]){return new Promise((resolve,reject)=>db.all(sql,params,(e,r)=>e?reject(e):resolve(r||[])))}
async function ready(){
 if(db)return db;if(readyPromise)return readyPromise;
 readyPromise=(async()=>{await app.whenReady();db=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,e=>e?reject(e):resolve(d))});await new Promise((resolve,reject)=>db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;',e=>e?reject(e):resolve()));return db})();
 return readyPromise;
}
async function rows(input={}){
 await ready();
 const r=await all(`SELECT r.local_id AS movement_id,r.client_tx_id,r.payload_json,r.created_local_at,
   o.device_id,o.device_sequence,o.business_id,o.branch_id,o.employee_id,o.status AS sync_status,o.synced_at
   FROM offline_v2_records r LEFT JOIN offline_v2_outbox o ON o.client_tx_id=r.client_tx_id
   WHERE r.record_type='inventory_ledger' ORDER BY r.created_local_at,r.local_id`);
 let out=r.map(x=>({...x,...(parse(x.payload_json,{})||{}),payload_json:undefined}));
 if(text(input.business_id))out=out.filter(x=>text(x.business_id)===text(input.business_id));
 if(num(input.branch_id)>0)out=out.filter(x=>num(x.branch_id)===num(input.branch_id));
 if(text(input.item_kind))out=out.filter(x=>text(x.item_kind)===text(input.item_kind));
 if(text(input.item_id))out=out.filter(x=>text(x.item_id)===text(input.item_id));
 if(text(input.client_tx_id))out=out.filter(x=>text(x.client_tx_id)===text(input.client_tx_id));
 const limit=Math.max(1,Math.min(5000,num(input.limit,1000)));return out.slice(-limit);
}
async function projection(input={}){
 const list=await rows({...input,limit:5000}),groups=new Map();
 for(const m of list){
   const key=`${text(m.business_id)}|${num(m.branch_id)}|${text(m.item_kind)}|${text(m.item_id)}`;
   if(!groups.has(key))groups.set(key,{business_id:text(m.business_id),branch_id:num(m.branch_id),item_kind:text(m.item_kind),item_id:text(m.item_id),audit_delta_total:0,pending_delta:0,movement_count:0,pending_count:0,server_derived_count:0});
   const g=groups.get(key),delta=num(m.quantity_delta);g.movement_count++;g.audit_delta_total+=delta;
   if(m.server_derived===true||m.server_derived===1)g.server_derived_count++;
   if(text(m.sync_status)!=='synced'&&m.projectable!==false&&m.projectable!==0){g.pending_delta+=delta;g.pending_count++}
 }
 return {ok:true,source:'offline_v2_inventory_ledger',groups:[...groups.values()]};
}
async function stats(input={}){
 const list=await rows({...input,limit:5000});
 const counts={SALE:0,RETURN:0,PURCHASE:0,WASTE:0,ADJUSTMENT:0,TRANSFER_OUT:0,TRANSFER_IN:0,OTHER:0};
 for(const m of list){const t=text(m.movement_type).toUpperCase();if(Object.prototype.hasOwnProperty.call(counts,t))counts[t]++;else counts.OTHER++}
 return {ok:true,total:list.length,unsynced:list.filter(x=>text(x.sync_status)!=='synced').length,server_derived:list.filter(x=>x.server_derived===true||x.server_derived===1).length,counts};
}
function installOfflineV2InventoryStore(){
 if(installed)return {rows,projection,stats};installed=true;
 ipcMain.handle('offline-v2:inventory-ledger',(_e,input)=>rows(input||{}));
 ipcMain.handle('offline-v2:inventory-projection',(_e,input)=>projection(input||{}));
 ipcMain.handle('offline-v2:inventory-stats',(_e,input)=>stats(input||{}));
 ready().catch(e=>console.error('Offline V2 inventory ledger init failed',e));
 return {rows,projection,stats};
}
module.exports={installOfflineV2InventoryStore};
