const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'permissions-v2-owner-delivery-settings.sql'),'utf8');
const helper=fs.readFileSync(path.join(root,'permissions-v2-delivery-settings-routing.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function need(src,token,label){
  if(!src.toLowerCase().includes(token.toLowerCase()))throw new Error(label+' missing: '+token);
}

for(const token of [
  "('delivery.drivers.manage','إدارة مناديب التوصيل'",
  "('delivery.zones.manage','إدارة مناطق التوصيل'",
  "('delivery.drivers.manage','restaurant','commerce.delivery',true)",
  "('delivery.zones.manage','restaurant','commerce.delivery',true)",
  "'PV2-F4-DELIVERY-SETTINGS-58.29'",
  'create or replace function public.delivery_driver_save_v2',
  "has_action_permission_v2('delivery.drivers.manage')",
  'DRIVER_BRANCH_REASSIGN_NOT_ALLOWED',
  'create or replace function public.delivery_zone_save_v2',
  "has_action_permission_v2('delivery.zones.manage')",
  'DELIVERY_ZONE_BRANCH_REASSIGN_NOT_ALLOWED',
  'revoke insert,update,delete on table public.delivery_drivers from public,anon,authenticated',
  'revoke insert,update,delete on table public.delivery_zones from public,anon,authenticated'
])need(sql,token,'PV2-F4 SQL');

if(/on\s+conflict\s*\(employee_id,action_code\)\s*do\s+update/i.test(sql))
  throw new Error('PV2-F4 must not overwrite existing explicit Action overrides');

for(const token of [
  "rpc('delivery_driver_save_v2'",
  "rpc('delivery_zone_save_v2'",
  'saveDriver',
  'saveZone'
])need(helper,token,'PV2-F4 routing candidate');

if(/rest\(\s*['"]delivery_(?:drivers|zones)['"][\s\S]{0,260}?method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/i.test(helper))
  throw new Error('PV2-F4 routing candidate must not contain direct Delivery Settings DML');

if(!index.includes(`permissions-v2-delivery-settings-routing.js?v=${pkg.version}`))
  throw new Error('PV2-F4 runtime routing asset must be wired at package version');

function count(resource,method){
  const re=new RegExp("rest\\(\\s*['\"]"+resource+"['\"][\\s\\S]{0,360}?method\\s*:\\s*['\"]"+method+"['\"]","g");
  return (app.match(re)||[]).length;
}
const counts={
 driverPost:count('delivery_drivers','POST'),
 driverPatch:count('delivery_drivers','PATCH'),
 driverDelete:count('delivery_drivers','DELETE'),
 zonePost:count('delivery_zones','POST'),
 zonePatch:count('delivery_zones','PATCH'),
 zoneDelete:count('delivery_zones','DELETE')
};
const expected={driverPost:0,driverPatch:0,driverDelete:0,zonePost:0,zonePatch:0,zoneDelete:0};
for(const k of Object.keys(expected))if(counts[k]!==expected[k])
  throw new Error('PV2-F4 direct path count drift '+k+'='+counts[k]+' expected='+expected[k]);
const routed=(app.match(/__SharawlaPV2DeliverySettings/g)||[]).length;
if(routed!==8)throw new Error('PV2-F4 expected exactly 8 routed Delivery Settings surfaces, found '+routed);

console.log('PV2-F4 Delivery Drivers/Zones RUNTIME CUTOVER PASS — '+JSON.stringify(counts)+' routed='+routed);
