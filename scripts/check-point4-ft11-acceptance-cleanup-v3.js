'use strict';
const fs=require('fs'),crypto=require('crypto');
const raw=fs.readFileSync('evidence/point4-runtime-recovery-2026-09-22/37-sharawla_acceptance_cleanup_v3.sql','utf8');
const src=fs.readFileSync('supabase-point4-ft11-acceptance-cleanup-v3-guard.sql','utf8');
const fail=m=>{throw new Error('FT11_37_FAIL '+m)};
if(crypto.createHash('md5').update(raw).digest('hex')!=='ca7846b9e2e6fa3593b7bcacdb4f4111') fail('raw-integrity');
for(const x of ['ACCEPTANCE_CLEANUP_STOCK_NOT_ZERO','ACCEPTANCE_CLEANUP_PHARMACY_BATCH_NOT_ZERO','retail_supplier_return_items','retail_supplier_returns','retail_goods_receipt_items','retail_purchase_workflow_events','retail_goods_receipts','sharawla_acceptance_scan_v3']) if(!src.includes(x)) fail('anchor:'+x);
const drift=src.indexOf('if v_stock_drift>0'),batch=src.indexOf('if v_batch_nonzero>0'),freeze=src.indexOf("select coalesce(jsonb_agg"),guard=src.indexOf('inventory_stock_assert_legacy_write_allowed_v2'),firstDelete=src.indexOf('delete from public.logistics_client_settlement_items_v1');
if(!(drift>=0&&batch>drift&&freeze>batch&&guard>freeze&&firstDelete>guard)) fail('boundary-order');
if((src.match(/inventory_stock_assert_legacy_write_allowed_v2/g)||[]).length!==1) fail('guard-callsite');
if(!/select distinct branch_id,product_id from public\.retail_inventory_movements/.test(src)) fail('ownership');
if(!/jsonb_array_elements\(v_ownership\)[\s\S]*order by 1,2/.test(src.slice(freeze,firstDelete))) fail('deterministic');
const post=src.slice(firstDelete); if((post.match(/retail_inventory_movements/g)||[]).length!==1) fail('rediscovery');
const purchase=['retail_supplier_return_items','retail_supplier_returns','retail_goods_receipt_items','retail_purchase_workflow_events','retail_goods_receipts','retail_purchase_order_items','retail_purchase_orders'];
let last=-1;for(const t of purchase){const i=post.indexOf('delete from public.'+t);if(i<0||i<last)fail('purchase-order:'+t);last=i;}
const executable=src.replace(/^\s*--.*$/gm,''); if(/\bcanonical_stock\b|\bcutover\s*=\s*(?:on|true)\b/i.test(executable)) fail('activation');
console.log('POINT4_FT11_37_SEMANTIC_PASS raw_md5=1 zero_drift=1 batch_zero=1 frozen_products=1 deterministic_guard=1 v3_purchasing_order=1 rediscovery=0');
