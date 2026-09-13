-- Sharawla POS 10.5.4-beta.54
-- Sandbox acceptance cleanup for Purchasing Attachments fixtures.
-- Exact ACC run only; admin only. Storage objects must be removed through the Storage API first.

begin;

create or replace function public.sharawla_beta54_purchase_attachment_cleanup_manifest_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public,storage
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 refv text;
 objects jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح'; end if;
 refv:='ACC-PA-'||r;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path) order by a.id),'[]'::jsonb)
 into objects
 from public.purchase_attachments a
 where a.reference_number=refv
   and a.original_file_name=('acceptance-'||r||'.png')
   and a.storage_path is not null;
 return jsonb_build_object('ok',true,'run_id',r,'objects',objects);
end;$$;

create or replace function public.sharawla_beta54_purchase_attachment_cleanup_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public,storage
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 refv text;
 ids bigint[]:=array[]::bigint[];
 object_residue integer:=0; d_rows integer:=0; d_audit integer:=0; metadata_residue integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط'; end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح'; end if;
 refv:='ACC-PA-'||r;

 select coalesce(array_agg(id),array[]::bigint[]) into ids
 from public.purchase_attachments
 where reference_number=refv
   and original_file_name=('acceptance-'||r||'.png');

 select count(*) into object_residue
 from storage.objects o
 join public.purchase_attachments a on a.id=any(ids) and o.bucket_id=a.storage_bucket and o.name=a.storage_path;
 if object_residue<>0 then
   return jsonb_build_object('ok',false,'run_id',r,'message','Storage objects remain; remove them through the Storage API first','storage_residue',object_residue,'residue',object_residue);
 end if;

 delete from public.audit_logs
 where entity_type='purchase_attachment' and entity_id=any(ids);
 get diagnostics d_audit=row_count;

 delete from public.purchase_attachments
 where id=any(ids)
   and reference_number=refv
   and original_file_name=('acceptance-'||r||'.png');
 get diagnostics d_rows=row_count;

 select count(*) into metadata_residue from public.purchase_attachments
 where reference_number=refv and original_file_name=('acceptance-'||r||'.png');

 return jsonb_build_object(
  'ok',metadata_residue=0,
  'run_id',r,
  'deleted',jsonb_build_object('attachments',d_rows,'audit',d_audit),
  'storage_residue',0,
  'residue',metadata_residue
 );
end;$$;

grant execute on function public.sharawla_beta54_purchase_attachment_cleanup_manifest_v1(text) to authenticated;
grant execute on function public.sharawla_beta54_purchase_attachment_cleanup_v1(text) to authenticated;

commit;
