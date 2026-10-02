create index if not exists nfos_market_order_logs_session_idx on public.nfos_market_order_logs(market_session_id);
create index if not exists nfos_market_order_logs_member_day_idx on public.nfos_market_order_logs(created_by_member_id,business_day);
create index if not exists nfos_market_order_logs_day_status_idx on public.nfos_market_order_logs(business_day,status);
create index if not exists nfos_market_order_log_items_order_idx on public.nfos_market_order_log_items(order_id);
create index if not exists nfos_market_order_log_items_item_idx on public.nfos_market_order_log_items(item_id);
create index if not exists nfos_retail_item_availability_location_idx on public.nfos_retail_item_availability(retail_location_id);
create index if not exists nfos_retail_item_availability_item_idx on public.nfos_retail_item_availability(item_id);
