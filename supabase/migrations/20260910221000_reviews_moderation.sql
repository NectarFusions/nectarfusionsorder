-- NectarFusions customer reviews + moderation
-- Public browsers never read/write this table directly. The website uses
-- reviewed Netlify functions and service-role access. Review images remain
-- private and are exposed to approved-review readers with short signed URLs.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 120),
  email text,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 180),
  body text not null check (char_length(btrim(body)) > 0),
  product_text text check (product_text is null or char_length(product_text) <= 220),
  image_bucket text,
  image_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved')),
  source text not null default 'customer'
    check (source in ('customer', 'admin')),
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_image_pair_check check (
    (image_bucket is null and image_path is null)
    or
    (image_bucket is not null and image_path is not null)
  )
);

create index if not exists reviews_status_approved_at_idx
  on public.reviews (status, approved_at desc);

create index if not exists reviews_status_submitted_at_idx
  on public.reviews (status, submitted_at desc);

alter table public.reviews enable row level security;

revoke all on table public.reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.reviews to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'review-images',
  'review-images',
  false,
  8388608,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.reviews is
  'Moderated NectarFusions customer reviews. Public submissions remain pending until an authenticated admin approves them.';

comment on column public.reviews.email is
  'Private reviewer contact email. Never returned by the public reviews endpoint.';

comment on column public.reviews.rating is
  'NectarFusions bee rating from 1 through 5.';
