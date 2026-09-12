-- Sharawla Web Portal V1 — secure public API for Beta operational backend
-- Additive. No direct anon table writes. Public mutations are validated security-definer RPCs.
begin;

create table if not exists public.web_membership_requests_v1(
 id bigserial primary key,
 branch_id bigint not null references public.branches(id) on delete restrict,
 requested_plan_id bigint references public.membership_plans_v1(id) on delete set null,
 customer_name text not null,
 customer_phone text not null,
 notes text,
 status text not null default 'new' check(status in('new','contacted','converted','cancelled')),
 client_tx_id text not null unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create or replace function public.web_profile_bootstrap_v1(p_profile text)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare prof text:=lower(trim(coalesce(p_profile,'')));b jsonb;w jsonb;br jsonb;extra jsonb:='{}'::jsonb;begin
 if prof not in('retail','service','membership','logistics') then raise exception 'Profile غير مدعوم في Web Portal V1';end if;
 select to_jsonb(x) into b from (select business_name,tagline,phone,address,logo_url,currency_symbol,primary_color,accent_color from public.business_settings order by id limit 1)x;
 select to_jsonb(x) into w from (select theme_name,page_background,surface_color,text_color,card_radius,show_contact,show_locations,show_whatsapp,whatsapp_url,show_facebook,facebook_url,show_instagram,instagram_url from public.website_settings order by id limit 1)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order,x.id),'[]'::jsonb) into br from (select id,name,address,phone,location_url,whatsapp,coalesce(sort_order,0) sort_order from public.branches where active is distinct from false and website_visible=true)x;
 if prof='service' then
   select jsonb_build_object('services',coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)) into extra from (select id,code,name,category,duration_minutes,base_price from public.service_catalog where active=true)x;
 elsif prof='membership' then
   extra:=jsonb_build_object(
    'plans',(select coalesce(jsonb_agg(to_jsonb(x) order by x.price,x.name),'[]'::jsonb) from (select id,code,name,duration_days,price,freeze_days_allowed,visits_limit from public.membership_plans_v1 where active=true)x),
    'classes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at),'[]'::jsonb) from (select id,branch_id,name,starts_at,ends_at,capacity from public.membership_classes_v1 where status='scheduled' and starts_at>=now() and starts_at<now()+interval '60 days')x)
   );
 elsif prof='logistics' then
   select jsonb_build_object('zones',coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)) into extra from (select id,code,name,base_fee,extra_kg_fee from public.logistics_zones_v1 where active=true)x;
 end if;
 return jsonb_build_object('ok',true,'profile',prof,'business',coalesce(b,'{}'::jsonb),'website',coalesce(w,'{}'::jsonb),'branches',coalesce(br,'[]'::jsonb),'data',coalesce(extra,'{}'::jsonb));
end;$$;

create or replace function public.web_service_booking_v1(p_branch_id bigint,p_service_id bigint,p_customer_name text,p_customer_phone text,p_starts_at timestamptz,p_notes text,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');ph text:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9+]','','g');cid bigint;sid bigint;dur integer;aid bigint;begin
 if k is null then raise exception 'معرف الطلب مطلوب';end if;if char_length(ph)<8 then raise exception 'رقم الهاتف غير صحيح';end if;if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'الاسم مطلوب';end if;if p_starts_at<now()+interval '15 minutes' then raise exception 'اختر موعدًا قادمًا';end if;
 if not exists(select 1 from public.branches where id=p_branch_id and active is distinct from false and website_visible=true) then raise exception 'الفرع غير متاح للحجز';end if;
 select id,duration_minutes into sid,dur from public.service_catalog where id=p_service_id and active=true;if sid is null then raise exception 'الخدمة غير متاحة';end if;
 perform pg_advisory_xact_lock(hashtextextended('web-service:'||k,0));select id into aid from public.service_appointments_v1 where client_tx_id=k;if aid is not null then return jsonb_build_object('ok',true,'appointment_id',aid,'duplicate',true);end if;
 select id into cid from public.customers where regexp_replace(coalesce(phone,''),'[^0-9+]','','g')=ph order by id limit 1;if cid is null then insert into public.customers(name,phone,notes) values(trim(p_customer_name),ph,'Created from Sharawla Web Portal') returning id into cid;end if;
 insert into public.service_appointments_v1(branch_id,customer_id,service_id,starts_at,ends_at,status,source,notes,client_tx_id) values(p_branch_id,cid,p_service_id,p_starts_at,p_starts_at+make_interval(mins=>greatest(coalesce(dur,30),1)),'booked','website',nullif(trim(coalesce(p_notes,'')),''),k) returning id into aid;
 return jsonb_build_object('ok',true,'appointment_id',aid,'duplicate',false);
end;$$;

create or replace function public.web_membership_request_v1(p_branch_id bigint,p_plan_id bigint,p_customer_name text,p_customer_phone text,p_notes text,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$declare k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');ph text:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9+]','','g');rid bigint;begin
 if k is null then raise exception 'معرف الطلب مطلوب';end if;if char_length(ph)<8 then raise exception 'رقم الهاتف غير صحيح';end if;if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'الاسم مطلوب';end if;
 if not exists(select 1 from public.branches where id=p_branch_id and active is distinct from false and website_visible=true) then raise exception 'الفرع غير متاح';end if;
 if p_plan_id is not null and not exists(select 1 from public.membership_plans_v1 where id=p_plan_id and active=true) then raise exception 'الخطة غير متاحة';end if;
 perform pg_advisory_xact_lock(hashtextextended('web-membership:'||k,0));select id into rid from public.web_membership_requests_v1 where client_tx_id=k;if rid is not null then return jsonb_build_object('ok',true,'request_id',rid,'duplicate',true);end if;
 insert into public.web_membership_requests_v1(branch_id,requested_plan_id,customer_name,customer_phone,notes,client_tx_id) values(p_branch_id,p_plan_id,trim(p_customer_name),ph,nullif(trim(coalesce(p_notes,'')),''),k) returning id into rid;return jsonb_build_object('ok',true,'request_id',rid,'duplicate',false);
end;$$;

create or replace function public.web_membership_book_class_v1(p_class_id bigint,p_member_code text,p_phone text,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$declare k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');mid bigint;bid bigint;cap integer;used integer;begin
 if k is null then raise exception 'معرف الطلب مطلوب';end if;if char_length(ph)<8 or nullif(trim(coalesce(p_member_code,'')),'') is null then raise exception 'بيانات العضو غير مكتملة';end if;
 select m.id into mid from public.membership_members_v1 m join public.customers c on c.id=m.customer_id where lower(m.member_code)=lower(trim(p_member_code)) and regexp_replace(coalesce(c.phone,''),'[^0-9+]','','g')=ph and m.status='active' limit 1;if mid is null then raise exception 'تعذر التحقق من العضوية';end if;
 if not exists(select 1 from public.membership_subscriptions_v1 s where s.member_id=mid and s.status='active' and current_date between s.starts_on and s.ends_on) then raise exception 'لا يوجد اشتراك ساري';end if;
 select id,capacity into bid,cap from public.membership_classes_v1 where id=p_class_id and status='scheduled' and starts_at>now();if bid is null then raise exception 'الحصة غير متاحة';end if;
 perform pg_advisory_xact_lock(hashtextextended('web-class:'||p_class_id::text,0));select count(*) into used from public.membership_bookings_v1 where class_id=p_class_id and status='booked';if used>=cap then raise exception 'الحصة مكتملة';end if;
 if exists(select 1 from public.membership_bookings_v1 where client_tx_id=k) then return jsonb_build_object('ok',true,'duplicate',true);end if;
 insert into public.membership_bookings_v1(class_id,member_id,status,client_tx_id) values(p_class_id,mid,'booked',k);return jsonb_build_object('ok',true,'duplicate',false);
end;$$;

create or replace function public.web_logistics_track_v1(p_tracking_number text,p_phone text)
returns jsonb language plpgsql stable security definer set search_path=public
as $$declare ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');s public.logistics_shipments_v1%rowtype;events jsonb;begin
 if char_length(ph)<8 or nullif(trim(coalesce(p_tracking_number,'')),'') is null then raise exception 'بيانات التتبع غير مكتملة';end if;
 select * into s from public.logistics_shipments_v1 where lower(tracking_number)=lower(trim(p_tracking_number)) and regexp_replace(recipient_phone,'[^0-9+]','','g')=ph limit 1;if not found then raise exception 'الشحنة غير موجودة';end if;
 select coalesce(jsonb_agg(jsonb_build_object('status',status,'location',location,'note',note,'created_at',created_at) order by created_at),'[]'::jsonb) into events from public.logistics_tracking_events_v1 where shipment_id=s.id;
 return jsonb_build_object('ok',true,'tracking_number',s.tracking_number,'status',s.status,'recipient_name',s.recipient_name,'shipping_fee',s.shipping_fee,'cod_amount',s.cod_amount,'created_at',s.created_at,'delivered_at',s.delivered_at,'events',events);
end;$$;

create or replace function public.web_logistics_pickup_v1(p_branch_id bigint,p_contact_name text,p_contact_phone text,p_address text,p_scheduled_at timestamptz,p_notes text,p_client_tx_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$declare k text:=nullif(trim(coalesce(p_client_tx_id,'')),'');ph text:=regexp_replace(coalesce(p_contact_phone,''),'[^0-9+]','','g');rid bigint;begin
 if k is null then raise exception 'معرف الطلب مطلوب';end if;if char_length(ph)<8 or nullif(trim(coalesce(p_contact_name,'')),'') is null or nullif(trim(coalesce(p_address,'')),'') is null then raise exception 'بيانات الاستلام غير مكتملة';end if;
 if not exists(select 1 from public.branches where id=p_branch_id and active is distinct from false and website_visible=true) then raise exception 'الفرع غير متاح';end if;
 perform pg_advisory_xact_lock(hashtextextended('web-pickup:'||k,0));select id into rid from public.logistics_pickup_requests_v1 where client_tx_id=k;if rid is not null then return jsonb_build_object('ok',true,'request_id',rid,'duplicate',true);end if;
 insert into public.logistics_pickup_requests_v1(branch_id,client_customer_id,pickup_address,contact_name,contact_phone,scheduled_at,status,notes,client_tx_id) values(p_branch_id,null,trim(p_address),trim(p_contact_name),ph,p_scheduled_at,'requested',nullif(trim(coalesce(p_notes,'')),''),k) returning id into rid;return jsonb_build_object('ok',true,'request_id',rid,'duplicate',false);
end;$$;

alter table public.web_membership_requests_v1 enable row level security;
revoke all on public.web_membership_requests_v1 from anon,authenticated;
revoke all on function public.web_profile_bootstrap_v1(text) from public;
revoke all on function public.web_service_booking_v1(bigint,bigint,text,text,timestamptz,text,text) from public;
revoke all on function public.web_membership_request_v1(bigint,bigint,text,text,text,text) from public;
revoke all on function public.web_membership_book_class_v1(bigint,text,text,text) from public;
revoke all on function public.web_logistics_track_v1(text,text) from public;
revoke all on function public.web_logistics_pickup_v1(bigint,text,text,text,timestamptz,text,text) from public;
grant execute on function public.web_profile_bootstrap_v1(text) to anon,authenticated;
grant execute on function public.web_service_booking_v1(bigint,bigint,text,text,timestamptz,text,text) to anon,authenticated;
grant execute on function public.web_membership_request_v1(bigint,bigint,text,text,text,text) to anon,authenticated;
grant execute on function public.web_membership_book_class_v1(bigint,text,text,text) to anon,authenticated;
grant execute on function public.web_logistics_track_v1(text,text) to anon,authenticated;
grant execute on function public.web_logistics_pickup_v1(bigint,text,text,text,timestamptz,text,text) to anon,authenticated;

commit;
