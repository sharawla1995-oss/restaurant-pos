'use strict';

// Sharawla Offline Engine V2 — Phase 2 durable local store + Phase 3 sync state.
// The database remains separate from the legacy sql.js database and remains
// shadow-only until a later takeover gate. No method here drains legacy queue.
const {app,ipcMain}=require('electron');
const path=require('path');
const crypto=require('crypto');
const sqlite3=require('sqlite3');

const STORE_VERSION='2.5';
const PROTOCOL_VERSION=2;
const SCHEMA_VERSION=2;
const VALID_STATUS=new Set(['pending','syncing','retryable','blocked','conflict','dead_letter','synced']);
let db=null;
let readyPromise=null;
let writeChain=Promise.resolve();

function nowIso(){return new Date().toISOString()}
function text(v){return String(v??'').trim()}
function number(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((o,k)=>(o[k]=canonical(value[k]),o),{});
  return value;
}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')}
function dbPath(){return path.join(app.getPath('userData'),'sharawla-offline-v2.sqlite')}
function parseJson(v,fallback=null){try{return v==null?fallback:JSON.parse(v)}catch{return fallback}}
function hydrate(row){
  if(!row)return null;
  const envelope=parseJson(row.envelope_json,{})||{};
  return {...row,envelope:{...envelope,status:row.status,attempts:number(row.attempts),last_attempt_at:row.last_attempt_at||null,next_retry_at:row.next_retry_at||null,last_error_code:row.last_error_code||null,last_error_message:row.last_error_message||null,synced_at:row.synced_at||null,server_ack:parseJson(row.server_ack_json,null)},server_ack:parseJson(row.server_ack_json,null)};
}

function run(sql,params=[]){return new Promise((resolve,reject)=>db.run(sql,params,function(err){if(err)reject(err);else resolve({changes:this.changes,lastID:this.lastID})}))}
function get(sql,params=[]){return new Promise((resolve,reject)=>db.get(sql,params,(err,row)=>err?reject(err):resolve(row)))}
function all(sql,params=[]){return new Promise((resolve,reject)=>db.all(sql,params,(err,rows)=>err?reject(err):resolve(rows||[])))}
function exec(sql){return new Promise((resolve,reject)=>db.exec(sql,err=>err?reject(err):resolve(true)))}
function serializeWrite(fn){const next=writeChain.then(fn,fn);writeChain=next.catch(()=>{});return next}

async function openNativeStore(){
  if(db)return db;
  await app.whenReady();
  db=await new Promise((resolve,reject)=>{
    const d=new sqlite3.Database(dbPath(),sqlite3.OPEN_READWRITE|sqlite3.OPEN_CREATE,err=>err?reject(err):resolve(d));
  });
  await exec(`
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS offline_v2_meta(
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offline_v2_device_sequences(
 device_id TEXT PRIMARY KEY,
 last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offline_v2_records(
 record_type TEXT NOT NULL,
 local_id TEXT NOT NULL,
 client_tx_id TEXT NOT NULL,
 parent_local_id TEXT,
 payload_json TEXT NOT NULL,
 created_local_at TEXT NOT NULL,
 PRIMARY KEY(record_type,local_id)
);
CREATE INDEX IF NOT EXISTS offline_v2_records_tx_idx ON offline_v2_records(client_tx_id);
CREATE TABLE IF NOT EXISTS offline_v2_outbox(
 client_tx_id TEXT PRIMARY KEY,
 device_id TEXT NOT NULL,
 device_sequence INTEGER NOT NULL,
 business_id TEXT NOT NULL,
 branch_id INTEGER NOT NULL,
 employee_id INTEGER NOT NULL,
 operation_type TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 local_entity_id TEXT,
 local_shift_id TEXT,
 depends_on_tx_id TEXT,
 created_local_at TEXT NOT NULL,
 protocol_version INTEGER NOT NULL,
 schema_version INTEGER NOT NULL,
 status TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt_at TEXT,
 next_retry_at TEXT,
 last_error_code TEXT,
 last_error_message TEXT,
 synced_at TEXT,
 server_ack_json TEXT,
 envelope_json TEXT NOT NULL,
 payload_digest TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(device_id,device_sequence)
);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_status_idx ON offline_v2_outbox(status,created_local_at);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_dependency_idx ON offline_v2_outbox(depends_on_tx_id,status);
CREATE INDEX IF NOT EXISTS offline_v2_outbox_retry_idx ON offline_v2_outbox(status,next_retry_at,device_id,device_sequence);
CREATE TABLE IF NOT EXISTS offline_v2_mappings(
 entity_type TEXT NOT NULL,
 local_id TEXT NOT NULL,
 server_id TEXT,
 client_tx_id TEXT NOT NULL,
 server_version TEXT,
 mapped_at TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(entity_type,local_id),
 UNIQUE(client_tx_id,entity_type,local_id)
);
CREATE INDEX IF NOT EXISTS offline_v2_mappings_tx_idx ON offline_v2_mappings(client_tx_id);
CREATE TABLE IF NOT EXISTS offline_v2_inbox(
 server_event_id TEXT PRIMARY KEY,
 status TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 protocol_version INTEGER NOT NULL,
 schema_version INTEGER NOT NULL,
 received_at TEXT NOT NULL,
 applied_at TEXT,
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS offline_v2_bon_reservations(
 reservation_uid TEXT PRIMARY KEY,
 business_id TEXT NOT NULL,
 branch_id INTEGER NOT NULL,
 server_shift_id INTEGER,
 shift_open_tx_id TEXT,
 device_fingerprint TEXT NOT NULL,
 start_bon INTEGER NOT NULL CHECK(start_bon>=1),
 end_bon INTEGER NOT NULL CHECK(end_bon>=start_bon),
 status TEXT NOT NULL CHECK(status IN ('active','closed')),
 issued_at TEXT NOT NULL,
 imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_v2_bon_reservation_owner_idx
 ON offline_v2_bon_reservations(business_id,branch_id,server_shift_id,device_fingerprint,status);
CREATE TABLE IF NOT EXISTS offline_v2_bon_consumptions(
 reservation_uid TEXT NOT NULL,
 bon_number INTEGER NOT NULL CHECK(bon_number>=1),
 sale_client_tx_id TEXT NOT NULL UNIQUE,
 consumed_at TEXT NOT NULL,
 PRIMARY KEY(reservation_uid,bon_number),
 FOREIGN KEY(reservation_uid) REFERENCES offline_v2_bon_reservations(reservation_uid) ON DELETE RESTRICT
);
`);
  let bonColumns=await all('PRAGMA table_info(offline_v2_bon_reservations)');
  if(!bonColumns.some(x=>text(x.name)==='business_id'))await run('ALTER TABLE offline_v2_bon_reservations ADD COLUMN business_id TEXT');
  if(!bonColumns.some(x=>text(x.name)==='numbering_mode'))await run("ALTER TABLE offline_v2_bon_reservations ADD COLUMN numbering_mode TEXT NOT NULL DEFAULT 'SHIFT'");
  if(!bonColumns.some(x=>text(x.name)==='business_date'))await run("ALTER TABLE offline_v2_bon_reservations ADD COLUMN business_date TEXT");
  await run("UPDATE offline_v2_bon_reservations SET numbering_mode='SHIFT' WHERE numbering_mode IS NULL OR trim(numbering_mode)=''");
  bonColumns=await all('PRAGMA table_info(offline_v2_bon_reservations)');
  const legacyShiftNotNull=bonColumns.some(x=>text(x.name)==='server_shift_id'&&number(x.notnull)===1)||bonColumns.some(x=>text(x.name)==='shift_open_tx_id'&&number(x.notnull)===1);
  if(legacyShiftNotNull){
    // V2.4 scope migration: preserve every reservation/consumption while allowing
    // BRANCH reservations to have no shift owner. Foreign-key children are copied
    // back after the parent table is rebuilt; no operational row is discarded.
    await exec('BEGIN IMMEDIATE TRANSACTION');
    try{
      await exec(`CREATE TABLE offline_v2_bon_reservations_scope_v24(
        reservation_uid TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        branch_id INTEGER NOT NULL,
        server_shift_id INTEGER,
        shift_open_tx_id TEXT,
        device_fingerprint TEXT NOT NULL,
        start_bon INTEGER NOT NULL CHECK(start_bon>=1),
        end_bon INTEGER NOT NULL CHECK(end_bon>=start_bon),
        status TEXT NOT NULL CHECK(status IN ('active','closed')),
        issued_at TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        numbering_mode TEXT NOT NULL DEFAULT 'SHIFT' CHECK(numbering_mode IN ('SHIFT','BRANCH')),
        business_date TEXT,
        CHECK(numbering_mode='BRANCH' OR (server_shift_id IS NOT NULL AND server_shift_id>=1 AND shift_open_tx_id IS NOT NULL AND trim(shift_open_tx_id)<>'')))
      );
      INSERT INTO offline_v2_bon_reservations_scope_v24(reservation_uid,business_id,branch_id,server_shift_id,shift_open_tx_id,device_fingerprint,start_bon,end_bon,status,issued_at,imported_at,numbering_mode,business_date)
      SELECT reservation_uid,business_id,branch_id,server_shift_id,shift_open_tx_id,device_fingerprint,start_bon,end_bon,status,issued_at,imported_at,COALESCE(NULLIF(trim(numbering_mode),''),'SHIFT'),business_date
      FROM offline_v2_bon_reservations;
      CREATE TABLE offline_v2_bon_consumptions_scope_v24(
        reservation_uid TEXT NOT NULL,
        bon_number INTEGER NOT NULL CHECK(bon_number>=1),
        sale_client_tx_id TEXT NOT NULL UNIQUE,
        consumed_at TEXT NOT NULL,
        PRIMARY KEY(reservation_uid,bon_number),
        FOREIGN KEY(reservation_uid) REFERENCES offline_v2_bon_reservations_scope_v24(reservation_uid) ON DELETE RESTRICT
      );
      INSERT INTO offline_v2_bon_consumptions_scope_v24(reservation_uid,bon_number,sale_client_tx_id,consumed_at)
      SELECT reservation_uid,bon_number,sale_client_tx_id,consumed_at FROM offline_v2_bon_consumptions;
      DROP TABLE offline_v2_bon_consumptions;
      DROP TABLE offline_v2_bon_reservations;
      ALTER TABLE offline_v2_bon_reservations_scope_v24 RENAME TO offline_v2_bon_reservations;
      ALTER TABLE offline_v2_bon_consumptions_scope_v24 RENAME TO offline_v2_bon_consumptions;
      CREATE INDEX offline_v2_bon_reservation_owner_idx ON offline_v2_bon_reservations(business_id,branch_id,server_shift_id,device_fingerprint,status);
      CREATE INDEX offline_v2_bon_reservation_scope_idx ON offline_v2_bon_reservations(business_id,branch_id,numbering_mode,server_shift_id,device_fingerprint,status);`);
      await exec('COMMIT');
    }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
  }else{
    await run("CREATE INDEX IF NOT EXISTS offline_v2_bon_reservation_scope_idx ON offline_v2_bon_reservations(business_id,branch_id,numbering_mode,server_shift_id,device_fingerprint,status)");
  }
  await run(`INSERT INTO offline_v2_meta(key,value,updated_at) VALUES('store_version',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,[STORE_VERSION,nowIso()]);
  const integrity=await get('PRAGMA integrity_check');
  if(String(Object.values(integrity||{})[0]||'').toLowerCase()!=='ok')throw new Error('Offline V2 native database integrity check failed');
  return db;
}
function ready(){if(!readyPromise)readyPromise=openNativeStore();return readyPromise}

function validateCommit(input){
  const errors=[];
  const required=['client_tx_id','device_id','business_id','branch_id','employee_id','operation_type','entity_type'];
  for(const k of required)if(input?.[k]===undefined||input?.[k]===null||input?.[k]==='')errors.push(`missing:${k}`);
  if(input?.protocol_version!=null&&number(input.protocol_version)!==PROTOCOL_VERSION)errors.push('invalid:protocol_version');
  if(input?.schema_version!=null&&number(input.schema_version)!==SCHEMA_VERSION)errors.push('invalid:schema_version');
  if(input?.status&&input.status!=='pending')errors.push('new_operation_status_must_be_pending');
  // Fail closed for durable order-status events. The generic runtime catalog may
  // exist before the transport-specific adapter registers, but such a window
  // must never be allowed to persist an unbound event into the outbox.
  if(text(input?.operation_type)==='expense_update'){
    const p=input?.payload?.rpc_payload||{};
    if(input?.payload?.rpc_name!=='offline_expense_update_v1'||text(p.p_client_tx_id)!==text(input.client_tx_id))errors.push('invalid:expense_update_binding');
    if(!text(p.p_expense_id)||!text(p.p_description)||!Number.isFinite(Number(p.p_amount))||Number(p.p_amount)<=0||!Number.isFinite(Number(p.p_expected_amount))||Number(p.p_expected_amount)<=0||typeof p.p_expected_description!=='string')errors.push('invalid:expense_update_revision');
  }
  if(text(input?.operation_type)==='order_status'){
    const rpcName=text(input?.payload?.rpc_name);
    const rpcPayload=input?.payload?.rpc_payload;
    if(rpcName!=='order_status_apply_offline_v2')errors.push('invalid:order_status_rpc_binding');
    if(!rpcPayload||typeof rpcPayload!=='object'||Array.isArray(rpcPayload))errors.push('invalid:order_status_rpc_payload');
    else{
      if(!text(rpcPayload.p_order_id))errors.push('missing:order_status:p_order_id');
      if(!text(rpcPayload.p_target_status))errors.push('missing:order_status:p_target_status');
      if(text(rpcPayload.p_client_tx_id)!==text(input?.client_tx_id))errors.push('invalid:order_status_client_tx_binding');
    }
  }
  const boundRpc={
    driver_save:'offline_delivery_driver_save_v1',zone_save:'offline_delivery_zone_save_v1',
    customer_create:'offline_customer_create_v1',
    customer_update:'offline_customer_update_v1',
    customer_address_save:'offline_customer_address_save_v1',
    customer_address_delete:'offline_customer_address_delete_v1',
    delivery_assign_driver:'offline_delivery_assign_driver_v1'
  }[text(input?.operation_type)];
  if(boundRpc){
    const rpcName=text(input?.payload?.rpc_name),rpcPayload=input?.payload?.rpc_payload;
    if(rpcName!==boundRpc)errors.push('invalid:'+text(input?.operation_type)+'_rpc_binding');
    if(!rpcPayload||typeof rpcPayload!=='object'||Array.isArray(rpcPayload))errors.push('invalid:'+text(input?.operation_type)+'_rpc_payload');
    else if(text(rpcPayload.p_client_tx_id)!==text(input?.client_tx_id))errors.push('invalid:'+text(input?.operation_type)+'_client_tx_binding');
    if(text(input?.operation_type)==='customer_update'&&text(input?.depends_on_tx_id)&&text(rpcPayload?.p_customer_create_tx)!==text(input?.depends_on_tx_id))errors.push('invalid:customer_update_dependency_binding');
    if(text(input?.operation_type)==='customer_address_save'&&text(input?.depends_on_tx_id)){
      const dependency=text(rpcPayload?.p_address_save_tx)||text(rpcPayload?.p_customer_create_tx);
      if(dependency!==text(input.depends_on_tx_id))errors.push('invalid:customer_address_dependency_binding');
    }
    if(text(input?.operation_type)==='customer_address_delete'&&text(input?.depends_on_tx_id)&&text(rpcPayload?.p_address_save_tx)!==text(input?.depends_on_tx_id))errors.push('invalid:customer_address_delete_dependency_binding');
  }
  const records=Array.isArray(input?.records)?input.records:[];
  for(const [i,r] of records.entries())if(!text(r?.record_type)||!text(r?.local_id))errors.push(`invalid:record:${i}`);
  if(errors.length){const e=new Error(`Offline V2 atomic commit invalid: ${errors.join(',')}`);e.code='OFFLINE_V2_INVALID_COMMIT';throw e}
}

async function allocateSequence(deviceId){
  const now=nowIso();
  await run(`INSERT INTO offline_v2_device_sequences(device_id,last_sequence,updated_at) VALUES(?,0,?) ON CONFLICT(device_id) DO NOTHING`,[deviceId,now]);
  await run(`UPDATE offline_v2_device_sequences SET last_sequence=last_sequence+1,updated_at=? WHERE device_id=?`,[now,deviceId]);
  const row=await get(`SELECT last_sequence FROM offline_v2_device_sequences WHERE device_id=?`,[deviceId]);
  return number(row?.last_sequence);
}

function envelopeFrom(input,sequence){
  return {
    client_tx_id:text(input.client_tx_id),device_id:text(input.device_id),device_sequence:sequence,
    business_id:text(input.business_id),branch_id:number(input.branch_id),employee_id:number(input.employee_id),
    operation_type:text(input.operation_type),entity_type:text(input.entity_type),
    local_entity_id:text(input.local_entity_id)||null,local_shift_id:text(input.local_shift_id)||null,
    depends_on_tx_id:text(input.depends_on_tx_id)||null,created_local_at:text(input.created_local_at)||nowIso(),
    protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,status:'pending',attempts:0,
    last_attempt_at:null,next_retry_at:null,last_error_code:null,last_error_message:null,synced_at:null,server_ack:null,
    payload:clone(input.payload??null)
  };
}

function bonEvidence(input){
  if(text(input?.operation_type)!=='sale')return null;
  const e=input?.payload?.rpc_payload?.p_order?.bon_reservation;if(e==null)return null;
  const out={reservation_uid:text(e.reservation_uid),bon_number:number(e.bon_number),business_id:text(e.business_id),branch_id:number(e.branch_id),numbering_mode:(text(e.numbering_mode)||'SHIFT').toUpperCase(),business_date:text(e.business_date),server_shift_id:number(e.server_shift_id),shift_open_tx_id:text(e.shift_open_tx_id),device_fingerprint:text(e.device_fingerprint)};
  const shiftInvalid=out.numbering_mode==='SHIFT'&&(out.server_shift_id<1||!out.shift_open_tx_id);
  const branchDayInvalid=out.numbering_mode==='BRANCH'&&!/^\d{4}-\d{2}-\d{2}$/.test(out.business_date);
  if(!out.reservation_uid||out.bon_number<1||!out.business_id||out.branch_id<1||!['SHIFT','BRANCH'].includes(out.numbering_mode)||shiftInvalid||branchDayInvalid||!out.device_fingerprint){const err=new Error('Invalid scope-aware Bon reservation evidence');err.code='OFFLINE_V2_BON_EVIDENCE_INVALID';throw err}
  if(out.business_id!==text(input.business_id)||out.branch_id!==number(input.branch_id)){const err=new Error('Bon reservation branch mismatch');err.code='OFFLINE_V2_BON_OWNER_MISMATCH';throw err}
  return out;
}
async function consumeBonReservationUnsafe(input,tx){
  const e=bonEvidence(input);if(!e)return null;
  const prior=await get('SELECT * FROM offline_v2_bon_consumptions WHERE sale_client_tx_id=?',[tx]);
  if(prior){if(text(prior.reservation_uid)!==e.reservation_uid||number(prior.bon_number)!==e.bon_number){const err=new Error('Sale replay Bon mismatch');err.code='OFFLINE_V2_BON_REPLAY_MISMATCH';throw err}return prior}
  const r=await get('SELECT * FROM offline_v2_bon_reservations WHERE reservation_uid=?',[e.reservation_uid]);
  if(!r||text(r.status)!=='active'){const err=new Error('Bon reservation unavailable');err.code='OFFLINE_V2_BON_RESERVATION_UNAVAILABLE';throw err}
  const rMode=(text(r.numbering_mode)||'SHIFT').toUpperCase();
  const shiftMismatch=rMode==='SHIFT'&&(number(r.server_shift_id)!==e.server_shift_id||text(r.shift_open_tx_id)!==e.shift_open_tx_id);
  const dayMismatch=rMode==='BRANCH'&&text(r.business_date)!==e.business_date;
  if(text(r.business_id)!==e.business_id||number(r.branch_id)!==e.branch_id||rMode!==e.numbering_mode||shiftMismatch||dayMismatch||text(r.device_fingerprint)!==e.device_fingerprint){const err=new Error('Bon reservation owner/scope mismatch');err.code='OFFLINE_V2_BON_OWNER_MISMATCH';throw err}
  if(e.bon_number<number(r.start_bon)||e.bon_number>number(r.end_bon)){const err=new Error('Bon outside reserved range');err.code='OFFLINE_V2_BON_OUT_OF_RANGE';throw err}
  await run('INSERT INTO offline_v2_bon_consumptions(reservation_uid,bon_number,sale_client_tx_id,consumed_at) VALUES(?,?,?,?)',[e.reservation_uid,e.bon_number,tx,nowIso()]);
  return {reservation_uid:e.reservation_uid,bon_number:e.bon_number,sale_client_tx_id:tx};
}
async function importBonReservationUnsafe(input){
  const r={reservation_uid:text(input?.reservation_uid),business_id:text(input?.business_id),branch_id:number(input?.branch_id),numbering_mode:(text(input?.numbering_mode)||'SHIFT').toUpperCase(),business_date:text(input?.business_date),server_shift_id:number(input?.server_shift_id),shift_open_tx_id:text(input?.shift_open_tx_id),device_fingerprint:text(input?.device_fingerprint),start_bon:number(input?.start_bon),end_bon:number(input?.end_bon),status:text(input?.status)||'active',issued_at:text(input?.issued_at)||nowIso()};
  const shiftInvalid=r.numbering_mode==='SHIFT'&&(r.server_shift_id<1||!r.shift_open_tx_id);
  const branchDayInvalid=r.numbering_mode==='BRANCH'&&!/^\d{4}-\d{2}-\d{2}$/.test(r.business_date);
  if(!r.reservation_uid||!r.business_id||r.branch_id<1||!['SHIFT','BRANCH'].includes(r.numbering_mode)||shiftInvalid||!r.device_fingerprint||r.start_bon<1||r.end_bon<r.start_bon||!['active','closed'].includes(r.status)){const e=new Error('Invalid scope-aware server Bon reservation');e.code='OFFLINE_V2_BON_RESERVATION_INVALID';throw e}
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const old=await get('SELECT * FROM offline_v2_bon_reservations WHERE reservation_uid=?',[r.reservation_uid]);
    if(old){
      const oldMode=(text(old.numbering_mode)||'SHIFT').toUpperCase();
      const same=text(old.business_id)===r.business_id&&number(old.branch_id)===r.branch_id&&oldMode===r.numbering_mode&&(r.numbering_mode!=='BRANCH'||text(old.business_date)===r.business_date)&&(r.numbering_mode!=='SHIFT'||(number(old.server_shift_id)===r.server_shift_id&&text(old.shift_open_tx_id)===r.shift_open_tx_id))&&text(old.device_fingerprint)===r.device_fingerprint&&number(old.start_bon)===r.start_bon&&number(old.end_bon)===r.end_bon;
      if(!same){const e=new Error('Bon reservation immutable fields changed');e.code='OFFLINE_V2_BON_RESERVATION_MISMATCH';throw e}
      if(text(old.status)==='closed'&&r.status==='active'){const e=new Error('Closed Bon reservation cannot reactivate');e.code='OFFLINE_V2_BON_RESERVATION_CLOSED';throw e}
      if(r.status==='closed'&&text(old.status)!=='closed')await run("UPDATE offline_v2_bon_reservations SET status='closed' WHERE reservation_uid=?",[r.reservation_uid]);
      await exec('COMMIT');return {ok:true,duplicate:true,reservation:r};
    }
    await run('INSERT INTO offline_v2_bon_reservations(reservation_uid,business_id,branch_id,server_shift_id,shift_open_tx_id,device_fingerprint,start_bon,end_bon,status,issued_at,imported_at,numbering_mode,business_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[r.reservation_uid,r.business_id,r.branch_id,r.numbering_mode==='SHIFT'?r.server_shift_id:null,r.numbering_mode==='SHIFT'?r.shift_open_tx_id:null,r.device_fingerprint,r.start_bon,r.end_bon,r.status,r.issued_at,nowIso(),r.numbering_mode,r.numbering_mode==='BRANCH'?r.business_date:null]);
    await exec('COMMIT');return {ok:true,duplicate:false,reservation:r};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function importBonReservation(input){await ready();return serializeWrite(()=>importBonReservationUnsafe(clone(input||{})))}
async function nextReservedBon(input){
  await ready();
  const businessId=text(input?.business_id),branchId=number(input?.branch_id),mode=(text(input?.numbering_mode)||'SHIFT').toUpperCase(),businessDate=text(input?.business_date),shiftId=number(input?.server_shift_id),shiftTx=text(input?.shift_open_tx_id),fingerprint=text(input?.device_fingerprint);
  const shiftInvalid=mode==='SHIFT'&&(shiftId<1||!shiftTx);
  const branchDayInvalid=mode==='BRANCH'&&!/^\d{4}-\d{2}-\d{2}$/.test(businessDate);
  if(!businessId||branchId<1||!['SHIFT','BRANCH'].includes(mode)||shiftInvalid||branchDayInvalid||!fingerprint){const e=new Error('Bon reservation lookup identity incomplete');e.code='OFFLINE_V2_BON_LOOKUP_INVALID';throw e}
  const reservations=mode==='SHIFT'
    ?await all("SELECT * FROM offline_v2_bon_reservations WHERE business_id=? AND branch_id=? AND numbering_mode='SHIFT' AND server_shift_id=? AND shift_open_tx_id=? AND device_fingerprint=? AND status='active' ORDER BY start_bon ASC",[businessId,branchId,shiftId,shiftTx,fingerprint])
    :await all("SELECT * FROM offline_v2_bon_reservations WHERE business_id=? AND branch_id=? AND numbering_mode='BRANCH' AND business_date=? AND device_fingerprint=? AND status='active' ORDER BY start_bon ASC",[businessId,branchId,businessDate,fingerprint]);
  for(const r of reservations){
    const used=await all('SELECT bon_number FROM offline_v2_bon_consumptions WHERE reservation_uid=? ORDER BY bon_number ASC',[r.reservation_uid]);
    const taken=new Set(used.map(x=>number(x.bon_number)));
    for(let bon=number(r.start_bon);bon<=number(r.end_bon);bon++)if(!taken.has(bon))return {reservation_uid:text(r.reservation_uid),bon_number:bon,business_id:businessId,branch_id:branchId,numbering_mode:mode,business_date:mode==='BRANCH'?businessDate:null,server_shift_id:mode==='SHIFT'?shiftId:null,shift_open_tx_id:mode==='SHIFT'?shiftTx:null,device_fingerprint:fingerprint,start_bon:number(r.start_bon),end_bon:number(r.end_bon),issued_at:r.issued_at};
  }
  return null;
}

async function assignBonReservationForSaleUnsafe(input){
  if(text(input?.operation_type)!=='sale')return null;
  const order=input?.payload?.rpc_payload?.p_order;
  if(!order||order.bon_reservation)return order?.bon_reservation||null;
  const mode=(text(order.bon_numbering_mode)||'SHIFT').toUpperCase();
  const businessId=text(input.business_id),branchId=number(input.branch_id),fingerprint=text(order.device_fingerprint||input.device_fingerprint);
  const shiftId=number(order.shift_id),shiftTx=text(order.shift_open_tx_id),businessDate=text(order.bon_business_date);
  if(!businessId||branchId<1||!['SHIFT','BRANCH'].includes(mode)||!fingerprint)return null;
  if(mode==='SHIFT'&&(shiftId<1||!shiftTx))return null;
  if(mode==='BRANCH'&&!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))return null;
  const reservations=mode==='SHIFT'
    ?await all("SELECT * FROM offline_v2_bon_reservations WHERE business_id=? AND branch_id=? AND numbering_mode='SHIFT' AND server_shift_id=? AND shift_open_tx_id=? AND device_fingerprint=? AND status='active' ORDER BY start_bon ASC",[businessId,branchId,shiftId,shiftTx,fingerprint])
    :await all("SELECT * FROM offline_v2_bon_reservations WHERE business_id=? AND branch_id=? AND numbering_mode='BRANCH' AND business_date=? AND device_fingerprint=? AND status='active' ORDER BY start_bon ASC",[businessId,branchId,businessDate,fingerprint]);
  for(const r of reservations){
    const used=await all('SELECT bon_number FROM offline_v2_bon_consumptions WHERE reservation_uid=? ORDER BY bon_number ASC',[r.reservation_uid]);
    const taken=new Set(used.map(x=>number(x.bon_number)));
    for(let bon=number(r.start_bon);bon<=number(r.end_bon);bon++)if(!taken.has(bon)){
      const evidence={reservation_uid:text(r.reservation_uid),bon_number:bon,business_id:businessId,branch_id:branchId,numbering_mode:mode,business_date:mode==='BRANCH'?businessDate:null,server_shift_id:mode==='SHIFT'?shiftId:null,shift_open_tx_id:mode==='SHIFT'?shiftTx:null,device_fingerprint:fingerprint,start_bon:number(r.start_bon),end_bon:number(r.end_bon),issued_at:r.issued_at};
      order.bon_reservation=evidence;
      return evidence;
    }
  }
  return null;
}

async function closeBonReservationsForShiftUnsafe(input){
  if(text(input?.operation_type)!=='shift_close')return 0;
  const p=input?.payload?.rpc_payload||{},businessId=text(input?.business_id),branchId=number(input?.branch_id),shiftId=number(p?.p_shift_id);
  if(!businessId||branchId<1||shiftId<1)return 0;
  const r=await run("UPDATE offline_v2_bon_reservations SET status='closed' WHERE business_id=? AND branch_id=? AND numbering_mode='SHIFT' AND server_shift_id=? AND status='active'",[businessId,branchId,shiftId]);
  return number(r?.changes);
}

async function commitOperationUnsafe(input){
  validateCommit(input);
  const tx=text(input.client_tx_id);
  let payloadHash=null;
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const existing=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    if(existing){
      const replayHash=digest({payload:input.payload??null,records:input.records||[],identity:{device_id:input.device_id,business_id:input.business_id,branch_id:input.branch_id,employee_id:input.employee_id},operation_type:input.operation_type,entity_type:input.entity_type,local_entity_id:input.local_entity_id??null,local_shift_id:input.local_shift_id??null,depends_on_tx_id:input.depends_on_tx_id??null});
      const persisted=hydrate(existing).envelope;
      const persistedBon=persisted?.payload?.rpc_payload?.p_order?.bon_reservation;
      const replayWithoutBon=persistedBon&&input?.payload?.rpc_payload?.p_order&&!input.payload.rpc_payload.p_order.bon_reservation;
      const persistedPayload=replayWithoutBon?clone(input):null;
      if(persistedPayload){
        persistedPayload.payload.rpc_payload.p_order.bon_reservation=clone(persistedBon);
        const persistedOrder=(persisted.records||[]).find(r=>text(r?.record_type)==='order'&&r?.payload&&typeof r.payload==='object');
        const replayOrder=(persistedPayload.records||[]).find(r=>text(r?.record_type)==='order'&&r?.payload&&typeof r.payload==='object');
        if(!persistedOrder||!replayOrder){const e=new Error('Reserved Bon replay requires matching durable order record');e.code='OFFLINE_V2_BON_REPLAY_RECORD_REQUIRED';throw e}
        replayOrder.payload.bon_numbering_mode=persistedOrder.payload.bon_numbering_mode;
        replayOrder.payload.bon_business_date=persistedOrder.payload.bon_business_date;
        replayOrder.payload.bon_reservation=clone(persistedOrder.payload.bon_reservation);
        replayOrder.payload.bon_number=persistedOrder.payload.bon_number;
        replayOrder.payload._official_number_pending=persistedOrder.payload._official_number_pending;
      }
      const comparableHash=persistedPayload?digest({payload:persistedPayload.payload??null,records:persistedPayload.records||[],identity:{device_id:persistedPayload.device_id,business_id:persistedPayload.business_id,branch_id:persistedPayload.branch_id,employee_id:persistedPayload.employee_id},operation_type:persistedPayload.operation_type,entity_type:persistedPayload.entity_type,local_entity_id:persistedPayload.local_entity_id??null,local_shift_id:persistedPayload.local_shift_id??null,depends_on_tx_id:persistedPayload.depends_on_tx_id??null}):replayHash;
      if(existing.payload_digest!==comparableHash){const e=new Error('Same client_tx_id was reused with different payload');e.code='OFFLINE_V2_TX_PAYLOAD_MISMATCH';throw e}
      await exec('COMMIT');
      return {ok:true,duplicate:true,durable:true,event:hydrate(existing).envelope};
    }
    // Exact replay above does not reread parents. New scoped children require a same-owner durable parent.
    const scopedType=text(input.operation_type),p=input.payload?.rpc_payload||{},dependency=text(input.depends_on_tx_id);
    if(['driver_save','zone_save','order_status','expense_update'].includes(scopedType)){
      const bindings={driver_save:'offline_delivery_driver_save_v1',zone_save:'offline_delivery_zone_save_v1',order_status:'order_status_apply_offline_v2',expense_update:'offline_expense_update_v1'};
      const field=scopedType==='driver_save'?'p_driver_id':scopedType==='zone_save'?'p_zone_id':scopedType==='order_status'?'p_order_id':'p_expense_id';
      const parentField=scopedType==='driver_save'?'p_driver_save_tx':scopedType==='zone_save'?'p_zone_save_tx':scopedType==='expense_update'?'p_expense_parent_tx':null;
      if(input.payload.rpc_name!==bindings[scopedType]||text(p.p_client_tx_id)!==tx
       ||(['driver_save','zone_save'].includes(scopedType)&&number(p.p_branch_id)!==number(input.branch_id))
       ||(parentField&&text(p[parentField])!==dependency)
       ||(text(p[field]).startsWith('offline-')&&!dependency)){
        const error=new Error('Offline V2 scoped route/branch/dependency mismatch');error.code='OFFLINE_V2_SCOPED_PARENT_INVALID';throw error;
      }
    }
    if(['driver_save','zone_save','order_status','expense_update'].includes(scopedType)&&dependency){
      const parent=await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[dependency]);
      const expected=scopedType==='order_status'?'sale':scopedType==='expense_update'?['expense','expense_update']:scopedType;
      const field=scopedType==='driver_save'?'p_driver_id':scopedType==='zone_save'?'p_zone_id':scopedType==='order_status'?'p_order_id':'p_expense_id';
      const prefix=scopedType==='driver_save'?'offline-driver-':scopedType==='zone_save'?'offline-zone-':scopedType==='order_status'?'offline-':'offline-exp-';
      const alias=text(p[field]);
      if(!parent||!(Array.isArray(expected)?expected.includes(parent.operation_type):parent.operation_type===expected)
       ||parent.device_id!==text(input.device_id)||parent.business_id!==text(input.business_id)||number(parent.branch_id)!==number(input.branch_id)
       ||number(parent.employee_id)!==number(input.employee_id)||['conflict','dead_letter'].includes(parent.status)
       ||(scopedType!=='expense_update'&&alias!==prefix+dependency)){
        const error=new Error('Offline V2 scoped parent identity/type/dependency mismatch');error.code='OFFLINE_V2_SCOPED_PARENT_INVALID';throw error;
      }
      if(scopedType==='expense_update'){
        let ancestor=parent,root=null;const seen=new Set();
        while(ancestor&&!seen.has(ancestor.client_tx_id)){
          seen.add(ancestor.client_tx_id);
          if(!['expense','expense_update'].includes(ancestor.operation_type)||ancestor.device_id!==text(input.device_id)
           ||ancestor.business_id!==text(input.business_id)||number(ancestor.branch_id)!==number(input.branch_id)
           ||number(ancestor.employee_id)!==number(input.employee_id))break;
          const envelope=hydrate(ancestor).envelope,rpc=envelope.payload?.rpc_payload||{};
          if(ancestor.operation_type==='expense'){root='offline-exp-'+ancestor.client_tx_id;break}
          if(!text(ancestor.depends_on_tx_id)){root=text(rpc.p_expense_id);break}
          ancestor=await get('SELECT * FROM offline_v2_outbox WHERE client_tx_id=?',[ancestor.depends_on_tx_id]);
        }
        const canonical=text(hydrate(parent).server_ack?.server_entity_id);
        if(!root||(alias!==root&&(!canonical||alias!==canonical))){
          const error=new Error('Offline V2 expense parent belongs to another entity');error.code='OFFLINE_V2_SCOPED_PARENT_INVALID';throw error;
        }
      }
    }
    // Bon selection, consumption and the operational outbox event share one serialized SQLite transaction.
    // No previewed number is trusted here; capacity exhaustion leaves the sale unreserved (OFF-*).
    const assignedBon=await assignBonReservationForSaleUnsafe(input);
    // recordsFor() is built before this Native transaction. Mirror the exact
    // assigned Bon into the durable local order record before hashing/writing.
    if(assignedBon){
      const orderRecord=(input.records||[]).find(r=>text(r?.record_type)==='order'&&r?.payload&&typeof r.payload==='object');
      if(!orderRecord){const e=new Error('Native Bon assignment requires a durable local order record');e.code='OFFLINE_V2_BON_ORDER_RECORD_REQUIRED';throw e}
      orderRecord.payload.bon_numbering_mode=text(input?.payload?.rpc_payload?.p_order?.bon_numbering_mode)||text(assignedBon.numbering_mode)||'SHIFT';
      orderRecord.payload.bon_business_date=text(assignedBon.business_date)||null;
      orderRecord.payload.bon_reservation=clone(assignedBon);
      orderRecord.payload.bon_number=number(assignedBon.bon_number);
      orderRecord.payload._official_number_pending=false;
    }
    payloadHash=digest({payload:input.payload??null,records:input.records||[],identity:{device_id:input.device_id,business_id:input.business_id,branch_id:input.branch_id,employee_id:input.employee_id},operation_type:input.operation_type,entity_type:input.entity_type,local_entity_id:input.local_entity_id??null,local_shift_id:input.local_shift_id??null,depends_on_tx_id:input.depends_on_tx_id??null});
    await consumeBonReservationUnsafe(input,tx);
    await closeBonReservationsForShiftUnsafe(input);
    const sequence=await allocateSequence(text(input.device_id));
    const envelope=envelopeFrom(input,sequence);const created=envelope.created_local_at;
    for(const r of (input.records||[])){
      await run(`INSERT INTO offline_v2_records(record_type,local_id,client_tx_id,parent_local_id,payload_json,created_local_at) VALUES(?,?,?,?,?,?)`,[
        text(r.record_type),text(r.local_id),tx,text(r.parent_local_id)||null,JSON.stringify(r.payload??null),text(r.created_local_at)||created
      ]);
    }
    if(envelope.local_entity_id){
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,NULL,?,NULL,NULL,?) ON CONFLICT(entity_type,local_id) DO NOTHING`,[envelope.entity_type,envelope.local_entity_id,tx,nowIso()]);
    }
    const now=nowIso();
    await run(`INSERT INTO offline_v2_outbox(client_tx_id,device_id,device_sequence,business_id,branch_id,employee_id,operation_type,entity_type,local_entity_id,local_shift_id,depends_on_tx_id,created_local_at,protocol_version,schema_version,status,attempts,envelope_json,payload_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,[
      tx,envelope.device_id,sequence,envelope.business_id,envelope.branch_id,envelope.employee_id,envelope.operation_type,envelope.entity_type,envelope.local_entity_id,envelope.local_shift_id,envelope.depends_on_tx_id,envelope.created_local_at,PROTOCOL_VERSION,SCHEMA_VERSION,'pending',JSON.stringify(envelope),payloadHash,now,now
    ]);
    await exec('COMMIT');
    return {ok:true,duplicate:false,durable:true,event:envelope};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function commitOperation(input){await ready();return serializeWrite(()=>commitOperationUnsafe(clone(input||{})))}

async function importShadowUnsafe(snapshot){
  const events=Array.isArray(snapshot?.outbox)?snapshot.outbox:[];
  const mappings=Array.isArray(snapshot?.mappings)?snapshot.mappings:[];
  const inbox=Array.isArray(snapshot?.inbox)?snapshot.inbox:[];
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    let imported=0,duplicates=0;
    for(const event of events){
      const tx=text(event?.client_tx_id);if(!tx)throw new Error('Shadow import event missing client_tx_id');
      const old=await get(`SELECT payload_digest FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
      if(old){duplicates++;continue}
      const seq=number(event.device_sequence);if(seq<1)throw new Error(`Shadow import invalid sequence: ${tx}`);
      const status=VALID_STATUS.has(event.status)?event.status:'pending';
      const env={...clone(event),protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,status};
      const pHash=digest(event.legacy_payload??event.payload??env);
      const now=nowIso();
      await run(`INSERT INTO offline_v2_device_sequences(device_id,last_sequence,updated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET last_sequence=MAX(last_sequence,excluded.last_sequence),updated_at=excluded.updated_at`,[text(event.device_id),seq,now]);
      await run(`INSERT INTO offline_v2_outbox(client_tx_id,device_id,device_sequence,business_id,branch_id,employee_id,operation_type,entity_type,local_entity_id,local_shift_id,depends_on_tx_id,created_local_at,protocol_version,schema_version,status,attempts,last_attempt_at,next_retry_at,last_error_code,last_error_message,synced_at,server_ack_json,envelope_json,payload_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        tx,text(event.device_id),seq,text(event.business_id),number(event.branch_id),number(event.employee_id),text(event.operation_type),text(event.entity_type),text(event.local_entity_id)||null,text(event.local_shift_id)||null,text(event.depends_on_tx_id)||null,text(event.created_local_at)||now,PROTOCOL_VERSION,SCHEMA_VERSION,status,number(event.attempts),event.last_attempt_at||null,event.next_retry_at||null,event.last_error_code||null,event.last_error_message||null,event.synced_at||null,event.server_ack?JSON.stringify(event.server_ack):null,JSON.stringify(env),pHash,now,now
      ]);imported++;
    }
    for(const m of mappings){
      if(!text(m?.entity_type)||!text(m?.local_id)||!text(m?.client_tx_id))continue;
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,local_id) DO UPDATE SET server_id=COALESCE(excluded.server_id,server_id),server_version=COALESCE(excluded.server_version,server_version),mapped_at=COALESCE(excluded.mapped_at,mapped_at),updated_at=excluded.updated_at`,[text(m.entity_type),text(m.local_id),m.server_id==null?null:text(m.server_id),text(m.client_tx_id),m.server_version==null?null:text(m.server_version),m.mapped_at||null,nowIso()]);
    }
    for(const i of inbox){
      if(!text(i?.server_event_id))continue;
      await run(`INSERT OR IGNORE INTO offline_v2_inbox(server_event_id,status,payload_json,protocol_version,schema_version,received_at,applied_at,last_error) VALUES(?,?,?,?,?,?,?,?)`,[text(i.server_event_id),text(i.status)||'received',JSON.stringify(i.payload??i),PROTOCOL_VERSION,SCHEMA_VERSION,text(i.received_at)||nowIso(),i.applied_at||null,i.last_error||null]);
    }
    await exec('COMMIT');
    return {ok:true,imported,duplicates,legacy_source_untouched:true};
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function importShadow(snapshot){await ready();return serializeWrite(()=>importShadowUnsafe(clone(snapshot||{})))}

async function listOutbox(status=null){
  await ready();
  const rows=status?await all(`SELECT * FROM offline_v2_outbox WHERE status=? ORDER BY device_id,device_sequence`,[String(status)]):await all(`SELECT * FROM offline_v2_outbox ORDER BY device_id,device_sequence`);
  return rows.map(hydrate);
}
async function getOutbox(clientTx){await ready();return hydrate(await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[text(clientTx)]))}
async function getRecord(recordType,localId){await ready();const r=await get(`SELECT * FROM offline_v2_records WHERE record_type=? AND local_id=?`,[text(recordType),text(localId)]);return r?{...r,payload:parseJson(r.payload_json)}:null}
async function getMappingByTx(clientTx){
  await ready();
  const r=await get(`SELECT entity_type,local_id,server_id,client_tx_id,server_version,mapped_at FROM offline_v2_mappings WHERE client_tx_id=? AND server_id IS NOT NULL ORDER BY mapped_at LIMIT 1`,[text(clientTx)]);
  return r?clone(r):null;
}

async function claimNextDueUnsafe(now){
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get(`SELECT o.* FROM offline_v2_outbox o
      WHERE o.status IN ('pending','retryable')
        AND (o.next_retry_at IS NULL OR o.next_retry_at<=?)
        AND (o.depends_on_tx_id IS NULL OR EXISTS(
          SELECT 1 FROM offline_v2_outbox p WHERE p.client_tx_id=o.depends_on_tx_id AND p.status='synced'
        ))
      ORDER BY o.device_id,o.device_sequence LIMIT 1`,[now]);
    if(!row){await exec('COMMIT');return null}
    const changed=await run(`UPDATE offline_v2_outbox SET status='syncing',attempts=attempts+1,last_attempt_at=?,next_retry_at=NULL,updated_at=? WHERE client_tx_id=? AND status IN ('pending','retryable')`,[now,now,row.client_tx_id]);
    if(changed.changes!==1){await exec('ROLLBACK');return null}
    const claimed=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[row.client_tx_id]);
    await exec('COMMIT');
    return hydrate(claimed);
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function claimNextDue(now=nowIso()){await ready();return serializeWrite(()=>claimNextDueUnsafe(text(now)||nowIso()))}

async function recoverStaleSyncingUnsafe(cutoff,now){
  const r=await run(`UPDATE offline_v2_outbox SET status='retryable',next_retry_at=?,last_error_code='OFFLINE_V2_STALE_IN_FLIGHT',last_error_message='Recovered stale in-flight operation after restart',updated_at=? WHERE status='syncing' AND (last_attempt_at IS NULL OR last_attempt_at<=?)`,[now,now,cutoff]);
  return {ok:true,recovered:r.changes};
}
async function recoverStaleSyncing(cutoff,now=nowIso()){await ready();return serializeWrite(()=>recoverStaleSyncingUnsafe(text(cutoff),text(now)||nowIso()))}

async function markRetryableUnsafe(clientTx,error,nextRetryAt){
  const now=nowIso();
  const r=await run(`UPDATE offline_v2_outbox SET status='retryable',next_retry_at=?,last_error_code=?,last_error_message=?,updated_at=? WHERE client_tx_id=? AND status='syncing'`,[text(nextRetryAt)||now,text(error?.code)||'OFFLINE_V2_RETRYABLE',text(error?.message)||'Retryable sync error',now,text(clientTx)]);
  if(r.changes!==1)throw new Error(`Offline V2 retry transition rejected: ${text(clientTx)}`);
  return getOutbox(clientTx);
}
async function markRetryable(clientTx,error,nextRetryAt){await ready();return serializeWrite(()=>markRetryableUnsafe(clientTx,error,nextRetryAt))}

async function markConflictUnsafe(clientTx,error){
  const now=nowIso();
  const r=await run(`UPDATE offline_v2_outbox SET status='conflict',next_retry_at=NULL,last_error_code=?,last_error_message=?,updated_at=? WHERE client_tx_id=? AND status='syncing'`,[text(error?.code)||'BUSINESS_CONFLICT',text(error?.message)||'Business conflict requires attention',now,text(clientTx)]);
  if(r.changes!==1)throw new Error(`Offline V2 conflict transition rejected: ${text(clientTx)}`);
  return getOutbox(clientTx);
}
async function markConflict(clientTx,error){await ready();return serializeWrite(()=>markConflictUnsafe(clientTx,error))}

function validateAckForStore(row,ack){
  if(!ack||ack.ok!==true)throw new Error('Offline V2 explicit ACK required');
  if(text(ack.client_tx_id)!==text(row.client_tx_id))throw new Error('Offline V2 ACK client_tx_id mismatch');
  if(number(ack.protocol_version)!==PROTOCOL_VERSION)throw new Error('Offline V2 ACK protocol mismatch');
  if(!(ack.acknowledged===true||ack.duplicate===true||ack.idempotent_replay===true))throw new Error('Offline V2 ACK not explicit');
  if(!text(ack.server_event_id))throw new Error('Offline V2 ACK server_event_id missing');
  if(text(ack.payload_digest)!==text(row.payload_digest))throw new Error('Offline V2 ACK payload digest mismatch');
  if(text(row.local_entity_id)&&!(ack.server_entity_id!==undefined&&ack.server_entity_id!==null&&text(ack.server_entity_id)))throw new Error('Offline V2 ACK server entity mapping missing');
}
async function markAckedUnsafe(clientTx,ack){
  const tx=text(clientTx);const now=nowIso();
  await exec('BEGIN IMMEDIATE TRANSACTION');
  try{
    const row=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    if(!row)throw new Error(`Offline V2 event not found: ${tx}`);
    if(row.status==='synced'){
      const existing=parseJson(row.server_ack_json,{});
      if(text(existing?.client_tx_id)!==tx)throw new Error('Offline V2 persisted ACK mismatch');
      await exec('COMMIT');return hydrate(row);
    }
    if(row.status!=='syncing')throw new Error(`Offline V2 ACK transition rejected from ${row.status}`);
    validateAckForStore(row,ack);
    await run(`INSERT OR IGNORE INTO offline_v2_inbox(server_event_id,status,payload_json,protocol_version,schema_version,received_at,applied_at,last_error) VALUES(?,?,?,?,?,?,?,NULL)`,[text(ack.server_event_id),'acknowledged',JSON.stringify(ack),PROTOCOL_VERSION,SCHEMA_VERSION,now,now]);
    if(text(row.local_entity_id)){
      await run(`INSERT INTO offline_v2_mappings(entity_type,local_id,server_id,client_tx_id,server_version,mapped_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entity_type,local_id) DO UPDATE SET server_id=excluded.server_id,client_tx_id=excluded.client_tx_id,server_version=excluded.server_version,mapped_at=excluded.mapped_at,updated_at=excluded.updated_at`,[
        row.entity_type,row.local_entity_id,text(ack.server_entity_id),tx,ack.server_version==null?null:text(ack.server_version),now,now
      ]);
    }
    await run(`UPDATE offline_v2_outbox SET status='synced',synced_at=?,server_ack_json=?,next_retry_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=? WHERE client_tx_id=?`,[now,JSON.stringify(ack),now,tx]);
    const updated=await get(`SELECT * FROM offline_v2_outbox WHERE client_tx_id=?`,[tx]);
    await exec('COMMIT');return hydrate(updated);
  }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
}
async function markAcked(clientTx,ack){await ready();return serializeWrite(()=>markAckedUnsafe(clientTx,clone(ack)))}

async function syncStats(){
  await ready();
  const rows=await all(`SELECT status,COUNT(*) count FROM offline_v2_outbox GROUP BY status`);
  const counts={};for(const r of rows)counts[r.status]=number(r.count);
  const inbox=await get(`SELECT COUNT(*) count FROM offline_v2_inbox`);
  const mappings=await get(`SELECT COUNT(*) count FROM offline_v2_mappings WHERE server_id IS NOT NULL`);
  return {ok:true,shadow_mode:true,counts,inbox_count:number(inbox?.count),mapped_count:number(mappings?.count)};
}
async function resetTestQueue(input={}){
  await ready();
  return serializeWrite(async()=>{
    const supportCode=text(input?.support_code),branchName=text(input?.branch_name).toUpperCase();
    if(supportCode!=='SH-0007'||branchName!=='TEST')throw new Error('Offline V2 test reset is restricted to SH-0007 / TEST');
    await exec('BEGIN IMMEDIATE TRANSACTION');
    try{
      const rows=await get(`SELECT COUNT(*) c FROM offline_v2_outbox WHERE status<>'synced'`);
      const txs=await all(`SELECT client_tx_id FROM offline_v2_outbox WHERE status<>'synced'`);
      for(const r of txs)await run(`DELETE FROM offline_v2_records WHERE client_tx_id=?`,[r.client_tx_id]);
      await run(`DELETE FROM offline_v2_outbox WHERE status<>'synced'`);
      await exec('COMMIT');
      return {ok:true,cleared:number(rows?.c),scope:'SH-0007/TEST'};
    }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
  });
}

const RESET_GROUP_OPERATIONS=Object.freeze({
  orders:['sale','return','order_status','delivery_assign_driver'],
  shifts:['shift_open','shift_close'],
  expenses:['expense'],
  customers:['customer_create','customer_update','customer_address_save','customer_address_delete'],
  delivery:[]
});
async function resetTestGroups(input={}){
  await ready();
  return serializeWrite(async()=>{
    const supportCode=text(input?.support_code),branchName=text(input?.branch_name).toUpperCase();
    if(supportCode!=='SH-0007'||branchName!=='TEST')throw new Error('Offline V2 scoped test reset is restricted to SH-0007 / TEST');
    const groups=[...new Set((Array.isArray(input?.groups)?input.groups:[]).map(text).filter(Boolean))];
    const operations=[...new Set(groups.flatMap(g=>RESET_GROUP_OPERATIONS[g]||[]))];
    if(!operations.length)return {ok:true,cleared:0,groups,scope:'SH-0007/TEST',scoped:true};
    const opMarks=operations.map(()=>'?').join(',');
    await exec('BEGIN IMMEDIATE TRANSACTION');
    try{
      // Selected TEST reset removes every matching Offline V2 operation.
      // Historical acceptance sequences are not runtime-protected reset state.
      const txRows=await all(
        `SELECT client_tx_id FROM offline_v2_outbox WHERE operation_type IN (${opMarks})`,
        operations
      );
      const txs=txRows.map(r=>text(r.client_tx_id)).filter(Boolean);
      if(txs.length){
        const marks=txs.map(()=>'?').join(',');
        await run(`DELETE FROM offline_v2_records WHERE client_tx_id IN (${marks})`,txs);
        await run(`DELETE FROM offline_v2_mappings WHERE client_tx_id IN (${marks})`,txs);
        await run(`DELETE FROM offline_v2_outbox WHERE client_tx_id IN (${marks})`,txs);
      }
      await exec('COMMIT');
      const remainingRow=await get(`SELECT COUNT(*) c FROM offline_v2_outbox WHERE operation_type IN (${opMarks})`,operations);
      const remaining=number(remainingRow?.c);
      if(remaining!==0)throw new Error(`Offline V2 scoped reset verification failed: ${remaining} selected operations remain`);
      return {ok:true,cleared:txs.length,remaining,verified:true,groups,operations,scope:'SH-0007/TEST',scoped:true,device_sequence_reset:false};
    }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
  });
}

async function resetTestAll(input={}){
  await ready();
  return serializeWrite(async()=>{
    const supportCode=text(input?.support_code),branchName=text(input?.branch_name).toUpperCase();
    if(supportCode!=='SH-0007'||branchName!=='TEST')throw new Error('Offline V2 full test reset is restricted to SH-0007 / TEST');
    await exec('BEGIN IMMEDIATE TRANSACTION');
    try{
      const counts={};
      for(const table of ['offline_v2_outbox','offline_v2_records','offline_v2_mappings','offline_v2_inbox']){
        const row=await get(`SELECT COUNT(*) c FROM ${table}`);counts[table]=number(row?.c);
      }
      await run('DELETE FROM offline_v2_inbox');
      await run('DELETE FROM offline_v2_mappings');
      await run('DELETE FROM offline_v2_records');
      await run('DELETE FROM offline_v2_outbox');
      await run('DELETE FROM offline_v2_device_sequences');
      await run(`DELETE FROM offline_v2_meta WHERE key<>'store_version'`);
      await exec('COMMIT');
      return {ok:true,cleared:counts,scope:'SH-0007/TEST',device_sequence_reset:true};
    }catch(e){try{await exec('ROLLBACK')}catch{}throw e}
  });
}

async function health(){
  await ready();
  const integrity=await get('PRAGMA integrity_check');
  const journal=await get('PRAGMA journal_mode');
  const synchronous=await get('PRAGMA synchronous');
  const foreignKeys=await get('PRAGMA foreign_keys');
  const outbox=await get(`SELECT COUNT(*) c FROM offline_v2_outbox WHERE status<>'synced'`);
  return {ok:String(Object.values(integrity||{})[0]||'').toLowerCase()==='ok',backend:'native-sqlite3',database:dbPath(),store_version:STORE_VERSION,protocol_version:PROTOCOL_VERSION,schema_version:SCHEMA_VERSION,journal_mode:String(Object.values(journal||{})[0]||''),synchronous:number(Object.values(synchronous||{})[0]),foreign_keys:number(Object.values(foreignKeys||{})[0]),unsynced_count:number(outbox?.c),shadow_mode:true};
}

function installOfflineV2NativeStore(){
  // Shadow APIs only. No live transport is installed in Phase 3, therefore the
  // protected Beta43/Beta44 queue cannot be consumed by this protocol engine.
  ipcMain.handle('offline-v2:commit-operation',(_e,input)=>commitOperation(input));
  ipcMain.handle('offline-v2:import-bon-reservation',(_e,input)=>importBonReservation(input));
  ipcMain.handle('offline-v2:next-reserved-bon',(_e,input)=>nextReservedBon(input));
  ipcMain.handle('offline-v2:import-shadow',(_e,snapshot)=>importShadow(snapshot));
  ipcMain.handle('offline-v2:outbox',(_e,status=null)=>listOutbox(status));
  ipcMain.handle('offline-v2:record',(_e,type,id)=>getRecord(type,id));
  ipcMain.handle('offline-v2:health',()=>health());
  ipcMain.handle('offline-v2:sync-stats',()=>syncStats());
  ipcMain.handle('offline-v2:reset-test-queue',(_e,input={})=>resetTestQueue(input));
  ipcMain.handle('offline-v2:reset-test-groups',(_e,input={})=>resetTestGroups(input));
  ipcMain.handle('offline-v2:reset-test-all',(_e,input={})=>resetTestAll(input));
  ready().catch(e=>console.error('Offline V2 native store init failed',e));
  return {ready,commitOperation,importBonReservation,nextReservedBon,importShadow,listOutbox,getOutbox,getRecord,getMappingByTx,claimNextDue,recoverStaleSyncing,markRetryable,markConflict,markAcked,syncStats,health,resetTestQueue,resetTestGroups,resetTestAll};
}

module.exports={installOfflineV2NativeStore,PROTOCOL_VERSION,SCHEMA_VERSION,STORE_VERSION};
