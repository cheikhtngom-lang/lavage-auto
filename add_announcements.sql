-- ══════════════════════════════════════════════════════════════════════
-- Annonces — deux sens de diffusion, une seule table :
--   • 'platform_to_stations' : le Super Admin diffuse à TOUTES les stations
--     (ex: maintenance, nouveauté). Visible dans une clochette de
--     notification côté espace station.
--   • 'station_to_clients' : une station diffuse à SES clients — ceux qui
--     ont déjà réservé chez elle, qui ont un abonnement chez elle, ou qui
--     l'ont mise en favori. Visible dans une clochette côté espace
--     automobiliste.
--
-- Lu/non-lu géré comme les publicités (station_ads/dismissed_ad_ids) plutôt
-- qu'avec une table de statuts par destinataire : un seul tableau
-- profiles.dismissed_announcement_ids, pas de ligne par (annonce × lecteur).
-- Fonctionne pour un compte station (propriétaire OU collaborateur, tous
-- deux des lignes `profiles`) comme pour un automobiliste.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform_to_stations', 'station_to_clients')),
  -- Station émettrice — uniquement pour 'station_to_clients' (null pour une
  -- annonce plateforme, qui ne vient d'aucune station en particulier).
  station_id uuid references public.stations(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 120),
  message text not null check (length(trim(message)) > 0 and length(message) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcements_scope_station_ck check (
    (scope = 'station_to_clients' and station_id is not null) or
    (scope = 'platform_to_stations' and station_id is null)
  )
);
create index if not exists announcements_scope_idx on public.announcements(scope, created_at desc);
create index if not exists announcements_station_idx on public.announcements(station_id, created_at desc) where station_id is not null;

alter table public.profiles add column if not exists dismissed_announcement_ids uuid[] not null default '{}';

-- Un client "connaît" une station pour les annonces s'il y a déjà réservé,
-- y a un abonnement, ou l'a mise en favori. Volontairement distincte de
-- client_knows_station (add_station_shop.sql, réservation/favori seulement)
-- pour ne pas changer la visibilité de la Boutique en même temps.
create or replace function public.client_knows_station_for_announcements(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    exists (select 1 from public.reservations r where r.station_id = sid and r.client_id = auth.uid())
    or exists (select 1 from public.station_client_subscriptions s where s.station_id = sid and s.client_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and sid = any(p.favorite_station_ids));
$$;
grant execute on function public.client_knows_station_for_announcements(uuid) to authenticated;

alter table public.announcements enable row level security;

-- Lecture :
--  • Super Admin : tout.
--  • 'platform_to_stations' : tout compte rattaché à une station (owner ou
--    collaborateur — current_station_id() renvoie profiles.station_id,
--    renseigné pour les deux).
--  • 'station_to_clients' : la station émettrice, ou un client qui la connaît.
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select using (
  app_role() = 'super_admin'
  or (scope = 'platform_to_stations' and current_station_id() is not null)
  or (scope = 'station_to_clients' and (
    station_id = current_station_id()
    or public.client_knows_station_for_announcements(station_id)
  ))
);

-- Écriture : Super Admin pour les annonces plateforme ; une station pour ses
-- propres annonces clients (contrôle fin de qui, côté app — permission
-- 'announcements.manage', voir lib/permissions.js — RLS v1 reste au niveau
-- station comme le reste de la plateforme).
drop policy if exists "announcements_insert" on public.announcements;
create policy "announcements_insert" on public.announcements for insert with check (
  (scope = 'platform_to_stations' and app_role() = 'super_admin')
  or (scope = 'station_to_clients' and station_id = current_station_id())
);

-- Suppression réservée à l'auteur (filet de rattrapage en cas d'erreur de saisie).
drop policy if exists "announcements_delete" on public.announcements;
create policy "announcements_delete" on public.announcements for delete using (
  app_role() = 'super_admin' or station_id = current_station_id()
);

-- ─── Permission 'announcements.manage' pour le rôle catalogue "Gérant" ──
-- Même mécanique que vidange.manage (add_plan_gating.sql) : redéfinit
-- seed_builtin_station_roles pour les prochaines stations, et backfille
-- celles déjà créées.
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
     array['dashboard','washers.manage','vidange.manage','transactions.view','accounting.manage','subscriptions.manage','analytics.view','settings.manage','announcements.manage'], true),
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
   set permissions = array_append(permissions, 'announcements.manage')
 where is_builtin
   and key = 'gerant'
   and not ('announcements.manage' = any(permissions))
   and not ('*' = any(permissions));

do $$
begin
  begin
    alter publication supabase_realtime add table public.announcements;
  exception when others then null;
  end;
end $$;
