do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.nfos_market_order_log_items'::regclass
      and conname='nfos_market_order_log_items_whole_units_check'
  ) then
    alter table public.nfos_market_order_log_items
      add constraint nfos_market_order_log_items_whole_units_check
      check(quantity=trunc(quantity));
  end if;
end $$;
