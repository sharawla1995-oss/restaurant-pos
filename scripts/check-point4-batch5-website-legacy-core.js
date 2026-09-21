const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-point4-pre-cutover-46-guard-installation-batch5-website-legacy-core.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH5_WEBSITE_LEGACY_CORE_FAIL '+m);process.exit(1)}
const defs=[...s.matchAll(/create or replace function\s+public\.([a-z0-9_]+)\s*\(/ig)];
if(defs.length!==1||defs[0][1]!=='retail_create_website_order_beta18_core')fail('scope');
if(!/retail_create_website_order_beta18_core\s*\(\s*p_branch_id bigint,[\s\S]*p_items jsonb\s*\)/i.test(s))fail('signature');
if((s.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==1)fail('guard-count');
const freeze=s.indexOf("if jsonb_array_length(v_frozen_products)=0");
const guard=s.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
const first=s.indexOf('insert into public.retail_inventory_balances',guard);
if(!(freeze>=0&&guard>freeze&&first>guard))fail('freeze-guard-first-write');
const phaseA=s.slice(s.indexOf('-- Phase A:'),guard);
if(/insert\s+into\s+public\.retail_inventory_balances|update\s+public\.retail_stock_reservations/i.test(phaseA))fail('phase-a-dml');
const phaseB=s.slice(s.indexOf('-- Phase B:'),s.indexOf("if jsonb_array_length(v_items)=0"));
if(!/jsonb_to_recordset\s*\(v_frozen_products\)/i.test(phaseB))fail('phase-b-not-frozen');
if(/jsonb_array_elements\s*\(p_items\)/i.test(phaseB))fail('raw-items-rediscovery');
if(!/retail_website_offer_discount\(p_branch_id,v_row\.product_id,v_qty,v_price\)/i.test(phaseB))fail('offer-semantics');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(s))fail('activation-token');
console.log('BATCH5_WEBSITE_LEGACY_CORE_PASS functions=1 guards=1 frozen=v_frozen_products phaseA_dml=0 raw_rediscovery_after_freeze=0 offer_phase=B activation=0');