-- V8.9 product images
alter table public.products add column if not exists image_url text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects for select to public using (bucket_id='product-images');
drop policy if exists "product_images_staff_insert" on storage.objects;
create policy "product_images_staff_insert" on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.has_permission('products'));
drop policy if exists "product_images_staff_update" on storage.objects;
create policy "product_images_staff_update" on storage.objects for update to authenticated using (bucket_id='product-images' and public.has_permission('products')) with check (bucket_id='product-images' and public.has_permission('products'));
drop policy if exists "product_images_staff_delete" on storage.objects;
create policy "product_images_staff_delete" on storage.objects for delete to authenticated using (bucket_id='product-images' and public.has_permission('products'));
grant select,insert,update,delete on storage.objects to authenticated;
notify pgrst, 'reload schema';
