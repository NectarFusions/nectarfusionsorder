-- NectarFusions universal partner commerce engine
-- Programs -> Packages -> Paid Orders -> Fulfillment -> Reorder / Renewal

create table if not exists public.partner_programs (
  program_key text primary key,
  label text not null,
  internal_label text not null,
  description text,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_programs_key_check check (
    program_key = any (array['retail','foodservice','business_gifting','hive_partners']::text[])
  )
);

insert into public.partner_programs (program_key,label,internal_label,description,active,sort)
values
  ('retail','Retail','Retail','Sell packaged NectarFusions jars directly to customers.',true,10),
  ('foodservice','Foodservice','Foodservice','Use NectarFusions in cafés, restaurants, bakeries, hospitality, beverages, or production.',true,20),
  ('business_gifting','Business Gifting','Corporate','Client, employee, event, wedding, and hospitality gifting.',true,30),
  ('hive_partners','Hive Partners','Sponsorship','Annual colony and apiary sponsorship programs.',true,40)
on conflict (program_key) do update set
  label=excluded.label,
  internal_label=excluded.internal_label,
  description=excluded.description,
  active=excluded.active,
  sort=excluded.sort,
  updated_at=now();

alter table public.partner_programs enable row level security;

drop policy if exists "Authenticated users view active partner programs" on public.partner_programs;
create policy "Authenticated users view active partner programs"
on public.partner_programs for select to authenticated
using (active = true or public.nf_is_admin());

drop policy if exists "Admins manage partner programs" on public.partner_programs;
create policy "Admins manage partner programs"
on public.partner_programs for all to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

create table if not exists public.partner_account_programs (
  partner_id uuid not null references public.partner_accounts(id) on delete cascade,
  program_key text not null references public.partner_programs(program_key),
  status text not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (partner_id, program_key),
  constraint partner_account_programs_status_check check (
    status = any (array['pending','approved','declined','suspended']::text[])
  )
);

create index if not exists partner_account_programs_status_idx
  on public.partner_account_programs (status, program_key, partner_id);

alter table public.partner_account_programs enable row level security;

drop policy if exists "Partners view their program access" on public.partner_account_programs;
create policy "Partners view their program access"
on public.partner_account_programs for select to authenticated
using (partner_id = public.nf_partner_id_for_user());

drop policy if exists "Admins manage partner program access" on public.partner_account_programs;
create policy "Admins manage partner program access"
on public.partner_account_programs for all to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Preserve existing access while moving away from one permanent partner_type.
insert into public.partner_account_programs (partner_id,program_key,status,approved_at)
select id,'retail','approved',now()
from public.partner_accounts
where partner_type in ('retail','both')
on conflict (partner_id,program_key) do nothing;

insert into public.partner_account_programs (partner_id,program_key,status,approved_at)
select id,'foodservice','approved',now()
from public.partner_accounts
where partner_type in ('wholesale','both')
on conflict (partner_id,program_key) do nothing;

-- Gifts were previously available to every approved portal type, so keep that access.
insert into public.partner_account_programs (partner_id,program_key,status,approved_at)
select id,'business_gifting','approved',now()
from public.partner_accounts
where partner_type is not null
on conflict (partner_id,program_key) do nothing;

-- Identity lookup for the unified store must no longer depend on the legacy
-- retail/wholesale partner_type. Program access is authorized independently.
create or replace function public.my_partner_store_account()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id
  from public.partner_users pu
  join public.partner_accounts pa on pa.id=pu.partner_id
  where pu.user_id=auth.uid()
    and pu.active=true
    and pa.auth_access_enabled=true
    and pa.relationship_status = any(array[
      'approved','onboarding','active_opening','active_ongoing','optimize'
    ]::text[])
  limit 1
$$;

revoke all on function public.my_partner_store_account() from public,anon,authenticated;
grant execute on function public.my_partner_store_account() to authenticated;

create table if not exists public.partner_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null unique,
  program_key text not null references public.partner_programs(program_key),
  name text not null,
  description text,
  image_url text,
  active boolean not null default false,
  package_type text not null default 'starter',
  price_mode text not null default 'catalog',
  base_price_cents integer,
  minimum_quantity integer,
  default_quantity integer,
  quantity_increment integer,
  flavor_selection_count integer,
  allowed_flavor_names text[] not null default '{}',
  allowed_size_ids text[] not null default '{}',
  allowed_textures text[] not null default '{}',
  customization_options jsonb not null default '{}'::jsonb,
  pickup_allowed boolean not null default true,
  delivery_allowed boolean not null default true,
  recurring_allowed boolean not null default false,
  default_reorder_interval_days integer,
  configuration_schema jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_packages_type_check check (
    package_type = any (array['starter','replenishment','recurring','sponsorship']::text[])
  ),
  constraint partner_packages_price_check check (base_price_cents is null or base_price_cents >= 0),
  constraint partner_packages_qty_check check (
    (minimum_quantity is null or minimum_quantity >= 0)
    and (default_quantity is null or default_quantity >= 0)
    and (quantity_increment is null or quantity_increment > 0)
    and (flavor_selection_count is null or flavor_selection_count >= 0)
    and (default_reorder_interval_days is null or default_reorder_interval_days > 0)
  )
);

create index if not exists partner_packages_program_sort_idx
  on public.partner_packages (program_key, active, sort, name);

alter table public.partner_packages enable row level security;

drop policy if exists "Partners view approved active packages" on public.partner_packages;
create policy "Partners view approved active packages"
on public.partner_packages for select to authenticated
using (
  active = true
  and exists (
    select 1
    from public.partner_account_programs pap
    where pap.partner_id = public.nf_partner_id_for_user()
      and pap.program_key = partner_packages.program_key
      and pap.status = 'approved'
  )
);

drop policy if exists "Admins manage partner packages" on public.partner_packages;
create policy "Admins manage partner packages"
on public.partner_packages for all to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

create table if not exists public.partner_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.partner_packages(id) on delete cascade,
  product_key text not null,
  category text not null,
  quantity integer,
  flavor_id uuid references public.flavors(id) on delete set null,
  flavor_name text,
  size_id text,
  texture text,
  unit_price_cents integer,
  rules jsonb not null default '{}'::jsonb,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_package_items_quantity_check check (quantity is null or quantity > 0),
  constraint partner_package_items_price_check check (unit_price_cents is null or unit_price_cents >= 0)
);

create index if not exists partner_package_items_package_sort_idx
  on public.partner_package_items (package_id, sort, created_at);

alter table public.partner_package_items enable row level security;

drop policy if exists "Partners view items for approved active packages" on public.partner_package_items;
create policy "Partners view items for approved active packages"
on public.partner_package_items for select to authenticated
using (
  exists (
    select 1
    from public.partner_packages pp
    join public.partner_account_programs pap
      on pap.program_key = pp.program_key
    where pp.id = partner_package_items.package_id
      and pp.active = true
      and pap.partner_id = public.nf_partner_id_for_user()
      and pap.status = 'approved'
  )
);

drop policy if exists "Admins manage partner package items" on public.partner_package_items;
create policy "Admins manage partner package items"
on public.partner_package_items for all to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Retail packages are live immediately. Their prices continue to come from the
-- current partner retail catalog, so package cards never hardcode dollar amounts.
insert into public.partner_packages (
  package_key,program_key,name,description,active,package_type,price_mode,
  minimum_quantity,default_quantity,quantity_increment,flavor_selection_count,
  allowed_flavor_names,allowed_size_ids,allowed_textures,pickup_allowed,
  delivery_allowed,recurring_allowed,default_reorder_interval_days,
  configuration_schema,sort
)
values
  (
    'retail-starter-shelf','retail','Starter Shelf',
    '12 jars. Choose 2 core flavors, 6 jars each, then choose one approved jar size.',
    true,'starter','catalog',12,12,6,2,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['4oz','7oz','1lb'],array['regular','spun'],true,true,false,21,
    '{"builder":"retail_shelf","flavor_selection_count":2,"quantity_per_flavor":6,"size_mode":"single","fixed_flavors":[]}'::jsonb,
    10
  ),
  (
    'retail-core-shelf','retail','Core Shelf',
    '18 jars. Choose 3 core flavors, 6 jars each, then choose one approved jar size.',
    true,'starter','catalog',18,18,6,3,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['4oz','7oz','1lb'],array['regular','spun'],true,true,false,30,
    '{"builder":"retail_shelf","flavor_selection_count":3,"quantity_per_flavor":6,"size_mode":"single","fixed_flavors":[]}'::jsonb,
    20
  ),
  (
    'retail-full-shelf','retail','Full NectarFusions Shelf',
    '30 jars. The complete five-flavor core collection with 6 jars of each flavor.',
    true,'starter','catalog',30,30,6,5,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['4oz','7oz','1lb'],array['regular','spun'],true,true,false,30,
    '{"builder":"retail_shelf","flavor_selection_count":5,"quantity_per_flavor":6,"size_mode":"single","fixed_flavors":["Original","Cinnamon","Lemon","Madagascar Vanilla","Chipotle"]}'::jsonb,
    30
  ),
  (
    'gifting-client-20','business_gifting','Client Gift 20',
    '20 ready-to-gift NectarFusions products with controlled container, flavor, label, and finishing options.',
    true,'starter','catalog',20,20,1,1,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['2oz'],array[]::text[],true,true,true,null,
    '{"builder":"business_gifting","gift_quantity":20,"flavor_selection_count":1}'::jsonb,
    10
  ),
  (
    'gifting-business-50','business_gifting','Business Gift 50',
    '50 ready-to-gift NectarFusions products for clients, employees, events, or hospitality.',
    true,'starter','catalog',50,50,1,1,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['2oz'],array[]::text[],true,true,true,null,
    '{"builder":"business_gifting","gift_quantity":50,"flavor_selection_count":1}'::jsonb,
    20
  ),
  (
    'gifting-event-100','business_gifting','Event Gift 100',
    '100 ready-to-gift NectarFusions products with optional branding and finishing add-ons.',
    true,'starter','catalog',100,100,1,1,
    array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle'],
    array['2oz'],array[]::text[],true,true,true,null,
    '{"builder":"business_gifting","gift_quantity":100,"flavor_selection_count":1}'::jsonb,
    30
  ),
  (
    'foodservice-cafe-starter','foodservice','Café Starter',
    'Preset café package. Activate after the exact container quantities are finalized.',
    false,'starter','catalog',null,null,1,3,array[]::text[],array['half_gallon'],array[]::text[],true,true,true,null,
    '{"builder":"foodservice","status":"needs_configuration"}'::jsonb,10
  ),
  (
    'foodservice-kitchen-pack','foodservice','Kitchen Pack',
    'Preset kitchen package. Activate after exact quantities and flavor rules are finalized.',
    false,'starter','catalog',null,null,1,2,array[]::text[],array['half_gallon','one_gallon'],array[]::text[],true,true,true,null,
    '{"builder":"foodservice","status":"needs_configuration"}'::jsonb,20
  ),
  (
    'foodservice-high-volume','foodservice','High Volume',
    'Large-format foodservice package using gallon and five-gallon formats.',
    false,'replenishment','catalog',null,null,1,1,array[]::text[],array['one_gallon','five_gallon'],array[]::text[],true,true,true,null,
    '{"builder":"foodservice","status":"needs_configuration"}'::jsonb,30
  ),
  (
    'hive-colony-partner','hive_partners','Colony Partner',
    'Annual one-colony sponsorship package. Activate after price and benefits are finalized.',
    false,'sponsorship','fixed',1,1,1,0,array[]::text[],array[]::text[],array[]::text[],true,true,true,365,
    '{"builder":"hive_sponsorship","status":"needs_configuration"}'::jsonb,10
  ),
  (
    'hive-apiary-partner','hive_partners','Apiary Partner',
    'Annual multi-colony sponsorship package. Activate after price and benefits are finalized.',
    false,'sponsorship','fixed',1,1,1,0,array[]::text[],array[]::text[],array[]::text[],true,true,true,365,
    '{"builder":"hive_sponsorship","status":"needs_configuration"}'::jsonb,20
  ),
  (
    'hive-community-partner','hive_partners','Community Partner',
    'Annual organizational sponsorship package. Activate after price and benefits are finalized.',
    false,'sponsorship','fixed',1,1,1,0,array[]::text[],array[]::text[],array[]::text[],true,true,true,365,
    '{"builder":"hive_sponsorship","status":"needs_configuration"}'::jsonb,30
  )
on conflict (package_key) do update set
  program_key=excluded.program_key,
  name=excluded.name,
  description=excluded.description,
  package_type=excluded.package_type,
  price_mode=excluded.price_mode,
  minimum_quantity=excluded.minimum_quantity,
  default_quantity=excluded.default_quantity,
  quantity_increment=excluded.quantity_increment,
  flavor_selection_count=excluded.flavor_selection_count,
  allowed_flavor_names=excluded.allowed_flavor_names,
  allowed_size_ids=excluded.allowed_size_ids,
  allowed_textures=excluded.allowed_textures,
  pickup_allowed=excluded.pickup_allowed,
  delivery_allowed=excluded.delivery_allowed,
  recurring_allowed=excluded.recurring_allowed,
  default_reorder_interval_days=excluded.default_reorder_interval_days,
  configuration_schema=excluded.configuration_schema,
  sort=excluded.sort,
  updated_at=now();

-- Fixed Full Shelf flavor lines make the package definition explicit while
-- still letting the buyer choose the common jar size at configuration time.
insert into public.partner_package_items (package_id,product_key,category,quantity,flavor_id,flavor_name,rules,sort)
select pp.id,'retail-jar','retail',6,f.id,f.name,'{"size":"package_selection","texture":"package_selection"}'::jsonb,
       case f.name when 'Original' then 10 when 'Cinnamon' then 20 when 'Lemon' then 30 when 'Madagascar Vanilla' then 40 else 50 end
from public.partner_packages pp
join public.flavors f on f.name = any(array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle']::text[])
where pp.package_key='retail-full-shelf'
  and not exists (
    select 1 from public.partner_package_items ppi
    where ppi.package_id=pp.id and ppi.flavor_id=f.id and ppi.product_key='retail-jar'
  );

-- Extend the already-paid partner order engine instead of creating another order table.
alter table public.partner_store_orders
  add column if not exists program_key text references public.partner_programs(program_key),
  add column if not exists package_id uuid references public.partner_packages(id) on delete set null,
  add column if not exists package_snapshot jsonb,
  add column if not exists configuration_snapshot jsonb,
  add column if not exists reorder_of_order_id uuid references public.partner_store_orders(id) on delete set null,
  add column if not exists queued_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reorder_due_on date;

create index if not exists partner_store_orders_program_idx
  on public.partner_store_orders (partner_id, program_key, created_at desc);
create index if not exists partner_store_orders_reorder_due_idx
  on public.partner_store_orders (reorder_due_on)
  where status='fulfilled' and reorder_due_on is not null;

comment on column public.partner_store_orders.package_snapshot is
  'Immutable server-side snapshot of the package definition used when this order was created.';
comment on column public.partner_store_orders.configuration_snapshot is
  'Immutable server-side snapshot of the selected products/flavors/sizes/customization/fulfillment for reorder history.';

create table if not exists public.partner_recurring_orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_accounts(id) on delete cascade,
  program_key text not null references public.partner_programs(program_key),
  package_id uuid references public.partner_packages(id) on delete set null,
  status text not null default 'active',
  cadence_value integer not null default 1,
  cadence_unit text not null default 'month',
  next_order_on date,
  configuration_snapshot jsonb not null default '{}'::jsonb,
  fulfillment_method text,
  delivery_profile_snapshot jsonb,
  created_from_order_id uuid unique references public.partner_store_orders(id) on delete set null,
  last_order_id uuid references public.partner_store_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_recurring_orders_status_check check (status = any(array['active','paused','cancelled']::text[])),
  constraint partner_recurring_orders_cadence_check check (
    cadence_value > 0 and cadence_unit = any(array['day','week','month','year']::text[])
  ),
  constraint partner_recurring_orders_fulfillment_check check (
    fulfillment_method is null or fulfillment_method = any(array['pickup','delivery']::text[])
  )
);

alter table public.partner_recurring_orders enable row level security;

drop policy if exists "Partners view their recurring partner orders" on public.partner_recurring_orders;
create policy "Partners view their recurring partner orders"
on public.partner_recurring_orders for select to authenticated
using (partner_id = public.nf_partner_id_for_user());

drop policy if exists "Admins manage recurring partner orders" on public.partner_recurring_orders;
create policy "Admins manage recurring partner orders"
on public.partner_recurring_orders for all to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

-- Explicit privileges complement RLS. Admin writes are allowed by policies;
-- partner accounts remain read-only where their policies only permit SELECT.
grant select,insert,update,delete on table public.partner_programs to authenticated;
grant select,insert,update,delete on table public.partner_account_programs to authenticated;
grant select,insert,update,delete on table public.partner_packages to authenticated;
grant select,insert,update,delete on table public.partner_package_items to authenticated;
grant select,insert,update,delete on table public.partner_recurring_orders to authenticated;

-- The existing unified partner order table previously exposed admin SELECT only.
-- The new lifecycle admin needs a narrowly RLS-gated UPDATE path.
drop policy if exists "Admins update partner store orders" on public.partner_store_orders;
create policy "Admins update partner store orders"
on public.partner_store_orders for update to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());
grant update on table public.partner_store_orders to authenticated;

-- Program-based Retail catalog. This replaces partner_type as the authorization rule.
create or replace function public.get_partner_retail_package_catalog()
returns table (
  flavor_id uuid,
  flavor_name text,
  image_url text,
  size_id text,
  size_label text,
  texture text,
  unit_price_cents integer,
  price_version text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    f.id,
    f.name,
    f.image_url,
    z.id,
    z.label,
    st.type::text,
    (z.price_cents / 2)::integer,
    'partner-package-retail-2026-09'::text
  from public.stock st
  join public.flavors f on f.id=st.flavor_id
  join public.sizes z on z.id=st.size_id
  where exists (
    select 1
    from public.partner_account_programs pap
    where pap.partner_id=public.nf_partner_id_for_user()
      and pap.program_key='retail'
      and pap.status='approved'
  )
    and f.active=true
    and f.name = any(array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle']::text[])
    and st.in_stock=true
    and st.size_id = any(array['4oz','7oz','1lb']::text[])
    and (
      st.type::text='regular'
      or (
        st.type::text='spun'
        and coalesce((select (s.value->>'enabled')::boolean from public.settings s where s.key='spun_availability'),false)=true
      )
    )
  order by f.name,z.sort,st.type::text
$$;

revoke all on function public.get_partner_retail_package_catalog() from public,anon,authenticated;
grant execute on function public.get_partner_retail_package_catalog() to authenticated;


-- Partner fulfillment profile fields used by the Delivery & Pickup workspace.
alter table public.partner_accounts
  add column if not exists building_details text,
  add column if not exists gate_access_code text,
  add column if not exists preferred_contact_method text;

alter table public.partner_accounts
  drop constraint if exists partner_accounts_preferred_contact_method_check;
alter table public.partner_accounts
  add constraint partner_accounts_preferred_contact_method_check
  check (
    preferred_contact_method is null
    or preferred_contact_method = any(array['text','call','email']::text[])
  );

create or replace function public.update_my_partner_fulfillment_profile(
  p_business_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_zip text,
  p_delivery_notes text,
  p_building_details text,
  p_gate_access_code text,
  p_preferred_contact_method text,
  p_preferred_fulfillment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_state text;
  v_zip text;
  v_contact text;
  v_fulfillment text;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_id_for_user();
  if v_partner_id is null then
    raise exception 'An approved partner account is required.';
  end if;

  v_state := upper(btrim(coalesce(p_state,'')));
  v_zip := regexp_replace(coalesce(p_zip,''),'\D','','g');
  v_contact := lower(btrim(coalesce(p_preferred_contact_method,'')));
  v_fulfillment := lower(btrim(coalesce(p_preferred_fulfillment,'')));

  if v_state <> '' and v_state !~ '^[A-Z]{2}$' then
    raise exception 'State must use a two-letter abbreviation.';
  end if;
  if v_zip <> '' and v_zip !~ '^\d{5}$' then
    raise exception 'ZIP must be five digits.';
  end if;
  if v_contact <> '' and v_contact not in ('text','call','email') then
    raise exception 'Choose Text, Call, or Email as the preferred contact method.';
  end if;
  if v_fulfillment <> '' and v_fulfillment not in ('pickup','delivery') then
    raise exception 'Choose Pickup or Delivery as the preferred fulfillment method.';
  end if;

  update public.partner_accounts
  set
    business_name=coalesce(nullif(btrim(p_business_name),''),business_name),
    phone=nullif(btrim(p_phone),''),
    address_line1=nullif(btrim(p_address_line1),''),
    address_line2=nullif(btrim(p_address_line2),''),
    city=nullif(btrim(p_city),''),
    state=nullif(v_state,''),
    zip=nullif(v_zip,''),
    delivery_notes=nullif(btrim(p_delivery_notes),''),
    building_details=nullif(btrim(p_building_details),''),
    gate_access_code=nullif(btrim(p_gate_access_code),''),
    preferred_contact_method=nullif(v_contact,''),
    preferred_fulfillment=nullif(v_fulfillment,''),
    updated_at=now()
  where id=v_partner_id;

  return jsonb_build_object('partner_id',v_partner_id,'saved',true);
end
$$;

revoke all on function public.update_my_partner_fulfillment_profile(
  text,text,text,text,text,text,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.update_my_partner_fulfillment_profile(
  text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

-- Partners may pause/resume or skip a scheduled recurring B2B order without
-- receiving direct UPDATE privileges on recurring-order rows.
create or replace function public.manage_my_partner_recurring_order(
  p_recurring_order_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_action text;
  v_row public.partner_recurring_orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_id_for_user();
  v_action := lower(btrim(coalesce(p_action,'')));

  select * into v_row
  from public.partner_recurring_orders pro
  where pro.id=p_recurring_order_id
    and pro.partner_id=v_partner_id
  for update;

  if v_row.id is null then
    raise exception 'Recurring order not found.';
  end if;

  if v_action='pause' then
    update public.partner_recurring_orders
    set status='paused',updated_at=now()
    where id=v_row.id;
  elsif v_action='resume' then
    update public.partner_recurring_orders
    set status='active',updated_at=now()
    where id=v_row.id;
  elsif v_action='skip' then
    if v_row.next_order_on is null then
      raise exception 'The next recurring order date is not scheduled yet.';
    end if;

    update public.partner_recurring_orders
    set
      next_order_on = case v_row.cadence_unit
        when 'day' then v_row.next_order_on + v_row.cadence_value
        when 'week' then v_row.next_order_on + (v_row.cadence_value * 7)
        when 'month' then (v_row.next_order_on + make_interval(months => v_row.cadence_value))::date
        when 'year' then (v_row.next_order_on + make_interval(years => v_row.cadence_value))::date
        else v_row.next_order_on
      end,
      updated_at=now()
    where id=v_row.id;
  else
    raise exception 'Choose pause, resume, or skip.';
  end if;

  return jsonb_build_object('id',v_row.id,'action',v_action,'saved',true);
end
$$;

revoke all on function public.manage_my_partner_recurring_order(uuid,text) from public,anon,authenticated;
grant execute on function public.manage_my_partner_recurring_order(uuid,text) to authenticated;

-- Fulfilled, not ordered, starts the reorder clock.
create or replace function public.nf_partner_store_order_status_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_days integer;
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.status='queued' then new.queued_at := coalesce(new.queued_at,now()); end if;
    if new.status='preparing' then new.preparing_at := coalesce(new.preparing_at,now()); end if;
    if new.status in ('ready','pickup_ready') then new.ready_at := coalesce(new.ready_at,now()); end if;
    if new.status='out_for_delivery' then new.out_for_delivery_at := coalesce(new.out_for_delivery_at,now()); end if;
    if new.status='cancelled' then new.cancelled_at := coalesce(new.cancelled_at,now()); end if;

    if new.status='fulfilled' then
      new.fulfilled_at := coalesce(new.fulfilled_at,now());
      if new.package_id is not null then
        select pp.default_reorder_interval_days into v_days
        from public.partner_packages pp
        where pp.id=new.package_id;
        if v_days is not null then
          new.reorder_due_on := (new.fulfilled_at at time zone 'America/Detroit')::date + v_days;
        end if;
      end if;

      update public.partner_recurring_orders pro
      set
        next_order_on = case pro.cadence_unit
          when 'day' then (new.fulfilled_at at time zone 'America/Detroit')::date + pro.cadence_value
          when 'week' then (new.fulfilled_at at time zone 'America/Detroit')::date + (pro.cadence_value * 7)
          when 'month' then ((new.fulfilled_at at time zone 'America/Detroit')::date + make_interval(months => pro.cadence_value))::date
          when 'year' then ((new.fulfilled_at at time zone 'America/Detroit')::date + make_interval(years => pro.cadence_value))::date
          else pro.next_order_on
        end,
        last_order_id = new.id,
        updated_at = now()
      where pro.created_from_order_id = new.id
        and pro.status='active'
        and pro.next_order_on is null;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists partner_store_order_status_stamp on public.partner_store_orders;
create trigger partner_store_order_status_stamp
before update on public.partner_store_orders
for each row execute function public.nf_partner_store_order_status_stamp();
