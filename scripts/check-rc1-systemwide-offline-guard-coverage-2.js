'use strict';
const fs=require('fs');
const guarded={
 'service-v1-ui.js':['service_catalog_save_v1','service_appointment_create_v1','service_job_create_v1','service_appointment_status_v1','service_job_status_v1','service_installation_set_v1','service_package_purchase_v1'],
 'purchasing-attachments-v1.js':['purchase_attachment_prepare_v1','purchase_attachment_finalize_v1','purchase_attachment_abort_v1','purchase_attachment_soft_delete_v1'],
 'permissions-v2-ui.js':['admin_reset_employee_action_permission_v2','admin_set_employee_action_permission_v2'],
 'beta54-shared-core-ui.js':['hr_employee_update_v1','hr_employee_create_v1','hr_employee_compensation_set_v1','hr_advance_decide_v1','hr_advance_create_v1','hr_advance_disburse_v1','hr_adjustment_create_v1','hr_payroll_approve_v1','hr_payroll_run_attendance_v1','hr_payroll_run_v1','hr_payroll_pay_attendance_v1','hr_payroll_pay_v1','treasury_manual_post_v1']
};
for(const [file,names] of Object.entries(guarded)){
 const s=fs.readFileSync(file,'utf8');
 if(!s.includes('ONLINE_ONLY_GUARD_UNAVAILABLE'))throw new Error(file+': missing fail-closed unavailable-guard behavior');
 for(const n of names)if(!s.includes("'"+n+"'")&&!s.includes('"'+n+'"'))throw new Error(file+': missing guarded mutation '+n);
}
const wh=fs.readFileSync('warehouse-v1-ui.js','utf8');
if(wh.includes("rpc('retail_purchase_order_create'"))throw new Error('warehouse-v1: legacy PO RPC remains');
for(const token of ["commitOptionalTxRpc('retail_purchase_order_create_v2'","WAREHOUSE_VARIANT_REQUIRED","OFFLINE_V2_OWNER_UNAVAILABLE"])if(!wh.includes(token))throw new Error('warehouse-v1: missing '+token);
console.log('RC1 systemwide offline guard coverage batch 2: PASS');
