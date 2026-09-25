'use strict';
const fs=require('fs');
const s=fs.readFileSync('permissions-v2-profile-feature-applicability.sql','utf8');
const expected={
 'customers.create':'core.customers',
 'customers.edit':'core.customers',
 'customers.address.manage':'core.customers',
 'expenses.edit':'core.expenses',
 'delivery.drivers.manage':'commerce.delivery',
 'delivery.zones.manage':'commerce.delivery',
 'orders.fulfillment.manage':'commerce.orders',
 'orders.delivery.assign_driver':'commerce.delivery',
 'orders.payment.review':'commerce.orders'
};
for(const [action,feature] of Object.entries(expected)){
 const needle=`('${action}','restaurant','${feature}',true)`;
 if(!s.includes(needle))throw new Error('PV2_RESTAURANT_APPLICABILITY_MISSING '+action+' => '+feature);
}
console.log('PV2 restaurant F1-F5 applicability: PASS');
