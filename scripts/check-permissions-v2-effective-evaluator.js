const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'permissions-v2-effective-evaluator.sql');
const src=fs.readFileSync(file,'utf8');
const lower=src.toLowerCase();

function need(token){
  if(!lower.includes(token.toLowerCase()))throw new Error('PV2-C contract missing: '+token);
}

for(const token of [
  'create table if not exists sharawla_internal.operational_feature_entitlements_v1',
  'cloud_business_id uuid not null',
  'feature_code text not null',
  'enabled boolean not null',
  'entitlement_version bigint not null',
  'primary key(cloud_business_id,feature_code)',
  'operational_feature_entitled_v1',
  'role_action_default_state_v2',
  "to_regclass('public.permission_role_action_defaults_v2')",
  'evaluate_action_permission_v2',
  'ACTION_UNKNOWN_OR_INAPPLICABLE',
  'FEATURE_NOT_ENTITLED',
  'ALLOW_USER_OVERRIDE',
  'DENY_USER_OVERRIDE',
  'ALLOW_ROLE_DEFAULT',
  'DENY_ROLE_DEFAULT',
  'ROLE_DEFAULT_MISSING',
  'ALLOW_LEGACY_TRANSITION',
  'DENY_LEGACY_TRANSITION',
  'create or replace function public.has_action_permission_v2(p_action_code text)'
])need(token);

if(/insert\s+into\s+sharawla_internal\.operational_feature_entitlements_v1/i.test(src))
  throw new Error('PV2-C must not provision Cloud Feature entitlement rows');

if(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.permission_role_action_defaults_v2/i.test(src))
  throw new Error('PV2-C must not take ownership of PV2-E Role-default schema');

if(/91826502-590e-4afa-8826-2c0f4b99c490/i.test(src))
  throw new Error('PV2-C generic source must not hardcode SH-0007 Business id');

for(const role of ['public','anon','authenticated']){
  const re=new RegExp('grant\\s+(?:all|insert|update|delete|select|execute|usage)[^;]*sharawla_internal[^;]*\\b'+role+'\\b','i');
  if(re.test(src))throw new Error('PV2-C must not grant private evaluator/projection access to '+role);
}

need('revoke all on table sharawla_internal.operational_feature_entitlements_v1 from public,anon,authenticated');
need('revoke all on function sharawla_internal.evaluate_action_permission_v2(text) from public,anon,authenticated');
need('grant execute on function public.has_action_permission_v2(text) to authenticated');

const evalStart=lower.indexOf('create or replace function sharawla_internal.evaluate_action_permission_v2');
const evalEnd=lower.indexOf('-- preserve the public contract',evalStart);
if(evalStart<0||evalEnd<0)throw new Error('PV2-C evaluator body boundary missing');
const evalBody=lower.slice(evalStart,evalEnd);
function before(a,b){
  const ia=evalBody.indexOf(a.toLowerCase()),ib=evalBody.indexOf(b.toLowerCase());
  if(ia<0||ib<0||ia>=ib)throw new Error('PV2-C evaluator ordering invalid: '+a+' must precede '+b);
}
before('current_operational_profile_v1()','ACTION_UNKNOWN_OR_INAPPLICABLE');
before('ACTION_UNKNOWN_OR_INAPPLICABLE','FEATURE_NOT_ENTITLED');
before('FEATURE_NOT_ENTITLED','role_action_default_state_v2(profile_code,role_code,v_action)');
before('role_action_default_state_v2(profile_code,role_code,v_action)','from public.employee_action_permissions_v2');
before('from public.employee_action_permissions_v2','ALLOW_USER_OVERRIDE');
before('ROLE_DEFAULT_MISSING','ALLOW_LEGACY_TRANSITION');

if(!/from\s+sharawla_internal\.evaluate_action_permission_v2\(p_action_code\)/i.test(src))
  throw new Error('PV2-C public has_action_permission_v2 must delegate to private effective evaluator');

console.log('PV2-C effective permission evaluator SOURCE PASS');
