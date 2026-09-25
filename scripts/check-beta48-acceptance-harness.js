'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json')),ver=JSON.parse(read('version.json'));
const ui=read('owner-acceptance-ui-v47.js'),registry=read('owner-acceptance-registry-v3.js'),e2e=read('owner-acceptance-e2e-v3.js'),advanced=read('owner-acceptance-advanced-v4.js'),lazy=read('owner-acceptance-lazy-loader-v47.js'),sync=read('scripts/sync-version.js'),loader=read('beta36-integration-loader.js'),app=read('app.js');
function need(src,t,msg=t){assert(src.includes(t),`Beta48 gate missing: ${msg}`)}
function no(src,t,msg=t){assert(!src.includes(t),`Beta48 gate forbidden: ${msg}`)}
const betaMatch=String(pkg.version||'').match(/^10\.5\.4-beta\.(\d+)$/);assert(betaMatch&&Number(betaMatch[1])>=48,'package version must be Beta48+');
assert.strictEqual(ver.version,pkg.version,'version.json version');
assert(String(pkg.description).includes('Offline Engine V2'),'Offline Engine V2 description invariant');
need(ui,"e.ctrlKey&&e.shiftKey&&e.key==='F12'",'F12 owner rerender reattach');
need(ui,"setTimeout(attachSoon,0)",'event-driven acceptance reattach');
need(ui,"failFast:level==='quick'",'Full/Chaos must continue collecting diagnostics');
no(ui,'MutationObserver','lightweight acceptance UI must stay event-driven');
no(ui,'setInterval','lightweight acceptance UI must not poll');
need(registry,'harness_version:VERSION','run must stamp harness version');
need(registry,'lastComparableResult','flaky detection must compare only compatible runs');
need(registry,"text(r.harness_version)!==VERSION",'old harness history must not create false flaky');
need(registry,'schema:4','Beta48 acceptance schema');
need(e2e,'retail.open-shift-precondition','explicit open-shift precondition');
need(e2e,'posLocalFirstRetailSale','POS local-first acceptance bridge');
need(e2e,"typeof global.saveOfflineSale!=='function'",'real POS offline persistence helper required');
need(e2e,"attempt?.path!=='local'",'offline acceptance must prove local fallback');
need(e2e,"finally{await net().disable('offline-phase-complete')}",'offline lab must always be disabled');
need(e2e,"finally{await net().disable('lost-ack-phase-complete')}",'lost ACK lab must always be disabled');
need(e2e,'global.syncOfflineQueue?.()','real POS queue sync path must be exercised');
no(e2e,'new MutationObserver','E2E pack must not add a broad body observer');
need(advanced,"disable?.('concurrency-preflight')",'20x test must force clean network preflight');
need(advanced,'attemptErrors','20x failure diagnostics');
need(advanced,'fulfilled=${ok}; rejected=${rej}','20x report must expose attempt outcomes');
need(advanced,'POS Local-First acceptance bridge unavailable','crash test must use local-first bridge');
need(advanced,"dependsOn:['retail.open-shift-precondition']",'advanced retail tests must share shift precondition');
no(advanced,'new MutationObserver','advanced pack must be event-driven');
need(lazy,'sharawla-beta48-acceptance-ready','Beta48 lazy ready event compatibility');
for(const f of ['owner-acceptance-registry-v3.js','owner-acceptance-network-lab.js','owner-acceptance-e2e-v3.js','owner-acceptance-profile-packs-v3.js','owner-acceptance-advanced-v4.js','owner-acceptance-recovery-permissions-v5.js','owner-acceptance-ui-v47.js'])need(sync,`'${f}'`,`version sync must include ${f}`);
need(sync,"'owner-diagnostics.js'",'Owner Diagnostics label must follow app version');
need(loader,'beta47-performance-sync-hotfix.js','Beta47 permanent conflict hotfix must remain loaded');
need(loader,'owner-acceptance-lazy-loader-v47.js','Owner acceptance must remain lazy');
no(loader,'owner-acceptance-e2e-v3.js','heavy E2E must not load at startup');
need(app,'if(canonical)return [canonical];','canonical fingerprint immutable invariant');
need(app,'if(canonical)break;','canonical cloud rejection must remain authoritative');
for(const src of [ui,registry,e2e,advanced,lazy]){
 no(src,'SH-0005','production device SH-0005');
 no(src,'SH-0006','production device SH-0006');
 no(src,'3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7','production business id');
 no(src,'kzokretuuigjhxjzdlmk','production backend');
}
console.log('Beta48+ Acceptance Harness gate PASS — local-first offline path / clean flaky history / 20x diagnostics / owner reattach / production invariants verified');
