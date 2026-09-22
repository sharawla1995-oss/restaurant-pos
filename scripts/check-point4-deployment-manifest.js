'use strict';
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('contracts/point4-pre-cutover-46-guard-contracts.v1.json'));
const m=JSON.parse(fs.readFileSync('contracts/point4-deployment-manifest.v1.json'));
const ids=[];
for(const x of m.known_effective_owners) for(const p of x.id_range.split(',')){const n=Number(p.trim());if(Number.isInteger(n))ids.push(n);}
const dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))],missing=c.records.map(x=>x.id).filter(x=>!ids.includes(x)),extra=ids.filter(x=>!c.records.some(y=>y.id===x));
let badBlob=0,badFile=0,badGuard=0;
for(const x of m.known_effective_owners){if(!/^[0-9a-f]{40}$/.test(x.blob))badBlob++;if(!fs.existsSync(x.artifact))badFile++;}
for(const r of c.records){if(!['inventory_stock_assert_legacy_write_allowed_v2','inventory_stock_assert_document_workflow_allowed_v2'].includes(r.required_guard))badGuard++;}
const owners=new Map();for(const x of m.known_effective_owners)for(const p of x.id_range.split(','))owners.set(Number(p.trim()),x);
let guardMissing=0,definitionMissing=0;
for(const r of c.records){const o=owners.get(r.id);if(!o)continue;const s=fs.readFileSync(o.artifact,'utf8').toLowerCase();let name=r.signature.slice(0,r.signature.indexOf('(')).toLowerCase();if(r.id===22&&o.effective_signature_note)name='retail_create_website_order_beta18_core';const a=s.indexOf('create or replace function public.'+name+'(');if(a<0){definitionMissing++;console.log('definition_missing_id='+r.id+' expected_name='+name+' artifact='+o.artifact);continue}const n=s.indexOf('\ncreate or replace function public.',a+20),b=s.slice(a,n<0?s.length:n);if(!b.includes(r.required_guard.toLowerCase())){guardMissing++;console.log('guard_missing_id='+r.id+' artifact='+o.artifact);}}

const crypto=require('crypto');
function defs(src){const re=/create\s+or\s+replace\s+function\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)/ig,out=[];let z;while((z=re.exec(src)))out.push({name:z[1].toLowerCase(),args:z[2].replace(/--.*$/gm,'').replace(/\s+/g,' ').trim(),at:z.index});return out;}
const trackedSql=fs.readdirSync('.').filter(x=>x.endsWith('.sql'));
const contractNames=new Set(c.records.map(r=>r.signature.slice(0,r.signature.indexOf('(')).toLowerCase()));
const occurrences=new Map();
for(const file of trackedSql){const src=fs.readFileSync(file,'utf8');for(const d of defs(src)){if(contractNames.has(d.name)){if(!occurrences.has(d.name))occurrences.set(d.name,[]);occurrences.get(d.name).push(file);}}}
let unresolvedCollisions=0;
for(const r of c.records){const name=r.signature.slice(0,r.signature.indexOf('(')).toLowerCase(),hits=[...new Set(occurrences.get(name)||[])];if(hits.length>1){const o=owners.get(r.id),registered=new Set([o&&o.artifact,...((o&&o.supersedes)||[]).map(x=>x.split('@')[0])]);const unknown=hits.filter(x=>!registered.has(x));if(unknown.length){unresolvedCollisions++;console.log('unresolved_collision_id='+r.id+' files='+unknown.join(','));}}}
console.log('POINT4_DEPLOYMENT_COLLISION_SCAN contracts='+c.records.length+' unresolved_collisions='+unresolvedCollisions);


const plan=m.deployment_plan||[];
let orderingViolations=0,downgrades=0,finalDefinitionMismatches=0,blobMismatches=0;
const seenPlan=new Set();
for(const x of plan){if(seenPlan.has(x.artifact)){orderingViolations++;console.log('duplicate_deployment_artifact='+x.artifact);}seenPlan.add(x.artifact);const o=m.known_effective_owners.find(y=>y.artifact===x.artifact);if(!o||o.blob!==x.blob){blobMismatches++;console.log('plan_blob_mismatch='+x.artifact);}}
const finalOwner=new Map();
for(const x of plan){const src=fs.readFileSync(x.artifact,'utf8').toLowerCase();for(const r of c.records){const o=owners.get(r.id);let name=r.signature.slice(0,r.signature.indexOf('(')).toLowerCase();if(r.id===22&&o&&o.artifact===x.artifact&&o.effective_signature_note)name='retail_create_website_order_beta18_core';if(src.includes('create or replace function public.'+name+'('))finalOwner.set(r.id,x.artifact);}}
for(const r of c.records){const o=owners.get(r.id),win=finalOwner.get(r.id);if(win!==o.artifact){finalDefinitionMismatches++;console.log('final_definition_mismatch_id='+r.id+' expected='+o.artifact+' actual='+(win||'BASELINE_RUNTIME'));if(win&&((o.supersedes)||[]).some(z=>z.split('@')[0]===win))downgrades++;}}
console.log('POINT4_FINAL_DEFINITION_SIMULATION contracts='+c.records.length+' deployment_artifacts='+plan.length+' blob_mismatches='+blobMismatches+' ordering_violations='+orderingViolations+' downgrades='+downgrades+' final_definition_mismatches='+finalDefinitionMismatches);


let prerequisiteViolations=0;
const pf=m.preflight||{},deps=(pf.dependencies||{});
if(pf.target_project!=='xihcxydjnzemflhedzor'||pf.mode!=='READ_ONLY'){prerequisiteViolations++;console.log('preflight_target_or_mode_invalid');}
if(!deps.legacy_guard||deps.legacy_guard.signature!=='inventory_stock_assert_legacy_write_allowed_v2(bigint,text,bigint)'||deps.legacy_guard.present!==true){prerequisiteViolations++;console.log('legacy_guard_prerequisite_invalid');}
if(!deps.document_guard||deps.document_guard.signature!=='inventory_stock_assert_document_workflow_allowed_v2(text)'||deps.document_guard.present!==true){prerequisiteViolations++;console.log('document_guard_prerequisite_invalid');}
const core=deps.website_guarded_core;
if(!core||core.created_by!=='supabase-point4-pre-cutover-46-guard-installation-batch5-website-legacy-core.sql'||core.present_before_deployment!==false){prerequisiteViolations++;console.log('website_core_prerequisite_invalid');}
else {const creator=plan.find(x=>x.artifact===core.created_by);if(!creator){prerequisiteViolations++;console.log('website_core_creator_not_in_plan');}else{const coreSrc=fs.readFileSync(creator.artifact,'utf8').toLowerCase();const coreDef=coreSrc.indexOf('create or replace function public.retail_create_website_order_beta18_core(');if(coreDef<0){prerequisiteViolations++;console.log('website_core_definition_missing_from_creator');}for(const x of plan){const src=fs.readFileSync(x.artifact,'utf8').toLowerCase();const dep=src.indexOf('retail_create_website_order_beta18_core(');const own=x.artifact===creator.artifact&&dep===coreDef;if(dep>=0&&!own&&x.order<=creator.order){prerequisiteViolations++;console.log('website_core_created_after_dependency artifact='+x.artifact+' order='+x.order+' creator_order='+creator.order);}}}}
console.log('POINT4_PREFLIGHT_PREREQUISITES target='+(pf.target_project||'NONE')+' contract_signatures='+(pf.checked_contract_signatures||0)+' missing_contract_signatures='+(pf.runtime_missing_contract_signatures??'NA')+' prerequisite_violations='+prerequisiteViolations);

const ok=ids.length===46&&new Set(ids).size===46&&!missing.length&&!dup.length&&!extra.length&&!badBlob&&!badFile&&!badGuard&&!guardMissing&&!definitionMissing&&!unresolvedCollisions&&!blobMismatches&&!orderingViolations&&!downgrades&&!finalDefinitionMismatches&&!prerequisiteViolations;
console.log(`POINT4_DEPLOYMENT_MANIFEST_${ok?'COVERAGE_PASS':'COVERAGE_FAIL'} contracts=${c.records.length} mapped=${new Set(ids).size} missing=${missing.length} duplicates=${dup.length} extra=${extra.length} bad_blob=${badBlob} bad_file=${badFile} definition_missing=${definitionMissing} guard_missing=${guardMissing}`);
if(missing.length)console.log('missing_ids='+missing.join(','));if(dup.length)console.log('duplicate_ids='+dup.join(','));if(definitionMissing||guardMissing)console.log('NOTE effective owner semantic/body reconciliation still required');
if(!ok)process.exit(1);
