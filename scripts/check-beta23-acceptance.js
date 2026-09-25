const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const version=String(pkg.version||'');
const m=version.match(/^10\.5\.4-beta\.(\d+)$/);
if(!m||Number(m[1])<23)throw new Error(`Expected 10.5.4-beta.23 or later beta candidate, got ${version}`);
const suite=read('beta23-acceptance-suite.js');
const engine=read('retail-engine.js');
const sw=read('sw.js');
const required=[
 'BETA_BUSINESS_ID','91826502-590e-4afa-8826-2c0f4b99c490','xihcxydjnzemflhedzor.supabase.co',
 'Candidate Loaded','Beta Isolation Lock','Runtime Profile','Retail Engine Registration','Restaurant Leakage',
 'Order Type Contract','Dine-In Disabled','Delivery Enabled','Decimal Product Contract','Decimal Normalization',
 'Weight Entry Modal Hook','EAN13 Checksum','Inventory Balances','Negative Stock Guard State','Inventory Movements',
 'Suppliers Read','Purchase Orders Read','GRN Read','Supplier Returns Read','Retail Offers','Stock Count','Transfers',
 'Website Bootstrap','Website Catalog','Expired Active Reservations','Website Accepted Link Integrity',
 'Branch Payment Contract','Duplicate Client TX Guard','Order Payment Reconciliation','Return Decimal Contract',
 'Shift Close Contract','Offline Queue State','Update Pending State','Update Health','Printer API','Notification Sound Hook',
 'Atomic Decimal Sale 0.250','Inventory Deduction 0.250','Idempotency Replay','Decimal Return 0.250','Inventory Restore After Return'
];
for(const token of required)if(!suite.includes(token))throw new Error(`Acceptance invariant missing: ${token}`);
for(const forbidden of ['SH-0005','SH-0006','kzokretuuigjhxjzdlmk.supabase.co','service_role','truncate table','drop table','delete from'])if(suite.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Forbidden acceptance token: ${forbidden}`);
const acceptanceAsset=`beta23-acceptance-suite.js?v=${version}`;
const fullRetailAsset=`beta23-full-retail.js?v=${version}`;
if(!engine.includes(acceptanceAsset))throw new Error(`Retail engine does not load ${acceptanceAsset}`);
if(!sw.includes(`./${acceptanceAsset}`))throw new Error(`Service worker does not cache ${acceptanceAsset}`);
if(!sw.includes(`./${fullRetailAsset}`))throw new Error(`Service worker does not cache ${fullRetailAsset}`);
if(!suite.includes("confirm('سيتم إنشاء بيع ومرتجع SELFTEST داخل Beta TEST فقط. متابعة؟')"))throw new Error('Transactional sandbox operator confirmation missing');
if(!suite.includes("business===BETA_BUSINESS_ID&&host===BETA_OPERATIONAL_HOST"))throw new Error('Transactional sandbox hard beta lock missing');
console.log(`Retail acceptance gate OK on ${version}`);
