'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const s=fs.readFileSync('app.js','utf8');
const helper=s.slice(s.indexOf('async function rc1RemoveStorageObject'),s.indexOf('async function uploadProductImage'));
assert(helper.includes("await rc1RequireCloudOnline('تنظيف ملف Cloud Storage')"),'storage DELETE helper must fail closed before fetch');
assert(helper.indexOf('rc1RequireCloudOnline')<helper.indexOf("method:'DELETE'"),'storage guard must precede DELETE');
for(const [fn,label] of [['uploadProductImage','رفع صورة الصنف'],['restoreBackup','استعادة النسخة الاحتياطية'],['uploadBusinessLogo','رفع لوجو النشاط']]){const i=s.indexOf('function '+fn)>=0?s.indexOf('function '+fn):s.indexOf('async function '+fn);const part=s.slice(i,i+1800);assert(part.includes('rc1RequireCloudOnline'),fn+' direct mutation guard missing');}
assert(s.includes('async function cloudRpc(name,payload={})'),'protected Sharawla Cloud activation/licensing helper must remain untouched');
new vm.Script(s,{filename:'app.js'});
console.log('RC1 special direct write guards PASS');
