const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const hardening=fs.readFileSync(path.join(root,'permissions-v2-owner-customers-create.sql'),'utf8');
const helper=fs.readFileSync(path.join(root,'permissions-v2-customers-create-routing.js'),'utf8');
const owner=fs.readFileSync(path.join(root,'supabase-beta54-shared-customer-foundation.sql'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'beta36-integration-loader.js'),'utf8');

function need(src,token,label){
  if(!src.toLowerCase().includes(token.toLowerCase()))throw new Error(label+' missing: '+token);
}

for(const token of [
  "has_action_permission_v2('customers.create')",
  'create or replace function public.customer_create_v2',
  'insert into public.customers'
])need(owner,token,'PV2-F1 established owner');

for(const token of [
  "to_regprocedure('public.customer_create_v2(text,text,text,text,text)')",
  'drop policy if exists customers_staff_insert on public.customers',
  'revoke insert on table public.customers from public,anon,authenticated',
  'grant select,update on table public.customers to authenticated',
  'grant execute on function public.customer_create_v2(text,text,text,text,text) to authenticated'
])need(hardening,token,'PV2-F1 hardening');

if(/revoke\s+(?:update|delete)\s+on\s+table\s+public\.customers/i.test(hardening))
  throw new Error('PV2-F1 scope must not harden customer edit/delete yet');

for(const token of [
  "rpc('customer_create_v2'",
  'createCustomer',
  'createManyCustomers'
])need(helper,token,'PV2-F1 routing candidate');

if(/rest\(\s*['"]customers['"][\s\S]{0,200}method\s*:\s*['"]POST['"]/i.test(helper))
  throw new Error('PV2-F1 routing candidate must not contain direct customer INSERT fallback');

if(loader.includes('permissions-v2-customers-create-routing.js'))
  throw new Error('PV2-F1 helper must remain unwired before coordinated Beta deploy');

// Freeze the three currently known direct customer-create paths so none is forgotten
// when the Runtime routing switch is authorized.
const directCreates=(app.match(/rest\(\s*['"]customers['"][\s\S]{0,260}?method\s*:\s*['"]POST['"]/g)||[]).length;
if(directCreates!==3)
  throw new Error('PV2-F1 expected exactly 3 current direct customer-create paths, found '+directCreates);

console.log('PV2-F1 Customers Create owner hardening SOURCE PREP PASS — direct paths frozen='+directCreates);
