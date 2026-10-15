'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const text=fs.readFileSync('app.js','utf8');
const begin=text.indexOf('async function topChickenCustomerCreate(');
const end=text.indexOf('\nfunction openTopChickenCustomerForm(',begin);
assert.ok(begin>0&&end>begin,'scoped customer writer exists');
const snippet=text.slice(begin,end);
new vm.Script(snippet);
const calls=[];let branch=22,tc=true,dup=[],created=[{id:42,name:'أحمد',phone:'01112345678'}],failAddress=false;
const context={
 isTopChickenStaffContext:async()=>tc,currentBranchId:()=>branch,
 normalizePhone:p=>String(p||'').replace(/\D/g,''),
 rest:async(table,query='',opts={})=>{
   calls.push({table,query,method:opts.method||'GET',body:opts.body});
   if(table==='customers'&&opts.method==='POST')return created;
   if(table==='customers')return dup;
   if(table==='customer_addresses'&&failAddress)throw Error('address blocked');
   return [];
 }
};vm.createContext(context);vm.runInContext(snippet,context);
const add=context.topChickenCustomerCreate;
(async()=>{
 await add({name:' أحمد ',phone:'01112345678',address:'Street 20',area:'El-Eshreen'});
 assert.equal(calls[0].table,'customers');
 assert.equal(calls[0].method,'GET');
 assert.equal(calls[1].method,'POST');
 assert.equal(JSON.parse(calls[1].body)[0].phone,'01112345678');
 assert.equal(calls[2].table,'customer_addresses');
 assert.equal(JSON.parse(calls[2].body)[0].customer_id,42);
 calls.length=0;
 dup=[{id:11,name:'مسجل',phone:'01112345678'}];
 await assert.rejects(add({name:'آخر',phone:'01112345678'}),/مسجل بالفعل/);
 assert.equal(calls.filter(c=>c.method==='POST').length,0,'duplicate does not create');
 dup=[];calls.length=0;
 await assert.rejects(add({name:'New',phone:'123'}),/11 رقم/);
 assert.equal(calls.length,0,'invalid phone never reaches database');
 tc=false;await assert.rejects(add({name:'New',phone:'01112345678'}),/توب تشيكن/);
 assert.equal(calls.length,0,'other business no data access');
 tc=true;branch=1;await assert.rejects(add({name:'New',phone:'01112345678'}),/توب تشيكن/);
 assert.equal(calls.length,0,'other branch no data access');
 branch=22;failAddress=true;
 await assert.rejects(add({name:'New',phone:'01112345678',address:'Street'}),/تم حفظ العميل لكن تعذر حفظ العنوان/);
 assert.equal(text.includes('id="newTopChickenCustomer"'),true,'customers screen button present');
 assert.equal(text.includes('id="newPosCustomer"'),true,'cashier button present');
 console.log('PASS: Top Chicken branch 22 customer add; 11-digit validation; no duplicate; address binding; foreign-tenant blocked; both buttons');
})().catch(e=>{console.error(e);process.exitCode=1});
