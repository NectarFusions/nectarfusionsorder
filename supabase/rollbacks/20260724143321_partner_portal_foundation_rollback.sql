-- NectarFusions Phase 3 Partner Portal
-- Targeted rollback for:
-- 20260724143321_partner_portal_foundation.sql
--
-- IMPORTANT:
-- Do not run this during normal operation.
-- This removes all Partner Portal tables, records, policies,
-- functions and the two Partner Portal storage buckets.
--
-- It does not remove or alter:
-- public.retail_locations
-- public.find_retail_locations(text)
-- public.flavors
-- public.sizes
-- public.admins
-- Supabase Auth users
-- existing order, subscription or storefront data

begin;

-- Refuse to proceed if the existing retail locator is not intact.

do $$
begin
  if to_regclass('public.retail_locations') is null then
    raise exception
      'STOP: public.retail_locations is missing before rollback.';
  end if;

  if to_regprocedure(
    'public.find_retail_locations(text)'
  ) is null then
    raise exception
      'STOP: public.find_retail_locations(text) is missing before rollback.';
  end if;
end;
$$;

-- Remove only the storage policies created by the Partner Portal migration.

drop policy if exists "Admins manage partner portal files"
on storage.objects;

drop policy if exists "Partners view their event images"
on storage.objects;

drop policy if exists "Partners upload their event images"
on storage.objects;

drop policy if exists "Partners update their event images"
on storage.objects;

drop policy if exists "Partners delete their event images"
on storage.objects;

drop policy if exists "Partners download active portal resources"
on storage.objects;

-- Refuse to remove the buckets if files are present.
-- Files must first be removed through the Supabase Storage interface or API.

do $$
declare
  portal_object_count bigint;
begin
  select count(*)
  into portal_object_count
  from storage.objects
  where bucket_id in (
    'partner-resources',
    'partner-event-images'
  );

  if portal_object_count > 0 then
    raise exception
      'STOP: The Partner Portal storage buckets contain % object(s). Remove those files through Supabase Storage before running this rollback.',
      portal_object_count;
  end if;
end;
$$;

delete from storage.buckets
where id in (
  'partner-resources',
  'partner-event-images'
);

-- Remove the public event lookup before removing its source tables.

drop function if exists
public.find_approved_partner_events(text);

-- Remove the eight Partner Portal tables in dependency-safe order.
-- Table triggers, indexes, comments, grants and table policies
-- are removed with their owning tables.

drop table if exists
public.partner_replenishment_items;

drop table if exists
public.partner_replenishment_requests;

drop table if exists
public.partner_events;

drop table if exists
public.partner_resources;

drop table if exists
public.partner_auth_audit;

drop table if exists
public.partner_applications;

drop table if exists
public.partner_users;

drop table if exists
public.partner_accounts;

-- Remove only the utility and security functions introduced
-- by the Partner Portal migration.

drop function if exists
public.nf_set_partner_event_submitted_at();

drop function if exists
public.nf_partner_id_for_user();

drop function if exists
public.nf_is_admin();

drop function if exists
public.nf_word_count(text);

drop function if exists
public.nf_set_updated_at();

-- Verify that the targeted Partner Portal objects are gone
-- and the existing retail locator remains available.

do $$
declare
  object_name text;
  remaining_policy_count integer;
  remaining_bucket_count integer;
begin
  foreach object_name in array array[
    'partner_accounts',
    'partner_users',
    'partner_applications',
    'partner_replenishment_requests',
    'partner_replenishment_items',
    'partner_resources',
    'partner_events',
    'partner_auth_audit'
  ]
  loop
    if to_regclass('public.' || object_name) is not null then
      raise exception
        'STOP: Partner Portal table still exists: %',
        object_name;
    end if;
  end loop;

  foreach object_name in array array[
    'public.nf_set_updated_at()',
    'public.nf_word_count(text)',
    'public.nf_is_admin()',
    'public.nf_partner_id_for_user()',
    'public.nf_set_partner_event_submitted_at()',
    'public.find_approved_partner_events(text)'
  ]
  loop
    if to_regprocedure(object_name) is not null then
      raise exception
        'STOP: Partner Portal function still exists: %',
        object_name;
    end if;
  end loop;

  select count(*)
  into remaining_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'Admins manage partner portal files',
      'Partners view their event images',
      'Partners upload their event images',
      'Partners update their event images',
      'Partners delete their event images',
      'Partners download active portal resources'
    );

  if remaining_policy_count <> 0 then
    raise exception
      'STOP: % Partner Portal storage policy or policies remain.',
      remaining_policy_count;
  end if;

  select count(*)
  into remaining_bucket_count
  from storage.buckets
  where id in (
    'partner-resources',
    'partner-event-images'
  );

  if remaining_bucket_count <> 0 then
    raise exception
      'STOP: % Partner Portal storage bucket or buckets remain.',
      remaining_bucket_count;
  end if;

  if to_regclass('public.retail_locations') is null then
    raise exception
      'STOP: public.retail_locations is missing after rollback.';
  end if;

  if to_regprocedure(
    'public.find_retail_locations(text)'
  ) is null then
    raise exception
      'STOP: public.find_retail_locations(text) is missing after rollback.';
  end if;
end;
$$;

commit;
