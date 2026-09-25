const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'permissions-v2-trusted-profile-binding.sql');
const src=fs.readFileSync(file,'utf8');

for(const token of [
  'create schema if not exists sharawla_internal',
  'operational_business_identity_v1',
  'current_operational_profile_v1',
  'current_operational_business_id_v1',
  'assert_operational_profile_v1',
  'assert_operational_profile_allowed_v1',
  'OPERATIONAL_PROFILE_BINDING_MISSING',
  'PROFILE_MISMATCH'
]){
  if(!src.includes(token))throw new Error('PV2-B trusted profile contract missing: '+token);
}

if(!/check\s*\(id\s*=\s*1\)/i.test(src))
  throw new Error('PV2-B singleton identity constraint missing');

if(/insert\s+into\s+sharawla_internal\.operational_business_identity_v1/i.test(src))
  throw new Error('PV2-B source contract must not provision a Business/Profile binding row');

if(/91826502-590e-4afa-8826-2c0f4b99c490/i.test(src))
  throw new Error('PV2-B generic source contract must not hardcode the SH-0007 Business');

for(const role of ['public','anon','authenticated']){
  const re=new RegExp('grant\\s+(?:all|insert|update|delete|select|execute|usage)[^;]*sharawla_internal[^;]*\\b'+role+'\\b','i');
  if(re.test(src))throw new Error('PV2-B must not grant private identity access to '+role);
}

if(!/revoke\s+all\s+on\s+schema\s+sharawla_internal\s+from\s+public,anon,authenticated/i.test(src))
  throw new Error('PV2-B private schema revoke contract missing');

for(const fn of [
  'current_operational_profile_v1\(\)',
  'current_operational_business_id_v1\(\)',
  'assert_operational_profile_v1\(text\)',
  'assert_operational_profile_allowed_v1\(text\[\]\)'
]){
  const re=new RegExp('revoke\\s+all\\s+on\\s+function\\s+sharawla_internal\\.'+fn+'\\s+from\\s+public,anon,authenticated','i');
  if(!re.test(src))throw new Error('PV2-B execute revoke missing for '+fn);
}

console.log('PV2-B trusted operational profile binding SOURCE PASS');
