const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-beta55-restaurant-acceptance.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH8_RESTAURANT_CLEANUP_FAIL '+m);process.exit(1)}
function fn(name){const a=s.indexOf('create or replace function public.'+name+'(');if(a<0)fail(name+':missing');let e=s.indexOf('\ncreate or replace function public.',a+20);if(e<0)e=s.length;return s.slice(a,e)}
const c=fn('sharawla_beta55_restaurant_acceptance_cleanup_v1');
const pre=c.indexOf("select coalesce(array_agg(id),array[]::bigint[]) into v_shifts");
const freeze=c.indexOf('for v_stock_identity in',pre);
const evidence=c.indexOf('select distinct sm.branch_id,sm.ingredient_id',freeze);
const scope=c.indexOf('sm.ingredient_id=any(v_ingredients)',evidence);
const order=c.indexOf('order by sm.branch_id,sm.ingredient_id',scope);
const guard=c.indexOf('inventory_stock_assert_legacy_write_allowed_v2',order);
const firstDelete=c.indexOf('delete from public.restaurant_table_session_orders');
if(!(pre>=0&&freeze>pre&&evidence>freeze&&scope>evidence&&order>scope&&guard>order&&firstDelete>guard))fail('freeze-guard-boundary');
if(!/inventory_stock_assert_legacy_write_allowed_v2\s*\(\s*v_stock_identity\.branch_id\s*,\s*'ingredient'\s*,\s*v_stock_identity\.ingredient_id\s*\)/i.test(c.slice(guard,firstDelete)))fail('guard-identity');
if((c.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==1)fail('guard-count');
if(/delete\s+from|update\s+public\.|insert\s+into/i.test(c.slice(pre,guard)))fail('mutation-before-guard');
if(!/delete from public\.stock_movements where ingredient_id=any\(v_ingredients\)/i.test(c))fail('cleanup-stock-movements-scope');
if(!/delete from public\.ingredient_stock where ingredient_id=any\(v_ingredients\)/i.test(c))fail('cleanup-ingredient-stock-scope');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(c))fail('activation');
console.log('BATCH8_RESTAURANT_CLEANUP_PASS functions=1 evidence=stock_movements tuple=branch_id+ingredient_id freeze_before_mutation=1 guard_all=1 deterministic_order=1 activation=0');
