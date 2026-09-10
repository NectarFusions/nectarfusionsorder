-- NectarFusions customer reviews + moderation
-- Upgrades the earlier partial reviews table if it already exists.
-- Public browsers do not read/write this table directly after this migration.
-- Reviewed Netlify functions use service-role access. Review images are private
-- and approved-review readers receive short-lived signed URLs.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  rating smallint not null,
  title text,
  body text not null,
  product_text text,
  image_bucket text,
  image_path text,
  status text not null default 'pending',
  source text not null default 'customer',
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Earlier partial implementation used reviewer_name + review_text.
-- Rename those columns in place so any existing records are preserved.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'reviewer_name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'display_name'
  ) then
    alter table public.reviews
      rename column reviewer_name to display_name;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'review_text'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'body'
  ) then
    alter table public.reviews
      rename column review_text to body;
  end if;
end
$$;

alter table public.reviews
  add column if not exists email text,
  add column if not exists title text,
  add column if not exists product_text text,
  add column if not exists image_bucket text,
  add column if not exists source text not null default 'customer',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.reviews
  alter column display_name type text using display_name::text,
  alter column body type text using body::text,
  alter column status type text using status::text,
  alter column status set default 'pending',
  alter column source set default 'customer',
  alter column source set not null,
  alter column submitted_at set default now(),
  alter column submitted_at set not null;

update public.reviews
set image_bucket = 'review-images'
where image_path is not null
  and image_bucket is null;

-- Replace old/partial checks with the current server contract.
alter table public.reviews
  drop constraint if exists reviews_rating_check,
  drop constraint if exists reviews_review_text_check,
  drop constraint if exists reviews_status_check,
  drop constraint if exists reviews_display_name_length_check,
  drop constraint if exists reviews_body_not_blank_check,
  drop constraint if exists reviews_title_length_check,
  drop constraint if exists reviews_product_text_length_check,
  drop constraint if exists reviews_image_pair_check,
  drop constraint if exists reviews_source_check;

alter table public.reviews
  add constraint reviews_rating_check
    check (rating between 1 and 5),
  add constraint reviews_display_name_length_check
    check (char_length(display_name) between 1 and 120),
  add constraint reviews_body_not_blank_check
    check (char_length(btrim(body)) > 0),
  add constraint reviews_title_length_check
    check (title is null or char_length(title) <= 180),
  add constraint reviews_product_text_length_check
    check (product_text is null or char_length(product_text) <= 220),
  add constraint reviews_image_pair_check
    check (
      (image_bucket is null and image_path is null)
      or
      (image_bucket is not null and image_path is not null)
    ),
  add constraint reviews_status_check
    check (status in ('pending', 'approved')),
  add constraint reviews_source_check
    check (source in ('customer', 'admin'));

create index if not exists reviews_status_approved_at_idx
  on public.reviews (status, approved_at desc);

create index if not exists reviews_status_submitted_at_idx
  on public.reviews (status, submitted_at desc);

alter table public.reviews enable row level security;

-- Remove the earlier direct-browser policies. The current design intentionally
-- routes public submission, public approved reads, and admin moderation through
-- reviewed Netlify functions instead.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
  loop
    execute format(
      'drop policy %I on public.reviews',
      p.policyname
    );
  end loop;
end
$$;

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

-- The earlier partial setup included direct authenticated deletion for this
-- bucket. The new admin endpoint performs image cleanup using service role.
drop policy if exists "Admins can delete review images"
  on storage.objects;

comment on table public.reviews is
  'Moderated NectarFusions customer reviews. Customer submissions remain pending until an authenticated admin approves them.';

comment on column public.reviews.email is
  'Private reviewer contact email. Never returned by the public reviews endpoint.';

comment on column public.reviews.rating is
  'NectarFusions bee rating from 1 through 5.';

