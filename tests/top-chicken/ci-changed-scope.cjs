const fs=require('node:fs'),{execFileSync}=require('node:child_process');
let files=[];
if(process.env.GITHUB_EVENT_NAME==='push'){
 const before=process.env.TC_BEFORE,head=process.env.GITHUB_SHA;
 if(!/^[a-f0-9]{40}$/.test(before||'')||!/[1-9a-f]/.test(before)||!/^[a-f0-9]{40}$/.test(head||''))throw Error('Push range required');
 files=execFileSync('git',['diff','--name-only',before,head],{encoding:'utf8'}).trim().split('\n');
}
const shared=f=>/^supabase\/top-chicken-.*-CANDIDATE\.sql$/.test(f)||/evidence\/top-chicken\/(staff-profile-metadata|cloud-.*source|dependency-tables|contracts|action-seed|deployed-owner|evaluator|trigger-snapshot)/.test(f);
const reviewedAuthority=fs.existsSync('supabase/top-chicken-cloud-execution-CANDIDATE.sql')&&files.some(f=>shared(f)||f==='app.js'||f==='supabase/config.toml'||f.startsWith('supabase/functions/top-chicken-')||f.startsWith('supabase/functions/smart-function/')||f.startsWith('tests/top-chicken/authority-review/')||f==='tests/top-chicken/generate_owner_repair.py');
// A dedicated native suite replaces only the newly changed authority layer; closed Auth/PG tests are retained.
const postgres=!reviewedAuthority&&files.some(f=>shared(f)||['tests/top-chicken/pg16.mjs','tests/top-chicken/fixture.sql'].includes(f));
const windows=files.some(f=>['app.js','main.js','preload.js','package.json','package-lock.json','top-chicken-test-build.json','tests/top-chicken/final-package-check.cjs'].includes(f));
const staff=!reviewedAuthority&&(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'||files.some(f=>shared(f)||f==='app.js'||f==='.github/workflows/top-chicken-prelaunch-isolated.yml'||f.startsWith('supabase/functions/')||f==='supabase/config.toml'||f.startsWith('tests/top-chicken/')&&f!=='tests/top-chicken/final-package-check.cjs'));
fs.appendFileSync(process.env.GITHUB_OUTPUT,`postgres=${postgres}\nwindows=${windows}\nstaff=${staff}\n`);
console.log(JSON.stringify({postgres,windows,staff,changed_files:files,rule:'Closed unaffected checks are retained; workflow-only setup fixes rerun staff/browser only.'}));
