const fs=require('fs');
const read=p=>fs.readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='10.5.4-beta.24')throw new Error('Beta24 version mismatch');
const r=read('retail-engine.js'),c=read('beta24-release-certification.js');
for(const t of ['beta24-release-certification.js?v=','sharawla-beta24-release-certification'])if(!r.includes(t))throw new Error('Retail loader missing '+t);
for(const t of ['Release Certification','Beta Isolation Lock','Sales Type Matrix','Inventory Ledger Integrity','Payment Reconciliation','Duplicate Transaction Guard','Update/LKG Health','Offline Queue Health','Notification Sound','Printer Output','نسخ التقرير الشامل','مسح الكل','RELEASE BLOCKED'])if(!c.includes(t))throw new Error('Certification contract missing '+t);
for(const bad of ['SH-0005','SH-0006','kzokretuuigjhxjzdlmk.supabase.co','DELETE FROM'])if(c.includes(bad))throw new Error('Certification safety violation '+bad);
console.log('Beta24 Release Certification gate OK');
