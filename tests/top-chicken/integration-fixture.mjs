import fs from 'node:fs';
import {setupDatabase,db,q,TC,OTHER,login} from './pg16.mjs';
const meta=JSON.parse(fs.readFileSync('evidence/top-chicken/website-dependency-metadata.json','utf8'));
const staff=JSON.parse(fs.readFileSync('evidence/top-chicken/staff-profile-metadata.json','utf8'));
const qi=s=>'"'+s.replaceAll('"','""')+'"';
export async function setupIntegration({realAuth=false}={}){
  await setupDatabase();
  // The original order fixture has a two-column identity stub. Restore the live metadata
  // before testing the unchanged legacy fallback, with synthetic singleton provenance.
  const identity=staff.tables.find(t=>t.name==='operational_business_identity_v1');
  const columns=new Set((await q("select column_name from information_schema.columns where table_schema='sharawla_internal' and table_name='operational_business_identity_v1'")).map(r=>r.column_name));
  const values={id:'1',binding_version:'1',source:"'isolated-fixture'"};
  for(const c of identity.columns){
    if(!columns.has(c.name)){
      const temporary=c.default||values[c.name];
      await db.exec(`ALTER TABLE sharawla_internal.operational_business_identity_v1 ADD COLUMN ${qi(c.name)} ${c.type}${temporary?` DEFAULT ${temporary}`:''}${c.notnull?' NOT NULL':''}`);
      if(!c.default&&temporary)await db.exec(`ALTER TABLE sharawla_internal.operational_business_identity_v1 ALTER COLUMN ${qi(c.name)} DROP DEFAULT`);
    }else if(c.notnull)await db.exec(`ALTER TABLE sharawla_internal.operational_business_identity_v1 ALTER COLUMN ${qi(c.name)} SET NOT NULL`);
  }
  for(const c of identity.constraints)await db.exec(`ALTER TABLE sharawla_internal.operational_business_identity_v1 ADD CONSTRAINT ${qi(c.name)} ${c.definition}`);

  if(!realAuth)await db.exec('CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb);');
  for(let n=1;n<=7;n++)if(!realAuth)await q('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,`fixture${n}@local.test`,{}]);
  const existing=new Set((await q("select tablename from pg_tables where schemaname='public'")).map(x=>x.tablename));
  for(const t of meta.tables)if(!existing.has(t.name)){
    for(const c of t.columns){const match=c.default?.match(/nextval\('([^']+)'::regclass\)/);if(match)await db.exec(`CREATE SEQUENCE IF NOT EXISTS ${match[1]};`);}
    const cols=t.columns.map(c=>`${qi(c.name)} ${c.type}${c.default?` DEFAULT ${c.default}`:''}${c.notnull?' NOT NULL':''}`);
    await db.exec(`CREATE TABLE public.${qi(t.name)} (${cols.join(',')});`);
  }
  // Actual deployed functions are used for tenant selection and UI permissions.
  for(const f of staff.functions.filter(f=>!['current_operational_business_id_v1','current_operational_profile_v1','operational_feature_entitled_v1'].includes(f.name)))await db.exec(f.definition);
  await db.exec("CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;");
  for(const f of meta.functions)if(f.name!=='create_website_order'||f.definition.includes('p_delivery_zone_id'))await db.exec(f.definition);
  const deferred=[];
  for(const t of meta.tables)for(const c of t.constraints||[])if(c.type!=='f'&&!(await q('select 1 from pg_constraint where conname=$1 and conrelid=$2::regclass',[c.name,'public.'+t.name])).length)await db.exec(`ALTER TABLE public.${qi(t.name)} ADD CONSTRAINT ${qi(c.name)} ${c.definition};`);
  for(const t of meta.tables)for(const idx of t.indexes||[])await db.exec(idx.replace('CREATE UNIQUE INDEX ','CREATE UNIQUE INDEX IF NOT EXISTS ').replace('CREATE INDEX ','CREATE INDEX IF NOT EXISTS '));
  const restored=new Set([...meta.tables.map(t=>'public.'+t.name),'auth.users','public.businesses']);
  for(const t of meta.tables)for(const c of t.constraints||[])if(c.type==='f'&&!(await q('select 1 from pg_constraint where conname=$1 and conrelid=$2::regclass',[c.name,'public.'+t.name])).length){
    const ref=c.ref.includes('.')?c.ref:'public.'+c.ref;
    if(restored.has(ref))deferred.push(`ALTER TABLE public.${qi(t.name)} ADD CONSTRAINT ${qi(c.name)} ${c.definition};`);
  }
  // Auth FKs are checked after real GoTrue fixture identities are provisioned in CI.
  for(const s of deferred)await db.exec(s);
  const selected=['orders','website_orders','website_order_items','website_order_item_modifiers','order_items','order_item_modifiers','customers','customer_addresses','branch_invoice_counters','shift_bon_counters','employees','employee_branches','employee_permissions','employee_action_permissions_v2','business_auth_memberships'];
  for(const t of meta.tables)if(selected.includes(t.name))for(const tr of t.triggers||[]){
    if(/BEFORE DELETE/.test(tr.definition))continue;
    await db.exec(tr.function_definition);
    const name=tr.definition.match(/CREATE TRIGGER (\S+)/)[1];
    if(!(await q('select 1 from pg_trigger where tgname=$1 and tgrelid=$2::regclass',[name,'public.'+t.name])).length)await db.exec(tr.definition);
  }
  for(const t of meta.tables)if(t.rls)await db.exec(`ALTER TABLE public.${qi(t.name)} ENABLE ROW LEVEL SECURITY;`);
  for(const p of meta.policies)await db.exec(`CREATE POLICY ${qi(p.policyname)} ON public.${qi(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(qi).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''};`);
  for(const g of meta.grants)await db.exec(`GRANT ${g.privilege_type} ON public.${qi(g.table_name)} TO ${qi(g.grantee)};`);
  // Existing explicit IDs never reset live counters. These sequences exist only in the new fixture.
  if(!(await q("select to_regclass('public.employees_id_seq') as id"))[0].id)await db.exec('CREATE SEQUENCE public.employees_id_seq START 10000;');
  for(const name of ['orders','website_orders','website_order_items','website_order_item_modifiers','order_items','order_item_modifiers','customers','customer_addresses']){
    await db.exec(`CREATE SEQUENCE IF NOT EXISTS public.${name}_id_seq START 20000;`);
    await db.exec(`ALTER TABLE public.${name} ALTER COLUMN id SET DEFAULT nextval('public.${name}_id_seq');`);
  }
  await db.exec(fs.readFileSync('supabase/top-chicken-staff-provisioning-CANDIDATE.sql','utf8'));
  await login(1);await db.exec('RESET ROLE');
  await q('update sharawla_internal.operational_business_identity_v1 set cloud_business_id=$1',[OTHER]);
  await q("insert into public.categories(id,name,sort_order,active,business_id) values(1,'Synthetic menu',1,true,$1)",[TC]);
  await q("insert into public.products(id,category_id,name,price,cost,active,website_visible,business_id) values(100,1,'Synthetic sandwich',90,30,true,true,$1)",[TC]);
  await q('insert into public.branch_products(id,branch_id,product_id,active,business_id) values(1,22,100,true,$1)',[TC]);
  await q("insert into public.delivery_zones(id,name,branch_id,delivery_fee,active,business_id) values(1,'Synthetic zone',22,10,true,$1)",[TC]);
  await q('update public.branch_payment_methods set website_enabled=true where branch_id=22');
  await q('insert into public.branch_website_settings(branch_id,orders_open,schedule_enabled,business_id) values(22,true,false,$1)',[TC]);
  await q("insert into public.shifts(id,branch_id,employee_id,status,business_id) values(1,22,2,'open',$1)",[TC]);
  return {deferred,metadata:meta};
}
export {db,q,login,TC,OTHER};
