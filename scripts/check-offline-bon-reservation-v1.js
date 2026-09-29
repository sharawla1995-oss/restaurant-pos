'use strict';
const fs=require('fs');
const assert=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const d=read('docs/OFFLINE-BON-RESERVATION-V1.md');
const app=read('app.js');
const transport=read('beta45-offline-v2-transport-runtime.js');
const numbering=read('supabase-v9-4-0-numbering-payments-finance.sql');
for(const x of [
 'device_fingerprint','shift_open_tx_id','server_shift_id','reservation_uid',
 'Two devices MUST receive disjoint intervals','same sale TX','Range exhaustion',
 'Offline-opened shift','OFF-*','ACK returns the same bon',
 'Restart never reuses a consumed bon','Printer failure','fail closed'
])assert(d.includes(x),`Bon Reservation V1 contract missing: ${x}`);
assert(numbering.includes('shift_bon_counters'),'server shift bon counter authority missing');
assert(numbering.includes('orders_shift_bon_unique'),'per-shift bon uniqueness missing');
assert(transport.includes("bon_number:null"),'current Offline sale must remain explicit official-number-pending before implementation');
assert(transport.includes("offline_reference:'OFF-'"),'current safe local OFF reference missing');
assert(transport.includes('_official_number_pending:true'),'current pending official-number marker missing');
assert(app.includes("rpc('pos_next_bon_v1'"),'current server next-bon preview authority missing');
assert(!transport.includes('bon_reservation_uid'),'reservation runtime unexpectedly appeared without implementation gate update');
console.log('OFFLINE BON RESERVATION V1 DESIGN GATE PASS — runtime_implementation=0');
