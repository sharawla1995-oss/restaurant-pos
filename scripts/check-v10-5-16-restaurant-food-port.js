const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
function ok(v,m){if(!v){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
const bridge=read('food-recipe-runtime-bridge-v10-5-16.js');
const basic=read('supabase-v10-5-16-food-recipe-basic-runtime.sql');
const advanced=read('supabase-v10-5-16-food-recipe-advanced-runtime.sql');
const ops=read('supabase-v10-5-16-restaurant-operations.sql');
const owner=read('supabase-v10-5-16-recipe-owner-transition.sql');
const approval=read('supabase-v10-5-16-return-approval-2h.sql');
const ui=read('v10-5-16-restaurant-closure-ui.js');
const app=read('app.js');
const index=read('index.html');

ok(bridge.includes('normalizeModifier')&&bridge.includes('qty'),'bridge keeps explicit modifier qty');
ok(basic.includes('oim.quantity')&&basic.includes('v_line.modifier_qty'),'food owner reads persisted modifier quantity');
ok(!basic.includes('base_quantity_delta*v_qty'),'modifier stock is not multiplied by sandwich qty');
ok(!/inventory_stock_assert_legacy_write_allowed_v2/i.test(advanced),'advanced runtime does not import Point4 legacy-write guard');
ok(!/inventory_stock_assert_legacy_write_allowed_v2/i.test(ops),'restaurant operations do not import Point4 legacy-write guard');
ok(!/Point\s*4|Point4|Canonical Stock/i.test(ops),'restaurant operations contain no Point4/Canonical Stock residue');
ok(!/jsonb_to_recordset\([^\n]*\)\s+with\s+ordinality/i.test(ops),'stock count does not use invalid recordset ordinality syntax');
ok(!/restaurant\.tables|restaurant_table|restaurant_floor/i.test(ops),'tables runtime is excluded');
ok(owner.includes('drop trigger if exists trg_recipe_order_item_fail_open_v1'),'legacy sale recipe trigger transition exists');
ok(owner.includes('drop trigger if exists trg_recipe_return_item_fail_open_v1'),'legacy return recipe trigger transition exists');
ok(owner.includes("column_name='quantity'"),'owner transition requires V10.5.15 exact extras');
ok(approval.includes("interval '2 hours'")&&!approval.includes("interval '5 minutes'"),'return approval lifetime is two hours');
ok(app.includes('effectiveApprovalStatus')&&app.includes("'expired'"),'expired approval is displayed as expired');
ok(app.includes("if(orderType==='delivery')")&&app.includes("if(!normalizePhone(phone))throw new Error('اكتب رقم موبايل العميل للدليفري')"),'delivery requires customer phone before save');
ok(app.includes("if(!deliveryAddress)throw new Error('اكتب عنوان التوصيل للدليفري')"),'delivery requires address before save');
ok(app.includes("if(!deliveryZone)throw new Error('اختار منطقة توصيل صحيحة')"),'delivery requires a real delivery zone before save');
ok(app.includes("const area=deliveryZone?String(deliveryZone.name||'').trim():null"),'delivery area comes from a valid zone, not placeholder text');
ok(!/tables/.test(ui.match(/const PAGES=new Set\([^\n]+/i)?.[0]||''),'tables route is excluded from production food port');
ok(index.includes('food-recipe-runtime-bridge-v10-5-16.js'),'desktop loads exact-qty recipe bridge');
ok(index.includes('v10-5-16-restaurant-closure-ui.js'),'desktop loads restaurant inventory/food UI');
console.log('V10.5.16_RESTAURANT_FOOD_PORT_STATIC_PASS');
