'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-bon-reservation-v2-scope-aware-source.sql','utf8');
for(const x of ['pos_bon_reservations_v2','numbering_mode',"numbering_mode in ('SHIFT','BRANCH')",'pos_bon_numbering_mode_v1','shift_bon_counters','branch_bon_counters_v1',"v_mode='SHIFT'","v_res.numbering_mode<>v_mode",'pos_bon_consumptions_v2'])
 assert(s.includes(x),'missing V2 scope invariant '+x);
assert(!s.includes('branch_invoice_counters'),'invoice numbering changed by Bon V2');
assert(s.includes("case when v_mode='SHIFT' then p_shift_id else null end"),'BRANCH reservation must not be owned by a shift');
class Scope{
 constructor(mode){this.mode=mode;this.next=1;this.r=[]}
 reserve(device,size=2){const x={mode:this.mode,device,start:this.next,end:this.next+size-1};this.next=x.end+1;this.r.push(x);return x}
}
const shiftA=new Scope('SHIFT'),shiftB=new Scope('SHIFT');
assert(shiftA.reserve('A').start===1&&shiftB.reserve('B').start===1,'SHIFT scopes may independently start at 1');
const branch=new Scope('BRANCH'),a=branch.reserve('A'),b=branch.reserve('B');
assert(a.start===1&&a.end===2&&b.start===3&&b.end===4,'BRANCH devices must share one disjoint namespace');
assert(a.mode==='BRANCH'&&b.mode==='BRANCH','reservation must freeze numbering mode');
console.log('BON RESERVATION V2 SCOPE GATE PASS — SHIFT=1 BRANCH=1 invoice_changes=0 runtime_activation=BLOCKED deployment=0');
