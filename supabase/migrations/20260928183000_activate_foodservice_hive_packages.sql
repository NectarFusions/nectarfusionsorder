-- Activate approved NectarFusions Foodservice and Hive Partner packages.
-- Automation reminder rules remain inactive until their delivery content is tested.

update public.partner_packages
set
  active = true,
  configuration_schema =
    case
      when program_key = 'hive_partners'
        then jsonb_set(
          coalesce(configuration_schema, '{}'::jsonb),
          '{status}',
          '"active"'::jsonb,
          true
        )
      else configuration_schema
    end,
  updated_at = now()
where package_key in (
  'foodservice-cafe-starter',
  'foodservice-kitchen-pack',
  'foodservice-high-volume',
  'hive-colony-partner',
  'hive-apiary-partner',
  'hive-community-partner'
);
