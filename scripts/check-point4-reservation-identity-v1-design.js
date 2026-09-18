#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const design=read('docs/POINT4-BATCH4B-RESERVATION-IDENTITY-V1-DESIGN.md');
const beta17=read('supabase-v10-5-4-beta17-retail-market-core.sql');
const beta18=read('supabase-v10-5-4-beta18-retail-website-integration.sql');
const finalize=read('supabase-v10-5-4-beta18-retail-website-integration-finalize.sql');

const need=(text,patterns,label)=>{
  for(const pattern of patterns){
    if(!(pattern instanceof RegExp?pattern.test(text):text.includes(pattern))){
      throw new Error(`${label}: missing ${String(pattern)}`);
    }
  }
};

need(beta17,[
  'create table if not exists public.retail_stock_reservations(',
  'unique(reservation_key,product_id)',
  'create or replace function public.retail_reserve_stock('
],'current reservation source');
need(beta18,[
  'create table if not exists public.retail_website_orders(',
  'create table if not exists public.retail_website_order_items(',
  'unique(retail_website_order_id,product_id)',
  'create or replace function public.accept_retail_website_order(',
  'create or replace function public.reject_retail_website_order(',
  'create or replace function public.cancel_retail_website_order_customer('
],'current website reservation source');
need(finalize,[
  'retail_create_website_order_beta18_core',
  'revoke execute on function public.retail_reserve_stock'
],'current hardened wrapper');

need(design,[
  'design only',
  'retail_reservation_documents_identity_v1',
  'retail_reservation_lines_identity_v1',
  'retail_reservation_mutations_identity_v1',
  'document_uid',
  'creation_client_tx_id',
  'line_uid',
  'reservation_effect_line_key',
  'Same TX + byte-identical digest',
  'Same TX + different digest',
  'Existing reservation/order rows',
  'No sidecar, remain explicitly Legacy',
  'new versioned RPCs',
  'ON DELETE RESTRICT',
  'No Point 4B-1/4B-2 object',
  'not activate Canonical Stock',
  '4B-2 committed-concurrency gate remains open'
],'design invariants');

const forbidden=[
  /\bcreate\s+table\b/i,
  /\bcreate\s+or\s+replace\s+function\b/i,
  /\balter\s+table\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+public\./i,
  /\bdelete\s+from\b/i,
  /\bgrant\s+execute\b/i,
  /\bcommit\s*;/i,
  /inventory_stock_apply_movement_v2\s*\(/i
];
for(const pattern of forbidden){
  if(pattern.test(design))throw new Error(`design document contains executable-looking SQL: ${pattern}`);
}

const ownSource=fs.readFileSync(__filename,'utf8');
if(/inventory_stock_apply_movement_v2\s*\(/i.test(ownSource)){
  throw new Error('checker must not introduce a Canonical Stock writer call');
}

console.log('Point 4 Batch 4B Reservation Identity V1 design checker: PASS');
console.log('Static design/source assertions only; no database or runtime proof claimed.');
