'use strict';
// Isolated Node 20+, no Supabase/Edge/production connections.
const assert=require('node:assert/strict');
const fs=require('node:fs');
// Node 20 exposes webcrypto as globalThis.crypto; no global mutation needed.
const domainPath='../../supabase/functions/top-chicken-staff/staff-domain.mjs';
const url=new URL(domainPath,'file://'+process.cwd()+'/tests/top-chicken/');
(async()=>{
 const m=await import(url.href);
 const base={action:'create',username:'  New.Worker@Example.COM ',name:' New Cashier ',
  password:'strong-password-123',role:'cashier',branch_id:22,branch_ids:[22],
  permissions:['orders','pos','orders'],active:true,
  request_id:'10000000-0000-4000-8000-000000000001'};
 const norm=m.staffCreatePayload(base);
 assert.equal(norm.username,'new.worker@example.com');
 assert.equal(norm.name,'New Cashier');
 assert.deepEqual(norm.permissions,['orders','pos']);
 assert.equal(norm.branch_id,22);
 const admin=m.staffCreatePayload({...base,role:'admin',permissions:['users','suppliers','foodRecipes']});
 assert.deepEqual(admin.permissions,[],'admin relies on role, not fabricated explicit user privilege inserts');
 const d=await m.staffDigest(norm);
 assert.match(d,/^[a-f0-9]{64}$/);
 assert.equal(await m.staffDigest(norm),d,'stable digest');
 assert.notEqual(await m.staffDigest({...norm,password:'another-strong-password'}),d);
 function deny(p,code){assert.throws(()=>m.staffCreatePayload(p),new RegExp(code))}
 deny({...base,username:'local-name'},'VALID_EMAIL_REQUIRED');
 deny({...base,username:'no-at'},'VALID_EMAIL_REQUIRED');
 deny({...base,username:'a@invalid'},'VALID_EMAIL_REQUIRED');
 deny({...base,password:'short'},'PASSWORD_MIN_8_REQUIRED');
 deny({...base,branch_id:9},'BRANCH_22_ONLY');
 deny({...base,branch_ids:[22,9]},'BRANCH_22_ONLY');
 deny({...base,role:'superadmin'},'ROLE_INVALID');
 deny({...base,permissions:['__evil__']},'PERMISSION_NOT_ALLOWLISTED');
 deny({...base,request_id:'bad'},'REQUEST_ID_INVALID');
 deny({...base,action:'password'},'ACTION_NOT_SUPPORTED');
 const engine=fs.readFileSync('restaurant-engine.js','utf8');
 const defs=engine.split('const PERMISSION_DEFS=Object.freeze([')[1]?.split('].map(row=>Object.freeze(row)))')[0];
 assert.ok(defs,'read deployed restaurant engine permission definitions');
 const uiKeys=[...defs.matchAll(/\['([^']+)','[^']*'\]/g)].map(x=>x[1]);
 assert.equal(uiKeys.length,58);
 for(const key of uiKeys)assert.ok(m.PERMISSION_ALLOWLIST.has(key),'missing permission '+key);
 assert.equal(m.PERMISSION_ALLOWLIST.size,uiKeys.length+1,'no unrecognized privileges');
 const edge=fs.readFileSync('supabase/functions/top-chicken-staff/index.ts','utf8');
 assert.ok(edge.includes("await verifiedUser("),'auth token verified before action');
 assert.ok(edge.indexOf('await verifiedUser(')<edge.indexOf("staffManagePayload(body)"),'JWT before staff management');
 assert.ok(edge.indexOf('await verifiedUser(')<edge.indexOf("staffCreatePayload(body)"),'JWT before staff creation');
 assert.ok(edge.includes('new_reservation!==true'),'uncertain retry does not create another Auth user');
 assert.ok(edge.includes('STAFF_COMMIT_RECONCILIATION_REQUIRED'),'never claim success on uncertain DB state');
 assert.ok(!edge.includes('deleteUser('),'no unsafe deletion of potentially committed auth record');
 const sql=fs.readFileSync('review-only/top-chicken-sh0008-staff-create-NO-DEPLOY.sql','utf8');
 assert.ok(sql.includes("v_username:='tc_'"),'internal username derived from email');
 assert.ok(sql.includes("regexp_replace(split_part(v_rec.email,'@',1)"),'no @ is copied into employee username');
 assert.ok(sql.includes("VALUES(v_name,v_username,v_role"),'employees.username must use no-@ handle');
 assert.ok(!sql.includes("VALUES(v_name,v_rec.email,v_role"),'never store full email in no-at username');
 const fixture=fs.readFileSync('tests/top-chicken/isolated-pg16-staff-fixture.sql','utf8');
 assert.ok(fixture.includes('employees_username_no_at')&&fixture.includes('employees_username_format'),'fixture matches deployed Beta username CHECK constraints');
 assert.ok(edge.includes("top_chicken_staff_create_reserve_v1")&&edge.includes("top_chicken_staff_create_finish_v1"));
 console.log('PASS: valid email/username normalization, @ required explicitly, password/branch/role/id validation, exact 58 permission keys, digest retry binding, JWT auth & fail-closed Edge recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
