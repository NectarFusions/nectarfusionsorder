-- Newsletter Studio: server-only marketing contacts and editorial issues.
-- Run in Supabase before deploying the React / Netlify changes.
create extension if not exists pgcrypto;

create table if not exists public.nf_newsletter_contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text unique,
  phone text,
  source text not null default 'manual',
  consent_status text not null default 'needs_permission'
    check (consent_status in ('needs_permission','subscribed','unsubscribed')),
  consent_detail text,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_contact_has_identity check
    (length(trim(full_name)) > 0 or email is not null or phone is not null)
);

create table if not exists public.nf_newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  week_number integer not null check (week_number between 1 and 4),
  topic text not null,
  keywords text not null default '',
  fun_fact text not null default '',
  subject text not null default '',
  preheader text not null default '',
  title text not null default '',
  body text not null default '',
  status text not null default 'draft'
    check (status in ('draft','approved','sending','sent')),
  approved_at timestamptz,
  sent_at timestamptz,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nf_newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.nf_newsletter_issues(id) on delete restrict,
  contact_id uuid not null references public.nf_newsletter_contacts(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued','sending','sent','failed')),
  provider_message_id text,
  error_text text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (issue_id, contact_id)
);
create index if not exists nf_newsletter_contact_consent_idx
  on public.nf_newsletter_contacts(consent_status, archived);
create index if not exists nf_newsletter_deliveries_issue_idx
  on public.nf_newsletter_deliveries(issue_id, status);

-- No client access, including logged-in customers. Only the server's
-- Supabase service role can read or mutate these records.
alter table public.nf_newsletter_contacts enable row level security;
alter table public.nf_newsletter_issues enable row level security;
alter table public.nf_newsletter_deliveries enable row level security;
revoke all on public.nf_newsletter_contacts from anon, authenticated;
revoke all on public.nf_newsletter_issues from anon, authenticated;
revoke all on public.nf_newsletter_deliveries from anon, authenticated;
