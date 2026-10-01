
create index if not exists nfos_market_sale_allocations_inventory_tx_idx
  on public.nfos_market_sale_allocations(inventory_transaction_id);

create index if not exists nfos_market_sessions_assigned_member_idx
  on public.nfos_market_sessions(assigned_member_id)
  where assigned_member_id is not null;

create index if not exists nfos_market_sessions_inventory_location_idx
  on public.nfos_market_sessions(inventory_location_id);

create index if not exists nfos_market_sessions_venue_idx
  on public.nfos_market_sessions(venue_id)
  where venue_id is not null;
