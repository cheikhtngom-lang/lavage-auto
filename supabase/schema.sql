-- O'Wash / Lavage Auto — schéma Supabase (Postgres + Auth + RLS)
-- À coller tel quel dans Supabase Dashboard > SQL Editor > New query > Run.
-- Conçu pour repartir de zéro (aucune donnée localStorage existante à migrer).

create extension if not exists pgcrypto;

-- ─── Stations (annuaire public — champs sensibles séparés dans station_billing) ─
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) default auth.uid(),
  name text not null,
  owner_name text,
  owner_phone text,
  address text,
  city text,
  quartier text,
  region text,
  lat double precision,
  lng double precision,
  status text not null default 'en_attente' check (status in ('en_attente', 'active', 'suspendue')),
  open_time text default '08:00',
  close_time text default '20:00',
  logo_url text,
  cachet_url text,
  owner_email text,
  loyalty_threshold integer not null default 5,
  promo_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Infos de facturation SaaS — jamais exposées publiquement (voir policies).
create table public.station_billing (
  station_id uuid primary key references public.stations(id) on delete cascade,
  plan text not null default 'Starter',
  subscription_status text not null default 'essai' check (subscription_status in ('essai', 'a_jour', 'en_retard')),
  next_billing_date timestamptz,
  clients_count integer not null default 0,
  notes text
);

-- Auto-crée la ligne de facturation dès qu'une station est créée, pour ne
-- jamais avoir à donner de droit INSERT sur station_billing côté client.
create or replace function public.handle_new_station()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.station_billing (station_id) values (new.id);
  return new;
end;
$$;
create trigger on_station_created
  after insert on public.stations
  for each row execute function public.handle_new_station();

-- ─── Profils (1:1 avec auth.users) ───────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'automobiliste')),
  station_id uuid references public.stations(id) on delete set null,
  full_name text,
  email text,
  phone text,
  favorite_station_ids uuid[] not null default '{}',
  hidden_station_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
-- Un seul compte admin par station (comme aujourd'hui : 1 station = 1 compte de connexion).
create unique index one_admin_per_station on public.profiles(station_id) where role = 'admin';

-- ─── Fonctions utilitaires (SECURITY DEFINER pour éviter la récursion RLS
-- sur profiles : une policy sur `profiles` qui interrogerait `profiles`
-- directement se re-déclencherait elle-même). Définies ici (après `profiles`)
-- car une fonction LANGUAGE SQL est analysée à sa création — contrairement à
-- plpgsql, elle exige que les tables qu'elle référence existent déjà.
create or replace function public.app_role()
returns text
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_station_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select station_id from public.profiles where id = auth.uid();
$$;

-- ─── Véhicules (garage automobiliste) ────────────────────────────────────
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  brand text not null,
  plate text,
  created_at timestamptz not null default now()
);

-- ─── Employés (laveurs/équipe station — pas de login propre) ────────────
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  name text not null,
  role text not null default 'Laveur',
  status text not null default 'Actif',
  daily_status text not null default 'present',
  avatar text,
  clock_in text,
  clock_out text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  total_time text,
  created_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  daily_status text,
  status text,
  clock_in text,
  clock_out text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  total_time text,
  unique (employee_id, work_date)
);

-- ─── Grille tarifaire + durées (une ligne par catégorie/service) ─────────
create table public.wash_pricing (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  category text not null,
  service text not null,
  price integer not null,
  duration_minutes integer not null,
  unique (station_id, category, service)
);

-- ─── Réservations (file d'attente + en cours + historique = une seule
-- table, distinguée par `status` — plus simple à synchroniser en Realtime
-- que 3 listes séparées comme dans l'ancien modèle localStorage) ─────────
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text not null,
  vehicle_label text not null,
  category text not null,
  service text not null,
  status text not null default 'attente' check (status in ('attente', 'en_cours', 'termine', 'annule')),
  assigned_employee_id uuid references public.employees(id) on delete set null,
  assigned_to_name text,
  amount integer,
  paid boolean not null default false,
  reservation_group_id text,
  group_size integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─── Transactions (encaissements) — immuables une fois créées ───────────
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text,
  vehicle_label text,
  service text,
  method text,
  amount integer not null,
  created_at timestamptz not null default now()
);

-- ─── Avis clients ─────────────────────────────────────────────────────--
create table public.station_reviews (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─── Plans SaaS (configurables par le Super Admin) ───────────────────────
create table public.plans (
  key text primary key,
  label text not null,
  price integer not null
);
insert into public.plans (key, label, price) values
  ('Starter', 'Starter', 15000),
  ('Pro', 'Pro', 35000),
  ('Business', 'Business', 75000);

-- ─── Litiges + journal d'audit (Super Admin) ─────────────────────────────
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  station_name text,
  subject text not null,
  description text,
  status text not null default 'ouvert' check (status in ('ouvert', 'resolu', 'rembourse')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  created_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ══════════════════════════════════════════════════════════════════════

alter table public.stations enable row level security;
alter table public.station_billing enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.wash_pricing enable row level security;
alter table public.reservations enable row level security;
alter table public.transactions enable row level security;
alter table public.station_reviews enable row level security;
alter table public.plans enable row level security;
alter table public.disputes enable row level security;
alter table public.audit_log enable row level security;

-- stations : annuaire public pour les stations actives ; une station voit
-- toujours sa propre fiche même "en_attente" (onboarding avant validation).
-- `created_by = auth.uid()` est indispensable : à la création, le code lit la
-- ligne juste insérée (`.select()`) AVANT que le profil admin (qui alimente
-- current_station_id()) n'existe — sans cette clause, ce retour immédiat est
-- invisible pour son propre créateur et Postgres annule l'insertion entière
-- (RLS s'applique aussi à la clause RETURNING d'un INSERT).
create policy "stations_select" on public.stations for select
  using (status = 'active' or id = current_station_id() or created_by = auth.uid() or app_role() = 'super_admin');
-- Le rôle Postgres "authenticated" ne s'est pas appliqué de façon fiable sur
-- ce projet (cause non élucidée, possiblement lié aux clés JWT asymétriques) —
-- `auth.uid() is not null` est un équivalent fonctionnel qui ne dépend que du
-- contenu du JWT, pas du rôle de connexion PostgREST.
create policy "stations_insert" on public.stations for insert
  with check (auth.uid() is not null);
create policy "stations_update" on public.stations for update
  using (id = current_station_id() or app_role() = 'super_admin');
create policy "stations_delete" on public.stations for delete
  using (app_role() = 'super_admin');

-- station_billing : jamais public, uniquement la station concernée + super admin.
create policy "station_billing_select" on public.station_billing for select
  using (station_id = current_station_id() or app_role() = 'super_admin');
create policy "station_billing_update" on public.station_billing for update
  using (app_role() = 'super_admin');

-- profiles : chacun voit/édite le sien ; super admin voit tout.
-- L'auto-inscription ne peut jamais se donner le rôle super_admin (compte
-- créé manuellement dans le dashboard), et un compte "admin" ne peut se lier
-- qu'à une station qu'il vient lui-même de créer (voir stations.created_by) —
-- sinon un utilisateur pourrait s'attribuer une station déjà existante.
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or app_role() = 'super_admin');
create policy "profiles_insert" on public.profiles for insert
  with check (
    id = auth.uid()
    and (
      (role = 'automobiliste' and station_id is null)
      or (role = 'admin' and station_id in (select id from public.stations where created_by = auth.uid()))
    )
  );
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid() or app_role() = 'super_admin');

-- vehicles : strictement le propriétaire (+ super admin pour le support).
create policy "vehicles_select" on public.vehicles for select
  using (owner_id = auth.uid() or app_role() = 'super_admin');
create policy "vehicles_insert" on public.vehicles for insert
  with check (owner_id = auth.uid());
create policy "vehicles_update" on public.vehicles for update
  using (owner_id = auth.uid());
create policy "vehicles_delete" on public.vehicles for delete
  using (owner_id = auth.uid());

-- employees / attendance_records : gérés uniquement par l'admin de LEUR station.
create policy "employees_all" on public.employees for all
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');
create policy "attendance_all" on public.attendance_records for all
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');

-- wash_pricing : lecture publique (nécessaire pour que tout client compare/réserve),
-- écriture réservée à l'admin de la station concernée.
create policy "wash_pricing_select" on public.wash_pricing for select
  using (true);
create policy "wash_pricing_write" on public.wash_pricing for insert
  with check (station_id = current_station_id() or app_role() = 'super_admin');
create policy "wash_pricing_update" on public.wash_pricing for update
  using (station_id = current_station_id() or app_role() = 'super_admin');
create policy "wash_pricing_delete" on public.wash_pricing for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- reservations : la station voit sa file, le client voit ses propres réservations.
create policy "reservations_select" on public.reservations for select
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');
create policy "reservations_insert" on public.reservations for insert
  with check (client_id = auth.uid() or station_id = current_station_id());
create policy "reservations_update" on public.reservations for update
  using (station_id = current_station_id() or app_role() = 'super_admin');
-- Suppression réservée à la station propriétaire (bouton "Vider l'historique"
-- en Paramètres > Sécurité) — pas d'UPDATE côté transactions pour autant
-- (immuables), seulement ce nettoyage global.
create policy "reservations_delete" on public.reservations for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- transactions : immuables (pas de policy update/delete = interdit par défaut).
create policy "transactions_select" on public.transactions for select
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');
create policy "transactions_insert" on public.transactions for insert
  with check (station_id = current_station_id() or client_id = auth.uid());
create policy "transactions_delete" on public.transactions for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- station_reviews : lecture publique, un client ne poste que ses propres avis.
create policy "reviews_select" on public.station_reviews for select
  using (true);
create policy "reviews_insert" on public.station_reviews for insert
  with check (client_id = auth.uid());

-- plans : lecture publique (grille tarifaire SaaS), écriture super admin seul.
create policy "plans_select" on public.plans for select
  using (true);
create policy "plans_write" on public.plans for all
  using (app_role() = 'super_admin')
  with check (app_role() = 'super_admin');

-- disputes / audit_log : réservés au super admin.
create policy "disputes_all" on public.disputes for all
  using (app_role() = 'super_admin')
  with check (app_role() = 'super_admin');
create policy "audit_log_all" on public.audit_log for all
  using (app_role() = 'super_admin')
  with check (app_role() = 'super_admin');

-- ─── Realtime : remplace le polling toutes les 8/15s de l'ancien modèle
-- localStorage (voir useAppState.jsx / useSuperAdminState.jsx) par des
-- abonnements live sur les tables qui changent pendant qu'un autre onglet/
-- appareil regarde l'écran (file d'attente admin pendant qu'un client réserve).
alter publication supabase_realtime add table public.reservations;
alter publication supabase_realtime add table public.transactions;

-- ══════════════════════════════════════════════════════════════════════
-- Fonctions publiques agrégées (contournent volontairement RLS via
-- SECURITY DEFINER) — un automobiliste qui compare des stations ou suit sa
-- position doit voir "combien de monde attend", jamais QUI attend. Sans ça,
-- reservations_select interdit toute lecture des réservations des AUTRES
-- clients (comportement correct et volontaire, contrairement à l'ancien
-- système localStorage qui n'avait aucune protection de ce type).
-- ══════════════════════════════════════════════════════════════════════

-- Compteurs + laveurs présents par station, pour l'annuaire public et
-- l'estimation d'attente avant réservation.
create or replace function public.station_public_stats()
returns table(station_id uuid, waiting_count bigint, active_count bigint, active_employees bigint)
language sql security definer stable
set search_path = public
as $$
  select
    s.id,
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'attente'),
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'en_cours'),
    (select count(*) from public.employees e where e.station_id = s.id and e.daily_status = 'present')
  from public.stations s;
$$;
grant execute on function public.station_public_stats() to anon, authenticated;

-- Composition de la file de TOUTES les stations (catégorie/service/statut,
-- jamais le nom du client ni le véhicule) — sert à calculer une position et
-- un temps d'attente exacts, aussi bien pour un client qui réserve que pour
-- celui qui suit son propre véhicule.
create or replace function public.all_stations_queue_snapshot()
returns table(id uuid, station_id uuid, status text, category text, service text, created_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, station_id, status, category, service, created_at
  from public.reservations
  where status in ('attente', 'en_cours');
$$;
grant execute on function public.all_stations_queue_snapshot() to anon, authenticated;
