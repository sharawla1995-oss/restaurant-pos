-- V10.5.16 Website Exact Extras quantity persistence closure
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint)'::regprocedure) into v_def;
  if position('v_modifier_qty' in v_def)=0 then raise exception 'modifier qty pricing owner missing'; end if;
  v_def:=replace(v_def,'modifier_name,'||E'\n        '||'price'||E'\n      '||')','modifier_name,'||E'\n        '||'price,'||E'\n        '||'quantity'||E'\n      '||')');
  v_def:=replace(v_def,'v_mod.name,'||E'\n        '||'v_mod.price'||E'\n      '||');','v_mod.name,'||E'\n        '||'v_mod.price,'||E'\n        '||'greatest(1,coalesce(nullif(v_modifier->>''quantity'','''')::integer,1))'||E'\n      '||');');
  if position('modifier_name,'||E'\n        '||'price,'||E'\n        '||'quantity' in v_def)=0 then raise exception 'modifier quantity column patch did not match'; end if;
  if position('v_mod.price,'||E'\n        '||'greatest(1,coalesce(nullif(v_modifier->>''quantity'','''')::integer,1))' in v_def)=0 then raise exception 'modifier quantity value patch did not match'; end if;
  execute v_def;
end $$;
revoke all on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint) from public;
grant execute on function public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint) to anon,authenticated;
notify pgrst,'reload schema';
