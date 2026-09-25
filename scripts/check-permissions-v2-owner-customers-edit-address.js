const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'permissions-v2-owner-customers-edit-address.sql'),'utf8');
const helper=fs.readFileSync(path.join(root,'permissions-v2-customers-edit-address-routing.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'beta36-integration-loader.js'),'utf8');

function need(src,token,label){
  if(!src.toLowerCase().includes(token.toLowerCase()))throw new Error(label+' missing: '+token);
}

for(const token of [
  "('customers.edit','تعديل بيانات العميل'",
  "('customers.address.manage','إدارة عناوين العميل'",
  "'core.customers'",
  "assert_operational_profile_v1('restaurant')",
  'permission_role_action_defaults_v2',
  "has_action_permission_v2('customers.edit')",
  "has_action_permission_v2('customers.address.manage')",
  'create or replace function public.customer_update_v2',
  'create or replace function public.customer_address_save_v2',
  'create or replace function public.customer_address_delete_v2',
  'drop policy if exists customers_staff_update on public.customers',
  'revoke update on table public.customers from public,anon,authenticated',
  'drop policy if exists customer_addresses_staff_write on public.customer_addresses',
  'revoke insert,update,delete on table public.customer_addresses from public,anon,authenticated'
])need(sql,token,'PV2-F2 SQL');

for(const profile of ['restaurant','retail','pharmacy','logistics','membership','warehouse','service']){
  if(!sql.includes("('"+profile+"')"))throw new Error('PV2-F2 missing applicability profile '+profile);
}

for(const token of [
  "rpc('customer_update_v2'",
  "rpc('customer_address_save_v2'",
  "rpc('customer_address_delete_v2'",
  'updateCustomer',
  'saveAddress',
  'deleteAddress'
])need(helper,token,'PV2-F2 routing candidate');

if(/rest\(\s*['"](?:customers|customer_addresses)['"][\s\S]{0,240}?method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/i.test(helper))
  throw new Error('PV2-F2 routing candidate must not contain direct customer/address DML fallback');

if(loader.includes('permissions-v2-customers-edit-address-routing.js'))
  throw new Error('PV2-F2 helper must remain unwired before coordinated Beta deploy');

function count(re){return (app.match(re)||[]).length}
const counts={
  customerPatches:count(/rest\(\s*['"]customers['"][\s\S]{0,320}?method\s*:\s*['"]PATCH['"]/g),
  addressPosts:count(/rest\(\s*['"]customer_addresses['"][\s\S]{0,320}?method\s*:\s*['"]POST['"]/g),
  addressPatches:count(/rest\(\s*['"]customer_addresses['"][\s\S]{0,320}?method\s*:\s*['"]PATCH['"]/g),
  addressDeletes:count(/rest\(\s*['"]customer_addresses['"][\s\S]{0,320}?method\s*:\s*['"]DELETE['"]/g)
};
const expected={customerPatches:2,addressPosts:2,addressPatches:1,addressDeletes:1};
for(const k of Object.keys(expected))if(counts[k]!==expected[k])
  throw new Error('PV2-F2 direct path count drift '+k+'='+counts[k]+' expected='+expected[k]);

if(/on\s+conflict\s*\(employee_id,action_code\)\s*do\s+update/i.test(sql))
  throw new Error('PV2-F2 must not overwrite existing explicit Action overrides');

console.log('PV2-F2 Customers Edit/Address owner hardening SOURCE PREP PASS — '+JSON.stringify(counts));
