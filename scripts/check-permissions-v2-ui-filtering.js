const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'permissions-v2-ui-filtering.sql'),'utf8');
const ui=fs.readFileSync(path.join(root,'permissions-v2-ui-profile-filtered.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'beta36-integration-loader.js'),'utf8');

function need(src,token,label){
  if(!src.toLowerCase().includes(token.toLowerCase()))throw new Error(label+' missing: '+token);
}

for(const token of [
  'create or replace function public.admin_list_permission_actions_v2(p_employee_id bigint)',
  'current_operational_profile_v1()',
  'permission_action_profiles_v2',
  'operational_feature_entitled_v1(pap.required_feature_code)',
  "to_regclass('public.permission_role_action_defaults_v2')",
  "'role_default'::text",
  "'legacy_transition'::text",
  'revoke all on function public.admin_list_permission_actions_v2(bigint) from public,anon',
  'grant execute on function public.admin_list_permission_actions_v2(bigint) to authenticated'
])need(sql,token,'PV2-D SQL');

if(/p_profile_code|p_feature_codes|p_enabled_features/i.test(sql))
  throw new Error('PV2-D list RPC must not accept client-supplied Profile/Feature authority');

if(!/auth\.uid\(\)\s+is\s+null\s+or\s+not\s+public\.is_admin\(\)/i.test(sql))
  throw new Error('PV2-D list RPC must be Admin-only');

if(/grant\s+(?:all|insert|update|delete).*permission_action_profiles_v2.*authenticated/i.test(sql))
  throw new Error('PV2-D must not add applicability write grants');

for(const token of [
  "rpc('admin_list_permission_actions_v2',{p_employee_id:id})",
  'لا تظهر هنا إلا الإجراءات المسموحة للنشاط والخصائص المفعّلة',
  "mode==='role_default'",
  'admin_reset_employee_action_permission_v2',
  'admin_set_employee_action_permission_v2'
])need(ui,token,'PV2-D UI');

if(/rest\(\s*['"]permission_actions_v2['"]/i.test(ui))
  throw new Error('PV2-D UI must not read the global Action catalog directly');

if(/localStorage|business_type|enabled_features|p_profile_code|p_feature_codes/i.test(ui))
  throw new Error('PV2-D UI must not derive authorization authority client-side');

if(loader.includes('permissions-v2-ui-profile-filtered.js'))
  throw new Error('PV2-D source candidate must remain unwired before coordinated Beta deploy');

if(!loader.includes('permissions-v2-ui.js'))
  throw new Error('PV2-D source-only gate expects existing runtime UI to remain wired');

console.log('PV2-D profile/feature-aware UI filtering SOURCE PASS');
