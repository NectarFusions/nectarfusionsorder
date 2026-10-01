
insert into public.nfos_role_permissions(role,permission,description)
values
  ('owner','market.manage','Manage market sessions and field inventory'),
  ('operations_manager','market.manage','Manage market sessions and field inventory'),
  ('production_operator','market.manage','Manage assigned market sessions'),
  ('inventory_operator','market.manage','Manage assigned market sessions')
on conflict(role,permission) do update set description=excluded.description;

create table if not exists public.nfos_market_sessions (
  id uuid primary key default gen_random_uuid(),
  market_date_id uuid unique references public.market_dates(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  market_day date not null,
  venue_name text not null,
  inventory_location_id uuid not null references public.nfos_locations(id) on delete restrict,
  assigned_member_id uuid references public.nfos_team_members(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned','loaded','open','closed','reconciled','cancelled')),
  square_location_id text,
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  reconciled_at timestamptz,
  reconciled_by uuid,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfos_market_sales (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.nfos_market_sessions(id) on delete cascade,
  source text not null default 'manual'
    check (source in ('manual','square')),
  external_order_id text,
  external_payment_id text,
  external_line_id text,
  sold_at timestamptz not null default now(),
  item_id uuid not null references public.nfos_items(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cents integer not null default 0 check (unit_cents >= 0),
  gross_cents integer not null default 0 check (gross_cents >= 0),
  payment_method text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists nfos_market_sales_external_line_uidx
  on public.nfos_market_sales(session_id,source,external_line_id)
  where external_line_id is not null;

create index if not exists nfos_market_sales_session_idx
  on public.nfos_market_sales(session_id,sold_at);

create index if not exists nfos_market_sales_item_idx
  on public.nfos_market_sales(item_id);

create table if not exists public.nfos_market_sale_allocations (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.nfos_market_sales(id) on delete cascade,
  lot_id uuid not null references public.nfos_lots(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  inventory_transaction_id uuid not null references public.nfos_inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists nfos_market_sale_allocations_sale_idx
  on public.nfos_market_sale_allocations(sale_id);

create index if not exists nfos_market_sale_allocations_lot_idx
  on public.nfos_market_sale_allocations(lot_id);

create table if not exists public.nfos_market_reconciliations (
  session_id uuid primary key references public.nfos_market_sessions(id) on delete cascade,
  square_gross_cents integer,
  square_transaction_count integer,
  recorded_gross_cents integer,
  recorded_sale_count integer,
  difference_cents integer,
  status text not null default 'open'
    check (status in ('open','matched','review_required')),
  synced_at timestamptz,
  notes text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nfos_market_sessions enable row level security;
alter table public.nfos_market_sales enable row level security;
alter table public.nfos_market_sale_allocations enable row level security;
alter table public.nfos_market_reconciliations enable row level security;

revoke all on table public.nfos_market_sessions from anon;
revoke all on table public.nfos_market_sales from anon;
revoke all on table public.nfos_market_sale_allocations from anon;
revoke all on table public.nfos_market_reconciliations from anon;

grant select,insert,update,delete on table public.nfos_market_sessions to authenticated;
grant select,insert,update,delete on table public.nfos_market_sales to authenticated;
grant select on table public.nfos_market_sale_allocations to authenticated;
grant select,insert,update on table public.nfos_market_reconciliations to authenticated;

drop policy if exists nfos_market_sessions_admin_all on public.nfos_market_sessions;
create policy nfos_market_sessions_admin_all
on public.nfos_market_sessions
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_market_sales_admin_all on public.nfos_market_sales;
create policy nfos_market_sales_admin_all
on public.nfos_market_sales
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_market_sale_allocations_admin_read on public.nfos_market_sale_allocations;
create policy nfos_market_sale_allocations_admin_read
on public.nfos_market_sale_allocations
for select to authenticated
using ((select public.nf_is_admin()));

drop policy if exists nfos_market_reconciliations_admin_all on public.nfos_market_reconciliations;
create policy nfos_market_reconciliations_admin_all
on public.nfos_market_reconciliations
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_market_sessions_touch_updated_at on public.nfos_market_sessions;
create trigger nfos_market_sessions_touch_updated_at
before update on public.nfos_market_sessions
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_market_reconciliations_touch_updated_at on public.nfos_market_reconciliations;
create trigger nfos_market_reconciliations_touch_updated_at
before update on public.nfos_market_reconciliations
for each row execute function public.nfos_set_updated_at();

create or replace function nfos_private.assert_market_access(p_session_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_role text;
  v_assigned uuid;
begin
  v_member:=nfos_private.current_member_id('market.manage');

  select role into v_role
  from public.nfos_team_members
  where id=v_member;

  select assigned_member_id into v_assigned
  from public.nfos_market_sessions
  where id=p_session_id;

  if not found then raise exception 'Market session not found.'; end if;

  if v_role in ('owner','operations_manager') then
    return v_member;
  end if;

  if v_assigned is null or v_assigned<>v_member then
    raise exception 'This market session is not assigned to you.';
  end if;

  return v_member;
end;
$$;

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
  v_md public.market_dates%rowtype;
  v_venue public.venues%rowtype;
  v_location public.nfos_locations%rowtype;
  v_session public.nfos_market_sessions%rowtype;
  v_code text;
begin
  v_member:=nfos_private.current_member_id('market.manage');

  select * into v_md
  from public.market_dates
  where id=p_market_date_id;

  if v_md.id is null then raise exception 'Market date not found.'; end if;

  select * into v_venue
  from public.venues
  where id=v_md.venue_id;

  if v_venue.id is null then raise exception 'Market venue not found.'; end if;

  if p_assigned_member_id is not null and not exists(
    select 1 from public.nfos_team_members
    where id=p_assigned_member_id and active
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
    p_assigned_member_id,nullif(btrim(p_square_location_id),''),
    nullif(btrim(p_notes),''),auth.uid()
  )
  returning * into v_session;

  return jsonb_build_object(
    'id',v_session.id,
    'status',v_session.status,
    'inventory_location_id',v_session.inventory_location_id,
    'existing',false
  );
end;
$$;

create or replace function nfos_private.market_load_item(
  p_session_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_source_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_session public.nfos_market_sessions%rowtype;
  v_item public.nfos_items%rowtype;
  v_source uuid;
  v_remaining numeric;
  v_alloc numeric;
  v_lot record;
  v_count integer:=0;
begin
  v_member:=nfos_private.assert_market_access(p_session_id);

  select * into v_session
  from public.nfos_market_sessions
  where id=p_session_id
  for update;

  if v_session.status in ('closed','reconciled','cancelled') then
    raise exception 'This market session cannot receive more inventory.';
  end if;

  select * into v_item
  from public.nfos_items
  where id=p_item_id and active and item_type='finished_good';

  if v_item.id is null then raise exception 'Active finished item not found.'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Load quantity must be greater than zero.'; end if;

  v_source:=p_source_location_id;
  if v_source is null then
    select id into v_source
    from public.nfos_locations
    where code='MAIN' and active
    limit 1;
  end if;

  v_remaining:=p_quantity;

  for v_lot in
    select
      lb.lot_id,
      lb.on_hand,
      l.received_at
    from public.nfos_lot_balances lb
    join public.nfos_lots l on l.id=lb.lot_id
    where lb.item_id=p_item_id
      and lb.location_id=v_source
      and lb.on_hand>0
      and l.status='available'
    order by l.received_at nulls first,l.lot_code
  loop
    exit when v_remaining<=0;
    v_alloc:=least(v_remaining,v_lot.on_hand);

    perform nfos_private.record_inventory_movement(
      p_item_id,v_alloc,v_source,v_session.inventory_location_id,
      'transfer',v_lot.lot_id,'market_session_load',p_session_id::text,null,
      concat_ws(' · ','Loaded for '||v_session.venue_name,nullif(btrim(p_notes),'')),
      now(),'market_load'
    );

    v_remaining:=v_remaining-v_alloc;
    v_count:=v_count+1;
  end loop;

  if v_remaining>0 then
    raise exception 'Insufficient sellable finished inventory. Missing % units.',v_remaining;
  end if;

  update public.nfos_market_sessions
  set status=case when status='planned' then 'loaded' else status end
  where id=p_session_id;

  return jsonb_build_object(
    'session_id',p_session_id,
    'item_id',p_item_id,
    'quantity_loaded',p_quantity,
    'lots_used',v_count
  );
end;
$$;

create or replace function nfos_private.open_market_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_session public.nfos_market_sessions%rowtype;
begin
  v_member:=nfos_private.assert_market_access(p_session_id);

  select * into v_session
  from public.nfos_market_sessions
  where id=p_session_id
  for update;

  if v_session.status not in ('planned','loaded') then
    raise exception 'Only a planned or loaded market session can be opened.';
  end if;

  update public.nfos_market_sessions
  set status='open',opened_at=now(),opened_by=auth.uid()
  where id=p_session_id;

  return jsonb_build_object('id',p_session_id,'status','open','opened_at',now());
end;
$$;

create or replace function nfos_private.record_market_sale(
  p_session_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_cents integer,
  p_payment_method text default null,
  p_source text default 'manual',
  p_external_order_id text default null,
  p_external_payment_id text default null,
  p_external_line_id text default null,
  p_sold_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_session public.nfos_market_sessions%rowtype;
  v_item public.nfos_items%rowtype;
  v_sale public.nfos_market_sales%rowtype;
  v_remaining numeric;
  v_alloc numeric;
  v_lot record;
  v_tx uuid;
begin
  v_member:=nfos_private.assert_market_access(p_session_id);

  select * into v_session
  from public.nfos_market_sessions
  where id=p_session_id
  for update;

  if v_session.status<>'open' then
    raise exception 'Market session must be open before recording sales.';
  end if;

  select * into v_item
  from public.nfos_items
  where id=p_item_id and active and item_type='finished_good';

  if v_item.id is null then raise exception 'Active finished item not found.'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Sale quantity must be greater than zero.'; end if;
  if p_unit_cents is null or p_unit_cents<0 then raise exception 'Unit price cannot be negative.'; end if;
  if p_source not in ('manual','square') then raise exception 'Invalid market sale source.'; end if;

  if p_external_line_id is not null and exists(
    select 1
    from public.nfos_market_sales
    where session_id=p_session_id
      and source=p_source
      and external_line_id=p_external_line_id
  ) then
    return (
      select jsonb_build_object(
        'id',id,'duplicate',true,'quantity',quantity,'gross_cents',gross_cents
      )
      from public.nfos_market_sales
      where session_id=p_session_id
        and source=p_source
        and external_line_id=p_external_line_id
      limit 1
    );
  end if;

  insert into public.nfos_market_sales(
    session_id,source,external_order_id,external_payment_id,external_line_id,
    sold_at,item_id,quantity,unit_cents,gross_cents,payment_method,notes,created_by
  )
  values(
    p_session_id,p_source,nullif(btrim(p_external_order_id),''),
    nullif(btrim(p_external_payment_id),''),
    nullif(btrim(p_external_line_id),''),
    coalesce(p_sold_at,now()),p_item_id,p_quantity,p_unit_cents,
    round(p_quantity*p_unit_cents)::integer,
    nullif(btrim(p_payment_method),''),
    nullif(btrim(p_notes),''),
    auth.uid()
  )
  returning * into v_sale;

  v_remaining:=p_quantity;

  for v_lot in
    select
      lb.lot_id,
      lb.on_hand,
      l.received_at
    from public.nfos_lot_balances lb
    join public.nfos_lots l on l.id=lb.lot_id
    where lb.item_id=p_item_id
      and lb.location_id=v_session.inventory_location_id
      and lb.on_hand>0
    order by l.received_at nulls first,l.lot_code
  loop
    exit when v_remaining<=0;
    v_alloc:=least(v_remaining,v_lot.on_hand);

    v_tx:=nfos_private.record_inventory_movement(
      p_item_id,v_alloc,v_session.inventory_location_id,null,
      'sale',v_lot.lot_id,'market_sale',v_sale.id::text,
      p_unit_cents/100.0,
      concat_ws(' · ','Market sale at '||v_session.venue_name,nullif(btrim(p_notes),'')),
      coalesce(p_sold_at,now()),
      case when p_source='square' then 'market_square' else 'market_manual' end
    );

    insert into public.nfos_market_sale_allocations(
      sale_id,lot_id,quantity,inventory_transaction_id
    )
    values(v_sale.id,v_lot.lot_id,v_alloc,v_tx);

    perform nfos_private.refresh_lot_status(v_lot.lot_id);
    v_remaining:=v_remaining-v_alloc;
  end loop;

  if v_remaining>0 then
    raise exception 'Market inventory is short by % units for this sale.',v_remaining;
  end if;

  return jsonb_build_object(
    'id',v_sale.id,
    'duplicate',false,
    'quantity',v_sale.quantity,
    'gross_cents',v_sale.gross_cents
  );
end;
$$;

create or replace function nfos_private.close_market_session(
  p_session_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_session public.nfos_market_sessions%rowtype;
  v_main uuid;
  v_row record;
  v_returned numeric:=0;
begin
  v_member:=nfos_private.assert_market_access(p_session_id);

  select * into v_session
  from public.nfos_market_sessions
  where id=p_session_id
  for update;

  if v_session.status not in ('loaded','open') then
    raise exception 'Only a loaded or open market session can be closed.';
  end if;

  select id into v_main
  from public.nfos_locations
  where code='MAIN' and active
  limit 1;

  for v_row in
    select
      lb.item_id,lb.lot_id,lb.on_hand
    from public.nfos_lot_balances lb
    where lb.location_id=v_session.inventory_location_id
      and lb.on_hand>0
  loop
    perform nfos_private.record_inventory_movement(
      v_row.item_id,v_row.on_hand,v_session.inventory_location_id,v_main,
      'transfer',v_row.lot_id,'market_session_return',p_session_id::text,null,
      concat_ws(' · ','Returned after '||v_session.venue_name,nullif(btrim(p_notes),'')),
      now(),'market_return'
    );
    perform nfos_private.refresh_lot_status(v_row.lot_id);
    v_returned:=v_returned+v_row.on_hand;
  end loop;

  update public.nfos_market_sessions
  set status='closed',
      closed_at=now(),
      closed_by=auth.uid(),
      notes=concat_ws(E'\n',nullif(notes,''),nullif(btrim(p_notes),''))
  where id=p_session_id;

  return jsonb_build_object(
    'id',p_session_id,
    'status','closed',
    'returned_units',v_returned
  );
end;
$$;

create or replace view public.nfos_market_session_overview
with (security_invoker=true)
as
select
  s.id,
  s.market_date_id,
  s.venue_id,
  s.market_day,
  s.venue_name,
  s.inventory_location_id,
  l.name as inventory_location_name,
  s.assigned_member_id,
  tm.display_name as assigned_member_name,
  s.status,
  s.square_location_id,
  s.opened_at,
  s.closed_at,
  s.reconciled_at,
  s.notes,
  coalesce((
    select sum(tx.quantity)
    from public.nfos_inventory_transactions tx
    where tx.reference_type='market_session_load'
      and tx.reference_id=s.id::text
  ),0)::numeric(14,4) as units_loaded,
  coalesce((
    select sum(ms.quantity)
    from public.nfos_market_sales ms
    where ms.session_id=s.id
  ),0)::numeric(14,4) as units_sold,
  coalesce((
    select sum(tx.quantity)
    from public.nfos_inventory_transactions tx
    where tx.reference_type='market_session_return'
      and tx.reference_id=s.id::text
  ),0)::numeric(14,4) as units_returned,
  coalesce((
    select sum(ib.on_hand)
    from public.nfos_inventory_balances ib
    where ib.location_id=s.inventory_location_id
  ),0)::numeric(14,4) as units_at_market,
  coalesce((
    select sum(ms.gross_cents)
    from public.nfos_market_sales ms
    where ms.session_id=s.id
  ),0)::integer as recorded_gross_cents,
  coalesce((
    select count(*)
    from public.nfos_market_sales ms
    where ms.session_id=s.id
  ),0)::integer as recorded_sale_lines
from public.nfos_market_sessions s
join public.nfos_locations l on l.id=s.inventory_location_id
left join public.nfos_team_members tm on tm.id=s.assigned_member_id;

revoke all on table public.nfos_market_session_overview from anon;
grant select on table public.nfos_market_session_overview to authenticated;

create or replace view public.nfos_market_session_inventory
with (security_invoker=true)
as
select
  s.id as session_id,
  s.market_day,
  s.venue_name,
  ib.item_id,
  i.sku,
  i.name,
  i.size_label,
  i.legacy_texture,
  i.stocking_unit,
  ib.on_hand
from public.nfos_market_sessions s
join public.nfos_inventory_balances ib on ib.location_id=s.inventory_location_id
join public.nfos_items i on i.id=ib.item_id
where ib.on_hand<>0;

revoke all on table public.nfos_market_session_inventory from anon;
grant select on table public.nfos_market_session_inventory to authenticated;

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
begin
  v_member:=nfos_private.current_member_id('market.manage');
  select role into v_role from public.nfos_team_members where id=v_member;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day desc),'[]'::jsonb)
  into v_dates
  from(
    select md.id,md.venue_id,md.day,md.active,md.where_at,md.hours,v.name as venue_name
    from public.market_dates md
    join public.venues v on v.id=md.venue_id
    where md.day>=public.nfos_business_today()-30
    order by md.day desc
    limit 100
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.market_day desc),'[]'::jsonb)
  into v_sessions
  from(
    select *
    from public.nfos_market_session_overview s
    where v_role in ('owner','operations_manager')
       or s.assigned_member_id=v_member
    order by s.market_day desc
    limit 100
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
    select * from public.nfos_market_session_inventory
  ) x;

  return jsonb_build_object(
    'market_dates',v_dates,
    'sessions',v_sessions,
    'finished_items',v_items,
    'session_inventory',v_inventory
  );
end;
$$;

create or replace function public.nfos_market_get_workspace()
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.market_workspace(); $$;

create or replace function public.nfos_market_create_session(uuid,uuid default null,text default null,text default null)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.create_market_session($1,$2,$3,$4); $$;

create or replace function public.nfos_market_load_item(uuid,uuid,numeric,uuid default null,text default null)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.market_load_item($1,$2,$3,$4,$5); $$;

create or replace function public.nfos_market_open_session(uuid)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.open_market_session($1); $$;

create or replace function public.nfos_market_record_sale(uuid,uuid,numeric,integer,text default null,text default 'manual',text default null,text default null,text default null,timestamptz default now(),text default null)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.record_market_sale($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11); $$;

create or replace function public.nfos_market_close_session(uuid,text default null)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.close_market_session($1,$2); $$;

revoke all on function public.nfos_market_get_workspace() from public,anon;
revoke all on function public.nfos_market_create_session(uuid,uuid,text,text) from public,anon;
revoke all on function public.nfos_market_load_item(uuid,uuid,numeric,uuid,text) from public,anon;
revoke all on function public.nfos_market_open_session(uuid) from public,anon;
revoke all on function public.nfos_market_record_sale(uuid,uuid,numeric,integer,text,text,text,text,text,timestamptz,text) from public,anon;
revoke all on function public.nfos_market_close_session(uuid,text) from public,anon;

grant execute on function public.nfos_market_get_workspace() to authenticated;
grant execute on function public.nfos_market_create_session(uuid,uuid,text,text) to authenticated;
grant execute on function public.nfos_market_load_item(uuid,uuid,numeric,uuid,text) to authenticated;
grant execute on function public.nfos_market_open_session(uuid) to authenticated;
grant execute on function public.nfos_market_record_sale(uuid,uuid,numeric,integer,text,text,text,text,text,timestamptz,text) to authenticated;
grant execute on function public.nfos_market_close_session(uuid,text) to authenticated;

grant execute on function nfos_private.assert_market_access(uuid) to authenticated;
grant execute on function nfos_private.create_market_session(uuid,uuid,text,text) to authenticated;
grant execute on function nfos_private.market_load_item(uuid,uuid,numeric,uuid,text) to authenticated;
grant execute on function nfos_private.open_market_session(uuid) to authenticated;
grant execute on function nfos_private.record_market_sale(uuid,uuid,numeric,integer,text,text,text,text,text,timestamptz,text) to authenticated;
grant execute on function nfos_private.close_market_session(uuid,text) to authenticated;
grant execute on function nfos_private.market_workspace() to authenticated;
