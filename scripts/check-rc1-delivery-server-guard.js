'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const sql=fs.readFileSync('supabase-rc1-delivery-required-fields-guard-v1.sql','utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};

must(app.includes('function validatedDeliveryCheckoutInput()'),'client delivery validation missing');
for(const token of [
  "if(!/^01[0125][0-9]{8}$/.test(phone))",
  "if(!address)throw new Error('عنوان التوصيل مطلوب لأوردر الدليفري')",
  "String(z.branch_id)===String(currentBranchId())"
])must(app.includes(token),`client delivery validation missing: ${token}`);

for(const token of [
  'Required Fields Server Guard V1',
  "create_pos_order_atomic(jsonb,jsonb,jsonb) MD5 = a677482d9944aa8ae40003408506c7c1",
  "if v_md5 is distinct from 'a677482d9944aa8ae40003408506c7c1'",
  'create or replace function public.rc1_assert_delivery_required_fields_v1()',
  "v_phone !~ '^01[0125][0-9]{8}$'",
  "nullif(trim(coalesce(new.delivery_address,'')),'') is null",
  'new.delivery_zone_id is null',
  'z.id=new.delivery_zone_id',
  'z.branch_id=new.branch_id',
  'z.active=true',
  'create trigger trg_00_rc1_delivery_required_fields_v1',
  'before insert or update of order_type, customer_phone, delivery_address, delivery_zone_id, branch_id'
])must(sql.includes(token),`server delivery guard missing: ${token}`);

must(sql.indexOf('trg_00_rc1_delivery_required_fields_v1')>=0,'delivery guard trigger ordering marker missing');
console.log('RC1 delivery required-fields server guard SOURCE gate PASS');
