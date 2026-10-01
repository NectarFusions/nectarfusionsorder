
create or replace function nfos_private.create_market_session(
  p_market_date_id uuid,
  p_assigned_member_id uuid default null,
  p_square_location_id text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_role text;
  v_assignee uuid;
  v_md public.market_dates%rowtype;
  v_venue public.venues%rowtype;
  v_location public.nfos_locations%rowtype;
  v_session public.nfos_market_sessions%rowtype;
  v_code text;
begin
  v_member:=nfos_private.current_member_id('market.manage');
  select role into v_role from public.nfos_team_members where id=v_member;

  select * into v_md
  from public.market_dates
  where id=p_market_date_id;

  if v_md.id is null then raise exception 'Market date not found.'; end if;

  select * into v_venue
  from public.venues
  where id=v_md.venue_id;

  if v_venue.id is null then raise exception 'Market venue not found.'; end if;

  if v_role in ('owner','operations_manager') then
    v_assignee:=p_assigned_member_id;
  else
    if p_assigned_member_id is not null and p_assigned_member_id<>v_member then
      raise exception 'Operators can only create market sessions assigned to themselves.';
    end if;
    v_assignee:=v_member;
  end if;

  if v_assignee is not null and not exists(
    select 1 from public.nfos_team_members
    where id=v_assignee and active
  ) then
    raise exception 'Assigned team member must be active.';
  end if;

  select * into v_session
  from public.nfos_market_sessions
  where market_date_id=p_market_date_id;

  if v_session.id is not null then
    return jsonb_build_object(
      'id',v_session.id,
      'status',v_session.status,
      'inventory_location_id',v_session.inventory_location_id,
      'assigned_member_id',v_session.assigned_member_id,
      'existing',true
    );
  end if;

  v_code:='MKT-'||to_char(v_md.day,'YYYYMMDD')||'-'||upper(substr(replace(v_venue.id::text,'-',''),1,6));

  insert into public.nfos_locations(
    code,name,location_type,counts_as_company_inventory,
    available_to_sell_online,active,notes
  )
  values(
    v_code,
    v_venue.name||' — '||v_md.day::text,
    'market',
    true,
    false,
    true,
    concat_ws(' · ',v_md.where_at,v_md.hours,'Created for NFOS market session')
  )
  returning * into v_location;

  insert into public.nfos_market_sessions(
    market_date_id,venue_id,market_day,venue_name,inventory_location_id,
    assigned_member_id,square_location_id,notes,created_by
  )
  values(
    v_md.id,v_venue.id,v_md.day,v_venue.name,v_location.id,
    v_assignee,nullif(btrim(p_square_location_id),''),
    nullif(btrim(p_notes),''),auth.uid()
  )
  returning * into v_session;

  return jsonb_build_object(
    'id',v_session.id,
    'status',v_session.status,
    'inventory_location_id',v_session.inventory_location_id,
    'assigned_member_id',v_session.assigned_member_id,
    'existing',false
  );
end;
$$;

create or replace function nfos_private.assign_market_session(
  p_session_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_manager uuid;
  v_member public.nfos_team_members%rowtype;
begin
  v_manager:=nfos_private.current_member_id('team.assign');

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id and active;

  if v_member.id is null then raise exception 'Active team member not found.'; end if;
  if not exists(
    select 1 from public.nfos_role_permissions
    where role=v_member.role and permission='market.manage'
  ) then
    raise exception 'That team member does not have market access.';
  end if;

  update public.nfos_market_sessions
  set assigned_member_id=p_member_id
  where id=p_session_id
    and status not in ('reconciled','cancelled');

  if not found then raise exception 'Open market session not found.'; end if;

  return jsonb_build_object(
    'session_id',p_session_id,
    'assigned_member_id',p_member_id,
    'assigned_to',v_member.display_name
  );
end;
$$;

create or replace function nfos_private.market_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_role text;
  v_dates jsonb;
  v_sessions jsonb;
  v_items jsonb;
  v_inventory jsonb;
  v_team jsonb;
  v_recon jsonb;
  v_mappings jsonb;
begin
  v_member:=nfos_private.current_member_id('market.manage');
  select role into v_role from public.nfos_team_members where id=v_member;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day desc),'[]'::jsonb)
  into v_dates
  from(
    select md.id,md.venue_id,md.day,md.active,md.where_at,md.hours,v.name as venue_name
    from public.market_dates md
    join public.venues v on v.id=md.venue_id
    where md.day>=public.nfos_business_today()-60
    order by md.day desc
    limit 150
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.market_day desc),'[]'::jsonb)
  into v_sessions
  from(
    select *
    from public.nfos_market_session_overview s
    where v_role in ('owner','operations_manager')
       or s.assigned_member_id=v_member
    order by s.market_day desc
    limit 150
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
  into v_items
  from(
    select id,sku,name,size_label,legacy_texture,stocking_unit
    from public.nfos_items
    where item_type='finished_good' and active
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.venue_name,x.name),'[]'::jsonb)
  into v_inventory
  from(
    select i.*
    from public.nfos_market_session_inventory i
    join public.nfos_market_sessions s on s.id=i.session_id
    where v_role in ('owner','operations_manager')
       or s.assigned_member_id=v_member
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  into v_team
  from(
    select tm.id,tm.display_name,tm.email,tm.role
    from public.nfos_team_members tm
    where tm.active
      and exists(
        select 1 from public.nfos_role_permissions rp
        where rp.role=tm.role and rp.permission='market.manage'
      )
      and v_role in ('owner','operations_manager')
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.synced_at desc nulls last),'[]'::jsonb)
  into v_recon
  from(
    select r.*
    from public.nfos_market_reconciliations r
    join public.nfos_market_sessions s on s.id=r.session_id
    where v_role in ('owner','operations_manager')
       or s.assigned_member_id=v_member
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.square_item_name,x.square_variation_name),'[]'::jsonb)
  into v_mappings
  from(
    select
      m.id,m.square_variation_id,m.item_id,m.square_item_name,m.square_variation_name,
      m.square_sku,m.active,m.mapped_at,i.sku as nfos_sku,i.name as nfos_name
    from public.nfos_square_catalog_mappings m
    join public.nfos_items i on i.id=m.item_id
    where m.active
  ) x;

  return jsonb_build_object(
    'market_dates',v_dates,
    'sessions',v_sessions,
    'finished_items',v_items,
    'session_inventory',v_inventory,
    'team',v_team,
    'reconciliations',v_recon,
    'square_mappings',v_mappings
  );
end;
$$;

create or replace function public.nfos_market_assign_session(uuid,uuid)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.assign_market_session($1,$2); $$;

revoke all on function public.nfos_market_assign_session(uuid,uuid) from public,anon;
grant execute on function public.nfos_market_assign_session(uuid,uuid) to authenticated;
grant execute on function nfos_private.assign_market_session(uuid,uuid) to authenticated;
