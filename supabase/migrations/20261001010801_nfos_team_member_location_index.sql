
create index if not exists nfos_team_members_default_location_idx
  on public.nfos_team_members(default_location_id)
  where default_location_id is not null;
