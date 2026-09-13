-- Sharawla POS 10.5.4-beta.54
-- Sandbox acceptance cleanup for Purchasing Attachments fixtures.
-- Exact ACC run only; admin only. Deletes the exact test object, metadata and audit rows.

begin;

create or replace function public.sharawla_beta54_purchase_attachment_cleanup_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public,storage
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 refv text;
 ids bigint[]:=array[]::bigint[];
 d_objects integer:=0; d_rows integer:=0; d_audit integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح'; end if;
 refv:='ACC-PA-'||r;

 select coalesce(array_agg(id),array[]::bigint[]) into ids
 from public.purchase_attachments
 where reference_number=refv
   and original_file_name=('acceptance-'||r||'.png');

 delete from public.audit_logs
 where entity_type='purchase_attachment' and entity_id=any(ids);
 get diagnostics d_audit=row_count;

 delete from storage.objects o
 using public.purchase_attachments a
 where a.id=any(ids)
   and o.bucket_id=a.storage_bucket
   and o.name=a.storage_path;
 get diagnostics d_objects=row_count;

 delete from public.purchase_attachments
 where id=any(ids)
   and reference_number=refv
   and original_file_name=('acceptance-'||r||'.png');
 get diagnostics d_rows=row_count;

 return jsonb_build_object(
  'ok',true,
  'run_id',r,
  'deleted',jsonb_build_object('objects',d_objects,'attachments',d_rows,'audit',d_audit),
  'residue',(select count(*) from public.purchase_attachments where reference_number=refv and original_file_name=('acceptance-'||r||'.png'))
 );
end;$$;

grant execute on function public.sharawla_beta54_purchase_attachment_cleanup_v1(text) to authenticated;

commit;
