-- NectarFusions Phase 3 Partner Portal
-- Database foundation and Row Level Security
--
-- This migration intentionally stores no readable passwords.
-- Authentication passwords remain exclusively inside Supabase Auth.
--
-- Do not run in Production until the SQL has been reviewed.

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- SHARED SECURITY AND UTILITY FUNCTIONS
-- ============================================================

create or replace function public.nf_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.nf_word_count(value text)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when btrim(coalesce(value, '')) = '' then 0
    else cardinality(
      regexp_split_to_array(
        btrim(value),
        E'\\s+'
      )
    )
  end;
$$;

create or replace function public.nf_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  );
$$;

revoke all on function public.nf_is_admin() from public;
grant execute on function public.nf_is_admin() to authenticated;

-- ============================================================
-- PARTNER ACCOUNTS
-- ============================================================

create table if not exists public.partner_accounts (
  id uuid primary key default gen_random_uuid(),

  business_name text not null,
  public_name text,
  contact_name text,
  email text not null,
  phone text,

  partner_type text not null default 'retailer'
    check (
      partner_type in (
        'retailer',
        'wholesaler',
        'event_partner',
        'other'
      )
    ),

  relationship_status text not null default 'application_received'
    check (
      relationship_status in (
        'application_received',
        'needs_information',
        'under_review',
        'waitlisted',
        'approved',
        'onboarding',
        'active_opening',
        'active_ongoing',
        'optimize',
        'paused',
        'closed',
        'declined'
      )
    ),

  auth_access_enabled boolean not null default false,

  preferred_delivery_days text[] not null default '{}'
    check (
      preferred_delivery_days <@
      array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    ),

  preferred_fulfillment text
    check (
      preferred_fulfillment is null
      or preferred_fulfillment in (
        'pickup',
        'delivery',
        'shipping',
        'flexible'
      )
    ),

  receiving_notes text,
  delivery_notes text,

  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,

  website_url text,
  public_description text,

  locator_permission boolean not null default false,
  event_submission_enabled boolean not null default false,

  approved_at timestamptz,
  paused_at timestamptz,
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (length(btrim(business_name)) between 1 and 160),
  check (length(btrim(email)) between 3 and 320)
);

create unique index if not exists partner_accounts_email_unique
on public.partner_accounts (lower(btrim(email)));

create index if not exists partner_accounts_status_index
on public.partner_accounts (relationship_status);

create index if not exists partner_accounts_type_index
on public.partner_accounts (partner_type);

create index if not exists partner_accounts_zip_index
on public.partner_accounts (zip);

drop trigger if exists partner_accounts_updated_at
on public.partner_accounts;

create trigger partner_accounts_updated_at
before update on public.partner_accounts
for each row execute function public.nf_set_updated_at();

-- ============================================================
-- AUTHENTICATED PARTNER USERS
-- ============================================================

create table if not exists public.partner_users (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete cascade,

  user_id uuid not null unique
    references auth.users(id)
    on delete cascade,

  email text not null,

  partner_role text not null default 'owner'
    check (
      partner_role in (
        'owner',
        'order_contact',
        'staff'
      )
    ),

  active boolean not null default true,
  invited_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),

  unique (partner_id, email)
);

create index if not exists partner_users_partner_index
on public.partner_users (partner_id);

create index if not exists partner_users_email_index
on public.partner_users (lower(btrim(email)));

create or replace function public.nf_partner_id_for_user()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pu.partner_id
  from public.partner_users pu
  join public.partner_accounts pa
    on pa.id = pu.partner_id
  where pu.user_id = auth.uid()
    and pu.active = true
    and pa.auth_access_enabled = true
    and pa.relationship_status in (
      'approved',
      'onboarding',
      'active_opening',
      'active_ongoing',
      'optimize',
      'paused'
    )
  limit 1;
$$;

revoke all on function public.nf_partner_id_for_user() from public;
grant execute on function public.nf_partner_id_for_user()
to authenticated;

-- ============================================================
-- PARTNER APPLICATIONS
-- ============================================================

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid
    references public.partner_accounts(id)
    on delete set null,

  contact_name text not null,
  business_name text not null,
  business_type text not null,
  email text not null,
  phone text,

  website_social text,
  business_address text,
  sales_location text not null,
  opening_timing text,
  interests text,
  current_assortment text,
  heard_about_us text,
  message text,

  status text not null default 'application_received'
    check (
      status in (
        'application_received',
        'needs_information',
        'under_review',
        'waitlisted',
        'approved',
        'declined',
        'archived'
      )
    ),

  consent_to_contact boolean not null default false,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  admin_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_applications_status_index
on public.partner_applications (status, submitted_at desc);

create index if not exists partner_applications_email_index
on public.partner_applications (lower(btrim(email)));

drop trigger if exists partner_applications_updated_at
on public.partner_applications;

create trigger partner_applications_updated_at
before update on public.partner_applications
for each row execute function public.nf_set_updated_at();

-- ============================================================
-- REPLENISHMENT REQUESTS
-- ============================================================

create table if not exists public.partner_replenishment_requests (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete restrict,

  submitted_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  status text not null default 'submitted'
    check (
      status in (
        'submitted',
        'under_review',
        'needs_information',
        'quoted',
        'accepted',
        'fulfilled',
        'cancelled',
        'declined'
      )
    ),

  needed_by date,

  fulfillment_method text
    check (
      fulfillment_method is null
      or fulfillment_method in (
        'pickup',
        'delivery',
        'shipping',
        'flexible'
      )
    ),

  preferred_delivery_days text[] not null default '{}'
    check (
      preferred_delivery_days <@
      array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    ),

  current_inventory_notes text,
  request_notes text,
  admin_notes text,

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_replenishment_partner_index
on public.partner_replenishment_requests (
  partner_id,
  submitted_at desc
);

create index if not exists partner_replenishment_status_index
on public.partner_replenishment_requests (
  status,
  submitted_at desc
);

drop trigger if exists partner_replenishment_updated_at
on public.partner_replenishment_requests;

create trigger partner_replenishment_updated_at
before update on public.partner_replenishment_requests
for each row execute function public.nf_set_updated_at();

create table if not exists public.partner_replenishment_items (
  id uuid primary key default gen_random_uuid(),

  request_id uuid not null
    references public.partner_replenishment_requests(id)
    on delete cascade,

  flavor_id uuid
    references public.flavors(id)
    on delete set null,

  flavor_name text not null,
  size_id text not null,
  texture text not null default 'regular'
    check (texture in ('regular', 'spun')),

  quantity integer not null
    check (quantity between 1 and 999),

  on_hand_count integer
    check (
      on_hand_count is null
      or on_hand_count between 0 and 9999
    ),

  notes text,
  created_at timestamptz not null default now()
);

create index if not exists partner_replenishment_items_request_index
on public.partner_replenishment_items (request_id);

-- ============================================================
-- DOWNLOADABLE PARTNER MATERIALS
-- ============================================================

create table if not exists public.partner_resources (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text,

  category text not null default 'other'
    check (
      category in (
        'line_sheet',
        'w9',
        'insurance',
        'shelf_card',
        'product_care',
        'terms',
        'process',
        'event_material',
        'other'
      )
    ),

  storage_bucket text not null default 'partner-resources',
  storage_path text not null,

  visible_to_partner_types text[] not null default '{}'
    check (
      visible_to_partner_types <@
      array[
        'retailer',
        'wholesaler',
        'event_partner',
        'other'
      ]::text[]
    ),

  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),

  version_label text,
  effective_at timestamptz,
  expires_at timestamptz,

  sort integer not null default 0,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (storage_bucket, storage_path)
);

create index if not exists partner_resources_active_index
on public.partner_resources (status, sort, title);

drop trigger if exists partner_resources_updated_at
on public.partner_resources;

create trigger partner_resources_updated_at
before update on public.partner_resources
for each row execute function public.nf_set_updated_at();

-- ============================================================
-- PARTNER EVENT SUBMISSIONS
-- ============================================================

create table if not exists public.partner_events (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete restrict,

  submitted_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  title text not null,
  description text not null,

  start_at timestamptz not null,
  end_at timestamptz,

  venue_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,

  image_bucket text not null default 'partner-event-images',
  image_path text,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'submitted',
        'approved',
        'rejected',
        'cancelled'
      )
    ),

  admin_notes text,
  rejection_reason text,

  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (length(btrim(title)) between 1 and 120),
  check (public.nf_word_count(description) <= 50),
  check (end_at is null or end_at >= start_at)
);

create index if not exists partner_events_partner_index
on public.partner_events (partner_id, start_at desc);

create index if not exists partner_events_public_index
on public.partner_events (status, start_at);

drop trigger if exists partner_events_updated_at
on public.partner_events;

create trigger partner_events_updated_at
before update on public.partner_events
for each row execute function public.nf_set_updated_at();

-- ============================================================
-- AUTH AND ADMIN AUDIT LOG
-- ============================================================

create table if not exists public.partner_auth_audit (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid
    references public.partner_accounts(id)
    on delete set null,

  user_id uuid
    references auth.users(id)
    on delete set null,

  action text not null
    check (
      action in (
        'invite_requested',
        'invite_sent',
        'password_reset_requested',
        'access_deactivated',
        'access_reactivated',
        'login_recorded'
      )
    ),

  requested_by uuid references auth.users(id),
  result text,
  created_at timestamptz not null default now()
);

create index if not exists partner_auth_audit_partner_index
on public.partner_auth_audit (partner_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.partner_accounts enable row level security;
alter table public.partner_users enable row level security;
alter table public.partner_applications enable row level security;
alter table public.partner_replenishment_requests enable row level security;
alter table public.partner_replenishment_items enable row level security;
alter table public.partner_resources enable row level security;
alter table public.partner_events enable row level security;
alter table public.partner_auth_audit enable row level security;

grant select on public.partner_accounts to authenticated;
grant select on public.partner_users to authenticated;

grant select, insert, update
on public.partner_replenishment_requests
to authenticated;

grant select, insert
on public.partner_replenishment_items
to authenticated;

grant select
on public.partner_resources
to authenticated;

grant select, insert, update
on public.partner_events
to authenticated;

grant select, insert, update, delete
on public.partner_accounts,
   public.partner_users,
   public.partner_applications,
   public.partner_replenishment_requests,
   public.partner_replenishment_items,
   public.partner_resources,
   public.partner_events,
   public.partner_auth_audit
to authenticated;

-- Partner accounts

drop policy if exists "Partners can view their account"
on public.partner_accounts;

create policy "Partners can view their account"
on public.partner_accounts
for select
to authenticated
using (
  id = public.nf_partner_id_for_user()
);

drop policy if exists "Admins manage partner accounts"
on public.partner_accounts;

create policy "Admins manage partner accounts"
on public.partner_accounts
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Partner users

drop policy if exists "Partners can view their account users"
on public.partner_users;

create policy "Partners can view their account users"
on public.partner_users
for select
to authenticated
using (
  partner_id = public.nf_partner_id_for_user()
);

drop policy if exists "Admins manage partner users"
on public.partner_users;

create policy "Admins manage partner users"
on public.partner_users
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Applications are managed through secure server functions and Admin.

drop policy if exists "Admins manage partner applications"
on public.partner_applications;

create policy "Admins manage partner applications"
on public.partner_applications
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Replenishment requests

drop policy if exists "Partners view their replenishment requests"
on public.partner_replenishment_requests;

create policy "Partners view their replenishment requests"
on public.partner_replenishment_requests
for select
to authenticated
using (
  partner_id = public.nf_partner_id_for_user()
);

drop policy if exists "Partners submit replenishment requests"
on public.partner_replenishment_requests;

create policy "Partners submit replenishment requests"
on public.partner_replenishment_requests
for insert
to authenticated
with check (
  partner_id = public.nf_partner_id_for_user()
  and submitted_by = auth.uid()
  and status = 'submitted'
);

drop policy if exists "Admins manage replenishment requests"
on public.partner_replenishment_requests;

create policy "Admins manage replenishment requests"
on public.partner_replenishment_requests
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Replenishment items

drop policy if exists "Partners view their replenishment items"
on public.partner_replenishment_items;

create policy "Partners view their replenishment items"
on public.partner_replenishment_items
for select
to authenticated
using (
  exists (
    select 1
    from public.partner_replenishment_requests r
    where r.id = request_id
      and r.partner_id = public.nf_partner_id_for_user()
  )
);

drop policy if exists "Partners add submitted replenishment items"
on public.partner_replenishment_items;

create policy "Partners add submitted replenishment items"
on public.partner_replenishment_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.partner_replenishment_requests r
    where r.id = request_id
      and r.partner_id = public.nf_partner_id_for_user()
      and r.status = 'submitted'
  )
);

drop policy if exists "Admins manage replenishment items"
on public.partner_replenishment_items;

create policy "Admins manage replenishment items"
on public.partner_replenishment_items
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Downloadable materials

drop policy if exists "Partners view active resources"
on public.partner_resources;

create policy "Partners view active resources"
on public.partner_resources
for select
to authenticated
using (
  status = 'active'
  and (
    expires_at is null
    or expires_at > now()
  )
  and exists (
    select 1
    from public.partner_accounts pa
    where pa.id = public.nf_partner_id_for_user()
      and (
        cardinality(visible_to_partner_types) = 0
        or pa.partner_type = any(visible_to_partner_types)
      )
  )
);

drop policy if exists "Admins manage partner resources"
on public.partner_resources;

create policy "Admins manage partner resources"
on public.partner_resources
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Partner events

drop policy if exists "Partners view their events"
on public.partner_events;

create policy "Partners view their events"
on public.partner_events
for select
to authenticated
using (
  partner_id = public.nf_partner_id_for_user()
);

drop policy if exists "Partners create events"
on public.partner_events;

create policy "Partners create events"
on public.partner_events
for insert
to authenticated
with check (
  partner_id = public.nf_partner_id_for_user()
  and submitted_by = auth.uid()
  and status in ('draft', 'submitted')
  and exists (
    select 1
    from public.partner_accounts pa
    where pa.id = partner_id
      and pa.event_submission_enabled = true
  )
);

drop policy if exists "Partners update editable events"
on public.partner_events;

create policy "Partners update editable events"
on public.partner_events
for update
to authenticated
using (
  partner_id = public.nf_partner_id_for_user()
  and status in ('draft', 'rejected')
)
with check (
  partner_id = public.nf_partner_id_for_user()
  and status in ('draft', 'submitted')
);

drop policy if exists "Admins manage partner events"
on public.partner_events;

create policy "Admins manage partner events"
on public.partner_events
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Auth audit

drop policy if exists "Admins view partner auth audit"
on public.partner_auth_audit;

create policy "Admins view partner auth audit"
on public.partner_auth_audit
for select
to authenticated
using (public.nf_is_admin());

drop policy if exists "Admins create partner auth audit"
on public.partner_auth_audit;

create policy "Admins create partner auth audit"
on public.partner_auth_audit
for insert
to authenticated
with check (public.nf_is_admin());

-- ============================================================
-- PUBLIC APPROVED-EVENT LOOKUP
-- ============================================================

create or replace function public.find_approved_partner_events(
  p_zip text default null
)
returns table (
  event_id uuid,
  partner_id uuid,
  business_name text,
  event_title text,
  event_description text,
  start_at timestamptz,
  end_at timestamptz,
  venue_name text,
  address_line1 text,
  city text,
  state text,
  zip text,
  image_bucket text,
  image_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    pa.id,
    coalesce(pa.public_name, pa.business_name),
    e.title,
    e.description,
    e.start_at,
    e.end_at,
    e.venue_name,
    e.address_line1,
    e.city,
    e.state,
    e.zip,
    e.image_bucket,
    e.image_path
  from public.partner_events e
  join public.partner_accounts pa
    on pa.id = e.partner_id
  where e.status = 'approved'
    and coalesce(e.end_at, e.start_at) >= now()
    and pa.locator_permission = true
    and pa.relationship_status in (
      'approved',
      'onboarding',
      'active_opening',
      'active_ongoing',
      'optimize'
    )
    and (
      nullif(btrim(coalesce(p_zip, '')), '') is null
      or e.zip = btrim(p_zip)
      or pa.zip = btrim(p_zip)
    )
  order by e.start_at asc;
$$;

revoke all
on function public.find_approved_partner_events(text)
from public;

grant execute
on function public.find_approved_partner_events(text)
to anon, authenticated;

-- ============================================================
-- PRIVATE STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'partner-resources',
    'partner-resources',
    false,
    26214400,
    array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  ),
  (
    'partner-event-images',
    'partner-event-images',
    false,
    8388608,
    array[
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Admin access to both partner buckets.

drop policy if exists "Admins manage partner portal files"
on storage.objects;

create policy "Admins manage partner portal files"
on storage.objects
for all
to authenticated
using (
  bucket_id in (
    'partner-resources',
    'partner-event-images'
  )
  and public.nf_is_admin()
)
with check (
  bucket_id in (
    'partner-resources',
    'partner-event-images'
  )
  and public.nf_is_admin()
);

-- Event image access is tied to one registered event image path.
--
-- Required object path:
-- partner-event-images/<partner-id>/<event-id>/<filename>
--
-- The event record must contain the same bucket and complete storage path.
-- Partners may replace or delete an image only while the event remains
-- editable. Submitted and approved event images are locked for Admin review.

drop policy if exists "Partners view their event images"
on storage.objects;

create policy "Partners view their event images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'partner-event-images'
  and exists (
    select 1
    from public.partner_events e
    where e.partner_id =
      (select public.nf_partner_id_for_user())
      and e.image_bucket = bucket_id
      and e.image_path = name
      and (storage.foldername(name))[1] =
        e.partner_id::text
      and (storage.foldername(name))[2] =
        e.id::text
  )
);

drop policy if exists "Partners upload their event images"
on storage.objects;

create policy "Partners upload their event images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'partner-event-images'
  and exists (
    select 1
    from public.partner_events e
    join public.partner_accounts pa
      on pa.id = e.partner_id
    where e.partner_id =
      (select public.nf_partner_id_for_user())
      and e.image_bucket = bucket_id
      and e.image_path = name
      and (storage.foldername(name))[1] =
        e.partner_id::text
      and (storage.foldername(name))[2] =
        e.id::text
      and e.status in ('draft', 'rejected')
      and pa.event_submission_enabled = true
  )
);

drop policy if exists "Partners update their event images"
on storage.objects;

create policy "Partners update their event images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'partner-event-images'
  and exists (
    select 1
    from public.partner_events e
    join public.partner_accounts pa
      on pa.id = e.partner_id
    where e.partner_id =
      (select public.nf_partner_id_for_user())
      and e.image_bucket = bucket_id
      and e.image_path = name
      and (storage.foldername(name))[1] =
        e.partner_id::text
      and (storage.foldername(name))[2] =
        e.id::text
      and e.status in ('draft', 'rejected')
      and pa.event_submission_enabled = true
  )
)
with check (
  bucket_id = 'partner-event-images'
  and exists (
    select 1
    from public.partner_events e
    join public.partner_accounts pa
      on pa.id = e.partner_id
    where e.partner_id =
      (select public.nf_partner_id_for_user())
      and e.image_bucket = bucket_id
      and e.image_path = name
      and (storage.foldername(name))[1] =
        e.partner_id::text
      and (storage.foldername(name))[2] =
        e.id::text
      and e.status in ('draft', 'rejected')
      and pa.event_submission_enabled = true
  )
);

drop policy if exists "Partners delete their event images"
on storage.objects;

create policy "Partners delete their event images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'partner-event-images'
  and exists (
    select 1
    from public.partner_events e
    join public.partner_accounts pa
      on pa.id = e.partner_id
    where e.partner_id =
      (select public.nf_partner_id_for_user())
      and e.image_bucket = bucket_id
      and e.image_path = name
      and (storage.foldername(name))[1] =
        e.partner_id::text
      and (storage.foldername(name))[2] =
        e.id::text
      and e.status in ('draft', 'rejected')
      and pa.event_submission_enabled = true
  )
);

-- Partners can read only active materials authorized for their account.

drop policy if exists "Partners download active portal resources"
on storage.objects;

create policy "Partners download active portal resources"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'partner-resources'
  and exists (
    select 1
    from public.partner_resources r
    join public.partner_accounts pa
      on pa.id = public.nf_partner_id_for_user()
    where r.storage_bucket = bucket_id
      and r.storage_path = name
      and r.status = 'active'
      and (
        r.expires_at is null
        or r.expires_at > now()
      )
      and (
        cardinality(r.visible_to_partner_types) = 0
        or pa.partner_type =
          any(r.visible_to_partner_types)
      )
  )
);

comment on table public.partner_accounts is
'Approved and prospective NectarFusions business partners. Passwords are never stored here.';

comment on table public.partner_users is
'Maps Supabase Auth users to partner accounts without exposing passwords.';

comment on table public.partner_replenishment_requests is
'Partner-submitted inventory replenishment requests awaiting NectarFusions review.';

comment on table public.partner_events is
'Partner event submissions. Descriptions are limited to fifty words and require Admin approval before publication.';

commit;
