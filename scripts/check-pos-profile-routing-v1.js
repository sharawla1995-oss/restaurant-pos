'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8').replace(/\r\n?/g,'\n');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const html=fs.readFileSync('index.html','utf8');
const fail=[];
const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(app.includes('POS-PROFILE-ROUTING-V1'),'explicit POS routing marker missing');
need(app.includes("if(profile==='restaurant')return renderRestaurantPOS()"),'Restaurant POS adapter missing');
need(app.includes("if(profile==='retail')return renderRetailPOS()"),'Retail POS adapter missing');
need(app.includes("if(profile==='pharmacy')"),'Pharmacy POS adapter branch missing');
need(app.includes('window.SharawlaPharmacyUI?.renderPOS'),'Pharmacy UI owner delegation missing');
need(app.includes('data-pos-profile-fail-closed="PROFILE_NOT_POS"'),'non-POS profile fail-closed screen missing');
need(!app.includes("if(isRetailProfile())return renderRetailPOS();"),'implicit non-retail Restaurant fallback still present');

need(app.includes("moduleEnabled('pickup')?'<option value=\"pickup\">استلام من الفرع</option>'"),'Pickup capability gate missing');
need(app.includes("moduleEnabled('tables')?'<option value=\"dinein\">صالة</option>'"),'Dine-in tables gate missing');
need(app.includes("status:['delivery','pickup'].includes(orderType)?'new':'completed'"),'Pickup fulfillment lifecycle start missing');
need(app.includes("or=(order_type.eq.delivery,order_type.eq.pickup)"),'Pickup fulfillment queue query missing');
need(app.includes("['delivery','pickup'].includes(String(o.order_type||''))"),'Pickup fulfillment queue filter missing');
need(app.includes("filter==='delivered'?['delivered','completed'].includes(o.status)"),'Pickup completed filter compatibility missing');

for(const ref of [
  'touch-ux-v1.css?v='+pkg.version,
  'inventory-overview-v1.js?v='+pkg.version,
  'sharawla-navigation-registry.js?v='+pkg.version,
  'product-map-navigation-v1.js?v='+pkg.version
])need(html.includes(ref),'versioned runtime ref missing: '+ref);

if(fail.length){
 console.error('POS Profile Routing V1: FAIL');
 fail.forEach(x=>console.error('- '+x));
 process.exit(1);
}
console.log('POS Profile Routing V1: PASS');
console.log('restaurant=explicit; retail=explicit; pharmacy=delegated; others=fail-closed; pickup=capability-gated; dinein=tables-gated');
