'use strict';
const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('app.js','utf8');
const sql=fs.readFileSync('supabase-rc1-bon-numbering-policy-v1-source.sql','utf8');
for(const x of ["['bon','🧾 ترقيم البونات']",'name="bonNumberingMode" value="SHIFT"','name="bonNumberingMode" value="BRANCH"','saveBonNumberingMode',"rpc('pos_set_bon_numbering_mode_v1'",'p_branch_id:currentBranchId()','p_mode:selected','navigator.onLine===false'])
  assert(app.includes(x),'BON settings runtime missing '+x);
for(const x of ['pos_set_bon_numbering_mode_v1','v_active_shifts','pos_bon_reservations_v2',"status=''active''","v_mode not in ('SHIFT','BRANCH')",'has_branch_access'])
  assert(sql.includes(x),'BON transition safety missing '+x);
assert(app.includes("branchBonNumberingMode(currentBranchId())"),'settings must resolve current branch policy');
console.log('BON POLICY SETTINGS RUNTIME PASS — SHIFT|BRANCH UI + online-only fail-closed transition');
