-- Canonical Product Master + Market Management reconciliation.
drop function if exists public.nfos_update_product_master(uuid,text,text,text,text,text,uuid,text,jsonb);
drop function if exists public.nfos_get_product_availability();
drop function if exists public.nfos_get_products_workspace();
drop function if exists nfos_private.update_product_master(uuid,text,text,text,text,text,uuid,text,jsonb);
drop function if exists nfos_private.product_availability_workspace();
drop function if exists nfos_private.products_workspace();
drop table if exists public.nfos_products;

alter table public.nfos_product_profiles
  add column if not exists primary_recipe_id uuid references public.nfos_recipes(id) on delete set null;

alter table public.retail_locations
  add column if not exists partner_account_id uuid references public.partner_accounts(id) on delete set null;

create unique index if not exists retail_locations_partner_account_uidx
  on public.retail_locations(partner_account_id)
  where partner_account_id is not null;

grant select,insert,update,delete on table public.nfos_product_profiles to authenticated;
grant select,insert,update,delete on table public.nfos_retail_item_availability to authenticated;

drop policy if exists "NFOS team view product profiles" on public.nfos_product_profiles;
create policy "NFOS team view product profiles"
on public.nfos_product_profiles
for select
to authenticated
using (public.nf_is_admin() or public.nfos_has_permission('products.view'));

drop policy if exists "NFOS manage product profiles" on public.nfos_product_profiles;
create policy "NFOS manage product profiles"
on public.nfos_product_profiles
for all
to authenticated
using (public.nf_is_admin() or public.nfos_has_permission('products.manage'))
with check (public.nf_is_admin() or public.nfos_has_permission('products.manage'));

drop policy if exists "NFOS team view retail availability" on public.nfos_retail_item_availability;
create policy "NFOS team view retail availability"
on public.nfos_retail_item_availability
for select
to authenticated
using (public.nf_is_admin() or public.nfos_has_permission('products.view'));

drop policy if exists "NFOS manage retail availability" on public.nfos_retail_item_availability;
create policy "NFOS manage retail availability"
on public.nfos_retail_item_availability
for all
to authenticated
using (public.nf_is_admin() or public.nfos_has_permission('products.manage'))
with check (public.nf_is_admin() or public.nfos_has_permission('products.manage'));

update public.nfos_product_profiles pp
set primary_recipe_id = (
      select nr.id
      from public.nfos_recipes nr
      where nr.legacy_flavor_id=pp.flavor_id
      order by (nr.status='active') desc,nr.version desc,nr.created_at desc
      limit 1
    ),
    updated_at=now()
where pp.primary_recipe_id is null;

create or replace function nfos_private.products_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_products jsonb;
begin
  if not public.nf_is_admin() then
    perform nfos_private.current_member_id('products.view');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  into v_products
  from (
    select
      pp.flavor_id,
      f.name as display_name,
      f.hex,
      f.image_url,
      f.active as catalog_active,
      pp.product_status,
      pp.category,
      pp.product_tier,
      pp.seasonality,
      pp.season_start_month,
      pp.season_end_month,
      pp.short_description,
      pp.internal_notes,
      pp.primary_recipe_id,
      r.recipe_key,
      r.name as recipe_name,
      r.version as recipe_version,
      r.status as recipe_status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',nr.id,'recipe_key',nr.recipe_key,'name',nr.name,
          'version',nr.version,'status',nr.status,'category',nr.category
        ) order by (nr.status='active') desc,nr.version desc,nr.created_at desc)
        from public.nfos_recipes nr
        where nr.legacy_flavor_id=pp.flavor_id
      ),'[]'::jsonb) as recipes,
      coalesce((
        select sum(coalesce(inv.company_on_hand,0))
        from public.nfos_items i
        left join public.nfos_inventory_summary inv on inv.item_id=i.id
        where i.item_type='finished_good' and i.legacy_flavor_id=pp.flavor_id
      ),0) as company_on_hand,
      coalesce((
        select sum(ms.quantity)
        from public.nfos_market_sales ms
        join public.nfos_items i on i.id=ms.item_id
        where i.legacy_flavor_id=pp.flavor_id and ms.sold_at>=now()-interval '30 days'
      ),0) as units_sold_30d,
      coalesce((
        select sum(ms.gross_cents)
        from public.nfos_market_sales ms
        join public.nfos_items i on i.id=ms.item_id
        where i.legacy_flavor_id=pp.flavor_id and ms.sold_at>=now()-interval '30 days'
      ),0) as revenue_30d_cents,
      coalesce((
        select sum(ms.quantity)
        from public.nfos_market_sales ms
        join public.nfos_items i on i.id=ms.item_id
        where i.legacy_flavor_id=pp.flavor_id
      ),0) as units_sold_all_time,
      coalesce((
        select sum(ms.gross_cents)
        from public.nfos_market_sales ms
        join public.nfos_items i on i.id=ms.item_id
        where i.legacy_flavor_id=pp.flavor_id
      ),0) as revenue_all_time_cents,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_id',i.id,
          'sku',i.sku,
          'name',i.name,
          'size_id',i.legacy_size_id,
          'size_label',i.size_label,
          'texture',i.legacy_texture,
          'retail_price_cents',i.retail_price_cents,
          'active',i.active,
          'reorder_point',i.reorder_point,
          'target_stock',i.target_stock,
          'max_stock',i.max_stock,
          'barcode_value',i.barcode_value,
          'company_on_hand',coalesce(inv.company_on_hand,0),
          'planning_on_hand',coalesce(inv.planning_on_hand,0)
        ) order by
          case i.legacy_size_id when '4oz' then 1 when '7oz' then 2 when '1lb' then 3 else 9 end,
          i.legacy_texture)
        from public.nfos_items i
        left join public.nfos_inventory_summary inv on inv.item_id=i.id
        where i.item_type='finished_good' and i.legacy_flavor_id=pp.flavor_id
      ),'[]'::jsonb) as variants
    from public.nfos_product_profiles pp
    join public.flavors f on f.id=pp.flavor_id
    left join public.nfos_recipes r on r.id=pp.primary_recipe_id
  ) x;

  return jsonb_build_object('generated_at',now(),'products',v_products);
end;
$function$;

create or replace function nfos_private.product_availability_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_products jsonb;
begin
  if not public.nf_is_admin() then
    perform nfos_private.current_member_id('products.view');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]'::jsonb)
  into v_products
  from (
    select
      pp.flavor_id,
      f.name as display_name,
      pp.product_status,
      pp.category,
      pp.product_tier,
      pp.seasonality,
      coalesce((
        select sum(coalesce(inv.company_on_hand,0))
        from public.nfos_items i
        left join public.nfos_inventory_summary inv on inv.item_id=i.id
        where i.item_type='finished_good' and i.legacy_flavor_id=pp.flavor_id
      ),0) as company_on_hand,
      coalesce((
        select jsonb_agg(to_jsonb(c) order by c.location_name)
        from (
          select l.id as location_id,l.name as location_name,l.location_type,sum(lb.on_hand) as on_hand
          from public.nfos_lot_balances lb
          join public.nfos_items i on i.id=lb.item_id
          join public.nfos_locations l on l.id=lb.location_id
          where i.item_type='finished_good'
            and i.legacy_flavor_id=pp.flavor_id
            and lb.on_hand>0
            and l.active
            and l.counts_as_company_inventory
          group by l.id,l.name,l.location_type
        ) c
      ),'[]'::jsonb) as company_locations,
      coalesce((
        select sum(msi.on_hand)
        from public.nfos_market_session_inventory msi
        join public.nfos_items i on i.id=msi.item_id
        join public.nfos_market_sessions s on s.id=msi.session_id
        where i.legacy_flavor_id=pp.flavor_id
          and msi.on_hand>0
          and s.status in ('loaded','open')
      ),0) as market_on_hand,
      coalesce((
        select jsonb_agg(to_jsonb(m) order by m.market_day,m.venue_name)
        from (
          select msi.session_id,msi.venue_name,msi.market_day,sum(msi.on_hand) as on_hand
          from public.nfos_market_session_inventory msi
          join public.nfos_items i on i.id=msi.item_id
          join public.nfos_market_sessions s on s.id=msi.session_id
          where i.legacy_flavor_id=pp.flavor_id
            and msi.on_hand>0
            and s.status in ('loaded','open')
          group by msi.session_id,msi.venue_name,msi.market_day
        ) m
      ),'[]'::jsonb) as markets,
      coalesce((
        select jsonb_agg(to_jsonb(q) order by q.location_name)
        from (
          select
            rl.id as retail_location_id,
            rl.name as location_name,
            rl.address_line_1,
            rl.address_line_2,
            rl.city,
            rl.state,
            rl.zip,
            max(a.last_confirmed_at) as last_confirmed_at,
            case
              when bool_or(a.availability_status='in_stock') then 'in_stock'
              when bool_or(a.availability_status='low') then 'low'
              when bool_and(a.availability_status='out_of_stock') then 'out_of_stock'
              else 'unknown'
            end as availability_status,
            case
              when count(*) filter (where a.quantity_on_hand is null)>0 then null
              else sum(a.quantity_on_hand)
            end as quantity_on_hand,
            array_agg(distinct a.source) as sources
          from public.nfos_retail_item_availability a
          join public.retail_locations rl on rl.id=a.retail_location_id and rl.active
          join public.nfos_items i on i.id=a.item_id
          where i.item_type='finished_good' and i.legacy_flavor_id=pp.flavor_id
          group by rl.id,rl.name,rl.address_line_1,rl.address_line_2,rl.city,rl.state,rl.zip
        ) q
      ),'[]'::jsonb) as retail_locations
    from public.nfos_product_profiles pp
    join public.flavors f on f.id=pp.flavor_id
    where pp.product_status<>'retired'
  ) x;

  return jsonb_build_object('generated_at',now(),'products',v_products);
end;
$function$;

create or replace function nfos_private.update_product_master(
  p_flavor_id uuid,
  p_product_status text,
  p_category text,
  p_product_tier text,
  p_seasonality text,
  p_season_start_month integer,
  p_season_end_month integer,
  p_primary_recipe_id uuid,
  p_short_description text,
  p_internal_notes text,
  p_variants jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_variant jsonb; v_item_id uuid;
begin
  if not public.nf_is_admin() and not public.nfos_has_permission('products.manage') then
    raise exception 'Product management access required.';
  end if;
  if p_product_status not in ('active','seasonal','limited','development','retired') then
    raise exception 'Invalid product status.';
  end if;
  if p_seasonality not in ('year_round','seasonal','limited','custom') then
    raise exception 'Invalid seasonality.';
  end if;
  if p_primary_recipe_id is not null and not exists(
    select 1 from public.nfos_recipes where id=p_primary_recipe_id and legacy_flavor_id=p_flavor_id
  ) then
    raise exception 'Primary recipe must belong to this flavor.';
  end if;
  if jsonb_typeof(coalesce(p_variants,'[]'::jsonb))<>'array' then
    raise exception 'Variants must be a JSON array.';
  end if;

  insert into public.nfos_product_profiles(
    flavor_id,product_status,category,product_tier,seasonality,
    season_start_month,season_end_month,primary_recipe_id,
    short_description,internal_notes,updated_at
  ) values(
    p_flavor_id,p_product_status,nullif(btrim(p_category),''),
    nullif(btrim(p_product_tier),''),p_seasonality,
    p_season_start_month,p_season_end_month,p_primary_recipe_id,
    nullif(btrim(p_short_description),''),nullif(btrim(p_internal_notes),''),now()
  )
  on conflict(flavor_id) do update
  set product_status=excluded.product_status,
      category=excluded.category,
      product_tier=excluded.product_tier,
      seasonality=excluded.seasonality,
      season_start_month=excluded.season_start_month,
      season_end_month=excluded.season_end_month,
      primary_recipe_id=excluded.primary_recipe_id,
      short_description=excluded.short_description,
      internal_notes=excluded.internal_notes,
      updated_at=now();

  update public.flavors
  set active=(p_product_status in ('active','seasonal','limited'))
  where id=p_flavor_id;

  for v_variant in select value from jsonb_array_elements(coalesce(p_variants,'[]'::jsonb)) loop
    v_item_id=(v_variant->>'item_id')::uuid;
    update public.nfos_items
    set retail_price_cents=case when v_variant ? 'retail_price_cents' then nullif(v_variant->>'retail_price_cents','')::integer else retail_price_cents end,
        reorder_point=case when v_variant ? 'reorder_point' then nullif(v_variant->>'reorder_point','')::numeric else reorder_point end,
        target_stock=case when v_variant ? 'target_stock' then nullif(v_variant->>'target_stock','')::numeric else target_stock end,
        max_stock=case when v_variant ? 'max_stock' then nullif(v_variant->>'max_stock','')::numeric else max_stock end,
        active=case when v_variant ? 'active' then coalesce((v_variant->>'active')::boolean,active) else active end,
        updated_at=now()
    where id=v_item_id and item_type='finished_good' and legacy_flavor_id=p_flavor_id;
  end loop;

  return jsonb_build_object('ok',true,'flavor_id',p_flavor_id);
end;
$function$;

create or replace function public.nfos_get_products_workspace()
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.products_workspace(); $function$;

create or replace function public.nfos_get_product_availability()
returns jsonb language sql security invoker set search_path=''
as $function$ select nfos_private.product_availability_workspace(); $function$;

create or replace function public.nfos_update_product_master(
  p_flavor_id uuid,
  p_product_status text,
  p_category text default null,
  p_product_tier text default null,
  p_seasonality text default 'year_round',
  p_season_start_month integer default null,
  p_season_end_month integer default null,
  p_primary_recipe_id uuid default null,
  p_short_description text default null,
  p_internal_notes text default null,
  p_variants jsonb default '[]'::jsonb
)
returns jsonb language sql security invoker set search_path=''
as $function$
  select nfos_private.update_product_master(
    p_flavor_id,p_product_status,p_category,p_product_tier,p_seasonality,
    p_season_start_month,p_season_end_month,p_primary_recipe_id,
    p_short_description,p_internal_notes,p_variants
  );
$function$;

revoke all on function public.nfos_get_products_workspace() from public;
revoke all on function public.nfos_get_product_availability() from public;
revoke all on function public.nfos_update_product_master(uuid,text,text,text,text,integer,integer,uuid,text,text,jsonb) from public;
grant execute on function public.nfos_get_products_workspace() to authenticated;
grant execute on function public.nfos_get_product_availability() to authenticated;
grant execute on function public.nfos_update_product_master(uuid,text,text,text,text,integer,integer,uuid,text,text,jsonb) to authenticated;

-- Reject scanned orders that exceed the assigned market's actual available inventory.
create or replace function nfos_private.replace_market_order_log_lines(p_order_id uuid,p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_line record;
  v_item_id uuid;
  v_unit_cents integer;
  v_session_id uuid;
  v_count integer := 0;
  v_units numeric := 0;
  v_total bigint := 0;
  v_bad record;
begin
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then
    raise exception 'Order lines must be an array.';
  end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception 'Scan at least one item before logging the order.';
  end if;

  select market_session_id into v_session_id
  from public.nfos_market_order_logs
  where id=p_order_id;

  if v_session_id is null then raise exception 'Market order session not found.'; end if;

  delete from public.nfos_market_order_log_items where order_id=p_order_id;

  for v_line in
    select * from jsonb_to_recordset(p_lines) as x(item_id uuid,quantity numeric)
  loop
    if v_line.item_id is null or v_line.quantity is null or v_line.quantity<=0 then
      raise exception 'Every scanned item needs a quantity greater than zero.';
    end if;
    if v_line.quantity<>trunc(v_line.quantity) then
      raise exception 'Market orders must use whole-item quantities.';
    end if;

    select i.id,coalesce(i.retail_price_cents,s.price_cents)
    into v_item_id,v_unit_cents
    from public.nfos_items i
    join public.flavors f on f.id=i.legacy_flavor_id and f.active
    left join public.sizes s on s.id=i.legacy_size_id
    where i.id=v_line.item_id and i.active and i.item_type='finished_good';

    if v_item_id is null then
      raise exception 'A scanned item is not an active sellable finished product.';
    end if;
    if v_unit_cents is null then
      raise exception 'Selling price is missing for one of the scanned items.';
    end if;

    insert into public.nfos_market_order_log_items(order_id,item_id,quantity,unit_cents)
    values(p_order_id,v_item_id,v_line.quantity,v_unit_cents)
    on conflict(order_id,item_id) do update
    set quantity=public.nfos_market_order_log_items.quantity + excluded.quantity,
        unit_cents=excluded.unit_cents,
        updated_at=now();

    v_count:=v_count+1;
    v_units:=v_units+v_line.quantity;
    v_total:=v_total+round(v_line.quantity*v_unit_cents)::bigint;
  end loop;

  select li.item_id,li.quantity,coalesce(msi.on_hand,0) as available,i.name
  into v_bad
  from public.nfos_market_order_log_items li
  join public.nfos_items i on i.id=li.item_id
  left join public.nfos_market_session_inventory msi
    on msi.session_id=v_session_id and msi.item_id=li.item_id
  where li.order_id=p_order_id
    and li.quantity>coalesce(msi.on_hand,0)
  order by i.name
  limit 1;

  if found then
    raise exception '% only has % available at this market; the order requests %.',
      v_bad.name,v_bad.available,v_bad.quantity;
  end if;

  return jsonb_build_object('line_count',v_count,'units',v_units,'estimated_total_cents',v_total);
end;
$function$;

-- Link an external retail-location record to a partner once, then update last-known availability from fulfillment.
create or replace function nfos_private.sync_retail_availability_from_partner_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.partner_store_orders%rowtype;
  v_location uuid;
  v_line record;
  v_item uuid;
begin
  select * into v_order from public.partner_store_orders where id=p_order_id;
  if v_order.id is null or v_order.fulfilled_at is null then return; end if;

  select id into v_location
  from public.retail_locations
  where partner_account_id=v_order.partner_id and active
  limit 1;
  if v_location is null then return; end if;

  for v_line in
    select * from public.partner_store_order_items
    where order_id=v_order.id and flavor_id is not null
  loop
    select i.id into v_item
    from public.nfos_items i
    where i.item_type='finished_good'
      and i.legacy_flavor_id=v_line.flavor_id
      and (v_line.size_id is null or i.legacy_size_id=v_line.size_id)
      and (v_line.texture is null or i.legacy_texture=v_line.texture)
    order by i.active desc
    limit 1;

    if v_item is null then continue; end if;

    insert into public.nfos_retail_item_availability(
      retail_location_id,item_id,availability_status,quantity_on_hand,
      source,source_reference,last_confirmed_at,notes,updated_at
    ) values(
      v_location,v_item,'in_stock',null,
      'partner_fulfillment',v_order.order_no,v_order.fulfilled_at,
      'Last-known availability based on fulfilled partner order. Shelf quantity is not independently confirmed.',
      now()
    )
    on conflict(retail_location_id,item_id) do update
    set availability_status='in_stock',
        quantity_on_hand=null,
        source='partner_fulfillment',
        source_reference=excluded.source_reference,
        last_confirmed_at=excluded.last_confirmed_at,
        notes=excluded.notes,
        updated_at=now();
  end loop;
end;
$function$;

create or replace function public.nfos_sync_retail_availability_from_partner_fulfillment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.fulfilled_at is not null
     and (old.fulfilled_at is null or old.fulfilled_at is distinct from new.fulfilled_at) then
    perform nfos_private.sync_retail_availability_from_partner_order(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function public.nfos_sync_retail_availability_from_partner_fulfillment() from public,anon,authenticated;

drop trigger if exists nfos_sync_retail_availability_after_fulfillment on public.partner_store_orders;
create trigger nfos_sync_retail_availability_after_fulfillment
after update of fulfilled_at on public.partner_store_orders
for each row execute function public.nfos_sync_retail_availability_from_partner_fulfillment();
