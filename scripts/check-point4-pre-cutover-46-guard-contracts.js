#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const file=path.resolve(__dirname,'../contracts/point4-pre-cutover-46-guard-contracts.v1.json');
const a=JSON.parse(fs.readFileSync(file,'utf8'));
const EXPECTED_DIRECT=[
  "accept_retail_website_order_identity_v1(text,text)",
  "accept_retail_website_order(bigint)",
  "cancel_retail_website_order_customer_identity_v1(text,text,text)",
  "cancel_retail_website_order_customer(text,text)",
  "create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)",
  "create_retail_pos_order_atomic(jsonb,jsonb,jsonb)",
  "create_retail_variant_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text)",
  "create_retail_variant_pos_order_atomic_v1(jsonb,jsonb,jsonb)",
  "expire_retail_website_order_identity_v1(text)",
  "food_apply_ingredient_delta_internal_v1(bigint,bigint,numeric,numeric,text,text)",
  "food_apply_order_consumption_v1(jsonb,jsonb)",
  "food_apply_return_consumption_v1(bigint,bigint,jsonb,text)",
  "food_ingredient_stock_adjust_v1(bigint,bigint,numeric,numeric,text,text)",
  "food_production_batch_complete_v1(bigint,numeric,jsonb,text,text)",
  "food_stock_count_post_v1(bigint,text,jsonb,text)",
  "food_waste_post_v1(bigint,bigint,bigint,bigint,text,numeric,text,text,text)",
  "inventory_supply_request_dispatch_v1(bigint,jsonb,text,text)",
  "inventory_supply_request_receive_v1(bigint,jsonb,boolean,text,text)",
  "reject_retail_website_order_identity_v1(text,text,text)",
  "reject_retail_website_order(bigint,text)",
  "retail_create_website_order_identity_v1(jsonb)",
  "retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb)",
  "retail_inventory_adjust(bigint,bigint,numeric,text,text,text)",
  "retail_inventory_set_item_policy(bigint,bigint,boolean,numeric)",
  "retail_landed_cost_post_v1(bigint)",
  "retail_post_stock_count(bigint,text,jsonb)",
  "retail_purchase_receive_v2(bigint,jsonb,text)",
  "retail_purchase_receive(bigint,jsonb,text)",
  "retail_reserve_stock(bigint,text,jsonb,integer)",
  "retail_supplier_return_create_v2(bigint,bigint,text,jsonb,text)",
  "retail_supplier_return_create(bigint,bigint,text,jsonb,text)",
  "retail_transfer_create(bigint,bigint,jsonb,text,text)",
  "retail_transfer_receive(bigint)",
  "retail_variant_inventory_adjust_v1(bigint,bigint,numeric,text,text,text)",
  "sharawla_acceptance_cleanup_v1(text)",
  "sharawla_acceptance_cleanup_v2(text)",
  "sharawla_acceptance_cleanup_v3(text)",
  "sharawla_beta55_restaurant_acceptance_cleanup_v1(text)",
  "sharawla_beta55_supply_acceptance_cleanup_v1(text)",
  "sharawla_beta55_supply_acceptance_fixture_v1(text)"
];
const EXPECTED_BARRIERS=[
  "inventory_supply_request_cancel_v1(bigint,text)",
  "inventory_supply_request_create_v1(bigint,text,jsonb,text,text)",
  "inventory_supply_request_decide_v1(bigint,boolean,jsonb,text)",
  "inventory_supply_request_prepare_v1(bigint,text)",
  "inventory_supply_request_submit_v1(bigint)",
  "inventory_supply_shortage_request_create_v1(bigint,jsonb,text,text)"
];
const expected=new Set([...EXPECTED_DIRECT,...EXPECTED_BARRIERS]);
const req=['id','signature','classification','required_guard','provenance','cardinality','replay_boundary','precompute','guard_insertion_boundary','first_commitment_write','conditional_behavior'];
const rec=Array.isArray(a.records)?a.records:[]; const sigs=rec.map(r=>r.signature);
const counts=new Map(); for(const s of sigs) counts.set(s,(counts.get(s)||0)+1);
const duplicates=[...counts].filter(([,n])=>n>1).map(([s])=>s);
const actual=new Set(sigs); const missing=[...expected].filter(s=>!actual.has(s)); const unexpected=[...actual].filter(s=>!expected.has(s));
let schemaViolations=[], invariantViolations=[];
for(const [i,r] of rec.entries()){
 for(const k of req) if(!(k in r)||r[k]===null||r[k]===undefined||String(r[k]).trim()==='') schemaViolations.push(`record ${i+1}: missing/empty ${k}`);
 const isD=EXPECTED_DIRECT.includes(r.signature), isB=EXPECTED_BARRIERS.includes(r.signature);
 if(isD && r.classification!=='DIRECT_PHYSICAL_WRITER') schemaViolations.push(`${r.signature}: classification must be DIRECT_PHYSICAL_WRITER`);
 if(isB && r.classification!=='DOCUMENT_WORKFLOW_BARRIER') schemaViolations.push(`${r.signature}: classification must be DOCUMENT_WORKFLOW_BARRIER`);
 if(isD && r.required_guard!=='inventory_stock_assert_legacy_write_allowed_v2') schemaViolations.push(`${r.signature}: wrong Direct guard`);
 if(isB && r.required_guard!=='inventory_stock_assert_document_workflow_allowed_v2') schemaViolations.push(`${r.signature}: wrong Barrier guard`);
 if(/dummy|sentinel|item_id\s*[:=]?\s*0|identity\s*[:=]?\s*0/i.test(JSON.stringify(r))) invariantViolations.push(`${r.signature}: sentinel/dummy identity marker`);
 if(isB && !/document|workflow|request/i.test(r.provenance)) invariantViolations.push(`${r.signature}: barrier provenance is not document/workflow based`);
 if(isD && /one-document/i.test(r.cardinality)) invariantViolations.push(`${r.signature}: Direct has document cardinality`);
 if(/many|two/.test(r.cardinality) && !/all|distinct|complete|actual|effective|lines|items|products|ingredients|allocations|identities|stored|matching|requested|test/i.test(r.provenance)) invariantViolations.push(`${r.signature}: multi-identity provenance lacks completeness evidence`);
}
if(a.invariant!=='Replay / Early-return -> Read-Only validation & precompute -> Freeze complete actually-affected identity/document set -> Guard ALL -> First new-execution commitment write -> Execute from the same frozen set.') invariantViolations.push('authoritative invariant mismatch');
const direct=rec.filter(r=>r.classification==='DIRECT_PHYSICAL_WRITER').length;
const barriers=rec.filter(r=>r.classification==='DOCUMENT_WORKFLOW_BARRIER').length;
const report={records:`${rec.length}/46`,unique_signatures:`${actual.size}/46`,direct:`${direct}/40`,barriers:`${barriers}/6`,missing:missing.length,unexpected:unexpected.length,duplicates:duplicates.length,schema_violations:schemaViolations.length,invariant_violations:invariantViolations.length,missing_signatures:missing,unexpected_signatures:unexpected,duplicate_signatures:duplicates,schema_errors:schemaViolations,invariant_errors:invariantViolations};
const pass=rec.length===46&&actual.size===46&&direct===40&&barriers===6&&!missing.length&&!unexpected.length&&!duplicates.length&&!schemaViolations.length&&!invariantViolations.length;
console.log(JSON.stringify({...report,gate:pass?'PASS':'FAIL'},null,2)); process.exit(pass?0:1);
