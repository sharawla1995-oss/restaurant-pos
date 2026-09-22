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

const ok=ids.length===46&&new Set(ids).size===46&&!missing.length&&!dup.length&&!extra.length&&!badBlob&&!badFile&&!badGuard&&!guardMissing&&!definitionMissing&&!unresolvedCollisions;
console.log(`POINT4_DEPLOYMENT_MANIFEST_${ok?'COVERAGE_PASS':'COVERAGE_FAIL'} contracts=${c.records.length} mapped=${new Set(ids).size} missing=${missing.length} duplicates=${dup.length} extra=${extra.length} bad_blob=${badBlob} bad_file=${badFile} definition_missing=${definitionMissing} guard_missing=${guardMissing}`);
if(missing.length)console.log('missing_ids='+missing.join(','));if(dup.length)console.log('duplicate_ids='+dup.join(','));if(definitionMissing||guardMissing)console.log('NOTE effective owner semantic/body reconciliation still required');
if(!ok)process.exit(1);
