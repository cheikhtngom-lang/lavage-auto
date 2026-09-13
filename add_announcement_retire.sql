-- ══════════════════════════════════════════════════════════════════════
-- Annonces — « Retirer » (add_announcements.sql avait la table + le
-- diffuseur ; il manquait un moyen de désactiver une annonce en gardant
-- son historique). Ajoute une colonne `active` : une annonce retirée
-- n'est plus visible des destinataires mais reste dans l'historique de
-- l'émetteur (Super Admin pour platform_to_stations, station pour
-- station_to_clients) avec un badge « Retirée » — pas de suppression.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

alter table public.announcements add column if not exists active boolean not null default true;

-- Lecture : l'émetteur voit tout son historique (actif + retiré) ; un
-- destinataire (station recevant une annonce plateforme, client connaissant
-- la station émettrice) ne voit que les annonces encore actives.
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select using (
  app_role() = 'super_admin'
  or (scope = 'platform_to_stations' and current_station_id() is not null and active)
  or (scope = 'station_to_clients' and (
    station_id = current_station_id()
    or (active and public.client_knows_station_for_announcements(station_id))
  ))
);

-- Écriture (retrait) : même périmètre que la suppression existante —
-- l'émetteur seulement (Super Admin pour une annonce plateforme, la
-- station pour la sienne).
drop policy if exists "announcements_update" on public.announcements;
create policy "announcements_update" on public.announcements for update using (
  app_role() = 'super_admin' or station_id = current_station_id()
) with check (
  app_role() = 'super_admin' or station_id = current_station_id()
);
