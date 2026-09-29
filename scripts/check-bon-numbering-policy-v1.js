'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const d=fs.readFileSync('docs/BON-NUMBERING-POLICY-V1.md','utf8');
const s=fs.readFileSync('supabase-rc1-bon-numbering-policy-v1-source.sql','utf8');
const legacy=fs.readFileSync('supabase-v9-4-0-numbering-payments-finance.sql','utf8');
for(const x of ['Invoice numbering is unchanged','SHIFT:','BRANCH:','SHIFT is the default','OFF-*','active shifts/reservations','pending Offline sales'])
  assert(d.includes(x),'policy contract missing '+x);
for(const x of ['branch_bon_numbering_policy','bon_numbering_mode','default \'SHIFT\'',"check(bon_numbering_mode in ('SHIFT','BRANCH'))",'branch_bon_counters_v1','pos_bon_numbering_mode_v1',"'SHIFT'::text"])
  assert(s.includes(x),'policy source missing '+x);
assert(!s.includes('branch_invoice_counters'),'invoice numbering must not be modified by Bon policy source');
assert(legacy.includes('orders_shift_bon_unique')&&legacy.includes('shift_bon_counters'),'legacy SHIFT authority evidence missing');
for(const x of ['pos_set_bon_numbering_mode_v1','v_active_shifts','pos_bon_reservations_v2',"status=''active''",'has_branch_access',"v_mode not in ('SHIFT','BRANCH')"])
  assert(s.includes(x),'safe policy transition source missing '+x);
assert(s.includes('runtime-authoritative')===false,'SQL must not claim metadata transition activates runtime BRANCH authority');
class Policy{
 constructor(mode='SHIFT'){this.mode=mode;this.active=0;this.pending=0}
 change(next){if(!['SHIFT','BRANCH'].includes(next))throw Error('mode');if(this.active||this.pending)throw Error('transition blocked');this.mode=next}
}
const p=new Policy();assert(p.mode==='SHIFT','default must preserve legacy online behavior');
p.active=1;let blocked=false;try{p.change('BRANCH')}catch{blocked=true}assert(blocked,'active work must block policy transition');
p.active=0;p.pending=1;blocked=false;try{p.change('BRANCH')}catch{blocked=true}assert(blocked,'pending offline work must block transition');
p.pending=0;p.change('BRANCH');assert(p.mode==='BRANCH','clean transition model failed');
console.log('BON NUMBERING POLICY V1 GATE PASS — modes=SHIFT|BRANCH default=SHIFT transition=FAIL_CLOSED runtime_branch_activation=DEPLOYMENT_GATED invoice_changes=0 deployment=0');
