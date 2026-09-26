'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json')),loader=read('beta36-integration-loader.js'),fix=read('beta51-final-offline-acceptance-fix.js');
const m=String(pkg.version||'').match(/^10\.5\.4-beta\.(\d+)(?:\.\d+)*$/);
assert(m&&Number(m[1])>=51,'Beta51+ package version required');
{const d=String(pkg.description||'');assert(d.includes('Offline')&&d.includes('SH-0007'),'Beta51+ release must preserve Offline SH-0007 acceptance identity');}
for(const t of ["const VERSION='10.5.4-beta.51'",'topBurgerDesktop?.offlineV2?.event','operation_type===\'sale\'','READY_STATES','localSaleResult','originalSaveOfflineSale'])assert(fix.includes(t),`Beta51 final fix missing: ${t}`);
assert(!fix.includes('takeoverActivate'),'Beta51 fix must not auto-activate takeover');
assert(!fix.includes('takeoverPrepare'),'Beta51 fix must not rerun migration');
assert(loader.includes('beta51-final-offline-acceptance-fix.js'),'Beta51 loader entry missing');
assert(loader.indexOf('beta51-final-offline-acceptance-fix.js')<loader.indexOf('owner-acceptance-lazy-loader-v47.js'),'Beta51 final fix must load before acceptance harness');
console.log(`Beta51+ Final Offline Acceptance regression gate PASS on ${pkg.version} — durable sale reuse fix preserved; owner harness loads after fix`);
