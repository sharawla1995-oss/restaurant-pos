do $$
declare v_def text;
begin
 select pg_get_functiondef('public.accept_website_order(bigint)'::regprocedure) into v_def;
 v_def:=replace(v_def,
 'modifier_name,'||E'\n        '||'price'||E'\n      '||')',
 'modifier_name,'||E'\n        '||'price,'||E'\n        '||'quantity'||E'\n      '||')');
 v_def:=replace(v_def,
 'wm.modifier_name,'||E'\n        '||'wm.price'||E'\n      '||');',
 'wm.modifier_name,'||E'\n        '||'wm.price,'||E'\n        '||'greatest(1,coalesce(wm.quantity,1))'||E'\n      '||');');
 if position('wm.quantity' in v_def)=0 then raise exception 'accept qty patch did not match'; end if;
 execute v_def;
end $$;
revoke all on function public.accept_website_order(bigint) from public;
grant execute on function public.accept_website_order(bigint) to authenticated;