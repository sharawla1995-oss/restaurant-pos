'use strict';
const fs=require('fs');
const base=fs.readFileSync('permissions-v2-profile-feature-applicability.sql','utf8');
if(!base.includes("('customers.create','restaurant','core.customers',true)"))throw new Error('PV2_A_CUSTOMERS_CREATE_MAPPING_MISSING');
const owners={
 'permissions-v2-owner-customers-edit-address.sql':{'customers.edit':'core.customers','customers.address.manage':'core.customers'},
 'permissions-v2-owner-shifts-expenses.sql':{'expenses.edit':null},
 'permissions-v2-owner-delivery-settings.sql':{'delivery.drivers.manage':'commerce.delivery','delivery.zones.manage':'commerce.delivery'},
 'permissions-v2-owner-order-fulfillment.sql':{'orders.fulfillment.manage':null},
 'permissions-v2-owner-order-driver-assignment.sql':{'orders.delivery.assign_driver':'commerce.delivery'},
 'permissions-v2-owner-website-payment-review.sql':{'orders.payment.review':null}
};
for(const [file,map] of Object.entries(owners)){
 const s=fs.readFileSync(file,'utf8');
 for(const [action,feature] of Object.entries(map)){
  if(!s.includes(action))throw new Error('PV2_OWNER_ACTION_MISSING '+file+' '+action);
  const row=feature===null ? `('${action}','restaurant',null,true)` : `('${action}','restaurant','${feature}',true)`;
  if(!s.includes(row))throw new Error('PV2_OWNER_RESTAURANT_MAPPING_MISSING '+file+' '+action);
  if(!new RegExp("insert\\s+into\\s+public\\.permission_actions_v2","i").test(s))throw new Error('PV2_OWNER_ACTION_INSERT_MISSING '+file);
 }
}
for(const action of ['customers.edit','customers.address.manage','expenses.edit','delivery.drivers.manage','delivery.zones.manage','orders.fulfillment.manage','orders.delivery.assign_driver','orders.payment.review']){
 if(base.includes(`('${action}','restaurant'`))throw new Error('PV2_A_PREMATURE_FK_MAPPING '+action);
}
console.log('PV2 Restaurant F1-F5 applicability ownership: PASS');
