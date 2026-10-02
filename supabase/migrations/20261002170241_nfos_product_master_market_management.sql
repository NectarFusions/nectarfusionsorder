-- NFOS Market Management staged-order workflow.
insert into public.nfos_role_permissions(role,permission) values
  ('market_manager','ops.view'),
  ('market_manager','products.view'),
  ('market_manager','inventory.lookup'),
  ('market_manager','market.order.log'),
  ('operations_manager','products.view'),
  ('operations_manager','market.order.log'),
  ('owner','products.view'),
  ('owner','products.manage'),
  ('owner','market.order.log')
on conflict do nothing;

create sequence if not exists public.nfos_market_order_log_seq;

create table if not exists public.nfos_market_order_logs (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('MKT-' || lpad(nextval('public.nfos_market_order_log_seq')::text,6,'0')),
  market_session_id uuid not null references public.nfos_market_sessions(id),
  created_by_member_id uuid not null references public.nfos_team_members(id),
  created_by_user_id uuid not null references auth.users(id),
  business_day date not null default public.nfos_business_today(),
  status text not null default 'logged'
    check (status in ('logged','submitted','approved','returned','cancelled')),
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfos_market_order_log_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.nfos_market_order_logs(id) on delete cascade,
  item_id uuid not null references public.nfos_items(id),
  quantity numeric not null check (quantity > 0),
  unit_cents integer not null check (unit_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,item_id)
);

alter table public.nfos_market_order_logs enable row level security;
alter table public.nfos_market_order_log_items enable row level security;

create or replace function nfos_private.market_lookup_sellable_barcode(p_barcode text)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_result jsonb;
begin
  perform nfos_private.current_member_id('market.order.log');
  select jsonb_build_object(
    'item_id',i.id,'sku',i.sku,'name',i.name,'size_label',i.size_label,
    'texture',i.legacy_texture,'barcode_value',i.barcode_value,
    'flavor_id',f.id,'flavor_name',f.name,
    'unit_cents',coalesce(i.retail_price_cents,s.price_cents),
    'company_on_hand',coalesce(inv.company_on_hand,0),
    'planning_on_hand',coalesce(inv.planning_on_hand,0)
  ) into v_result
  from public.nfos_items i
  join public.flavors f on f.id=i.legacy_flavor_id and f.active
  left join public.sizes s on s.id=i.legacy_size_id
  left join public.nfos_inventory_summary inv on inv.item_id=i.id
  where i.item_type='finished_good' and i.active and i.barcode_value=btrim(p_barcode)
  limit 1;
  return v_result;
end;
$function$;

create or replace function nfos_private.replace_market_order_log_lines(p_order_id uuid,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_line record; v_item_id uuid; v_unit_cents integer; v_count integer:=0; v_units numeric:=0; v_total bigint:=0;
begin
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' then raise exception 'Order lines must be an array.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Scan at least one item before logging the order.'; end if;
  delete from public.nfos_market_order_log_items where order_id=p_order_id;
  for v_line in select * from jsonb_to_recordset(p_lines) as x(item_id uuid,quantity numeric) loop
    if v_line.item_id is null or v_line.quantity is null or v_line.quantity<=0 then raise exception 'Every scanned item needs a quantity greater than zero.'; end if;
    select i.id,coalesce(i.retail_price_cents,s.price_cents) into v_item_id,v_unit_cents
    from public.nfos_items i
    join public.flavors f on f.id=i.legacy_flavor_id and f.active
    left join public.sizes s on s.id=i.legacy_size_id
    where i.id=v_line.item_id and i.active and i.item_type='finished_good';
    if v_item_id is null then raise exception 'A scanned item is not an active sellable finished product.'; end if;
    if v_unit_cents is null then raise exception 'Selling price is missing for one of the scanned items.'; end if;
    insert into public.nfos_market_order_log_items(order_id,item_id,quantity,unit_cents)
    values(p_order_id,v_item_id,v_line.quantity,v_unit_cents)
    on conflict(order_id,item_id) do update
      set quantity=public.nfos_market_order_log_items.quantity+excluded.quantity,
          unit_cents=excluded.unit_cents,
          updated_at=now();
    v_count:=v_count+1;
    v_units:=v_units+v_line.quantity;
    v_total:=v_total+round(v_line.quantity*v_unit_cents)::bigint;
  end loop;
  return jsonb_build_object('line_count',v_count,'units',v_units,'estimated_total_cents',v_total);
end;
$function$;

create or replace function nfos_private.log_market_order(p_market_session_id uuid,p_lines jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_member uuid; v_order public.nfos_market_order_logs%rowtype; v_lines jsonb;
begin
  v_member:=nfos_private.current_member_id('market.order.log');
  if not exists(
    select 1 from public.nfos_market_sessions
    where id=p_market_session_id and assigned_member_id=v_member and status in ('loaded','open')
  ) then raise exception 'Choose an assigned market session that has been loaded or opened.'; end if;
  insert into public.nfos_market_order_logs(market_session_id,created_by_member_id,created_by_user_id,notes)
  values(p_market_session_id,v_member,auth.uid(),nullif(btrim(p_notes),'')) returning * into v_order;
  v_lines:=nfos_private.replace_market_order_log_lines(v_order.id,p_lines);
  return jsonb_build_object('id',v_order.id,'order_no',v_order.order_no,'status',v_order.status,'summary',v_lines);
end;
$function$;

create or replace function nfos_private.update_market_order_log(p_order_id uuid,p_lines jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_member uuid; v_order public.nfos_market_order_logs%rowtype; v_lines jsonb;
begin
  v_member:=nfos_private.current_member_id('market.order.log');
  select * into v_order
  from public.nfos_market_order_logs
  where id=p_order_id and created_by_member_id=v_member and status in ('logged','returned')
  for update;
  if v_order.id is null then raise exception 'Only your logged or returned orders can be edited.'; end if;
  update public.nfos_market_order_logs set notes=nullif(btrim(p_notes),''),updated_at=now() where id=p_order_id;
  v_lines:=nfos_private.replace_market_order_log_lines(p_order_id,p_lines);
  return jsonb_build_object('id',p_order_id,'order_no',v_order.order_no,'status',v_order.status,'summary',v_lines);
end;
$function$;

create or replace function nfos_private.submit_market_order_log(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_member uuid; v_order public.nfos_market_order_logs%rowtype;
begin
  v_member:=nfos_private.current_member_id('market.order.log');
  update public.nfos_market_order_logs
  set status='submitted',submitted_at=now(),updated_at=now()
  where id=p_order_id and created_by_member_id=v_member and status in ('logged','returned')
    and exists(select 1 from public.nfos_market_order_log_items where order_id=p_order_id)
  returning * into v_order;
  if v_order.id is null then raise exception 'This order cannot be submitted. Make sure it has items and is still editable.'; end if;
  return jsonb_build_object('id',v_order.id,'order_no',v_order.order_no,'status',v_order.status,'submitted_at',v_order.submitted_at);
end;
$function$;

create or replace function nfos_private.market_order_workspace()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_member uuid; v_sessions jsonb; v_inventory jsonb; v_logs jsonb;
begin
  v_member:=nfos_private.current_member_id('market.order.log');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.market_day,x.venue_name),'[]'::jsonb) into v_sessions
  from(
    select s.id,s.status,s.inventory_location_id,s.assigned_member_id,md.day as market_day,v.name as venue_name,
           coalesce(md.where_at,v.where_at) as where_at,coalesce(md.hours,v.hours) as hours
    from public.nfos_market_sessions s
    left join public.market_dates md on md.id=s.market_date_id
    left join public.venues v on v.id=s.venue_id
    where s.assigned_member_id=v_member and s.status in ('loaded','open')
      and coalesce(md.day,public.nfos_business_today()) between public.nfos_business_today()-1 and public.nfos_business_today()+1
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.venue_name,x.name),'[]'::jsonb) into v_inventory
  from(
    select i.* from public.nfos_market_session_inventory i
    join public.nfos_market_sessions s on s.id=i.session_id
    where s.assigned_member_id=v_member and s.status in ('loaded','open')
  ) x;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',o.id,'order_no',o.order_no,'market_session_id',o.market_session_id,
      'business_day',o.business_day,'status',o.status,'notes',o.notes,
      'submitted_at',o.submitted_at,'approved_at',o.approved_at,'admin_notes',o.admin_notes,
      'created_at',o.created_at,'updated_at',o.updated_at,'venue_name',v.name,'market_day',md.day,
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',li.id,'item_id',li.item_id,'quantity',li.quantity,'unit_cents',li.unit_cents,
          'sku',i.sku,'name',i.name,'size_label',i.size_label,'texture',i.legacy_texture,
          'flavor_id',i.legacy_flavor_id,'flavor_name',f.name,
          'line_total_cents',round(li.quantity*li.unit_cents)::bigint
        ) order by f.name,i.size_label,i.legacy_texture)
        from public.nfos_market_order_log_items li
        join public.nfos_items i on i.id=li.item_id
        left join public.flavors f on f.id=i.legacy_flavor_id
        where li.order_id=o.id
      ),'[]'::jsonb)
    ) order by o.created_at desc
  ),'[]'::jsonb) into v_logs
  from public.nfos_market_order_logs o
  join public.nfos_market_sessions s on s.id=o.market_session_id
  left join public.market_dates md on md.id=s.market_date_id
  left join public.venues v on v.id=s.venue_id
  where o.created_by_member_id=v_member and o.business_day=public.nfos_business_today();
  return jsonb_build_object('business_day',public.nfos_business_today(),'sessions',v_sessions,'session_inventory',v_inventory,'logs',v_logs);
end;
$function$;

create or replace function nfos_private.admin_market_order_approvals()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_pending jsonb; v_history jsonb;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at),'[]'::jsonb) into v_pending
  from(
    select o.id,o.order_no,o.market_session_id,o.business_day,o.status,o.notes,o.submitted_at,o.created_at,
           tm.display_name as logged_by,v.name as venue_name,md.day as market_day,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'id',li.id,'item_id',li.item_id,'quantity',li.quantity,'unit_cents',li.unit_cents,
               'sku',i.sku,'name',i.name,'size_label',i.size_label,'texture',i.legacy_texture,
               'flavor_name',f.name,'line_total_cents',round(li.quantity*li.unit_cents)::bigint
             ) order by f.name,i.size_label,i.legacy_texture)
             from public.nfos_market_order_log_items li
             join public.nfos_items i on i.id=li.item_id
             left join public.flavors f on f.id=i.legacy_flavor_id
             where li.order_id=o.id
           ),'[]'::jsonb) as items
    from public.nfos_market_order_logs o
    join public.nfos_team_members tm on tm.id=o.created_by_member_id
    join public.nfos_market_sessions s on s.id=o.market_session_id
    left join public.market_dates md on md.id=s.market_date_id
    left join public.venues v on v.id=s.venue_id
    where o.status='submitted'
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb) into v_history
  from(
    select o.id,o.order_no,o.business_day,o.status,o.approved_at,o.admin_notes,o.updated_at,
           tm.display_name as logged_by,v.name as venue_name
    from public.nfos_market_order_logs o
    join public.nfos_team_members tm on tm.id=o.created_by_member_id
    join public.nfos_market_sessions s on s.id=o.market_session_id
    left join public.venues v on v.id=s.venue_id
    where o.status in ('approved','returned','cancelled')
      and o.business_day>=public.nfos_business_today()-7
    order by o.updated_at desc limit 100
  ) x;
  return jsonb_build_object('pending',v_pending,'history',v_history);
end;
$function$;

create or replace function nfos_private.review_market_order_log(p_order_id uuid,p_action text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_order public.nfos_market_order_logs%rowtype;
  v_session public.nfos_market_sessions%rowtype;
  v_line record;
  v_action text:=lower(coalesce(nullif(btrim(p_action),''),''));
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if v_action not in ('approve','return') then raise exception 'Action must be approve or return.'; end if;
  select * into v_order from public.nfos_market_order_logs where id=p_order_id for update;
  if v_order.id is null then raise exception 'Logged order not found.'; end if;
  if v_order.status<>'submitted' then raise exception 'Only submitted orders can be reviewed.'; end if;
  if v_action='return' then
    update public.nfos_market_order_logs
    set status='returned',admin_notes=nullif(btrim(p_admin_notes),''),approved_at=null,approved_by=null,updated_at=now()
    where id=p_order_id;
    return jsonb_build_object('id',p_order_id,'order_no',v_order.order_no,'status','returned');
  end if;
  select * into v_session from public.nfos_market_sessions where id=v_order.market_session_id for update;
  if v_session.id is null then raise exception 'Market session not found.'; end if;
  if v_session.status='loaded' then
    perform nfos_private.open_market_session(v_session.id);
    select * into v_session from public.nfos_market_sessions where id=v_session.id;
  end if;
  if v_session.status<>'open' then raise exception 'The market session must be loaded or open before this order can be approved.'; end if;
  for v_line in select * from public.nfos_market_order_log_items where order_id=p_order_id order by created_at,id loop
    perform nfos_private.record_market_sale(
      v_order.market_session_id,v_line.item_id,v_line.quantity,v_line.unit_cents,null,'manual',
      v_order.order_no,null,v_line.id::text,coalesce(v_order.submitted_at,now()),
      concat_ws(' · ','Approved Market Management order',nullif(btrim(p_admin_notes),''))
    );
  end loop;
  update public.nfos_market_order_logs
  set status='approved',approved_at=now(),approved_by=auth.uid(),admin_notes=nullif(btrim(p_admin_notes),''),updated_at=now()
  where id=p_order_id returning * into v_order;
  return jsonb_build_object('id',v_order.id,'order_no',v_order.order_no,'status',v_order.status,'approved_at',v_order.approved_at);
end;
$function$;

create or replace function public.nfos_market_get_order_workspace()
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.market_order_workspace(); $function$;
create or replace function public.nfos_market_lookup_sellable_barcode(p_barcode text)
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.market_lookup_sellable_barcode(p_barcode); $function$;
create or replace function public.nfos_market_log_order(p_market_session_id uuid,p_lines jsonb,p_notes text default null)
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.log_market_order(p_market_session_id,p_lines,p_notes); $function$;
create or replace function public.nfos_market_update_logged_order(p_order_id uuid,p_lines jsonb,p_notes text default null)
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.update_market_order_log(p_order_id,p_lines,p_notes); $function$;
create or replace function public.nfos_market_submit_logged_order(p_order_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.submit_market_order_log(p_order_id); $function$;
create or replace function public.nfos_admin_get_market_order_approvals()
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.admin_market_order_approvals(); $function$;
create or replace function public.nfos_admin_review_market_order(p_order_id uuid,p_action text,p_admin_notes text default null)
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.review_market_order_log(p_order_id,p_action,p_admin_notes); $function$;

revoke all on function public.nfos_market_get_order_workspace() from public,anon;
revoke all on function public.nfos_market_lookup_sellable_barcode(text) from public,anon;
revoke all on function public.nfos_market_log_order(uuid,jsonb,text) from public,anon;
revoke all on function public.nfos_market_update_logged_order(uuid,jsonb,text) from public,anon;
revoke all on function public.nfos_market_submit_logged_order(uuid) from public,anon;
revoke all on function public.nfos_admin_get_market_order_approvals() from public,anon;
revoke all on function public.nfos_admin_review_market_order(uuid,text,text) from public,anon;

grant execute on function public.nfos_market_get_order_workspace() to authenticated;
grant execute on function public.nfos_market_lookup_sellable_barcode(text) to authenticated;
grant execute on function public.nfos_market_log_order(uuid,jsonb,text) to authenticated;
grant execute on function public.nfos_market_update_logged_order(uuid,jsonb,text) to authenticated;
grant execute on function public.nfos_market_submit_logged_order(uuid) to authenticated;
grant execute on function public.nfos_admin_get_market_order_approvals() to authenticated;
grant execute on function public.nfos_admin_review_market_order(uuid,text,text) to authenticated;
