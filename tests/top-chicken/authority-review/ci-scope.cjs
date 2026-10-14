const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const before=process.env.TC_BEFORE,head=process.env.GITHUB_SHA;
let native=true,client=true,files=[];
if(process.env.GITHUB_EVENT_NAME==='push'){
 if(!/^[a-f0-9]{40}$/.test(before||'')||!/[1-9a-f]/.test(before)||!/^[a-f0-9]{40}$/.test(head||''))throw Error('Reviewed push range required');
 files=execFileSync('git',['diff','--name-only',before,head],{encoding:'utf8'}).trim().split('\n');
 native=files.some(f=>/^supabase\/(top-chicken-.*-CANDIDATE\.sql|functions\/)/.test(f)||/^tests\/top-chicken\/authority-review\/(entitlements|sql-compat|smart-compat|fixture)\.mjs$/.test(f)||f==='tests/top-chicken/generate_owner_repair.py'||/evidence\/top-chicken\/authority-review\/(cloud-effective-entitlements|live-operational-functions|live-smart-function-v2)\.json/.test(f));
 client=files.some(f=>f==='app.js'||f==='.github/workflows/top-chicken-authority-review.yml'||f.startsWith('supabase/functions/')||/^tests\/top-chicken\/authority-review\/(client-routing|signed-channel)\.mjs$/.test(f)||f.endsWith('/ci-scope.cjs'));
}
fs.appendFileSync(process.env.GITHUB_OUTPUT,`native=${native}\nclient=${client}\n`);
console.log(JSON.stringify({native,client,files,rule:'Retain successful native owner/entitlement results for workflow/frontend-only changes.'}));
