-- V9.3.2 - Business logo upload storage
-- Safe to run more than once.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('business-assets','business-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public=true,
  file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists business_assets_public_read on storage.objects;
create policy business_assets_public_read
on storage.objects for select
to public
using (bucket_id='business-assets');

drop policy if exists business_assets_staff_insert on storage.objects;
create policy business_assets_staff_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='business-assets'
  and (public.is_admin() or public.has_permission('businessSettings'))
);

drop policy if exists business_assets_staff_update on storage.objects;
create policy business_assets_staff_update
on storage.objects for update
to authenticated
using (
  bucket_id='business-assets'
  and (public.is_admin() or public.has_permission('businessSettings'))
)
with check (
  bucket_id='business-assets'
  and (public.is_admin() or public.has_permission('businessSettings'))
);

drop policy if exists business_assets_staff_delete on storage.objects;
create policy business_assets_staff_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='business-assets'
  and (public.is_admin() or public.has_permission('businessSettings'))
);
