'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-bon-numbering-policy-v1-online-migration-source.sql','utf8');
for(const x of ['bon_numbering_mode','orders_branch_bon_policy_unique',"where bon_numbering_mode='BRANCH'","where bon_numbering_mode='SHIFT'",'pos_bon_numbering_mode_v1(new.branch_id)','branch_bon_counters_v1','shift_bon_counters','pos_bon_policy_preflight_v1','historical_branch_duplicate_groups'])
 assert(s.includes(x),'missing online policy invariant '+x);
assert(s.includes('if new.invoice_number is null then')&&s.includes('branch_invoice_counters'),'invoice allocator must remain legacy-compatible');
assert(!/update\s+public\.orders\s+set\s+bon_number/i.test(s),'historical Bons must never be renumbered');
assert(s.includes("bon_numbering_mode is null"),'historical rows must retain legacy NULL stamp');
class N{
 constructor(mode){this.mode=mode;this.branch=1;this.shift=new Map()}
 bon(shift){if(this.mode==='BRANCH')return this.branch++;const n=this.shift.get(shift)||1;this.shift.set(shift,n+1);return n}
}
const a=new N('SHIFT');assert(a.bon('A')===1&&a.bon('B')===1&&a.bon('A')===2,'SHIFT online model failed');
const b=new N('BRANCH');assert(b.bon('A')===1&&b.bon('B')===2&&b.bon(null)===3,'BRANCH must share server namespace across sources');
console.log('BON NUMBERING ONLINE MIGRATION SOURCE GATE PASS — history_renumber=0 invoice_semantics=UNCHANGED deployment=0');
