const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
const app=read('app.js'),attendance=read('hr-attendance-admin-v1.js'),core=read('hr-core-admin-v1.js'),runtime=read('v10-5-14-ops-hr-summary.js'),sql=read('supabase-v10-5-15-order-modifier-read-parity.sql');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(app.includes("window.sharawlaHasPermissionLocal=function"),'app must expose loaded permission snapshot');
ok(app.includes("window.dispatchEvent(new Event('sharawla:auth-ready'))"),'app must signal auth-ready after session hydration');
ok((app.match(/sharawla:auth-ready/g)||[]).length>=2,'online and offline bootstrap must both signal auth-ready');
for(const [name,src] of [['attendance',attendance],['core',core]]){
 ok(src.includes("addEventListener('sharawla:auth-ready',refreshPermissions)"),name+' must refresh on auth-ready');
 ok(src.includes("global.sharawlaHasPermissionLocal"),name+' must reuse loaded POS permissions');
}
ok(attendance.includes("group.classList.add('hidden')"),'legacy HR child group must stay hidden from main sidebar');
ok(attendance.includes("sharawla:hr-nav-ready"),'HR permission router must signal shell immediately');
ok(runtime.includes("data-v14-page=\"hr\"")||runtime.includes("dataset.v14Page='hr'"),'single HR root entry must exist');
ok(runtime.includes("b.dataset.v14Page==='hr'"),'HR root must route to hub');
ok(runtime.includes("addEventListener('sharawla:hr-nav-ready',injectNav)"),'HR root must render as soon as permissions are ready');
ok(runtime.includes("setTimeout(init,150)"),'V15 runtime bootstrap delay must be reduced');
ok(app.includes('data-mod-qty'),'modifier quantity input must exist');
ok(app.includes('modifierCount(md'),'modifier quantity semantics must exist');
ok(app.includes('cartItemLineTotal(i)'),'cart line total must separate item quantity from modifier quantity');
ok(app.includes('expandedItemModifiers(i)'),'modifier quantities must persist as repeated durable modifier rows');
ok(app.includes('× ${m.qty}'),'printed modifier count must be visible');
ok(app.includes('modifiers:itemPayload[idx]?.modifiers'),'immediate receipt must retain checkout modifiers before reread');
ok(sql.includes('order_item_modifiers_staff_read_v15'),'branch-scoped modifier read policy must exist');
ok(sql.includes('public.has_branch_access(o.branch_id)'),'modifier reads must stay branch-scoped');
console.log('V10.5.15_HR_NAV_AND_MODIFIER_QTY_PASS');
