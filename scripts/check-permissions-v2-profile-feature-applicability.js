const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const mappingPath=path.join(root,'permissions-v2-profile-feature-applicability.sql');
const sql=fs.readFileSync(mappingPath,'utf8');

const validProfiles=new Set(['restaurant','retail','pharmacy','logistics','membership','service','warehouse']);
const mappingRows=[...sql.matchAll(/\('([^']+)'\s*,\s*'([^']+)'\s*,\s*(null|'[^']+')\s*,\s*true\)/g)]
  .map(m=>({action:m[1],profile:m[2],feature:m[3]==='null'?null:m[3].slice(1,-1)}));

if(!mappingRows.length)throw new Error('PV2-A mapping rows missing');

const seen=new Set();
for(const r of mappingRows){
  const k=r.action+'|'+r.profile;
  if(seen.has(k))throw new Error('PV2-A duplicate mapping: '+k);
  seen.add(k);
  if(!validProfiles.has(r.profile))throw new Error('PV2-A unknown profile: '+r.profile);
  if(r.feature!==null&&!r.feature.trim())throw new Error('PV2-A blank feature for '+k);
}

const actionCodes=new Set();
for(const file of fs.readdirSync(root).filter(x=>/^supabase-.*\.sql$/i.test(x))){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  const parts=src.split(/insert\s+into\s+public\.permission_actions_v2\s*\([^)]*\)\s*values/ig).slice(1);
  for(const part of parts){
    const block=part.split(/on\s+conflict|;/i)[0];
    for(const m of block.matchAll(/\(\s*'([^']+)'\s*,/g)) actionCodes.add(m[1]);
  }
}

const mappedActions=new Set(mappingRows.map(x=>x.action));
const missing=[...actionCodes].filter(x=>!mappedActions.has(x)).sort();
if(missing.length)throw new Error('PV2-A actions missing applicability mapping: '+missing.join(', '));

function profilesFor(action){
  return mappingRows.filter(x=>x.action===action).map(x=>x.profile).sort();
}
function expectExact(action,expected){
  const got=profilesFor(action);
  const want=[...expected].sort();
  if(JSON.stringify(got)!==JSON.stringify(want))throw new Error(action+' profiles='+got.join(',')+' expected='+want.join(','));
}

for(const a of [...mappedActions].filter(x=>x.startsWith('logistics.')))expectExact(a,['logistics']);
for(const a of [...mappedActions].filter(x=>x.startsWith('membership.')))expectExact(a,['membership']);
for(const a of [...mappedActions].filter(x=>x.startsWith('service.')))expectExact(a,['service']);
for(const a of [...mappedActions].filter(x=>x.startsWith('food.')||x.startsWith('restaurant.')||['recipe.manage','production.manage','waste.post'].includes(x)))expectExact(a,['restaurant']);
for(const a of [...mappedActions].filter(x=>x.startsWith('delivery.')))expectExact(a,['restaurant','retail','pharmacy']);

for(const token of [
  'create table if not exists public.permission_action_profiles_v2',
  'alter table public.permission_action_profiles_v2 enable row level security',
  'revoke all on table public.permission_action_profiles_v2 from public,anon,authenticated',
  'grant select on table public.permission_action_profiles_v2 to authenticated'
]){
  if(!sql.toLowerCase().includes(token.toLowerCase()))throw new Error('PV2-A security contract missing: '+token);
}

if(/grant\s+(insert|update|delete|all).*permission_action_profiles_v2.*authenticated/i.test(sql))
  throw new Error('PV2-A must not grant authenticated write access');

console.log('PV2-A profile/feature applicability PASS — actions='+actionCodes.size+' mappings='+mappingRows.length);
