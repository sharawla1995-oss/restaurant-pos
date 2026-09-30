'use strict';
const fs=require('fs'),assert=require('assert');

const app=fs.readFileSync('app.js','utf8');
const hr=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const nav=fs.readFileSync('product-map-navigation-v1.js','utf8');
const ext=fs.readFileSync('supabase-hr-attendance-payroll-extension-v1.sql','utf8');
const patch=fs.readFileSync('supabase-rc1-hr-action-profile-bindings-v1.sql','utf8');

assert(app.includes("function activateSidebarRoute(target,source='click')"),'core sidebar route activator missing');
assert(app.includes("showPage(b.dataset.page)"),'pointer/click route must still dispatch through showPage');
assert(app.includes("async function renderRestaurantClosureRoute(page)"),'Restaurant Closure core delegate missing');
for(const route of ['tables','foodIngredients','foodRecipes','foodOperations']){
  assert(
    new RegExp(route+":\\(\\)=>renderRestaurantClosureRoute\\('"+route+"'\\)").test(app),
    'Core PAGE_RENDERERS must own '+route+' so pointerup cannot hit unknown-route fail-closed'
  );
}
assert(app.includes("error.code='RESTAURANT_CLOSURE_ADAPTER_MISSING'"),'Restaurant Closure delegate must fail closed when adapter is missing');

assert(hr.includes("group.setAttribute('data-beta55-hr-group','1')"),'HR group must publish Product Map ownership marker');
assert(nav.includes("node.matches?.('[data-beta55-hr-group],.hr-nav-group')"),'Product Map must recognize HR group marker/class fallback');
assert(nav.includes("if(routeKey==='__hr_group__')return 'hr'"),'Product Map HR grouping contract missing');

const newActions=[
 'hr.attendance.view','hr.attendance.manage','hr.attendance.adjust',
 'hr.schedules.view','hr.schedules.manage','hr.geofence.manage',
 'hr.staff_accounts.manage','hr.deduction_rules.view','hr.deduction_rules.manage',
 'hr.leave.view','hr.leave.manage','hr.reports.view','hr.settings.manage'
];
for(const sql of [ext,patch]){
  assert(sql.includes('insert into public.permission_action_profiles_v2'),'HR action-profile binding insert missing');
  assert(sql.includes("where action_code='hr.employees.view' and active=true"),'HR bindings must mirror established HR profile applicability');
  assert(sql.includes('on conflict(action_code,profile_code) do update'),'HR bindings must be idempotent');
  for(const action of newActions)assert(sql.includes("('"+action+"')"),'HR profile binding missing '+action);
}
assert((patch.match(/\bbegin;/gi)||[]).length===1 && (patch.match(/\bcommit;/gi)||[]).length===1,'HR corrective patch must remain transactional');

console.log('RC1 practical nav/HR hotfix PASS — restaurant_routes=4; hr_group=owned; hr_profile_actions='+newActions.length);
