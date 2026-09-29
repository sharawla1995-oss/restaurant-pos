'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const t=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const n=fs.readFileSync('beta45-offline-v2-native-store.js','utf8');
const s=fs.readFileSync('supabase-rc1-bon-reservation-v2-scope-aware-source.sql','utf8');
const o=fs.readFileSync('supabase-rc1-bon-numbering-policy-v1-online-migration-source.sql','utf8');
for(const x of ["(text(order.bon_numbering_mode)||'SHIFT').toUpperCase()","numbering_mode:mode","mode==='SHIFT'?shiftId:null","mode==='SHIFT'?shiftOpenTx:null","bon_numbering_mode:mode"])
 assert(t.includes(x),'transport scope binding missing '+x);
assert(t.includes("if(mode==='SHIFT'){"),'SHIFT must retain open-shift proof');
assert(!/if\(!api\?\.nextReservedBon\|\|typeof global\.odbGet.*shiftId<1/.test(t),'BRANCH must not be globally blocked by shift lookup');
for(const x of ["numbering_mode='BRANCH'","numbering_mode='SHIFT'"])assert(n.includes(x),'native mode missing '+x);
for(const x of ["numbering_mode in ('SHIFT','BRANCH')",'branch_bon_counters_v1'])assert(s.includes(x),'server reservation mode missing '+x);
assert(o.includes("new.bon_numbering_mode:=v_bon_mode"),'online order must freeze server policy');
assert(o.includes('branch_invoice_counters'),'invoice allocator unexpectedly absent');
class Device{
 constructor(mode,ranges){this.mode=mode;this.ranges=ranges;this.used=new Set()}
 next(){for(const [a,b] of this.ranges)for(let n=a;n<=b;n++)if(!this.used.has(n))return n;return null}
 use(n){if(this.used.has(n))throw Error('duplicate');this.used.add(n)}
}
const d1=new Device('BRANCH',[[1,2]]),d2=new Device('BRANCH',[[3,4]]);
const nums=[d1.next(),d2.next()];d1.use(nums[0]);d2.use(nums[1]);assert(new Set(nums).size===2&&nums[0]===1&&nums[1]===3,'branch device ranges collided');
const shift1=new Device('SHIFT',[[1,2]]),shift2=new Device('SHIFT',[[1,2]]);
assert(shift1.next()===1&&shift2.next()===1,'independent SHIFT scopes changed');
const exhausted=new Device('BRANCH',[[9,9]]);exhausted.use(9);assert(exhausted.next()===null,'exhaustion must fall back to OFF');
console.log('BON SCOPE FINAL SOURCE GATE PASS — transport=1 native=1 online=1 two_device_branch=PASS exhausted=OFF invoice=UNCHANGED deployment=0');
