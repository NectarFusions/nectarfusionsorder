# Honey Club box and bonus-jar tracking

## What the system records

Every real Square `invoice.payment_made` webhook is registered once in `subscription_box_events` using both the Square event ID and invoice ID. The database transaction then increments `subscriptions.boxes_sent` exactly once.

The plan's `bonus_every` value controls the cycle. With the normal value of `3`, paid boxes 3, 6, 9, 12, and so on create an open bonus-jar alert.

## Admin notification

When an administrator is signed in, a persistent on-screen notification panel shows:

- a prominent summary alert when any bonus jars are waiting;
- a highlighted alert on the exact subscription, customer, plan, and paid box number;
- a **Mark bonus jar packed** button;
- the next earned-bonus box and how many paid boxes remain after an alert is acknowledged.

The alert is rebuilt from the database whenever an administrator signs in or returns to the browser. It remains open until an administrator acknowledges it, so refreshing or closing the browser cannot permanently dismiss the reminder.

When Resend is configured, the webhook also emails `BONUS_JAR_ALERT_EMAIL` (or `info@nectar-fusions.com`) for each newly earned bonus jar. Email failure does not lose the dashboard alert.

## Deployment order

1. Apply `supabase/migrations/20260801124400_subscription_box_bonus_tracking.sql` to the production Supabase project.
2. Deploy the Netlify and frontend code.
3. Send or replay one controlled subscription invoice event.
4. Confirm the paid-box count increases once.
5. Replay the same event and confirm the count does not change.
6. For a subscription whose next paid box is a multiple of three, confirm the admin alert and email appear.
7. Click **Mark bonus jar packed** and confirm the alert clears.

Do not deploy the webhook code before applying the migration; the new webhook calls the new database function.
