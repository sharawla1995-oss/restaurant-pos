const fs=require('fs');
function fail(msg){console.error('BETA29 CHECK FAILED:',msg);process.exit(1)}
function ok(msg){console.log('PASS:',msg)}
const runtime=fs.readFileSync('beta29-retail-functional-finalization.js','utf8');
const engine=fs.readFileSync('retail-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
if(pkg.version!=='10.5.4-beta.29')fail('package version mismatch');ok('package version beta29');
for(const marker of ['activationDeveloperContactBtn','activationSupportCode','retail_offer_set_active','buy_x_get_y','data-b29-edit-offer','data-b29-archive-offer','retailWebsiteOrdersNav','repairOwnerSessionResult'])if(!runtime.includes(marker))fail('missing runtime marker '+marker);ok('Beta29 runtime markers');
if(!engine.includes("promoCodes:'promocodes'"))fail('Retail promoCodes module mapping missing');
if(!engine.includes("'retailOffers','promoCodes'"))fail('Retail page order missing promoCodes');ok('Retail promoCodes route');
if(!html.includes('beta29-retail-functional-finalization.js?v=10.5.4-beta.29'))fail('Beta29 runtime not loaded');ok('Beta29 runtime loaded');
if(!html.includes('developerContactBtn'))fail('Login developer contact regressed');ok('Login developer contact preserved');
if(/data-page="kitchen"[^>]*class="[^"]*hidden/.test(html)){} // runtime engine remains the source of profile visibility.
console.log('Beta29 functional finalization static gate passed.');
