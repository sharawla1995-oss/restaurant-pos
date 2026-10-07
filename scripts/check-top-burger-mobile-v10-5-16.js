const fs=require('fs');
const app=fs.readFileSync('top-burger-mobile/app.js','utf8');
const index=fs.readFileSync('top-burger-mobile/index.html','utf8');
const sw=fs.readFileSync('top-burger-mobile/sw.js','utf8');
function has(s,n){if(!s.includes(n))throw new Error(n)}
has(index,'V10.5.16 Mobile','mobile version badge');
has(sw,"top-burger-mobile-10.5.16",'service worker cache');
has(app,'checkoutAttemptTx:null','stable checkout state');
has(app,'state.checkoutAttemptTx||uuid()','stable transaction reuse');
has(app,'resetCheckoutAttempt()','checkout reset');
has(app,"if(!phone)throw new Error('رقم موبايل العميل مطلوب للدليفري')",'delivery phone gate');
has(app,"if(!deliveryAddress)throw new Error('عنوان التوصيل مطلوب للدليفري')",'delivery address gate');
has(app,"if(!deliveryZone&&!(manualDeliveryFee>0))throw new Error('اختار منطقة توصيل أو اكتب رسوم التوصيل')",'zone or fee gate');
has(app,"delivery_zone_id:orderType==='delivery'&&deliveryZone?Number(deliveryZoneId):null",'null zone without zone');
has(app,"const area=orderType==='delivery'&&deliveryZone?String(deliveryZone.name||'').trim()||null:null;",'no placeholder area');
console.log('TOP_BURGER_MOBILE_V10_5_16_PASS');
