-- NFOS Product Master foundation.
create table if not exists public.nfos_product_profiles (
  flavor_id uuid primary key references public.flavors(id) on delete cascade,
  product_status text not null default 'active'
    check (product_status in ('active','seasonal','limited','development','retired')),
  category text,
  product_tier text,
  seasonality text not null default 'year_round'
    check (seasonality in ('year_round','seasonal','limited','custom')),
  season_start_month integer check (season_start_month between 1 and 12),
  season_end_month integer check (season_end_month between 1 and 12),
  short_description text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfos_retail_item_availability (
  id uuid primary key default gen_random_uuid(),
  retail_location_id uuid not null references public.retail_locations(id) on delete cascade,
  item_id uuid not null references public.nfos_items(id) on delete cascade,
  availability_status text not null default 'unknown'
    check (availability_status in ('in_stock','low','out_of_stock','unknown')),
  quantity_on_hand numeric check (quantity_on_hand is null or quantity_on_hand >= 0),
  source text not null default 'manual',
  source_reference text,
  last_confirmed_at timestamptz,
  notes text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(retail_location_id,item_id)
);

alter table public.nfos_product_profiles enable row level security;
alter table public.nfos_retail_item_availability enable row level security;

insert into public.nfos_product_profiles(flavor_id,product_status,seasonality)
select id,case when active then 'active' else 'retired' end,'year_round'
from public.flavors
on conflict(flavor_id) do nothing;
