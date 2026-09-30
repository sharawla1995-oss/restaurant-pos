'use strict';
const fs=require('fs');
const specs={
 'commerce-orders-v2-ui.js':['commerce_order_document_create_v2','commerce_order_document_submit_v2','commerce_order_document_decide_v2','commerce_order_document_record_payment_v2','commerce_order_document_cancel_v2'],
 'finance-b2b-ui.js':['finance_customer_account_set_v2','finance_receivable_create_v2','finance_collection_create_v2','commerce_price_tier_save_v2','commerce_customer_price_tier_set_v2'],
 'logistics-v1-ui.js':['logistics_shipment_create_v1','logistics_shipment_status_v1','logistics_cod_collect_v1','logistics_return_create_v1','logistics_pickup_request_create_v1','logistics_settlement_create_v1'],
 'membership-v1-ui.js':['membership_member_create_v1','membership_plan_save_v1','membership_subscribe_v1','membership_checkin_v1','membership_renew_v1','membership_freeze_v1','membership_class_save_v1'],
 'pharmacy-ui.js':['pharmacy_upsert_product_details','pharmacy_save_substitute','pharmacy_receive_batch','pharmacy_adjust_batch','pharmacy_create_prescription','pharmacy_update_web_rx_status','pharmacy_save_insurance_company','pharmacy_save_insurance_plan','pharmacy_update_claim_status','create_pharmacy_pos_order_atomic'],
 'hr-attendance-admin-v1.js':['hr_attendance_summary_approve_v1','hr_attendance_adjust_v1','hr_work_schedule_save_v1','hr_schedule_assign_v1','hr_leave_decide_v1','hr_recurring_adjustments_generate_v1','hr_deduction_rule_save_v1','hr_recurring_adjustment_save_v1','hr_staff_account_set_active_v1','hr_staff_logout_all_v1','hr_staff_device_revoke_v1','hr_staff_account_create_or_reset_v1','hr_geofence_set_v1','hr_settings_set_v1']
};
for(const [file,names] of Object.entries(specs)){
 const s=fs.readFileSync(file,'utf8');
 if(!s.includes('__SharawlaRC1OnlineOnlyGuard'))throw new Error(file+': missing online-only guard');
 for(const n of names)if(!s.includes("'"+n+"'"))throw new Error(file+': missing guarded mutation '+n);
}
const lc=fs.readFileSync('landed-cost-posting-v1.js','utf8');
const guard=lc.indexOf("__SharawlaRC1OnlineOnlyGuard?.requireCloud?.('Landed Cost')");
const post=lc.indexOf("g.rpc('retail_landed_cost_post_v1'");
if(guard<0||post<0||guard>post)throw new Error('Landed Cost: guard must precede posting RPC');
console.log('RC1 cloud-only offline fail-closed coverage: PASS');
