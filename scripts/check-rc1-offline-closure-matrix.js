'use strict';
const fs=require('fs'),assert=require('assert');
const strict={
 'commerce-orders-v2-ui.js':['commerce_order_document_create_v2','commerce_order_document_submit_v2','commerce_order_document_decide_v2','commerce_order_document_record_payment_v2','commerce_order_document_cancel_v2'],
 'finance-b2b-ui.js':['finance_customer_account_set_v2','finance_receivable_create_v2','finance_collection_create_v2','commerce_price_tier_save_v2','commerce_customer_price_tier_set_v2'],
 'logistics-v1-ui.js':['logistics_shipment_create_v1','logistics_shipment_status_v1','logistics_cod_collect_v1','logistics_return_create_v1','logistics_pickup_request_create_v1','logistics_settlement_create_v1'],
 'membership-v1-ui.js':['membership_member_create_v1','membership_plan_save_v1','membership_subscribe_v1','membership_checkin_v1','membership_renew_v1','membership_freeze_v1','membership_class_save_v1'],
 'service-v1-ui.js':['service_catalog_save_v1','service_appointment_create_v1','service_job_create_v1','service_appointment_status_v1','service_job_status_v1','service_installation_set_v1','service_package_purchase_v1'],
 'pharmacy-ui.js':['pharmacy_upsert_product_details','pharmacy_save_substitute','pharmacy_receive_batch','pharmacy_adjust_batch','pharmacy_create_prescription','pharmacy_update_web_rx_status','pharmacy_save_insurance_company','pharmacy_save_insurance_plan','pharmacy_update_claim_status','create_pharmacy_pos_order_atomic'],
 'beta54-shared-core-ui.js':['hr_employee_update_v1','hr_employee_create_v1','hr_employee_compensation_set_v1','hr_advance_decide_v1','hr_advance_create_v1','hr_advance_disburse_v1','hr_adjustment_create_v1','hr_payroll_approve_v1','hr_payroll_run_attendance_v1','hr_payroll_run_v1','hr_payroll_pay_attendance_v1','hr_payroll_pay_v1','treasury_manual_post_v1']
};
let strictCount=0;
for(const [file,names] of Object.entries(strict)){const s=fs.readFileSync(file,'utf8');assert(s.includes("code='ONLINE_ONLY_GUARD_UNAVAILABLE'"),file+' missing strict fail-closed helper');assert(/cloudMutations=new Set\(/.test(s),file+' missing mutation ownership set');assert(/cloudMutations\.has\([a-z]\).*requireCloud|cloudMutations\.has\(name\).*guard/s.test(s),file+' wrapper does not bind mutation set to cloud guard');for(const n of names){assert(s.includes("'"+n+"'")||s.includes('"'+n+'"'),file+' missing mutation '+n);strictCount++;}}
const wh=fs.readFileSync('beta55-central-warehouse-v2.js','utf8');for(const n of ['inventory_supply_request_create_v1','inventory_supply_request_submit_v1'])assert(wh.includes("commitOptionalTxRpc('"+n+"'"),'warehouse owner missing '+n);for(const n of ['inventory_supply_request_create_v1','inventory_supply_request_submit_v1'])assert(!wh.includes("rpc('"+n+"'"),'warehouse direct bypass '+n);
const app=fs.readFileSync('app.js','utf8');for(const fn of ['acceptOnlineOrderFromChannel','rejectOnlineOrderFromChannel']){const a=app.indexOf('async function '+fn),b=app.indexOf('\nasync function ',a+20),p=app.slice(a,b>0?b:a+5000);assert(p.includes('rc1RequireCloudOnline'),fn+' not strict');}
console.log('RC1 Offline Closure Matrix PASS — strict='+strictCount+'; warehouse=2; website=2; unresolved=0');
