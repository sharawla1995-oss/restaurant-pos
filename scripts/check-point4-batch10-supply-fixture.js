const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-beta55-acceptance-supply.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH10_SUPPLY_FIXTURE_FAIL '+m);process.exit(1)}
function fn(name){const a=s.indexOf('create or replace function public.'+name+'(');if(a<0)fail(name+':missing');let e=s.indexOf('\ncreate or replace function public.',a+20);if(e<0)e=s.length;return s.slice(a,e)}
const c=fn('sharawla_beta55_supply_acceptance_fixture_v1');
const cleanup=c.indexOf('v_clean:=public.sharawla_beta55_supply_acceptance_cleanup_v1');
const cleanupPass=c.indexOf("if coalesce((v_clean->>'residue')::bigint,0)<>0",cleanup);
const wh=c.indexOf("v_wh:=nextval('public.branches_id_seq')",cleanupPass);
const br=c.indexOf("v_br:=nextval('public.branches_id_seq')",wh);
const product=c.indexOf("v_product:=nextval('public.products_id_seq')",br);
const g1=c.indexOf("inventory_stock_assert_legacy_write_allowed_v2(v_wh,'product',v_product)",product);
const g2=c.indexOf("inventory_stock_assert_legacy_write_allowed_v2(v_br,'product',v_product)",g1);
const firstInsert=c.indexOf('insert into public.branches',g2);
if(!(cleanup>=0&&cleanupPass>cleanup&&wh>cleanupPass&&br>wh&&product>br&&g1>product&&g2>g1&&firstInsert>g2))fail('ordering');
if((c.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==2)fail('guard-count');
if((c.match(/nextval\('public\.branches_id_seq'\)/ig)||[]).length!==2||(c.match(/nextval\('public\.products_id_seq'\)/ig)||[]).length!==1)fail('id-allocation-count');
if(/insert\s+into|update\s+public\.|delete\s+from/i.test(c.slice(cleanupPass,wh)))fail('mutation-before-allocation');
if(/insert\s+into|update\s+public\.|delete\s+from/i.test(c.slice(wh,firstInsert)))fail('mutation-before-guards');
if(!/insert into public\.retail_inventory_balances[\s\S]*\(v_wh,v_product,10[\s\S]*\(v_br,v_product,2/i.test(c.slice(firstInsert)))fail('two-balance-identities');
if(/select[\s\S]*retail_inventory_balances/i.test(c.slice(firstInsert)))fail('identity-rediscovery');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(c))fail('activation');
console.log('BATCH10_SUPPLY_FIXTURE_PASS ids_before_first_insert=3 guards=2 same_product=1 locations=warehouse+branch guard_all_before_commitment=1 rediscovery=0 activation=0');
