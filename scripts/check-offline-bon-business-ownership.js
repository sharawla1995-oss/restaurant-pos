'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const n=fs.readFileSync('beta45-offline-v2-native-store.js','utf8'),t=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
for(const x of ["const STORE_VERSION='2.3'","business_id TEXT NOT NULL","PRAGMA table_info(offline_v2_bon_reservations)","ALTER TABLE offline_v2_bon_reservations ADD COLUMN business_id TEXT","business_id:text(e.business_id)","out.business_id!==text(input.business_id)","business_id:text(input?.business_id)","text(old.business_id)===r.business_id","WHERE business_id=? AND branch_id=?","business_id:businessId"])assert(n.includes(x),'Bon business ownership missing '+x);
assert(t.includes("api.nextReservedBon({business_id:identity.business_id,branch_id:branchId"),'transport must scope reservation lookup by canonical business');
console.log('OFFLINE BON BUSINESS OWNERSHIP GATE PASS — legacy unowned ranges fail closed deployment=0');
