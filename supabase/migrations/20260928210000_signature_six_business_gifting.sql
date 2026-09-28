-- NectarFusions Signature Six business gifting
-- Keep Client Gift 20, Business Gift 50, and Event Gift 100 active as individual-gift packages.
-- Signature Six is the distinct multi-jar boxed gifting experience.

update public.partner_programs
set
  description = 'Business gifting with individual 20, 50, and 100-gift packages plus the boxed Signature Six Michigan honey tasting collection.',
  updated_at = now()
where program_key = 'business_gifting';

update public.partner_packages
set
  active = true,
  description = case package_key
    when 'gifting-client-20' then '20 individual ready-to-gift NectarFusions 2 oz honeys for client gifting. These are individual gifts and do not come in a multi-jar gift box.'
    when 'gifting-business-50' then '50 individual ready-to-gift NectarFusions 2 oz honeys for clients, employees, events, or hospitality. These are individual gifts and do not come in a multi-jar gift box.'
    when 'gifting-event-100' then '100 individual ready-to-gift NectarFusions 2 oz honeys for events, conferences, hospitality, weddings, or larger gifting programs. These are individual gifts and do not come in a multi-jar gift box.'
    else description
  end,
  customization_options = coalesce(customization_options, '{}'::jsonb) ||
    '{"gift_box":false,"presentation":"individual_ready_to_gift"}'::jsonb,
  configuration_schema = coalesce(configuration_schema, '{}'::jsonb) ||
    '{"gift_box":false,"presentation":"individual_ready_to_gift"}'::jsonb,
  updated_at = now()
where package_key in (
  'gifting-client-20',
  'gifting-business-50',
  'gifting-event-100'
);

insert into public.partner_packages (
  package_key, program_key, name, description, image_url, active, package_type,
  price_mode, base_price_cents, minimum_quantity, default_quantity,
  quantity_increment, flavor_selection_count, allowed_flavor_names,
  allowed_size_ids, allowed_textures, customization_options, pickup_allowed,
  delivery_allowed, recurring_allowed, default_reorder_interval_days,
  configuration_schema, sort
)
values
(
  'gifting-signature-six',
  'business_gifting',
  'Signature Six',
  'Six 2 oz glass hexagons presented together in a showcased NectarFusions gift box: five signature flavors plus one rotating seasonal discovery. Built for premium client, employee, closing, holiday, welcome, and VIP gifting.',
  null,
  true,
  'starter',
  'fixed',
  3200,
  12,
  12,
  1,
  6,
  array['Original','Cinnamon','Lemon','Madagascar Vanilla','Chipotle','Pumpkin Spice'],
  array['2oz'],
  array[]::text[],
  '{"container":"hex","gift_box":true,"presentation":"signature_six_box","branded_insert":true,"nectarfusions_labels_required":true}'::jsonb,
  true,
  true,
  true,
  null,
  '{
    "builder":"signature_six",
    "unit":"gift_box",
    "gift_box":true,
    "jars_per_box":6,
    "minimum_boxes":12,
    "signature_flavors":["Original","Cinnamon","Lemon","Madagascar Vanilla","Chipotle"],
    "seasonal_flavor":"Pumpkin Spice",
    "seasonal_label":"Seasonal Discovery",
    "price_tiers":[
      {"min":12,"max":24,"unit_price_cents":3200},
      {"min":25,"max":49,"unit_price_cents":3000},
      {"min":50,"max":99,"unit_price_cents":2800}
    ],
    "custom_quote_min":100
  }'::jsonb,
  5
)
on conflict (package_key) do update set
  program_key = excluded.program_key,
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  active = excluded.active,
  package_type = excluded.package_type,
  price_mode = excluded.price_mode,
  base_price_cents = excluded.base_price_cents,
  minimum_quantity = excluded.minimum_quantity,
  default_quantity = excluded.default_quantity,
  quantity_increment = excluded.quantity_increment,
  flavor_selection_count = excluded.flavor_selection_count,
  allowed_flavor_names = excluded.allowed_flavor_names,
  allowed_size_ids = excluded.allowed_size_ids,
  allowed_textures = excluded.allowed_textures,
  customization_options = excluded.customization_options,
  pickup_allowed = excluded.pickup_allowed,
  delivery_allowed = excluded.delivery_allowed,
  recurring_allowed = excluded.recurring_allowed,
  default_reorder_interval_days = excluded.default_reorder_interval_days,
  configuration_schema = excluded.configuration_schema,
  sort = excluded.sort,
  updated_at = now();
