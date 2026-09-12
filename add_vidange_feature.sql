-- ══════════════════════════════════════════════════════════════════════
-- Vidange — nouvelle prestation à côté du lavage : l'automobiliste choisit
-- un type d'huile (+ options filtre à huile / filtre à air), un véhicule,
-- une date et une heure de rendez-vous, et paie en ligne (Wave/Orange Money
-- via PayDunya) ou sur place, exactement comme pour un lavage. Contrairement
-- au lavage (file d'attente en direct), la vidange est un RENDEZ-VOUS : le
-- client choisit un créneau futur parmi ceux encore disponibles compte tenu
-- de la capacité journalière fixée par la station.
--
-- Architecture volontairement séparée du lavage (wash_pricing/reservations)
-- plutôt que d'y ajouter des lignes "Vidange" : ces tables et tout le code
-- qui les lit (Settings.jsx grille tarifaire, Stations.jsx sélecteur de
-- service, DEFAULT_PRICING/DEFAULT_DURATION, reçus, Bilan...) sont taillés
-- sur mesure pour exactement 3 prestations de lavage — les faire cohabiter
-- avec une prestation de nature différente (rendez-vous vs file d'attente)
-- aurait fragilisé un flux de paiement déjà délicat (voir add_paydunya_per.sql,
-- add_manual_disbursement.sql). En revanche, le grand livre des reversements
-- (paiements_lavage) EST réutilisé tel quel pour la vidange (colonne
-- type_service) : Super Admin > Facturation et Comptabilité > Reversements
-- (côté station) affichent donc les deux sans code dupliqué.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Configuration vidange de la station ────────────────────────────
-- Une station doit explicitement activer la vidange (vidange_enabled) et
-- configurer au moins un prix avant que la section n'apparaisse côté
-- client — pas de forfait/module payant requis (contrairement à la
-- Boutique/au Bilan) : la vidange est une extension du service de base,
-- ouverte à toutes les stations dès qu'elles la configurent.
alter table public.stations add column if not exists vidange_enabled boolean not null default false;
-- Durée d'un créneau (minutes) — détermine les horaires proposés au client
-- entre l'ouverture et la fermeture de la station (open_time/close_time).
alter table public.stations add column if not exists vidange_slot_minutes integer not null default 60;
-- Nombre de vidanges pouvant être traitées en parallèle sur un même créneau.
alter table public.stations add column if not exists vidange_daily_capacity integer not null default 1;
-- Suppléments optionnels, prix fixe (indépendant de la catégorie de
-- véhicule) — null = option non proposée par cette station.
alter table public.stations add column if not exists vidange_filtre_huile_price integer;
alter table public.stations add column if not exists vidange_filtre_air_price integer;

-- ─── 2. Grille tarifaire vidange (catégorie véhicule × type d'huile) ──--
-- Mêmes 4 catégories que wash_pricing (Moto/Particulier/Transport/Camion),
-- table séparée pour ne pas mélanger deux prestations de nature différente
-- dans wash_pricing (voir note d'architecture ci-dessus).
create table if not exists public.vidange_pricing (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  category text not null,
  oil_type text not null check (oil_type in ('Minérale', 'Semi-Synthèse', 'Synthèse')),
  price integer not null default 0 check (price >= 0),
  unique (station_id, category, oil_type)
);

-- ─── 3. Rendez-vous vidange ────────────────────────────────────────────
create table if not exists public.vidange_bookings (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text not null,
  vehicle_label text not null,
  category text not null,
  oil_type text not null,
  filtre_huile boolean not null default false,
  filtre_air boolean not null default false,
  -- Kilométrage actuel renseigné par le client — informatif pour la
  -- station (choix du bon filtre, conseil vidange), jamais bloquant.
  mileage integer,
  scheduled_at timestamptz not null,
  -- Prix figé au moment de la réservation (comme reservations.amount pour
  -- le lavage) — un changement de tarif ensuite ne doit jamais modifier un
  -- rendez-vous déjà pris.
  amount integer not null,
  paid boolean not null default false,
  payment_method text,
  status text not null default 'confirmee' check (status in ('confirmee', 'terminee', 'annulee')),
  created_at timestamptz not null default now()
);
create index if not exists vidange_bookings_station_idx on public.vidange_bookings(station_id, scheduled_at);

-- Créneaux déjà pris pour une station à une date donnée — lecture publique
-- ANONYMISÉE (aucun nom/plaque de client, juste les horaires) : permet à
-- n'importe quel visiteur de voir quels créneaux sont encore libres avant
-- même d'avoir un compte, sans lui exposer les rendez-vous des autres
-- clients (RLS de vidange_bookings ne les lui montre pas directement).
create or replace function public.get_vidange_booked_slots(p_station_id uuid, p_day date)
returns table(scheduled_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select vb.scheduled_at from public.vidange_bookings vb
  where vb.station_id = p_station_id
    and vb.status = 'confirmee'
    and vb.scheduled_at >= p_day::timestamptz
    and vb.scheduled_at < (p_day + 1)::timestamptz;
$$;
grant execute on function public.get_vidange_booked_slots(uuid, date) to anon, authenticated;

-- ─── 4. Extension du grand livre des reversements (add_paydunya_per.sql +
-- add_manual_disbursement.sql) — une vidange payée en ligne suit exactement
-- le même circuit de redistribution/reversement manuel qu'un lavage, donc
-- la même table plutôt qu'un doublon : Super Admin > Facturation et
-- Comptabilité > Reversements (station) affichent les deux sans code en
-- plus, juste distingués par type_service.
alter table public.paiements_lavage add column if not exists type_service text not null default 'lavage'
  check (type_service in ('lavage', 'vidange'));
-- Parallèle à reservation_ids, rempli uniquement pour type_service='vidange'
-- (une vidange = un seul rendez-vous, mais un tableau pour rester cohérent
-- avec reservation_ids et couvrir une éventuelle réservation groupée future).
alter table public.paiements_lavage add column if not exists vidange_ids uuid[] not null default '{}';

-- ─── 5. Row Level Security ─────────────────────────────────────────────
alter table public.vidange_pricing enable row level security;
alter table public.vidange_bookings enable row level security;

-- vidange_pricing : lecture publique (nécessaire pour que tout client
-- compare/réserve, comme wash_pricing), écriture réservée à la station.
drop policy if exists "vidange_pricing_select" on public.vidange_pricing;
create policy "vidange_pricing_select" on public.vidange_pricing for select using (true);
drop policy if exists "vidange_pricing_write" on public.vidange_pricing;
create policy "vidange_pricing_write" on public.vidange_pricing for insert
  with check (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "vidange_pricing_update" on public.vidange_pricing;
create policy "vidange_pricing_update" on public.vidange_pricing for update
  using (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "vidange_pricing_delete" on public.vidange_pricing;
create policy "vidange_pricing_delete" on public.vidange_pricing for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- vidange_bookings : même pattern que reservations — la station voit ses
-- rendez-vous, le client voit les siens. Un client insère directement pour
-- lui-même (paiement sur place, comme createReservation pour le lavage) ;
-- un paiement en ligne est inséré par l'Edge Function (service_role,
-- contourne RLS). Statut modifiable par la station (terminée/annulée) ou
-- par le client lui-même (annulation de son propre rendez-vous à venir).
drop policy if exists "vidange_bookings_select" on public.vidange_bookings;
create policy "vidange_bookings_select" on public.vidange_bookings for select
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');
drop policy if exists "vidange_bookings_insert" on public.vidange_bookings;
create policy "vidange_bookings_insert" on public.vidange_bookings for insert
  with check (client_id = auth.uid() or station_id = current_station_id());
drop policy if exists "vidange_bookings_update" on public.vidange_bookings;
create policy "vidange_bookings_update" on public.vidange_bookings for update
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');
-- Suppression réservée à la station propriétaire — même bouton "Vider
-- l'historique" (Paramètres > Sécurité) que reservations_delete.
drop policy if exists "vidange_bookings_delete" on public.vidange_bookings;
create policy "vidange_bookings_delete" on public.vidange_bookings for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- ─── 6. Permission 'vidange.manage' pour les rôles catalogue existants ──
-- Redéfinit seed_builtin_station_roles (add_station_team.sql) pour que les
-- PROCHAINES stations créées aient la permission d'office sur Gérant/
-- Superviseur, et met à jour ici les stations DÉJÀ créées (le "on conflict
-- do nothing" de la fonction ne les aurait pas mises à jour).
create or replace function public.seed_builtin_station_roles(p_station_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.station_roles (station_id, key, name, description, permissions, is_builtin)
  values
    (p_station_id, 'super_admin_station', 'Super Admin Station',
     'Tous les droits sur la station.', array['*'], true),
    (p_station_id, 'gerant', 'Gérant',
     'Gestion complète au quotidien, sauf la gestion de l''équipe.',
     array['dashboard','washers.manage','vidange.manage','transactions.view','accounting.manage','subscriptions.manage','analytics.view','settings.manage'], true),
    (p_station_id, 'caissier', 'Caissier / Comptable',
     'Encaissements, transactions, comptabilité, dépenses et analytique.',
     array['dashboard','transactions.view','accounting.manage','subscriptions.manage','analytics.view'], true),
    (p_station_id, 'superviseur', 'Superviseur',
     'File d''attente, laveurs, planning et pointage.',
     array['dashboard','washers.manage','vidange.manage'], true),
    (p_station_id, 'reception', 'Réception',
     'File d''attente, nouveau lavage et suivi des transactions.',
     array['dashboard','transactions.view'], true),
    (p_station_id, 'laveur', 'Laveur',
     'Voit la file d''attente et ses lavages ; gère son pointage.',
     array['dashboard','washer.self'], true)
  on conflict (station_id, key) do nothing;
end;
$$;

update public.station_roles
   set permissions = array_append(permissions, 'vidange.manage')
 where is_builtin
   and key in ('gerant', 'superviseur')
   and not ('vidange.manage' = any(permissions))
   and not ('*' = any(permissions));

-- ─── 7. Realtime ────────────────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.vidange_pricing;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.vidange_bookings;
  exception when others then null;
  end;
end $$;
