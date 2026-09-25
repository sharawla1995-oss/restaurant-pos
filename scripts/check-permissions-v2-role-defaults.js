const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'permissions-v2-role-defaults.sql');
const src=fs.readFileSync(file,'utf8');
const lower=src.toLowerCase();

function need(token){
  if(!lower.includes(token.toLowerCase()))throw new Error('PV2-E contract missing: '+token);
}

for(const token of [
  "assert_operational_profile_v1('restaurant')",
  'create table if not exists public.permission_role_action_defaults_v2',
  'primary key(profile_code,role_code,action_code)',
  'revoke all on table public.permission_role_action_defaults_v2 from public,anon,authenticated',
  "'restaurant-runtime-role-pages-58.29'",
  "values ('admin'),('cashier'),('callcenter'),('delivery')",
  'create table if not exists sharawla_internal.permission_role_migration_evidence_v1',
  "'PV2-E-RESTAURANT-58.29'",
  'explicit_override_before',
  'legacy_allowed is distinct from ev.role_default_allowed',
  'on conflict(employee_id,action_code) do nothing',
  'admin_permission_role_migration_summary_v1',
  'effective_mismatches'
])need(token);

if(/update\s+public\.employee_action_permissions_v2/i.test(src))
  throw new Error('PV2-E must not overwrite pre-existing explicit Action overrides');

if(/on\s+conflict\s*\(employee_id,action_code\)\s*do\s+update/i.test(src))
  throw new Error('PV2-E preservation must never update an existing employee Action override');

if(/91826502-590e-4afa-8826-2c0f4b99c490/i.test(src))
  throw new Error('PV2-E source must not hardcode SH-0007 Business id');

if(!/employee_permissions\s+ep[\s\S]*ep\.allowed\s*=\s*true/i.test(src))
  throw new Error('PV2-E must preserve the backend persisted legacy permission result');

if(!/explicit_override_before\s+is\s+null/i.test(src))
  throw new Error('PV2-E must preserve existing explicit Action overrides');

if(!/begin;[\s\S]*insert into public\.permission_role_action_defaults_v2[\s\S]*insert into sharawla_internal\.permission_role_migration_evidence_v1[\s\S]*insert into public\.employee_action_permissions_v2[\s\S]*commit;/i.test(src))
  throw new Error('PV2-E defaults + evidence + preservation must commit atomically');

if(/grant\s+(?:all|insert|update|delete).*permission_role_action_defaults_v2.*authenticated/i.test(src))
  throw new Error('PV2-E must not grant direct authenticated Role-default writes');

console.log('PV2-E role defaults + legacy-preservation SOURCE PASS');
