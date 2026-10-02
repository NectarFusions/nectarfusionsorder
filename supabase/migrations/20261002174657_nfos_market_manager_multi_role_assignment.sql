-- Modern multi-role Market Management assignment support.
create or replace function nfos_private.market_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
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
    where v_role in ('owner','operations_manager') or s.assigned_member_id=v_member
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
    where v_role in ('owner','operations_manager') or s.assigned_member_id=v_member
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  into v_team
  from(
    select tm.id,tm.display_name,tm.email,tm.role,tm.roles
    from public.nfos_team_members tm
    where tm.active
      and tm.deleted_at is null
      and exists(
        select 1
        from public.nfos_role_permissions rp
        where rp.role=any(tm.roles)
          and rp.permission='market.order.log'
      )
      and v_role in ('owner','operations_manager')
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.synced_at desc nulls last),'[]'::jsonb)
  into v_recon
  from(
    select r.*
    from public.nfos_market_reconciliations r
    join public.nfos_market_sessions s on s.id=r.session_id
    where v_role in ('owner','operations_manager') or s.assigned_member_id=v_member
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.square_item_name,x.square_variation_name),'[]'::jsonb)
  into v_mappings
  from(
    select m.id,m.square_variation_id,m.item_id,m.square_item_name,m.square_variation_name,
           m.square_sku,m.active,m.mapped_at,i.sku as nfos_sku,i.name as nfos_name
    from public.nfos_square_catalog_mappings m
    join public.nfos_items i on i.id=m.item_id
    where m.active
  ) x;

  return jsonb_build_object(
    'market_dates',v_dates,'sessions',v_sessions,'finished_items',v_items,
    'session_inventory',v_inventory,'team',v_team,'reconciliations',v_recon,
    'square_mappings',v_mappings
  );
end;
$function$;

create or replace function nfos_private.assign_market_session(p_session_id uuid,p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_manager uuid;
  v_member public.nfos_team_members%rowtype;
begin
  v_manager:=nfos_private.current_member_id('team.assign');

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id and active and deleted_at is null;

  if v_member.id is null then raise exception 'Active team member not found.'; end if;

  if not exists(
    select 1
    from public.nfos_role_permissions rp
    where rp.role=any(v_member.roles)
      and rp.permission='market.order.log'
  ) then
    raise exception 'That team member does not have Market Management access.';
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
$function$;
