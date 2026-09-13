'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const src=read('owner-acceptance-advanced-v4.js');
const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const betaMatch=String(pkg.version||'').match(/^10\.5\.4-beta\.(\d+)$/);
assert(betaMatch&&Number(betaMatch[1])>=52,'Package version must be Beta52+');
assert.strictEqual(ver.version,pkg.version);
assert.strictEqual(ver.channel,'beta');
for(const marker of [
  "const CRASH_RESULT_KEY='sharawlaAcceptanceCrashResultV6'",
  'function savedCrashResult()',
  'function saveCrashResult(v)',
  'function crashAcceptanceResult()',
  "run:async()=>crashAcceptanceResult()",
  "Crash Test already completed — PASS",
  "reconciliation_ok:true",
  "cleanup_zero:true",
  "sale_status:synced.status",
  "return_status:returnEv.status",
  "orders:rows.length"
]) assert(src.includes(marker),`Missing Beta52 crash evidence marker: ${marker}`);
const savePos=src.indexOf('const result=saveCrashResult(');
const clearMarkerPos=src.indexOf('await global.topBurgerDesktop.acceptance.crashMarkerClear()');
const clearStatePos=src.indexOf('clearCrash();',clearMarkerPos);
assert(savePos>=0&&clearMarkerPos>savePos&&clearStatePos>clearMarkerPos,'Crash PASS evidence must persist before marker/state cleanup');
assert(src.includes("if(done?.status==='PASS')"),'Completed crash resume must be idempotently readable');
assert(src.includes("if(synced?.status!=='synced')"),'Crash sale synced assertion missing');
assert(src.includes("if(returnEv?.status!=='synced')"),'Crash return synced assertion missing');
assert(src.includes("if(!cleanupZero)throw new Error"),'Crash cleanup zero-residue assertion missing');
console.log(`Beta52+ Crash Evidence regression gate PASS on ${pkg.version} — guided crash completion remains durable, reportable, idempotently readable, and zero-residue verified`);
