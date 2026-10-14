import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {startLoopbackAPI} from './loopback-api.mjs';
import {serviceQuery} from './staff-integration.mjs';
import {TC} from './integration-fixture.mjs';
export async function runBrowserFlows(auth,test){
 const api=await startLoopbackAPI(auth);const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}});const external=[];const errors=[];
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{errors.push('UI dialog: '+d.message());d.dismiss();});});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.hostname==='127.0.0.1')return route.continue();
  if(u.hostname==='xihcxydjnzemflhedzor.supabase.co'){
   const response=await context.request.fetch(api.url+u.pathname+u.search,{method:request.method(),headers:request.headers(),data:request.postData()||undefined});
   return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
  }
  if(u.hostname==='ikppryeavoabnugcijeq.supabase.co'&&u.pathname.endsWith('/get_sharawla_business_runtime_config')){
   const p=request.postDataJSON();assert.equal(p.p_device_id,'LOCAL-E2E-SYNTHETIC');
   return route.fulfill({json:{ok:true,business_id:TC,pos_profile:'restaurant',profile_active:true,profile_implemented:true,modules_configured:true,enabled_modules:['pos','website','kitchen','delivery','pickup','customers','returns','reports','inventory']},headers:{'access-control-allow-origin':'*'}});
  }
  external.push(u.hostname+u.pathname);return route.abort();
 });
 const pos=await context.newPage();
 try{
  console.log('Browser checkpoint: open POS');await pos.goto(api.url+'/pos/index.html');console.log('Browser checkpoint: POS opened');
  await pos.evaluate(async business=>{
   cfg={url:'https://xihcxydjnzemflhedzor.supabase.co',key:'sb_publishable_fixture_only'};
   await saveLicenseState({device_id:'LOCAL-E2E-SYNTHETIC',device_fingerprint:'LOCAL-E2E-SYNTHETIC',business_id:business,offline_grace_days:1,support_code:'SYNTHETIC-SUPPORT',last_verified_at:new Date().toISOString()});
   await init();
  },TC);console.log('Browser checkpoint: fixture license/init ready');
  await test('Browser: administrator login and staff creation through actual POS form',async()=>{
   await pos.locator('#email').fill('fixture1');await pos.locator('#password').fill('Fixture-password-1');await pos.locator('#loginForm button[type=submit]').click();
   await pos.waitForFunction(()=>state.employee?.role==='admin');
   await pos.locator('[data-branch-pick="22"]').click();
   await pos.locator('#menuBtn').click();await pos.locator('[data-page=users]').click();await pos.locator('#newUserBtn').click();
   await pos.locator('#uName').fill('UI fixture cashier');await pos.locator('#uEmail').fill('ui_fixture_cashier');await pos.locator('#uPassword').fill('Fixture-password-ui');
   await pos.locator('#userForm button[type=submit]').click();
   await pos.waitForFunction(()=>!document.querySelector('#userForm'));
   const rows=await serviceQuery("select id,business_id,auth_user_id from employees where username='ui_fixture_cashier'");assert.equal(rows.length,1);assert.equal(rows[0].business_id,TC);
   await serviceQuery('insert into shifts(id,branch_id,employee_id,status,business_id) values(2,22,$1,\'open\',$2)',[rows[0].id,TC]);
  });
  // A new browser page exercises username login through the new TC handler; no injected session.
  const cashier=await context.newPage();await cashier.goto(api.url+'/pos/index.html');
  await cashier.evaluate(async()=>{cfg={url:'https://xihcxydjnzemflhedzor.supabase.co',key:'sb_publishable_fixture_only'};await init();});
  await cashier.locator('#email').fill('ui_fixture_cashier');await cashier.locator('#password').fill('Fixture-password-ui');await cashier.locator('#loginForm button[type=submit]').click();
  try{await cashier.waitForFunction(()=>state.employee?.username==='ui_fixture_cashier');}catch(e){console.error('CASHIER_LOGIN_TRACE',await cashier.locator('#toast').textContent(),await cashier.locator('body').innerText());throw e;}console.log('Browser checkpoint: new cashier logged in');
  for(const type of ['pickup','delivery'])await test(`Browser: website ${type} → cashier acceptance → full fulfillment`,async()=>{
   const site=await context.newPage();await site.goto(api.url+'/site/index.html');console.log('Browser checkpoint: site opened '+type);
   await site.locator('[data-choose-branch="22"]').click();await site.locator('[data-open-cat="1"]').first().click();await site.locator('[data-add="100"]').click();await site.locator('#addToCart').click();
   await site.locator('#v6QuickCart').click();await site.locator('#checkoutBtn').click();await site.locator(`[data-fulfillment="${type}"]`).click();
   await site.locator('#customerName').fill('Synthetic '+type);await site.locator('#customerPhone').fill(type==='pickup'?'01000000010':'01000000011');
   if(type==='delivery'){await site.locator('#deliveryZone').selectOption('1');await site.locator('#deliveryAddress').fill('Synthetic delivery address');}
   await site.locator('#submitOrder').click();await site.locator('#successModal:not(.hidden)').waitFor();
   const code=await site.locator('#websiteOrderCode').innerText();const wid=Number(code.replace('WEB-',''));assert.ok(wid>0);
   await cashier.locator('#menuBtn').click();await cashier.locator('[data-page=deliveryOrders]').click();await cashier.locator(`[data-web-accept="${wid}"]`).click();await cashier.locator('.website-order-review-modal [data-confirm]').click();
   await cashier.locator('.modal-card [data-close]').last().waitFor();await cashier.locator('.modal-card [data-close]').last().click();
   const order=(await serviceQuery('select * from orders where website_order_id=$1',[wid]))[0];assert.ok(order.customer_id);assert.equal(order.order_type,type);assert.equal(order.source,'website');assert.equal(Number(order.total),type==='delivery'?100:90);
   const oid=order.id;await cashier.locator(`[data-order-detail="${oid}"]`).click();await cashier.locator('[data-preparing]').click();
   await cashier.locator(`[data-order-detail="${oid}"]`).click();await cashier.locator('[data-ready]').click();
   await cashier.locator(`[data-order-detail="${oid}"]`).click();
   if(type==='pickup')await cashier.locator('[data-completed]').click();
   else {await cashier.locator('[data-assign]').click();await cashier.locator('[data-driver-pick="1"]').click();await cashier.locator(`[data-order-detail="${oid}"]`).click();await cashier.locator('[data-delivered]').click();}
   await cashier.waitForFunction(()=>!document.querySelector('.delivery-detail-modal')&&!document.querySelector('.driver-picker'));
   const end=(await serviceQuery('select * from orders where id=$1',[oid]))[0];assert.equal(end.status,type==='pickup'?'completed':'delivered');
   if(type==='delivery'){assert.equal(Number(end.driver_id),1);assert.equal(Number(end.delivery_cash_custody_amount),100);assert.equal(end.payment_status,'confirmed');}
   await site.close();
  });
  await cashier.close();
  await test('Browser: closed fixture intake blocks customer submission',async()=>{
   await serviceQuery('update branch_website_settings set orders_open=false where branch_id=22');
   const site=await context.newPage();await site.goto(api.url+'/site/index.html');await site.locator('[data-choose-branch="22"].closed').waitFor();assert.equal((await serviceQuery('select count(*)::int as n from website_orders'))[0].n,2);await site.close();
  });
  assert.equal(external.length,0,'Unexpected external request: '+external.join(','));
  return {api_trace:api.trace,unexpected_external:external,page_errors:errors,website_source_sha:'fa1537646aa0c5e1177910314b8595c3b2da3af5',scope:'Actual customer and POS UI, loopback SQL adapter; licensing synthetic; no real devices or physical printing'};
 }catch(e){console.error('BROWSER_TRACE',JSON.stringify({trace:api.trace,errors,external,pos_toast:await pos.locator('#toast').textContent().catch(()=>null)}));throw e;}
 finally{await browser.close();await new Promise(resolve=>api.server.close(resolve));}
}
