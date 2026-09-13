-- Sharawla POS 10.5.4-beta.55
-- Offline bridge for Delivery Settlement V2.
-- Legacy/offline status updates that reach the server still materialize cash custody.

begin;

create or replace function public.ensure_delivery_custody_snapshot_v2()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.order_type='delivery'
     and new.status in ('delivered','completed')
     and new.driver_id is not null
     and new.driver_settled_at is null then
    if lower(coalesce(new.payment_method,''))='cash' then
      if coalesce(new.delivery_cash_custody_amount,0)<=0 then
        new.delivery_cash_custody_amount:=round(coalesce(new.total,0),2);
      end if;
      if new.delivery_payment_finalized_at is null then
        new.delivery_payment_finalized_at:=coalesce(new.delivered_at,now());
      end if;
    elsif coalesce(new.delivery_cash_custody_amount,0)<>0 then
      new.delivery_cash_custody_amount:=0;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_delivery_custody_snapshot_v2 on public.orders;
create trigger trg_ensure_delivery_custody_snapshot_v2
before insert or update of status,payment_method,driver_id,driver_settled_at,total
on public.orders
for each row execute function public.ensure_delivery_custody_snapshot_v2();

notify pgrst,'reload schema';
commit;
