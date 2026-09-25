'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const required=[
 ['__SharawlaPV2CustomerCreate','customer create router'],
 ['__SharawlaPV2CustomerEditAddress','customer edit/address router'],
 ['__SharawlaPV2ExpenseEdit','expense edit router'],
 ['__SharawlaPV2DeliverySettings','delivery settings router']
];
for(const [needle,label] of required)if(!app.includes(needle))throw new Error('PV2_F1_F4_ROUTING_MISSING '+label);
for(const file of ['permissions-v2-customers-create-routing.js','permissions-v2-customers-edit-address-routing.js','permissions-v2-expense-edit-routing.js','permissions-v2-delivery-settings-routing.js']){
 const p=html.indexOf('<script src="'+file);
 const a=html.indexOf('<script src="app.js');
 if(p<0||a<0||p>a)throw new Error('PV2_F1_F4_LOAD_ORDER '+file);
}
const forbidden=[
 /rest\('customers',[^\n]{0,180}method:'POST'/,
 /rest\('customers',[^\n]{0,180}method:'PATCH'/,
 /rest\('customer_addresses',[^\n]{0,180}method:'POST'/,
 /rest\('customer_addresses',[^\n]{0,180}method:'PATCH'/,
 /rest\('customer_addresses',[^\n]{0,180}method:'DELETE'/,
 /rest\('expenses',[^\n]{0,180}method:'PATCH'/,
 /rest\('delivery_drivers',[^\n]{0,180}method:'POST'/,
 /rest\('delivery_drivers',[^\n]{0,180}method:'PATCH'/,
 /rest\('delivery_zones',[^\n]{0,180}method:'POST'/,
 /rest\('delivery_zones',[^\n]{0,180}method:'PATCH'/
];
for(const re of forbidden)if(re.test(app))throw new Error('PV2_F1_F4_DIRECT_DML_REMAINS '+re);
console.log('PV2 F1-F4 runtime routing: PASS');
