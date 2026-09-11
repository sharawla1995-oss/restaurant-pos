const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='10.5.4-beta.25')throw new Error(`Expected beta25 package, got ${pkg.version}`);
const ui=read('retail-finalization-ui.js');
const engine=read('retail-engine.js');
const sw=read('sw.js');
const sync=read('scripts/sync-version.js');
const required=[
  "const VERSION='10.5.4-beta.25'",
  'homeSidebarParity:true','searchEnhancements:true','inventoryFilters:true','stockCountDiffFilter:true',
  'data-retail-final-mirror','data-inv-filter="low"','data-count-diff',
  'بحث باسم الصنف أو الباركود','بحث باسم المورد أو الهاتف أو الرقم الضريبي',
  'بحث برقم الفاتورة أو البون أو العميل أو الهاتف','بحث برقم الطلب أو الهاتف أو اسم العميل',
  'بحث بالمورد أو رقم أمر الشراء أو الصنف','بحث برقم التحويل أو الفرع أو الصنف',
  'بحث باسم العرض أو الصنف أو نوع العرض','بحث برقم الوردية أو الموظف أو الحالة'
];
for(const token of required)if(!ui.includes(token))throw new Error(`Retail finalization invariant missing: ${token}`);
for(const forbidden of ['SH-0005','SH-0006','kzokretuuigjhxjzdlmk.supabase.co','service_role','truncate table','drop table','delete from'])if(ui.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`Forbidden finalization token: ${forbidden}`);
if(!engine.includes('retail-finalization-ui.js?v='))throw new Error('Retail Engine does not load retail-finalization-ui.js');
if(!sw.includes('./retail-finalization-ui.js?v='))throw new Error('Service worker does not cache retail-finalization-ui.js');
if(!sw.includes("url.pathname.endsWith('/retail-finalization-ui.js')"))throw new Error('Service worker fetch policy missing retail finalization runtime');
if(!sync.includes("'retail-finalization-ui.js'"))throw new Error('Version sync does not include retail finalization runtime');
if(!read('scripts/check-runtime-syntax.js').includes("'retail-finalization-ui.js'"))throw new Error('Runtime syntax gate does not parse retail finalization runtime');
console.log('Retail finalization gate OK');
