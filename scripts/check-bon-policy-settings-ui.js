'use strict';
const fs=require('fs'),assert=require('assert');
const app=fs.readFileSync('app.js','utf8');
const sql=fs.readFileSync('supabase-rc1-bon-numbering-policy-v1-source.sql','utf8');
for(const x of ['data-settings-section="bon"','name="bonNumberingMode"','value="SHIFT"','value="BRANCH"','saveBonNumberingMode',"rpc('pos_set_bon_numbering_mode_v1'",'saveOfflineBootstrap()'])
  assert(app.includes(x),'Bon settings UI/runtime missing '+x);
assert(app.includes("if(!navigator.onLine)"),'policy mutation must fail closed Offline');
for(const x of ['pos_set_bon_numbering_mode_v1','v_active_shifts','pos_bon_reservations_v2','has_branch_access'])
  assert(sql.includes(x),'server transition guard missing '+x);
console.log('BON POLICY SETTINGS UI GATE PASS — SHIFT|BRANCH guarded_admin_transition offline_write=BLOCKED');
