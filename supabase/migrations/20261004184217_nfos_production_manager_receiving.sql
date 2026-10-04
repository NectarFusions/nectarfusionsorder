-- Production Manager is the UI label for the existing production_operator role key.
-- Keep the underlying role key stable so existing team assignments continue working.
-- Receiving is intentionally exposed in the Production Manager Daily Work workspace.

insert into public.nfos_role_permissions(role, permission, description)
values (
  'production_operator',
  'inventory.manage',
  'Receive inventory needed for assigned production work'
)
on conflict (role, permission) do update
set description = excluded.description;
