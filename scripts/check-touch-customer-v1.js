'use strict';
const fs=require('fs');
const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n?/g,'\n');
const app=read('app.js');
const css=read('touch-ux-v1.css');
const html=read('index.html');
const acc=read('owner-acceptance-beta55-restaurant-v55.js');
const pkg=JSON.parse(read('package.json'));
const fail=[];
const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(app.includes('CUSTOMERS-MANUAL-CREATE-V1'),'manual customer create marker missing');
need(app.includes('id="newCustomerBtn"'),'new customer button missing');
need(app.includes('id="customerCreateForm"'),'customer create form missing');
need(app.includes("await rest('customers','',{method:'POST'"),'customer create POST missing');
need(app.includes("normalizePhone(x.phone)===normalized"),'customer duplicate-phone guard missing');
need(app.includes('inputmode="tel"'),'touch/mobile phone input mode missing');

need(css.includes('@media (any-pointer: coarse)'),'touch coarse-pointer gate missing');
need(css.includes('--sharawla-touch-target:46px'),'minimum touch target token missing');
need(css.includes('touch-action:manipulation'),'tap manipulation optimization missing');
need(css.includes('font-size:16px'),'touch input zoom guard missing');
need(css.includes('.table-wrap'),'touch table scrolling rule missing');

need(acc.includes("const POINT4_IDENTITY_V1='sharawla.point4.identity.v1'"),'acceptance Point4 identity contract missing');
need(acc.includes('line_uid:saleLineUid'),'acceptance sale line_uid missing');
need(acc.includes("point4Effect('sale',saleLineUid)"),'acceptance sale effect key missing');
need(acc.includes('original_source_document_id:saleSourceDocumentId'),'acceptance return lineage missing');
need(acc.includes("point4Effect('sale_return',returnLineUid)"),'acceptance return effect key missing');

const touchRef='touch-ux-v1.css?v='+pkg.version;
need(html.includes(touchRef),'versioned Touch UX stylesheet ref missing');
need(html.includes('inventory-overview-v1.js?v='+pkg.version),'Inventory Overview ref not synchronized');
need(html.includes('sharawla-navigation-registry.js?v='+pkg.version),'Navigation Registry ref not synchronized');
need(html.includes('product-map-navigation-v1.js?v='+pkg.version),'Product Map ref not synchronized');

if(fail.length){
  console.error('Customer + Touch UX V1: FAIL');
  fail.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('Customer + Touch UX V1: PASS');
console.log('touch=coarse-pointer-only; manual-customer=true; point4-acceptance-aligned=true');
