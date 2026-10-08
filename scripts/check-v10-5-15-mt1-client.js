const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function fail(m){console.error('V10_5_15_MT1_CLIENT_FAIL:',m);process.exit(1)}
function has(s,n,m){if(!s.includes(n))fail(m)}
function no(s,n,m){if(s.includes(n))fail(m)}
const app=read('app.js');
const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));

if(pkg.version!=='10.5.15')fail('package version changed');
if(ver.version!=='10.5.15')fail('version.json changed');

has(app,"if(String(d.business_id)!==String(st.business_id))",'Cloud Business Connection mismatch guard');
has(app,"const c=saveBusinessConnectionCache(d,st.device_id)",'canonical device binding cache');
has(app,"'X-Sharawla-Business']=businessId",'business selector header');
has(app,"'X-Sharawla-Device']=deviceId",'device selector header');
has(app,"...tenantIdentityHeaders()",'central REST/RPC tenant headers');
has(app,"async function assertSharawlaTenantContext()",'explicit desktop tenant assertion');
has(app,"rpc('mt1_assert_device_business',{p_device_id:deviceId})",'server-side device/business assertion');
has(app,"DEVICE_BUSINESS_CACHE_MISMATCH",'license/cache identity mismatch hard stop');
has(app,"if(navigator.onLine){await assertSharawlaTenantContext();await bootstrap()}else await loadOfflineBootstrap()",'tenant assertion before online bootstrap');
has(app,"rpc('update_website_settings_v1',payload)",'tenant-local website settings save');
has(app,'${activeTenantBusinessId()}/products/','tenant-prefixed product image path');
has(app,'${activeTenantBusinessId()}/branding/','tenant-prefixed business branding path');
has(app,"storage/v1/object/business-assets/${path}`,{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${session.access_token}`,...tenantIdentityHeaders()",'business asset upload carries tenant identity');

no(app,"rest('business_settings','select=*&id=eq.1&limit=1')",'legacy business_settings id=1 read');
no(app,"rest('website_settings','select=*&id=eq.1&limit=1')",'legacy website_settings id=1 read');
no(app,"const row={id:1,theme_name:theme",'legacy website_settings id=1 write');
no(app,'kzokretuuigjhxjzdlmk','Top Burger Production project ref embedded');
no(app,'91826502-590e-4afa-8826-2c0f4b99c490','current Beta tenant UUID embedded');
no(app,'11111111-1111-4111-8111-111111111111','test tenant UUID embedded');
if(/top chicken/i.test(app))fail('Top Chicken identity/name embedded');

console.log('V10_5_15_MT1_CLIENT_PASS');
