const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-beta55-acceptance-supply.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH9_SUPPLY_CLEANUP_FAIL '+m);process.exit(1)}
function fn(name){const a=s.indexOf('create or replace function public.'+name+'(');if(a<0)fail(name+':missing');let e=s.indexOf('\ncreate or replace function public.',a+20);if(e<0)e=s.length;return s.slice(a,e)}
const c=fn('sharawla_beta55_supply_acceptance_cleanup_v1');
const product=c.indexOf("select id into v_product from public.products");
const freeze=c.indexOf('for v_balance_identity in',product);
const distinct=c.indexOf('select distinct b.branch_id,b.product_id',freeze);
const p1=c.indexOf('v_product is not null',distinct), or1=c.indexOf('b.product_id=v_product or b.branch_id in (v_wh,v_br)',p1);
const p2=c.indexOf('v_product is null',or1), branchOnly=c.indexOf('b.branch_id in (v_wh,v_br)',p2);
const order=c.indexOf('order by b.branch_id,b.product_id',branchOnly);
const guard=c.indexOf('inventory_stock_assert_legacy_write_allowed_v2',order);
const firstDelete=c.indexOf('delete from public.audit_logs a');
if(!(product>=0&&freeze>product&&distinct>freeze&&p1>distinct&&or1>p1&&p2>or1&&branchOnly>p2&&order>branchOnly&&guard>order&&firstDelete>guard))fail('freeze-guard-boundary');
if(!/inventory_stock_assert_legacy_write_allowed_v2\s*\(\s*v_balance_identity\.branch_id\s*,\s*'product'\s*,\s*v_balance_identity\.product_id\s*\)/i.test(c.slice(guard,firstDelete)))fail('guard-identity');
if((c.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==1)fail('guard-count');
if(/delete\s+from|update\s+public\.|insert\s+into/i.test(c.slice(product,guard)))fail('mutation-before-guard');
const after=c.slice(firstDelete);
if(/select\s+distinct\s+b\.branch_id\s*,\s*b\.product_id\s+from\s+public\.retail_inventory_balances/i.test(after))fail('ownership-rediscovery');
if(!/delete from public\.retail_inventory_balances where product_id=v_product or branch_id in \(v_wh,v_br\)/i.test(c))fail('delete-product-or-branches');
if(!/delete from public\.retail_inventory_balances where branch_id in \(v_wh,v_br\)/i.test(c))fail('delete-branches-only');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(c))fail('activation');
console.log('BATCH9_SUPPLY_CLEANUP_PASS functions=1 exact_or_predicate=1 distinct=1 deterministic_order=1 freeze_before_audit_delete=1 guard_all=1 rediscovery=0 activation=0');
