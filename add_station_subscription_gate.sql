-- ══════════════════════════════════════════════════════════════════════
-- Blocage d'une station en fin d'abonnement + renouvellement en libre-
-- service — à exécuter une fois dans l'éditeur SQL Supabase. Idempotent
-- (peut être rejoué sans risque).
--
-- 1. `station_renewal_payments` : la station soumet un paiement Wave/
--    Orange Money (ligne PENDING, jamais activée directement — même
--    logique que super_user_subscriptions/station_ads déjà en place), le
--    Super Admin confirme dans Super Admin > Facturation une fois
--    l'argent réellement reçu (voir confirmRenewalPayment,
--    useSuperAdminState.jsx).
-- 2. `station_subscription_ok(sid)` : vrai si la station peut apparaître
--    publiquement (annuaire /stations + carrousel landing) — faux si
--    marquée impayée (en_retard) OU si son essai gratuit est terminé sans
--    abonnement payant. Utilisée dans la policy `stations_select` : ne
--    change RIEN à ce que voit la station elle-même sur son propre
--    espace (clause `id = current_station_id()` inchangée), seulement ce
--    que voient les automobilistes/visiteurs anonymes.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.station_renewal_payments (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REJECTED')),
  plan text not null,
  amount integer not null,
  method text,
  reference text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.station_renewal_payments enable row level security;

drop policy if exists "station_renewal_payments_select" on public.station_renewal_payments;
create policy "station_renewal_payments_select" on public.station_renewal_payments for select
  using (station_id = current_station_id() or app_role() = 'super_admin');

drop policy if exists "station_renewal_payments_insert" on public.station_renewal_payments;
create policy "station_renewal_payments_insert" on public.station_renewal_payments for insert
  with check (station_id = current_station_id());

drop policy if exists "station_renewal_payments_update" on public.station_renewal_payments;
create policy "station_renewal_payments_update" on public.station_renewal_payments for update
  using (app_role() = 'super_admin');

do $$
begin
  begin
    alter publication supabase_realtime add table public.station_renewal_payments;
  exception when others then null;
  end;
end $$;

create or replace function public.station_subscription_ok(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select sb.subscription_status <> 'en_retard'
       and not (sb.subscription_status = 'essai' and sb.trial_ends_at is not null and sb.trial_ends_at < now())
     from public.station_billing sb
     where sb.station_id = sid),
    true
  );
$$;

drop policy if exists "stations_select" on public.stations;
create policy "stations_select" on public.stations for select
  using (
    (status = 'active' and public.station_subscription_ok(id))
    or id = current_station_id()
    or created_by = auth.uid()
    or app_role() = 'super_admin'
  );
