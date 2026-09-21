const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-point4-pre-cutover-46-guard-installation-batch7-retail-transfers.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH7_TRANSFERS_FAIL '+m);process.exit(1)}
function fn(name){const a=s.indexOf('create or replace function public.'+name+'(');if(a<0)fail(name+':missing');let e=s.indexOf('\ncreate or replace function public.',a+20);if(e<0)e=s.length;return s.slice(a,e)}
const c=fn('retail_transfer_create'), r=fn('retail_transfer_receive');
const cf=c.indexOf("if jsonb_array_length(v_frozen_items)=0"),cg=c.indexOf('inventory_stock_assert_legacy_write_allowed_v2',cf),ch=c.indexOf('insert into public.retail_transfers',cg);
if(!(cf>=0&&cg>cf&&ch>cg))fail('create-boundary');
if(/jsonb_to_recordset\s*\((?:coalesce\()?p_items/i.test(c.slice(ch)))fail('create-raw-rediscovery');
if(!/jsonb_to_recordset\s*\(v_frozen_items\)/i.test(c.slice(ch)))fail('create-not-frozen-exec');
if(!/jsonb_build_object\('product_id',v\.product_id,'quantity',v_qty\)/i.test(c.slice(0,cg)))fail('create-effective-qty-not-frozen');
const replay=r.indexOf("if v_t.status='received' then return v_t.id; end if;"), sent=r.indexOf("if v_t.status<>'sent'"), rf=r.indexOf('select coalesce(jsonb_agg',sent), rg=r.indexOf('inventory_stock_assert_legacy_write_allowed_v2',rf), rb=r.indexOf('insert into public.retail_inventory_balances',rg);
if(!(replay>=0&&sent>replay&&rf>sent&&rg>rf&&rb>rg))fail('receive-ordering');
if(!/from public\.retail_transfer_items x[\s\S]*where x\.transfer_id=v_t\.id/i.test(r.slice(rf,rg)))fail('receive-stored-freeze');
if(!/jsonb_to_recordset\s*\(v_frozen_items\)/i.test(r.slice(rg)))fail('receive-not-frozen-exec');
if(/from public\.retail_transfer_items/i.test(r.slice(rg)))fail('receive-rediscovery');
if((s.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==2)fail('guard-count');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(s))fail('activation');
console.log('BATCH7_TRANSFERS_PASS functions=2 guards=2 create_effective_qty_frozen=1 create_raw_rediscovery=0 receive_replay_before_guard=1 receive_stored_set=1 receive_rediscovery=0 activation=0');