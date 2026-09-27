-- Activate tested Foodservice recurring reminders and Hive Partner annual-renewal reminders.
-- Foodservice reminders run 7 days before the recurring due date.
-- Hive Partner renewal reminders run 30 days before the annual renewal date.

update public.partner_automation_rules r
set
  active = true,
  updated_at = now()
from public.partner_packages p
where p.id = r.package_id
  and (
    (
      p.package_key in (
        'foodservice-cafe-starter',
        'foodservice-kitchen-pack',
        'foodservice-high-volume'
      )
      and r.event_key = 'recurring_due'
      and r.action_key = 'recurring_reminder'
    )
    or
    (
      p.package_key in (
        'hive-colony-partner',
        'hive-apiary-partner',
        'hive-community-partner'
      )
      and r.event_key = 'annual_renewal'
      and r.action_key = 'renewal_reminder'
    )
  );
