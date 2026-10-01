
create table if not exists public.nfos_square_catalog_mappings (
  id uuid primary key default gen_random_uuid(),
  square_variation_id text not null unique,
  item_id uuid not null references public.nfos_items(id) on delete cascade,
  square_item_name text,
  square_variation_name text,
  square_sku text,
  active boolean not null default true,
  mapped_by uuid,
  mapped_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfos_square_catalog_mappings_item_idx
  on public.nfos_square_catalog_mappings(item_id,active);

alter table public.nfos_square_catalog_mappings enable row level security;
revoke all on table public.nfos_square_catalog_mappings from anon;
grant select,insert,update,delete on table public.nfos_square_catalog_mappings to authenticated;

drop policy if exists nfos_square_catalog_mappings_admin_all on public.nfos_square_catalog_mappings;
create policy nfos_square_catalog_mappings_admin_all
on public.nfos_square_catalog_mappings
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_square_catalog_mappings_touch_updated_at on public.nfos_square_catalog_mappings;
create trigger nfos_square_catalog_mappings_touch_updated_at
before update on public.nfos_square_catalog_mappings
for each row execute function public.nfos_set_updated_at();

alter table public.nfos_market_reconciliations
  add column if not exists recorded_square_gross_cents integer,
  add column if not exists manual_gross_cents integer,
  add column if not exists total_recorded_gross_cents integer,
  add column if not exists unmapped_line_count integer not null default 0;

create or replace function nfos_private.set_market_square_location(
  p_session_id uuid,
  p_square_location_id text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
begin
  v_member:=nfos_private.assert_market_access(p_session_id);

  if nullif(btrim(p_square_location_id),'') is null then
    raise exception 'Square location is required.';
  end if;

  update public.nfos_market_sessions
  set square_location_id=btrim(p_square_location_id)
  where id=p_session_id;

  return jsonb_build_object(
    'session_id',p_session_id,
    'square_location_id',btrim(p_square_location_id)
  );
end;
$$;

create or replace function nfos_private.map_square_catalog_variation(
  p_item_id uuid,
  p_square_variation_id text,
  p_square_item_name text default null,
  p_square_variation_name text default null,
  p_square_sku text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_row public.nfos_square_catalog_mappings%rowtype;
begin
  v_member:=nfos_private.current_member_id('team.assign');

  if nullif(btrim(p_square_variation_id),'') is null then
    raise exception 'Square variation ID is required.';
  end if;

  if not exists(
    select 1 from public.nfos_items
    where id=p_item_id and active and item_type='finished_good'
  ) then
    raise exception 'Active NFOS finished item not found.';
  end if;

  insert into public.nfos_square_catalog_mappings(
    square_variation_id,item_id,square_item_name,square_variation_name,
    square_sku,active,mapped_by,mapped_at
  )
  values(
    btrim(p_square_variation_id),p_item_id,
    nullif(btrim(p_square_item_name),''),
    nullif(btrim(p_square_variation_name),''),
    nullif(btrim(p_square_sku),''),
    true,auth.uid(),now()
  )
  on conflict(square_variation_id) do update
  set item_id=excluded.item_id,
      square_item_name=excluded.square_item_name,
      square_variation_name=excluded.square_variation_name,
      square_sku=excluded.square_sku,
      active=true,
      mapped_by=auth.uid(),
      mapped_at=now(),
      updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,
    'square_variation_id',v_row.square_variation_id,
    'item_id',v_row.item_id
  );
end;
$$;

create or replace function nfos_private.get_square_catalog_mappings()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_rows jsonb;
begin
  v_member:=nfos_private.current_member_id('market.manage');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.square_item_name,x.square_variation_name),'[]'::jsonb)
  into v_rows
  from(
    select
      m.id,m.square_variation_id,m.item_id,m.square_item_name,
      m.square_variation_name,m.square_sku,m.active,m.mapped_at,
      i.sku as nfos_sku,i.name as nfos_name
    from public.nfos_square_catalog_mappings m
    join public.nfos_items i on i.id=m.item_id
    where m.active
  ) x;

  return v_rows;
end;
$$;

-- Allow trusted service-role imports to use the same low-level inventory ledger helper.
create or replace function nfos_private.record_inventory_movement(
  p_item_id uuid,
  p_quantity numeric,
  p_from_location_id uuid default null,
  p_to_location_id uuid default null,
  p_movement_type text default 'adjustment_add',
  p_lot_id uuid default null,
  p_reference_type text default null,
  p_reference_id text default null,
  p_unit_cost numeric default null,
  p_notes text default null,
  p_occurred_at timestamptz default now(),
  p_source text default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null and current_setting('role',true)<>'service_role' then
    raise exception 'Authentication required.';
  end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be greater than zero.'; end if;
  if p_from_location_id is null and p_to_location_id is null then
    raise exception 'A from or to location is required.';
  end if;

  insert into public.nfos_inventory_transactions(
    occurred_at,item_id,lot_id,quantity,from_location_id,to_location_id,
    movement_type,reference_type,reference_id,unit_cost,source,notes,created_by
  )
  values(
    coalesce(p_occurred_at,now()),p_item_id,p_lot_id,p_quantity,
    p_from_location_id,p_to_location_id,p_movement_type,p_reference_type,
    p_reference_id,p_unit_cost,coalesce(nullif(btrim(p_source),''),'employee'),
    p_notes,auth.uid()
  )
  returning id into v_id;

  perform nfos_private.sync_item_to_legacy_stock(p_item_id);
  return v_id;
end;
$$;

create or replace function nfos_private.record_square_market_sale_service(
  p_session_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_cents integer,
  p_gross_cents integer,
  p_payment_method text,
  p_external_order_id text,
  p_external_payment_id text,
  p_external_line_id text,
  p_sold_at timestamptz,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_session public.nfos_market_sessions%rowtype;
  v_item public.nfos_items%rowtype;
  v_sale public.nfos_market_sales%rowtype;
  v_remaining numeric;
  v_alloc numeric;
  v_lot record;
  v_tx uuid;
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Service role required.';
  end if;

  select * into v_session
  from public.nfos_market_sessions
  where id=p_session_id
  for update;

  if v_session.id is null then raise exception 'Market session not found.'; end if;
  if v_session.status not in ('open','closed','reconciled') then
    raise exception 'Market session must be open or closed before Square sales can be imported.';
  end if;

  select * into v_item
  from public.nfos_items
  where id=p_item_id and active and item_type='finished_good';

  if v_item.id is null then raise exception 'Active finished item not found.'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Sale quantity must be greater than zero.'; end if;
  if p_gross_cents is null or p_gross_cents<0 then raise exception 'Gross amount cannot be negative.'; end if;
  if nullif(btrim(p_external_line_id),'') is null then raise exception 'Square line ID is required.'; end if;

  if exists(
    select 1 from public.nfos_market_sales
    where session_id=p_session_id
      and source='square'
      and external_line_id=p_external_line_id
  ) then
    return (
      select jsonb_build_object(
        'id',id,'duplicate',true,'quantity',quantity,'gross_cents',gross_cents
      )
      from public.nfos_market_sales
      where session_id=p_session_id
        and source='square'
        and external_line_id=p_external_line_id
      limit 1
    );
  end if;

  insert into public.nfos_market_sales(
    session_id,source,external_order_id,external_payment_id,external_line_id,
    sold_at,item_id,quantity,unit_cents,gross_cents,payment_method,notes,created_by
  )
  values(
    p_session_id,'square',nullif(btrim(p_external_order_id),''),
    nullif(btrim(p_external_payment_id),''),
    btrim(p_external_line_id),
    coalesce(p_sold_at,now()),p_item_id,p_quantity,coalesce(p_unit_cents,0),
    p_gross_cents,nullif(btrim(p_payment_method),''),
    nullif(btrim(p_notes),''),null
  )
  returning * into v_sale;

  v_remaining:=p_quantity;

  for v_lot in
    select lb.lot_id,lb.on_hand,l.received_at
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
      case when p_quantity>0 then (p_gross_cents/100.0)/p_quantity else null end,
      concat_ws(' · ','Square market sale at '||v_session.venue_name,nullif(btrim(p_notes),'')),
      coalesce(p_sold_at,now()),'market_square'
    );

    insert into public.nfos_market_sale_allocations(
      sale_id,lot_id,quantity,inventory_transaction_id
    )
    values(v_sale.id,v_lot.lot_id,v_alloc,v_tx);

    perform nfos_private.refresh_lot_status(v_lot.lot_id);
    v_remaining:=v_remaining-v_alloc;
  end loop;

  if v_remaining>0 then
    raise exception 'Market inventory is short by % units for imported Square sale.',v_remaining;
  end if;

  return jsonb_build_object(
    'id',v_sale.id,'duplicate',false,'quantity',v_sale.quantity,'gross_cents',v_sale.gross_cents
  );
end;
$$;

create or replace function nfos_private.update_market_reconciliation_service(
  p_session_id uuid,
  p_square_gross_cents integer,
  p_square_transaction_count integer,
  p_unmapped_line_count integer default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_square_recorded integer:=0;
  v_manual integer:=0;
  v_total integer:=0;
  v_count integer:=0;
  v_diff integer:=0;
  v_status text;
  v_session_status text;
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Service role required.';
  end if;

  if not exists(select 1 from public.nfos_market_sessions where id=p_session_id) then
    raise exception 'Market session not found.';
  end if;

  select
    coalesce(sum(gross_cents) filter(where source='square'),0)::integer,
    coalesce(sum(gross_cents) filter(where source='manual'),0)::integer,
    coalesce(sum(gross_cents),0)::integer,
    count(*)::integer
  into v_square_recorded,v_manual,v_total,v_count
  from public.nfos_market_sales
  where session_id=p_session_id;

  v_diff:=coalesce(p_square_gross_cents,0)-v_square_recorded;
  v_status:=case
    when v_diff=0 and coalesce(p_unmapped_line_count,0)=0 then 'matched'
    else 'review_required'
  end;

  insert into public.nfos_market_reconciliations(
    session_id,square_gross_cents,square_transaction_count,
    recorded_gross_cents,recorded_square_gross_cents,manual_gross_cents,
    total_recorded_gross_cents,recorded_sale_count,difference_cents,
    unmapped_line_count,status,synced_at,notes,updated_by
  )
  values(
    p_session_id,coalesce(p_square_gross_cents,0),coalesce(p_square_transaction_count,0),
    v_total,v_square_recorded,v_manual,v_total,v_count,v_diff,
    coalesce(p_unmapped_line_count,0),v_status,now(),nullif(btrim(p_notes),''),null
  )
  on conflict(session_id) do update
  set square_gross_cents=excluded.square_gross_cents,
      square_transaction_count=excluded.square_transaction_count,
      recorded_gross_cents=excluded.recorded_gross_cents,
      recorded_square_gross_cents=excluded.recorded_square_gross_cents,
      manual_gross_cents=excluded.manual_gross_cents,
      total_recorded_gross_cents=excluded.total_recorded_gross_cents,
      recorded_sale_count=excluded.recorded_sale_count,
      difference_cents=excluded.difference_cents,
      unmapped_line_count=excluded.unmapped_line_count,
      status=excluded.status,
      synced_at=excluded.synced_at,
      notes=excluded.notes,
      updated_by=null,
      updated_at=now();

  select status into v_session_status
  from public.nfos_market_sessions
  where id=p_session_id;

  if v_session_status='closed' and v_status='matched' then
    update public.nfos_market_sessions
    set status='reconciled',reconciled_at=now(),reconciled_by=null
    where id=p_session_id;
  elsif v_session_status='reconciled' and v_status<>'matched' then
    update public.nfos_market_sessions
    set status='closed',reconciled_at=null,reconciled_by=null
    where id=p_session_id;
  end if;

  return jsonb_build_object(
    'session_id',p_session_id,
    'status',v_status,
    'square_gross_cents',coalesce(p_square_gross_cents,0),
    'recorded_square_gross_cents',v_square_recorded,
    'manual_gross_cents',v_manual,
    'total_recorded_gross_cents',v_total,
    'difference_cents',v_diff,
    'unmapped_line_count',coalesce(p_unmapped_line_count,0)
  );
end;
$$;

create or replace function public.nfos_market_set_square_location(uuid,text)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.set_market_square_location($1,$2); $$;

create or replace function public.nfos_market_map_square_variation(uuid,text,text default null,text default null,text default null)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.map_square_catalog_variation($1,$2,$3,$4,$5); $$;

create or replace function public.nfos_market_get_square_mappings()
returns jsonb
language sql
stable
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.get_square_catalog_mappings(); $$;

create or replace function public.nfos_market_record_square_sale_service(
  uuid,uuid,numeric,integer,integer,text,text,text,text,timestamptz,text default null
)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.record_square_market_sale_service($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11); $$;

create or replace function public.nfos_market_update_reconciliation_service(
  uuid,integer,integer,integer default 0,text default null
)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.update_market_reconciliation_service($1,$2,$3,$4,$5); $$;

revoke all on function public.nfos_market_set_square_location(uuid,text) from public,anon;
revoke all on function public.nfos_market_map_square_variation(uuid,text,text,text,text) from public,anon;
revoke all on function public.nfos_market_get_square_mappings() from public,anon;
revoke all on function public.nfos_market_record_square_sale_service(uuid,uuid,numeric,integer,integer,text,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.nfos_market_update_reconciliation_service(uuid,integer,integer,integer,text) from public,anon,authenticated;

grant execute on function public.nfos_market_set_square_location(uuid,text) to authenticated;
grant execute on function public.nfos_market_map_square_variation(uuid,text,text,text,text) to authenticated;
grant execute on function public.nfos_market_get_square_mappings() to authenticated;
grant execute on function public.nfos_market_record_square_sale_service(uuid,uuid,numeric,integer,integer,text,text,text,text,timestamptz,text) to service_role;
grant execute on function public.nfos_market_update_reconciliation_service(uuid,integer,integer,integer,text) to service_role;

grant execute on function nfos_private.set_market_square_location(uuid,text) to authenticated;
grant execute on function nfos_private.map_square_catalog_variation(uuid,text,text,text,text) to authenticated;
grant execute on function nfos_private.get_square_catalog_mappings() to authenticated;
grant execute on function nfos_private.record_square_market_sale_service(uuid,uuid,numeric,integer,integer,text,text,text,text,timestamptz,text) to service_role;
grant execute on function nfos_private.update_market_reconciliation_service(uuid,integer,integer,integer,text) to service_role;
