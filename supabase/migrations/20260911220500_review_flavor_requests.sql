-- Link reviews to catalog flavors and track requests for unavailable flavors.
alter table public.reviews add column if not exists flavor_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='reviews_flavor_id_fkey'
      and conrelid='public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_flavor_id_fkey
      foreign key (flavor_id) references public.flavors(id)
      on delete set null;
  end if;
end
$$;

create index if not exists reviews_flavor_id_idx
  on public.reviews(flavor_id) where flavor_id is not null;

update public.reviews r
set flavor_id=f.id
from public.flavors f
where r.flavor_id is null
  and nullif(btrim(r.product_text),'') is not null
  and lower(btrim(r.product_text))=lower(btrim(f.name));

create table if not exists public.flavor_requests (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid references public.flavors(id) on delete set null,
  flavor_name text not null check (char_length(btrim(flavor_name)) between 1 and 120),
  requester_hash text not null check (char_length(requester_hash)=64),
  source text not null default 'review' check (source in ('review','website')),
  review_id uuid references public.reviews(id) on delete set null,
  requested_on date not null default current_date,
  requested_at timestamptz not null default now()
);

create index if not exists flavor_requests_requested_at_idx
  on public.flavor_requests(requested_at desc);
create index if not exists flavor_requests_flavor_requested_idx
  on public.flavor_requests(flavor_id, requested_at desc);
create unique index if not exists flavor_requests_daily_requester_idx
  on public.flavor_requests(flavor_id, requester_hash, requested_on)
  where flavor_id is not null;

create table if not exists public.flavor_request_flags (
  flavor_id uuid primary key references public.flavors(id) on delete cascade,
  popular boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.flavor_requests enable row level security;
alter table public.flavor_request_flags enable row level security;
revoke all on table public.flavor_requests from public, anon, authenticated;
revoke all on table public.flavor_request_flags from public, anon, authenticated;
grant select,insert,update,delete on table public.flavor_requests to service_role;
grant select,insert,update,delete on table public.flavor_request_flags to service_role;
