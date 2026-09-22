const fs=require('fs');
function body(file,sig){const s=fs.readFileSync(file,'utf8');const a=s.indexOf('create or replace function public.'+sig);if(a<0)throw Error(sig+' missing');const b=s.indexOf('end;$$;',a);if(b<0)throw Error(sig+' unterminated');return s.slice(a,b+7);}
function order(b,labels){let last=-1;for(const [name,tok] of labels){const i=b.indexOf(tok);if(i<0)throw Error(name+' missing');if(i<=last)throw Error(name+' out of order');last=i;}}
const b14=body('supabase-engine-recipe-advanced-v1-runtime.sql','food_production_batch_complete_v1');
order(b14,[['replay',"if v_batch.status='completed'"],['freeze','into v_frozen_inputs'],['guard','inventory_stock_assert_legacy_write_allowed_v2'],['commit','update public.food_production_consumptions pc'],['execute','insert into public.ingredient_stock(branch_id,ingredient_id,quantity)']]);
if(!b14.includes("where x.track_inventory=true and x.actual_base_quantity>0"))throw Error('#14 tracked positive inputs not frozen');
if(!b14.includes("select v_prep.output_ingredient_id where coalesce(v_output_track,false)=true"))throw Error('#14 tracked output missing');
if(b14.slice(b14.indexOf('inventory_stock_assert_legacy_write_allowed_v2')).includes('jsonb_array_elements(coalesce(p_consumptions')) )throw Error('#14 payload rediscovery after guard');
const b15=body('supabase-beta55-restaurant-operations.sql','food_stock_count_post_v1');
order(b15,[['replay','select id into v_id from public.food_stock_counts where client_tx_id=v_key'],['validate','Point 4 FT-5: validate and freeze'],['guard','inventory_stock_assert_legacy_write_allowed_v2'],['commit','insert into public.food_stock_counts'],['execute','insert into public.ingredient_stock(branch_id,ingredient_id,quantity)']]);
if(!b15.includes('select distinct x.ingredient_id'))throw Error('#15 distinct guard set missing');
if(!b15.includes('i.track_inventory=true'))throw Error('#15 tracked validation/guard missing');
console.log('FT-5 semantic PASS: #14 + #15');