'use strict';
const fs=require('fs'),assert=require('assert');
const manifest=JSON.parse(fs.readFileSync('docs/SHARAWLA-RC1-RUNTIME-ALIGNMENT-BETA-DEPLOYMENT-MANIFEST.json','utf8'));
assert.strictEqual(manifest.authorized,false,'simulation must never authorize deployment');

const files=manifest.offline_alignment;
assert(files.length===20,'expected 20 ordered Offline alignment files');
assert.strictEqual(files.at(-1),'supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql','final dispatcher must be LAST');

const live=new Set([
 ...(manifest.live_prerequisites?.functions||[]),
 ...(manifest.live_prerequisites?.tables||[])
]);
const seenFunctions=new Set();
const seenTables=new Set(manifest.live_prerequisites?.tables||[]);
const owner=new Map();
const collisions=[];
const unresolved=[];

function defs(src){return [...src.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-zA-Z0-9_]+)\s*\(/gi)].map(m=>m[1])}
function tables(src){return [...src.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)/gi)].map(m=>m[1])}
function refs(src){return [...src.matchAll(/\bpublic\.([a-zA-Z0-9_]+)\s*\(/g)].map(m=>m[1])}
function assertDollarQuotes(file,src){
 const bad=src.split('\n').map((line,i)=>({line:i+1,text:line})).filter(x=>{
   const line=x.text;
   return (line.includes('as 
for(const file of files){
 const src=fs.readFileSync(file,'utf8');
 assertDollarQuotes(file,src);
 const fd=[...new Set(defs(src))],td=[...new Set(tables(src))],rr=[...new Set(refs(src))];
 const same=new Set([...fd,...td]);
 for(const name of rr){
   if(same.has(name)||live.has(name)||seenFunctions.has(name)||seenTables.has(name))continue;
   unresolved.push(file+': '+name);
 }
 for(const name of fd){
   if(owner.has(name))collisions.push(name+' => '+owner.get(name)+' / '+file);
   else owner.set(name,file);
 }
 fd.forEach(x=>seenFunctions.add(x));td.forEach(x=>seenTables.add(x));
}
assert.deepStrictEqual(unresolved,[],'unresolved public dependencies:\n'+unresolved.join('\n'));
assert.deepStrictEqual(collisions,[],'function definition collisions:\n'+collisions.join('\n'));

const combined=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const publicFinalDefs=[...combined.matchAll(/create\s+or\s+replace\s+function\s+public\.sharawla_offline_v2_apply_event\s*\(/gi)];
assert.strictEqual(publicFinalDefs.length,1,'public final dispatcher must be defined exactly once across deployment sequence');

const refFile=fs.readFileSync('supabase-offline-v2-restaurant-reference-owners-v1.sql','utf8');
const refTable=refFile.indexOf('create table if not exists public.offline_restaurant_reference_receipts_v1');
const refOwner=refFile.indexOf('create or replace function public.offline_food_supplier_save_v1');
assert(refTable>=0&&refOwner>refTable,'restaurant reference receipt table must be created before owners');

const retailFile=fs.readFileSync('supabase-rc1-offline-v2-retail-purchasing-owners-v1.sql','utf8');
for(const table of ['retail_offline_supplier_receipts','retail_offline_po_approval_receipts']){
 const ti=retailFile.indexOf('create table if not exists public.'+table);
 const fi=retailFile.indexOf('create or replace function public.offline_retail_supplier_create_v1');
 assert(ti>=0&&fi>ti,table+' must be created before Retail Offline owners');
}

const finalSrc=fs.readFileSync(files.at(-1),'utf8');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_reference_v1(jsonb) from public,anon,authenticated'),'reference helper must remain private');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_modern_v1(jsonb) from public,anon,authenticated'),'modern helper must remain private');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_alignment_special_v1(jsonb) from public,anon,authenticated'),'special helper must remain private');
assert(finalSrc.includes('grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated'),'final public dispatcher grant missing');

const hr=fs.readFileSync(manifest.hr_alignment[0],'utf8');
assertDollarQuotes(manifest.hr_alignment[0],hr);
const hrTables=[...new Set(tables(hr))];
const firstHrFunction=hr.search(/create\s+or\s+replace\s+function\s+public\./i);
assert(hrTables.length===16,'HR extension table count drifted');
for(const table of hrTables){
 const ti=hr.indexOf('create table if not exists public.'+table);
 assert(ti>=0&&ti<firstHrFunction,'HR table '+table+' must be defined before HR runtime functions');
}
for(const dep of ['permission_actions_v2','branches','employees','hr_employees','hr_payroll_items','hr_employee_adjustments','audit_logs','hr_payroll_periods','treasury_movements'])
 assert(manifest.live_prerequisites.tables.includes(dep),'HR live table prerequisite missing from manifest: '+dep);
for(const dep of ['has_action_permission_v2','has_branch_access','current_employee_id'])
 assert(manifest.live_prerequisites.functions.includes(dep),'HR live function prerequisite missing from manifest: '+dep);

console.log('RC1 Final Definition Simulation PASS — offline_files='+files.length+'; collisions=0; unresolved_dependencies=0; final_dispatcher_defs=1; HR_tables='+hrTables.length);
)&&!line.includes('as $'))||line.includes('end;$;');
 });
 assert.deepStrictEqual(bad,[],file+' contains malformed single-dollar PL/pgSQL delimiters: '+JSON.stringify(bad));
 const pairs=(src.match(/\$\$/g)||[]).length;
 assert.strictEqual(pairs%2,0,file+' has unbalanced $ delimiters');
}

for(const file of files){
 const src=fs.readFileSync(file,'utf8');
 const fd=[...new Set(defs(src))],td=[...new Set(tables(src))],rr=[...new Set(refs(src))];
 const same=new Set([...fd,...td]);
 for(const name of rr){
   if(same.has(name)||live.has(name)||seenFunctions.has(name)||seenTables.has(name))continue;
   unresolved.push(file+': '+name);
 }
 for(const name of fd){
   if(owner.has(name))collisions.push(name+' => '+owner.get(name)+' / '+file);
   else owner.set(name,file);
 }
 fd.forEach(x=>seenFunctions.add(x));td.forEach(x=>seenTables.add(x));
}
assert.deepStrictEqual(unresolved,[],'unresolved public dependencies:\n'+unresolved.join('\n'));
assert.deepStrictEqual(collisions,[],'function definition collisions:\n'+collisions.join('\n'));

const combined=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const publicFinalDefs=[...combined.matchAll(/create\s+or\s+replace\s+function\s+public\.sharawla_offline_v2_apply_event\s*\(/gi)];
assert.strictEqual(publicFinalDefs.length,1,'public final dispatcher must be defined exactly once across deployment sequence');

const refFile=fs.readFileSync('supabase-offline-v2-restaurant-reference-owners-v1.sql','utf8');
const refTable=refFile.indexOf('create table if not exists public.offline_restaurant_reference_receipts_v1');
const refOwner=refFile.indexOf('create or replace function public.offline_food_supplier_save_v1');
assert(refTable>=0&&refOwner>refTable,'restaurant reference receipt table must be created before owners');

const retailFile=fs.readFileSync('supabase-rc1-offline-v2-retail-purchasing-owners-v1.sql','utf8');
for(const table of ['retail_offline_supplier_receipts','retail_offline_po_approval_receipts']){
 const ti=retailFile.indexOf('create table if not exists public.'+table);
 const fi=retailFile.indexOf('create or replace function public.offline_retail_supplier_create_v1');
 assert(ti>=0&&fi>ti,table+' must be created before Retail Offline owners');
}

const finalSrc=fs.readFileSync(files.at(-1),'utf8');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_reference_v1(jsonb) from public,anon,authenticated'),'reference helper must remain private');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_modern_v1(jsonb) from public,anon,authenticated'),'modern helper must remain private');
assert(finalSrc.includes('revoke all on function public.sharawla_offline_v2_apply_event_alignment_special_v1(jsonb) from public,anon,authenticated'),'special helper must remain private');
assert(finalSrc.includes('grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated'),'final public dispatcher grant missing');

const hr=fs.readFileSync(manifest.hr_alignment[0],'utf8');
const hrTables=[...new Set(tables(hr))];
const firstHrFunction=hr.search(/create\s+or\s+replace\s+function\s+public\./i);
assert(hrTables.length===16,'HR extension table count drifted');
for(const table of hrTables){
 const ti=hr.indexOf('create table if not exists public.'+table);
 assert(ti>=0&&ti<firstHrFunction,'HR table '+table+' must be defined before HR runtime functions');
}
for(const dep of ['permission_actions_v2','branches','employees','hr_employees','hr_payroll_items','hr_employee_adjustments','audit_logs','hr_payroll_periods','treasury_movements'])
 assert(manifest.live_prerequisites.tables.includes(dep),'HR live table prerequisite missing from manifest: '+dep);
for(const dep of ['has_action_permission_v2','has_branch_access','current_employee_id'])
 assert(manifest.live_prerequisites.functions.includes(dep),'HR live function prerequisite missing from manifest: '+dep);

console.log('RC1 Final Definition Simulation PASS — offline_files='+files.length+'; collisions=0; unresolved_dependencies=0; final_dispatcher_defs=1; HR_tables='+hrTables.length);
