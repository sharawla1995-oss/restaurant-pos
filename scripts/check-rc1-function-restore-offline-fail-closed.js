'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync('app.js','utf8');
assert(s.includes("e.code='FUNCTION_MUTATION_OFFLINE_BLOCKED'"),'function Offline block missing');
assert(s.includes("async function restoreBackup(file,groups){\n await rc1RequireCloudOnline('استعادة النسخة الاحتياطية');"),'restore preflight missing');
new vm.Script(s,{filename:'app.js'});
console.log('RC1 function/restore Offline fail-closed gate PASS');
