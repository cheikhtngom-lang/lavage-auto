-- ═══════════════════════════════════════════════════════════════════════
-- Relances d'échéance d'abonnement (5 jours avant la fin)
--
--   kind = 'station' : abonnement d'une station à la plateforme
--                      (Super Admin > Relances)
--   kind = 'client'  : abonnement mensuel d'un client à une station
--                      (Admin > Relances), subscription_id renseigné
--
-- Journal des relances envoyées : l'email automatique (Edge Function
-- send-subscription-reminders, cron quotidien) n'écrit qu'UNE ligne par
-- échéance (index unique partiel channel = 'email') ; chaque clic sur le
-- bouton WhatsApp ajoute une ligne (historique « relancé le … »).
-- Les échéances elles-mêmes ne sont pas stockées : elles se déduisent de
-- station_billing et des factures station_subscription_invoices
-- (src/lib/subscriptionReminders.js, même règle côté Edge Function).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.subscription_reminders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('station', 'client')),
  station_id uuid not null references public.stations(id) on delete cascade,
  subscription_id uuid references public.station_client_subscriptions(id) on delete cascade,
  due_date date not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  constraint subscription_reminders_client_ref check ((kind = 'client') = (subscription_id is not null))
);

create index if not exists subscription_reminders_station_idx on public.subscription_reminders(station_id, kind);
create unique index if not exists subscription_reminders_email_once
  on public.subscription_reminders (kind, station_id, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'::uuid), due_date)
  where channel = 'email';

alter table public.subscription_reminders enable row level security;

-- Lecture : le Super Admin voit tout ; une station voit les relances de SES clients.
drop policy if exists subscription_reminders_select on public.subscription_reminders;
create policy subscription_reminders_select on public.subscription_reminders for select using (
  public.app_role() = 'super_admin'
  or (kind = 'client' and station_id = public.current_station_id())
);

-- Écriture depuis l'interface : uniquement la trace d'une relance WhatsApp
-- manuelle. Les emails sont écrits par l'Edge Function (service_role).
drop policy if exists subscription_reminders_insert on public.subscription_reminders;
create policy subscription_reminders_insert on public.subscription_reminders for insert with check (
  channel = 'whatsapp'
  and sent_by = auth.uid()
  and (
    (kind = 'station' and public.app_role() = 'super_admin')
    or (kind = 'client' and station_id = public.current_station_id() and public.has_station_perm('subscriptions.manage'))
  )
);

-- Data API (obligatoire pour les nouvelles tables à partir du 30/10/2026,
-- voir supabase/data_api_grants.sql).
grant select, insert on public.subscription_reminders to authenticated;
grant select, insert, update, delete on public.subscription_reminders to service_role;
