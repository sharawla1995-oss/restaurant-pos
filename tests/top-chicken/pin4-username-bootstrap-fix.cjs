'use strict';
// SOURCE ONLY. No live credentials, Auth logins, employees, or device changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync('app.js','utf8');
const pinEdge=fs.readFileSync('supabase/functions/top-chicken-pin-login/index.ts','utf8');
const sql=fs.readFileSync('review-only/top-chicken-pin-login-lease-bootstrap-NO-DEPLOY.sql','utf8');
let count=0;const check=(label,fn)=>{fn();count++;console.log('PASS '+label)};
check('Top Chicken login input stays text, never native email-only',()=>{
 assert.match(app,/if\(await isTopChickenStaffContext\(\)\)\{const input=\$\('#email'\);input\.type='text'/);
 assert.match(app,/اسم المستخدم أو البريد الإلكتروني/);
 assert(!app.includes("if(await isTopChickenStaffContext()){const input=$('#email');input.type='email'"));
});
check('PIN authentication continues using scoped endpoint, not raw email',()=>{
 const login=app.slice(app.indexOf('async function signIn(email,password)'),app.indexOf('async function logout()',app.indexOf('async function signIn(email,password)')));
 assert(login.includes("if(!email.includes('@') && await isTopChickenStaffContext())"));
 assert(login.includes("req('/functions/v1/top-chicken-pin-login'"));
 assert(login.includes("req('/auth/v1/token?grant_type=password'"));
 assert(login.includes("localStorage.removeItem('offlineLoginVerifier')"));
});
check('internal handle displays goo but Auth identity remains untouched',()=>{
 const start=app.indexOf('function topChickenLoginHandle(internalId){');
 const end=app.indexOf('function renderUsers(){',start);
 assert(start>0&&end>start);
 const f=new Function(app.slice(start,end)+"return topChickenLoginHandle;")();
 assert.equal(f('tc_tc-sh0008-goo_e1b55099d8d6'),'goo');
 assert.equal(f('tc_tc-sh0008-ahmed_012345abcdef'),'ahmed');
 assert.equal(f('someone@personal.test'),null);
 assert.equal(f('tc_tc-sh0008-goo_nothex'),null);
 assert(app.includes("editing&&tcStaffUserForm?'اسم الدخول (للعرض فقط)'"));
});
check('correct PIN Auth verified BEFORE signed commercial lease renewal',()=>{
 const auth=pinEdge.indexOf("requestJson(env.url+'/auth/v1/token?grant_type=password'");
 const verify=pinEdge.indexOf("if(!signed.ok)");
 const lease=pinEdge.indexOf('await ensureStaffLease(');
 const success=pinEdge.indexOf("top_chicken_pin_login_success_v1");
 assert(auth>=0&&auth<verify&&verify<lease&&lease<success);
 assert(pinEdge.includes("import {ensureStaffLease}"));
});
check('rate limited precheck and post-PIN authorization retained',()=>{
 assert(sql.includes("CREATE OR REPLACE FUNCTION public.top_chicken_pin_login_attempt_v1"));
 for(const token of ['tc-pin-login:','locked_until','attempts>=5','15 minutes','auth.users','business_auth_memberships','e.branch_id=22','e.active IS TRUE','m.active IS TRUE','b.active IS TRUE'])assert(sql.includes(token),token);
 assert(!sql.includes('CREATE OR REPLACE FUNCTION public.top_chicken_pin_login_success_v1'));
 assert(sql.includes("DO NOT replace or relax top_chicken_pin_login_success_v1"));
});
console.log('PASS '+count+' PIN4 username/login source-only groups');
