
create index if not exists nfos_purchase_orders_destination_location_idx
  on public.nfos_purchase_orders(destination_location_id);

create index if not exists nfos_purchase_receipts_inventory_transaction_idx
  on public.nfos_purchase_receipts(inventory_transaction_id)
  where inventory_transaction_id is not null;
