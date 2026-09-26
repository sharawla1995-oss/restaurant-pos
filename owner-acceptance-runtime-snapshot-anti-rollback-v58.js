(function(global){
'use strict';
// SH-0007-only focused runtime proof. Main-process implementation uses an isolated temp store,
// never the live Runtime Snapshot LKG/high-water files.
const VERSION='10.5.4-beta.58.29';
const R=()=>global.__SharawlaAcceptanceRegistry;
async function run(){
 const probe=global.topBurgerDesktop?.runtimeSnapshot?.antiRollbackProbe;
 if(typeof probe!=='function')throw new Error('Runtime Snapshot anti-rollback acceptance bridge unavailable');
 const r=await probe();
 if(r?.ok!==true||r?.isolated!==true||r?.temp_store!==true)throw new Error('Runtime Snapshot anti-rollback probe is not isolated');
 if(r?.reject_code!=='SNAPSHOT_ROLLBACK')throw new Error(`Runtime Snapshot rollback rejection missing: ${r?.reject_code||'none'}`);
 if(r?.lkg_unchanged!==true||r?.live_store_touched!==false)throw new Error('Runtime Snapshot LKG preservation proof missing');
 if(Number(r?.accepted_sequence)!==2||Number(r?.rejected_sequence)!==1||Number(r?.lkg_sequence)!==2||Number(r?.high_water)!==2)throw new Error('Runtime Snapshot anti-rollback sequence proof mismatch');
 return {status:'PASS',detail:`isolated=temp; accepted=${r.accepted_sequence}; rejected=${r.rejected_sequence}; code=${r.reject_code}; lkg=${r.lkg_sequence}; high_water=${r.high_water}; live_store=untouched`,evidence:r};
}
function register(){const r=R();if(!r||global.__SharawlaRuntimeSnapshotAntiRollbackAcceptanceRegistered)return false;global.__SharawlaRuntimeSnapshotAntiRollbackAcceptanceRegistered=true;r.register({id:'runtime-snapshot.anti-rollback-runtime-e2e',name:'Runtime Snapshot Anti-Rollback → Preserve LKG',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['core.offline'],run});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaRuntimeSnapshotAntiRollbackAcceptance=Object.freeze({version:VERSION,register,run});
})(window);
