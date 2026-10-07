(function(global){
'use strict';
const VERSION='food-recipe-ui-v1.2-production';
const FEATURE='food.recipes';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=n=>Number(n||0).toFixed(2);
const qty=n=>Number(n||0).toFixed(3).replace(/\.000$/,'');
const txid=()=>global.crypto?.randomUUID?.()||('recipe-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const rest=(t,q='',o={})=>global.rest(t,q,o);
const rpc=(n,p={})=>global.rpc(n,p);
const toast=m=>global.toast?.(m);
const branch=()=>Number(global.currentBranchId?.()||0);
const featureOn=()=>global.runtimeFeatureEnabled?.(FEATURE)===true;
const admin=()=>global.isAdmin?.()===true;

function ensureStyles(){
  if(document.getElementById('foodRecipeProductionStyle'))return;
  const s=document.createElement('style');
  s.id='foodRecipeProductionStyle';
  s.textContent='.recipe-prod-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.recipe-prod-tabs{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}.recipe-prod-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.recipe-prod-kpi{border:1px solid rgba(128,128,128,.28);border-radius:14px;padding:12px}.recipe-prod-kpi span{display:block;opacity:.7;font-size:12px}.recipe-prod-kpi b{display:block;font-size:22px;margin-top:3px}.recipe-prod-status{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:3px 8px;font-size:12px}.recipe-prod-modal{width:min(860px,96vw);max-height:92vh;overflow:auto}.recipe-prod-lines{max-height:52vh;overflow:auto}.recipe-prod-qty{width:110px;min-width:90px}.recipe-prod-note{font-size:12px;opacity:.75}@media(max-width:720px){.recipe-prod-head{align-items:flex-start}.recipe-prod-qty{width:86px}}';
  document.head.appendChild(s);
}

function modal(title,body){
  ensureStyles();
  const m=document.createElement('div');
  m.className='modal';
  m.innerHTML='<div class="modal-card recipe-prod-modal"><div class="section-head"><div><h2>'+esc(title)+'</h2></div><button type="button" class="secondary" data-close>إغلاق</button></div>'+body+'</div>';
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]'))m.remove()};
  return m;
}

async function loadData(){
  const bid=branch();
  const [ingredients,recipes,products,stock]=await Promise.all([
    rest('ingredients','select=*&order=active.desc,name'),
    rest('recipes','select=*&order=product_id,ingredient_id'),
    rest('products','select=id,name,active,price&active=eq.true&order=name'),
    rest('ingredient_stock','select=*&branch_id=eq.'+bid).catch(()=>[])
  ]);
  return {ingredients:ingredients||[],recipes:recipes||[],products:products||[],stock:stock||[]};
}

function recipeCost(d,productId){
  const im=new Map(d.ingredients.map(i=>[String(i.id),i]));
  return d.recipes.filter(r=>String(r.product_id)===String(productId))
    .reduce((sum,r)=>sum+Number(r.quantity||0)*Number(im.get(String(r.ingredient_id))?.cost_per_unit||0),0);
}
function stockQty(d,ingredientId){
  return Number(d.stock.find(s=>String(s.ingredient_id)===String(ingredientId))?.quantity||0);
}

async function ingredientForm(current,done){
  const m=modal(current?'تعديل خامة':'خامة جديدة',
    '<div class="form-grid">'+
    '<label>اسم الخامة<input data-name value="'+esc(current?.name||'')+'" placeholder="مثال: لحم برجر"></label>'+
    '<label>الوحدة<input data-unit value="'+esc(current?.unit||'جرام')+'" placeholder="جرام / قطعة / مل"></label>'+
    '<label>تكلفة الوحدة<input data-cost type="number" min="0" step="0.0001" value="'+Number(current?.cost_per_unit||0)+'"></label>'+
    '<label>حد التنبيه الأدنى<input data-min type="number" min="0" step="0.0001" value="'+Number(current?.minimum_quantity||0)+'"></label>'+
    '</div><label class="inline-check"><input data-active type="checkbox" '+(current?.active===false?'':'checked')+'> الخامة فعالة</label>'+
    '<p class="recipe-prod-note">تعديل الخامة لا يغيّر رصيد المخزون الحالي ولا يعيد حساب المبيعات السابقة.</p>'+
    '<div class="modal-actions"><button type="button" class="primary" data-save>حفظ</button></div>');
  m.querySelector('[data-save]').onclick=async()=>{
    const name=m.querySelector('[data-name]').value.trim();
    const unit=m.querySelector('[data-unit]').value.trim();
    const cost=Number(m.querySelector('[data-cost]').value||0);
    const min=Number(m.querySelector('[data-min]').value||0);
    if(!name||!unit)return toast('اسم الخامة والوحدة مطلوبان');
    if(cost<0||min<0)return toast('القيم لا يمكن أن تكون سالبة');
    try{
      await rpc('recipe_pos_save_ingredient_v1',{
        p_ingredient_id:current?.id||null,p_name:name,p_unit:unit,
        p_cost_per_unit:cost,p_minimum_quantity:min,
        p_active:m.querySelector('[data-active]').checked,p_client_tx_id:txid()
      });
      m.remove();toast('تم حفظ الخامة');await done();
    }catch(e){toast(e.message)}
  };
}

async function recipeForm(d,productId,done){
  const activeIngredients=d.ingredients.filter(i=>i.active!==false);
  if(!activeIngredients.length)return toast('أضف خامة فعالة أولًا');
  const selected=String(productId||'');
  const productOptions='<option value="">اختر الصنف</option>'+d.products.map(p=>'<option value="'+p.id+'" '+(String(p.id)===selected?'selected':'')+'>'+esc(p.name)+'</option>').join('');
  const quantities=new Map(d.recipes.filter(r=>String(r.product_id)===selected).map(r=>[String(r.ingredient_id),Number(r.quantity||0)]));
  const rows=activeIngredients.map(i=>'<tr><td><b>'+esc(i.name)+'</b></td><td>'+esc(i.unit||'-')+'</td><td><input class="recipe-prod-qty" data-ing="'+i.id+'" type="number" min="0" step="0.0001" value="'+(quantities.get(String(i.id))||'')+'" placeholder="0"></td><td data-line-cost="'+i.id+'">0.00</td></tr>').join('');
  const m=modal(selected?'تعديل الوصفة':'Recipe جديدة',
    '<label>الصنف<select data-product>'+productOptions+'</select></label>'+
    '<div class="recipe-prod-lines table-wrap"><table><thead><tr><th>الخامة</th><th>الوحدة</th><th>الكمية المستخدمة</th><th>التكلفة</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="recipe-prod-note">كل عملية بيع جديدة تأخذ Snapshot من الوصفة وقت البيع. المرتجعات القديمة تظل مرتبطة بالـSnapshot التاريخي.</p>'+
    '<div class="modal-actions"><button type="button" class="primary" data-save>حفظ الوصفة</button></div>');
  const calc=()=>{
    for(const i of activeIngredients){
      const q=Number(m.querySelector('[data-ing="'+i.id+'"]')?.value||0);
      const cell=m.querySelector('[data-line-cost="'+i.id+'"]');
      if(cell)cell.textContent=money(q*Number(i.cost_per_unit||0));
    }
  };
  m.addEventListener('input',calc);calc();
  m.querySelector('[data-product]').onchange=async e=>{const pid=e.target.value;m.remove();await recipeForm(d,pid,done)};
  m.querySelector('[data-save]').onclick=async()=>{
    const pid=Number(m.querySelector('[data-product]').value||0);
    const items=activeIngredients.map(i=>({ingredient_id:Number(i.id),quantity:Number(m.querySelector('[data-ing="'+i.id+'"]')?.value||0)})).filter(x=>x.quantity>0);
    if(!pid)return toast('اختر الصنف');
    if(!items.length)return toast('أدخل خامة واحدة على الأقل');
    try{
      await rpc('recipe_pos_replace_recipe_v1',{p_product_id:pid,p_items:items,p_client_tx_id:txid()});
      m.remove();toast('تم حفظ الوصفة');await done();
    }catch(e){toast(e.message)}
  };
}

async function renderPage(tab='recipes'){
  ensureStyles();
  const root=document.getElementById('page');
  if(!root)return;
  if(!featureOn()){root.innerHTML='<div class="panel"><div class="empty">ميزة الوصفات غير مفعلة لهذا النشاط من Sharawla Admin.</div></div>';return}
  if(!admin()){root.innerHTML='<div class="panel"><div class="empty">إدارة الوصفات متاحة للمدير فقط.</div></div>';return}
  root.innerHTML='<div class="panel"><div class="empty">جاري تحميل الوصفات...</div></div>';
  let d;
  try{d=await loadData()}catch(e){root.innerHTML='<div class="panel"><div class="empty">'+esc(e.message)+'</div></div>';return}

  const activeIngredients=d.ingredients.filter(i=>i.active!==false);
  const productsWithRecipe=new Set(d.recipes.map(r=>String(r.product_id))).size;
  const totalStockValue=d.stock.reduce((sum,s)=>{
    const i=d.ingredients.find(x=>String(x.id)===String(s.ingredient_id));
    return sum+Number(s.quantity||0)*Number(i?.cost_per_unit||0);
  },0);

  const recipesHtml='<div class="recipe-prod-head"><div><h2>🍲 الوصفات</h2><p class="muted">Recipe Basic Production — نفس فكرة واجهة الـBeta على الـowner الآمن الحالي.</p></div><button class="primary" data-new-recipe>+ Recipe</button></div>'+
    '<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الخامات</th><th>Food Cost</th><th>إجراء</th></tr></thead><tbody>'+
    (d.products.map(p=>{const lines=d.recipes.filter(r=>String(r.product_id)===String(p.id));return '<tr><td><b>'+esc(p.name)+'</b></td><td>'+lines.length+'</td><td>'+money(recipeCost(d,p.id))+'</td><td><button class="secondary" data-edit-recipe="'+p.id+'">'+(lines.length?'تعديل':'إنشاء')+'</button></td></tr>'}).join('')||'<tr><td colspan="4">لا توجد أصناف</td></tr>')+
    '</tbody></table></div>';

  const ingredientsHtml='<div class="recipe-prod-head"><div><h2>🧪 الخامات</h2><p class="muted">الرصيد المعروض للفرع الحالي. إدارة الرصيد نفسها تظل خارج Recipe.</p></div><button class="primary" data-new-ingredient>+ خامة</button></div>'+
    '<div class="table-wrap"><table><thead><tr><th>الخامة</th><th>الوحدة</th><th>الرصيد</th><th>تكلفة الوحدة</th><th>حد أدنى</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>'+
    (d.ingredients.map(i=>'<tr><td><b>'+esc(i.name)+'</b></td><td>'+esc(i.unit||'-')+'</td><td>'+qty(stockQty(d,i.id))+'</td><td>'+money(i.cost_per_unit)+'</td><td>'+qty(i.minimum_quantity)+'</td><td><span class="recipe-prod-status">'+(i.active===false?'موقوفة':'فعالة')+'</span></td><td><button class="secondary" data-edit-ingredient="'+i.id+'">تعديل</button></td></tr>').join('')||'<tr><td colspan="7">لا توجد خامات</td></tr>')+
    '</tbody></table></div>';

  root.innerHTML='<section class="panel">'+
    '<div class="recipe-prod-grid"><div class="recipe-prod-kpi"><span>الخامات الفعالة</span><b>'+activeIngredients.length+'</b></div><div class="recipe-prod-kpi"><span>أصناف لها Recipe</span><b>'+productsWithRecipe+'</b></div><div class="recipe-prod-kpi"><span>قيمة خامات الفرع</span><b>'+money(totalStockValue)+'</b></div></div>'+
    '<div class="recipe-prod-tabs"><button class="'+(tab==='recipes'?'primary':'secondary')+'" data-tab="recipes">🍲 الوصفات</button><button class="'+(tab==='ingredients'?'primary':'secondary')+'" data-tab="ingredients">🧪 الخامات</button></div>'+
    '<div data-content>'+(tab==='recipes'?recipesHtml:ingredientsHtml)+'</div></section>';

  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>renderPage(b.dataset.tab));
  const reload=()=>renderPage(tab);
  root.querySelector('[data-new-recipe]')?.addEventListener('click',()=>recipeForm(d,null,reload));
  root.querySelectorAll('[data-edit-recipe]').forEach(b=>b.onclick=()=>recipeForm(d,b.dataset.editRecipe,reload));
  root.querySelector('[data-new-ingredient]')?.addEventListener('click',()=>ingredientForm(null,reload));
  root.querySelectorAll('[data-edit-ingredient]').forEach(b=>b.onclick=()=>ingredientForm(d.ingredients.find(i=>String(i.id)===String(b.dataset.editIngredient)),reload));
}

global.SharawlaFoodRecipeUIV1=Object.freeze({version:VERSION,feature:FEATURE,renderPage});
})(window);
