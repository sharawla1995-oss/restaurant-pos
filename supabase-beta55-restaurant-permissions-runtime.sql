-- Sharawla POS 10.5.4-beta.55 — Restaurant Closure / Action Permission V2
-- Sandbox-first additive migration. Production remains unchanged until explicit release approval.
-- Purpose:
--   * keep the proven Food/Recipe engines intact
--   * enforce sensitive writes through explicit Action Permission V2 wrappers
--   * add backend audit rows for every protected write
--   * prevent direct authenticated bypass of the legacy write RPCs

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('food.ingredients.manage','إضافة وتعديل الخامات','food',null,true,700),
 ('food.ingredients.conversion.manage','إدارة تحويلات وحدات الخامات','food',null,true,701),
 ('food.ingredients.stock.adjust','تعديل رصيد خامة','food',null,true,702),
 ('food.recipes.manage','إنشاء وتعديل الوصفات','food',null,true,710),
 ('food.recipes.activate','تفعيل نسخة وصفة','food',null,true,711),
 ('food.prep.manage','إدارة التحضيرات','food',null,true,720),
 ('food.production.start','بدء دفعة إنتاج','food',null,true,721),
 ('food.production.complete','إكمال دفعة إنتاج','food',null,true,722),
 ('food.waste.post','ترحيل هالك خامات','food',null,true,730),
 ('food.suppliers.manage','إدارة موردي المطعم','food',null,true,740),
 ('food.purchasing.create','إنشاء أمر شراء خامات','food',null,true,741),
 ('food.purchasing.approve','اعتماد أمر شراء خامات','food',null,true,742),
 ('food.purchasing.receive','استلام مشتريات خامات','food',null,true,743),
 ('food.purchasing.return','مرتجع مورد خامات','food',null,true,744),
 ('food.stock_count.post','ترحيل جرد الخامات','food',null,true,750),
 ('food.transfer.create','إنشاء تحويل خامات','food',null,true,751),
 ('food.transfer.receive','استلام تحويل خامات','food',null,true,752),
 ('food.transfer.cancel','إلغاء تحويل خامات قبل الاستلام','food',null,true,753),
 ('restaurant.tables.manage','إدارة الصالات والترابيزات','restaurant',null,true,760),
 ('restaurant.tables.use','فتح/إغلاق جلسات الترابيزات','restaurant',null,true,761)
on conflict(code) do update
set name_ar=excluded.name_ar,
    domain=excluded.domain,
    legacy_permission=null,
    active=true,
    sort_order=excluded.sort_order;

create or replace function public.food_ingredient_save_action_v2(
 p_ingredient_id bigint,
 p_name text,
 p_base_unit_code text,
 p_purchase_unit_code text,
 p_sku text,
 p_barcode text,
 p_cost_per_base_unit numeric,
 p_minimum_quantity numeric,
 p_track_inventory boolean,
 p_usable_yield_percent numeric,
 p_shelf_life_minutes integer,
 p_active boolean
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.ingredients.manage') then raise exception 'ليس لديك صلاحية إضافة أو تعديل الخامات'; end if;
 v_id:=public.food_ingredient_save_v1(p_ingredient_id,p_name,p_base_unit_code,p_purchase_unit_code,p_sku,p_barcode,p_cost_per_base_unit,p_minimum_quantity,p_track_inventory,p_usable_yield_percent,p_shelf_life_minutes,p_active);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.ingredients.manage','ingredient',v_id,jsonb_build_object('name',p_name,'active',p_active));
 return v_id;
end;$$;

create or replace function public.food_ingredient_conversion_save_action_v2(
 p_ingredient_id bigint,
 p_from_unit_code text,
 p_to_unit_code text,
 p_factor numeric,
 p_active boolean
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.ingredients.conversion.manage') then raise exception 'ليس لديك صلاحية إدارة تحويلات الوحدات'; end if;
 v_id:=public.food_ingredient_conversion_save_v1(p_ingredient_id,p_from_unit_code,p_to_unit_code,p_factor,p_active);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.ingredients.conversion.manage','ingredient_unit_conversion',v_id,jsonb_build_object('ingredient_id',p_ingredient_id,'from',p_from_unit_code,'to',p_to_unit_code,'factor',p_factor));
 return v_id;
end;$$;

create or replace function public.food_ingredient_stock_adjust_action_v2(
 p_branch_id bigint,
 p_ingredient_id bigint,
 p_quantity_delta numeric,
 p_unit_cost numeric,
 p_reason text,
 p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.ingredients.stock.adjust') then raise exception 'ليس لديك صلاحية تعديل مخزون الخامات'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 v_id:=public.food_ingredient_stock_adjust_v1(p_branch_id,p_ingredient_id,p_quantity_delta,p_unit_cost,p_reason,p_client_tx_id);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),p_branch_id,'food.ingredients.stock.adjust','ingredient_adjustment',v_id,jsonb_build_object('ingredient_id',p_ingredient_id,'quantity_delta',p_quantity_delta,'client_tx_id',p_client_tx_id));
 return v_id;
end;$$;

create or replace function public.food_recipe_save_draft_action_v2(
 p_product_id bigint,
 p_variant_id bigint,
 p_name text,
 p_output_quantity numeric,
 p_output_unit_code text,
 p_lines jsonb,
 p_modifier_impacts jsonb,
 p_removal_mappings jsonb,
 p_notes text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.recipes.manage') then raise exception 'ليس لديك صلاحية إدارة الوصفات'; end if;
 v_id:=public.food_recipe_save_draft_v1(p_product_id,p_variant_id,p_name,p_output_quantity,p_output_unit_code,p_lines,p_modifier_impacts,p_removal_mappings,p_notes);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.recipes.manage','food_recipe_version',v_id,jsonb_build_object('product_id',p_product_id,'variant_id',p_variant_id));
 return v_id;
end;$$;

create or replace function public.food_recipe_activate_version_action_v2(p_recipe_version_id bigint) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.recipes.activate') then raise exception 'ليس لديك صلاحية تفعيل الوصفات'; end if;
 v_id:=public.food_recipe_activate_version_v1(p_recipe_version_id);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.recipes.activate','food_recipe_version',v_id,jsonb_build_object('recipe_version_id',p_recipe_version_id));
 return v_id;
end;$$;

create or replace function public.food_prep_item_save_action_v2(
 p_prep_item_id bigint,
 p_name text,
 p_output_ingredient_id bigint,
 p_base_unit_code text,
 p_default_batch_quantity numeric,
 p_shelf_life_minutes integer,
 p_notes text,
 p_active boolean
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.prep.manage') then raise exception 'ليس لديك صلاحية إدارة التحضيرات'; end if;
 v_id:=public.food_prep_item_save_v1(p_prep_item_id,p_name,p_output_ingredient_id,p_base_unit_code,p_default_batch_quantity,p_shelf_life_minutes,p_notes,p_active);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.prep.manage','food_prep_item',v_id,jsonb_build_object('name',p_name,'output_ingredient_id',p_output_ingredient_id));
 return v_id;
end;$$;

create or replace function public.food_prep_recipe_save_draft_action_v2(
 p_prep_item_id bigint,
 p_output_quantity numeric,
 p_output_unit_code text,
 p_lines jsonb,
 p_notes text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.prep.manage') then raise exception 'ليس لديك صلاحية إدارة وصفات التحضير'; end if;
 v_id:=public.food_prep_recipe_save_draft_v1(p_prep_item_id,p_output_quantity,p_output_unit_code,p_lines,p_notes);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),null,'food.prep.manage','food_recipe_version',v_id,jsonb_build_object('prep_item_id',p_prep_item_id));
 return v_id;
end;$$;

create or replace function public.food_production_batch_start_action_v2(
 p_branch_id bigint,
 p_prep_item_id bigint,
 p_planned_output_quantity numeric,
 p_batch_number text,
 p_notes text,
 p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.production.start') then raise exception 'ليس لديك صلاحية بدء دفعة إنتاج'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 v_id:=public.food_production_batch_start_v1(p_branch_id,p_prep_item_id,p_planned_output_quantity,p_batch_number,p_notes,p_client_tx_id);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),p_branch_id,'food.production.start','food_production_batch',v_id,jsonb_build_object('prep_item_id',p_prep_item_id,'client_tx_id',p_client_tx_id));
 return v_id;
end;$$;

create or replace function public.food_production_batch_complete_action_v2(
 p_production_batch_id bigint,
 p_actual_output_quantity numeric,
 p_consumptions jsonb,
 p_client_tx_id text,
 p_notes text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;v_branch bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.production.complete') then raise exception 'ليس لديك صلاحية إكمال دفعة إنتاج'; end if;
 select branch_id into v_branch from public.food_production_batches where id=p_production_batch_id;
 if v_branch is null or not public.has_branch_access(v_branch) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 v_id:=public.food_production_batch_complete_v1(p_production_batch_id,p_actual_output_quantity,p_consumptions,p_client_tx_id,p_notes);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),v_branch,'food.production.complete','food_production_batch',v_id,jsonb_build_object('actual_output_quantity',p_actual_output_quantity,'client_tx_id',p_client_tx_id));
 return v_id;
end;$$;

create or replace function public.food_waste_post_action_v2(
 p_branch_id bigint,
 p_ingredient_id bigint,
 p_prep_item_id bigint,
 p_shift_id bigint,
 p_reason_code text,
 p_quantity numeric,
 p_unit_code text,
 p_notes text,
 p_client_tx_id text
) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('food.waste.post') then raise exception 'ليس لديك صلاحية ترحيل الهالك'; end if;
 if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية لهذا الفرع'; end if;
 v_id:=public.food_waste_post_v1(p_branch_id,p_ingredient_id,p_prep_item_id,p_shift_id,p_reason_code,p_quantity,p_unit_code,p_notes,p_client_tx_id);
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(public.current_employee_id(),p_branch_id,'food.waste.post','food_waste_event',v_id,jsonb_build_object('ingredient_id',p_ingredient_id,'quantity',p_quantity,'unit_code',p_unit_code,'client_tx_id',p_client_tx_id));
 return v_id;
end;$$;

-- Direct authenticated calls to the legacy write RPCs are intentionally blocked.
-- The new wrappers keep the old proven implementations as internal implementation details.
revoke all on function public.food_ingredient_save_v1(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean) from public,authenticated;
revoke all on function public.food_ingredient_conversion_save_v1(bigint,text,text,numeric,boolean) from public,authenticated;
revoke all on function public.food_ingredient_stock_adjust_v1(bigint,bigint,numeric,numeric,text,text) from public,authenticated;
revoke all on function public.food_recipe_save_draft_v1(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text) from public,authenticated;
revoke all on function public.food_recipe_activate_version_v1(bigint) from public,authenticated;
revoke all on function public.food_prep_item_save_v1(bigint,text,bigint,text,numeric,integer,text,boolean) from public,authenticated;
revoke all on function public.food_prep_recipe_save_draft_v1(bigint,numeric,text,jsonb,text) from public,authenticated;
revoke all on function public.food_production_batch_start_v1(bigint,bigint,numeric,text,text,text) from public,authenticated;
revoke all on function public.food_production_batch_complete_v1(bigint,numeric,jsonb,text,text) from public,authenticated;
revoke all on function public.food_waste_post_v1(bigint,bigint,bigint,bigint,text,numeric,text,text,text) from public,authenticated;

grant execute on function public.food_ingredient_save_action_v2(bigint,text,text,text,text,text,numeric,numeric,boolean,numeric,integer,boolean) to authenticated;
grant execute on function public.food_ingredient_conversion_save_action_v2(bigint,text,text,numeric,boolean) to authenticated;
grant execute on function public.food_ingredient_stock_adjust_action_v2(bigint,bigint,numeric,numeric,text,text) to authenticated;
grant execute on function public.food_recipe_save_draft_action_v2(bigint,bigint,text,numeric,text,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.food_recipe_activate_version_action_v2(bigint) to authenticated;
grant execute on function public.food_prep_item_save_action_v2(bigint,text,bigint,text,numeric,integer,text,boolean) to authenticated;
grant execute on function public.food_prep_recipe_save_draft_action_v2(bigint,numeric,text,jsonb,text) to authenticated;
grant execute on function public.food_production_batch_start_action_v2(bigint,bigint,numeric,text,text,text) to authenticated;
grant execute on function public.food_production_batch_complete_action_v2(bigint,numeric,jsonb,text,text) to authenticated;
grant execute on function public.food_waste_post_action_v2(bigint,bigint,bigint,bigint,text,numeric,text,text,text) to authenticated;

commit;
