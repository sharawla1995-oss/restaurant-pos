const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const wrapper44=fs.readFileSync(path.join(root,'main-beta44.js'),'utf8');
const wrapper=fs.readFileSync(path.join(root,'main-beta23.js'),'utf8');
if(pkg.main!=='main-beta44.js')throw new Error('Beta44 storage hardening wrapper is not the package entrypoint.');
if(!wrapper44.includes("require('./main-beta23.js')"))throw new Error('Beta44 wrapper must preserve the Beta23 stale-update recovery chain.');
for(const token of [
  "require('./main.js')",
  'function recoverStalePending()',
  'compareSemver(current,staleTarget)',
  'if(cmp!==1)return false',
  "status:'recovery-pending'",
  "mode:'recovery'",
  'supersededPending:{...pending}',
  'coreHealth:null',
  'rendererHealth:null',
  'automaticRollbackEnabled:false',
  'STALE_PENDING_RECOVERY_PREPARED'
]){
  if(!wrapper.includes(token))throw new Error(`Updater stale-pending recovery invariant missing: ${token}`);
}
if(wrapper.includes('pendingUpdate:null'))throw new Error('Recovery wrapper must never blindly clear pendingUpdate.');
if(!wrapper.includes('writeJsonAtomic(statePath,next)'))throw new Error('Recovery state must be written atomically before main runtime starts.');
console.log('Beta44 -> Beta23 stale pending updater recovery chain OK.');
