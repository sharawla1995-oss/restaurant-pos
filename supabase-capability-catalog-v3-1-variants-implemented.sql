-- Sharawla Capability Catalog V3.1
-- Graduate commerce.variants from planned to implemented add-on.
-- Additive catalog change only: no profile/category/business assignment is created here.

begin;

update public.features
set implemented = true,
    feature_class = 'add_on',
    updated_at = now()
where code = 'commerce.variants'
  and active = true;

-- Fail closed if the catalog row is missing or duplicated.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.features
  where code = 'commerce.variants'
    and active = true
    and implemented = true
    and feature_class = 'add_on';

  if v_count <> 1 then
    raise exception 'commerce.variants graduation validation failed: % rows', v_count;
  end if;
end $$;

commit;
