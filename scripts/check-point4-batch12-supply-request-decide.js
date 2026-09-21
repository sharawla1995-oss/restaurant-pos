const fs=require('fs'),s=fs.readFileSync('supabase-beta55-central-warehouse-foundation.sql','utf8');
function fail(m){console.error('BATCH12_SUPPLY_REQUEST_DECIDE_FAIL '+m);process.exit(1)}
const a=s.indexOf('create or replace function public.inventory_supply_request_decide_v1('),e=s.indexOf('\ncreate or replace function public.',a+20),c=s.slice(a,e<0?s.length:e);
const replay=c.indexOf("if v_q.status in ('approved','rejected') then return v_q.id;end if;");
const validate=c.indexOf("if coalesce(p_approve,false)=true then",replay);
const freeze=c.indexOf("v_frozen_approved:=v_frozen_approved||jsonb_build_array(v_frozen_item)",validate);
const positive=c.indexOf("if v_positive=0 then raise exception",validate);
const guard=c.indexOf("inventory_stock_assert_document_workflow_allowed_v2(",positive);
const firstUpdate=c.indexOf("update public.inventory_supply_requests set status='rejected'",guard);
const approveReset=c.indexOf("update public.inventory_supply_request_items set quantity_approved=0",guard);
const frozenApply=c.indexOf("from jsonb_to_recordset(v_frozen_approved)",approveReset);
if(!(replay>=0&&validate>replay&&freeze>validate&&positive>freeze&&guard>positive&&firstUpdate>guard&&approveReset>guard&&frozenApply>approveReset))fail('ordering');
if(/\b(update|insert|delete)\s+(?:into\s+|from\s+)?public\./i.test(c.slice(replay,guard)))fail('write-before-guard');
if((c.match(/inventory_stock_assert_document_workflow_allowed_v2\s*\(/ig)||[]).length!==1)fail('guard-count');
if((c.match(/jsonb_to_recordset\(p_approved_items\)/ig)||[]).length!==1)fail('input-reparsed');
if((c.match(/jsonb_to_recordset\(v_frozen_approved\)/ig)||[]).length!==1)fail('frozen-not-execution-source');
if(/inventory_supply_request_items[\s\S]*select/i.test(c.slice(guard)))fail('possible-rediscovery-after-guard');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(c))fail('activation');
console.log('BATCH12_SUPPLY_REQUEST_DECIDE_PASS replay=1 validation_freeze_before_guard=1 document_guard=1 writes_before_guard=0 frozen_execution=1 activation=0');
