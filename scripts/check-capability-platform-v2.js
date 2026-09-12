'use strict';

const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const migrationPath=path.join(root,'supabase-capability-platform-v2-category-inheritance.sql');
const docPath=path.join(root,'docs','SHARAWLA-CAPABILITY-PLATFORM-V2.md');

function fail(msg){console.error(`CAPABILITY V2 FAIL: ${msg}`);process.exit(1);}
function ok(cond,msg){if(!cond)fail(msg);}
function has(text,needle,msg){ok(text.includes(needle),msg||`missing ${needle}`);}

ok(fs.existsSync(migrationPath),'migration file missing');
ok(fs.existsSync(docPath),'architecture document missing');
const sql=fs.readFileSync(migrationPath,'utf8');
const doc=fs.readFileSync(docPath,'utf8');

[
  'activity_category_features',
  'feature_class',
  "'core','standard','add_on','planned'",
  'admin_get_business_feature_matrix_v2',
  'admin_get_activity_category_feature_matrix',
  'admin_set_activity_category_features',
  'admin_reset_activity_category_features',
  'get_sharawla_business_runtime_config_v2',
  "'capability_version',2",
  "r.feature_class='core'",
  'feature_dependencies'
].forEach(x=>has(sql,x));

// V2 must not target production devices/business rows in a data migration.
for(const forbidden of [
  'SH-0005','SH-0006',
  '3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7'
]){
  ok(!sql.includes(forbidden),`migration must not target Production identifier ${forbidden}`);
}

// No automatic Category seed: the table may be created, but there must be no INSERT
// into it outside the explicit Admin setter function body. The migration must document
// no-row inheritance and runtime must read Category as an override layer.
has(sql,'No row means inherit the Profile baseline','missing no-row inheritance contract');
has(sql,'coalesce(r.c_enabled,r.p_enabled,false)','runtime Category/Profile precedence missing');
has(sql,'when r.b_enabled is not null then r.b_enabled','runtime Business precedence missing');
has(sql,"r.feature_class<>'planned'",'planned capabilities must be excluded at runtime');

// Admin RPCs must stay hardened.
for(const fn of [
  'admin_get_business_feature_matrix_v2(uuid)',
  'admin_get_activity_category_feature_matrix(uuid)',
  'admin_set_activity_category_features(uuid,text[],text[])',
  'admin_reset_activity_category_features(uuid)'
]){
  has(sql,`revoke all on function public.${fn} from public, anon`,`missing revoke for ${fn}`);
  has(sql,`grant execute on function public.${fn} to authenticated, service_role`,`missing grant for ${fn}`);
}

has(doc,'Core lock -> Profile -> Activity Category -> Business','documentation precedence missing');
has(doc,'not a full table-management system','food.tables semantic warning missing');

console.log('Capability Platform V2 static gate PASS');
