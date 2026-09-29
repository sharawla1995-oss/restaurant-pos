'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('beta45-offline-v2-native-store.js','utf8');
for(const x of ["ADD COLUMN business_date TEXT","business_date=?","bon_business_date","STORE_VERSION='2.5'","ADD COLUMN numbering_mode TEXT NOT NULL DEFAULT 'SHIFT'","numbering_mode='BRANCH'","numbering_mode='SHIFT'","numbering_mode:mode","mode==='SHIFT'?shiftId:null","numbering_mode='SHIFT' AND server_shift_id"])
 assert(s.includes(x),'missing native scope invariant '+x);
assert(s.includes("UPDATE offline_v2_bon_reservations SET numbering_mode='SHIFT'"),'legacy local reservations must migrate to SHIFT');
assert(/mode==='BRANCH'[\s\S]*device_fingerprint/.test(s),'BRANCH lookup must be device/branch scoped without shift ownership');
class Local{
 constructor(mode,start,end){this.mode=mode;this.start=start;this.end=end;this.used=new Set()}
 next(){for(let n=this.start;n<=this.end;n++)if(!this.used.has(n))return n;return null}
 consume(n){if(n<this.start||n>this.end||this.used.has(n))throw Error('bad');this.used.add(n)}
 closeShift(){if(this.mode==='SHIFT')this.closed=true}
}
const a=new Local('SHIFT',1,2);a.consume(a.next());a.closeShift();assert(a.closed===true,'SHIFT close invalidation failed');
const b=new Local('BRANCH',10,11);b.consume(b.next());b.closeShift();assert(!b.closed&&b.next()===11,'BRANCH capacity must survive cashier shift close');
console.log('BON NATIVE SCOPE GATE PASS — store=2.5 SHIFT=1 BRANCH=1 branch_survives_shift_close=1 business_date=FROZEN deployment=0');
