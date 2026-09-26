'use strict';
const fs=require('fs');
function must(c,m){if(!c)throw new Error(m)}
const ui=fs.readFileSync('owner-acceptance-ui-v47.js','utf8');
const registry=fs.readFileSync('owner-acceptance-registry-v55.js','utf8');
const loader=fs.readFileSync('owner-acceptance-lazy-loader-v47.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const wf=fs.readFileSync('.github/workflows/beta55-1-runtime-snapshot-build.yml','utf8');
const ids=['offline.shift-lifecycle-runtime-e2e','offline.http503-recovery-runtime-e2e','runtime-snapshot.anti-rollback-runtime-e2e'];
must(registry.includes("(!opts.ids||opts.ids.includes(t.id))"),'Acceptance Registry ids filter missing');
for(const id of ids){must(ui.includes(id),`Point15 focused UI missing ${id}`);must(loader.includes(id.includes('shift')?'owner-acceptance-offline-shift-v58.js':id.includes('http503')?'owner-acceptance-offline-http503-v58.js':'owner-acceptance-runtime-snapshot-anti-rollback-v58.js'),`Point15 focused owner not loaded for ${id}`)}
must(ui.includes("R.start({level:'chaos',mode:'sandbox',ids:[...POINT15_IDS],failFast:false})"),'Point15 focused runner must use explicit ids only');
must(ui.includes('data-acc-v47-focus="point15"')&&ui.includes('🎯 Point 15 Focused'),'Point15 focused UI button missing');
must(ui.includes('Point 15 Focused selection incomplete'),'Point15 focused selection completeness guard missing');
must(!/runPoint15Focused\(\)[\s\S]{0,1200}R\.start\(\{level:'chaos',mode:'sandbox',failFast/.test(ui),'Point15 focused runner must not fall back to broad chaos');
must(String(pkg.scripts?.check||'').includes('scripts/check-point15-focused-acceptance-runner.js'),'Point15 focused runner gate missing from npm run check');
must(wf.includes('run: npm run check'),'CI candidate validation must execute consolidated npm run check');
console.log('Point15 focused acceptance runner static gate PASS');
