-- ══════════════════════════════════════════════════════════════════════
-- Annonces — ciblage :
--   • 'platform_to_stations' : le Super Admin peut viser UNE station
--     précise (target_station_id) au lieu de diffuser à toutes.
--   • 'station_to_clients' : une station peut viser des clients précis
--     (target_client_ids) au lieu de diffuser à tous ceux qui la
--     connaissent — avec un raccourci "tous les abonnés" côté app (voir
--     station_known_clients() ci-dessous, utilisée pour peupler le
--     sélecteur de destinataires).
--
-- target_station_id / target_client_ids NULL = comportement inchangé
-- (diffusion large, comme avant cette migration).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

alter table public.announcements add column if not exists target_station_id uuid references public.stations(id) on delete cascade;
alter table public.announcements add column if not exists target_client_ids uuid[];

alter table public.announcements drop constraint if exists announcements_target_scope_ck;
alter table public.announcements add constraint announcements_target_scope_ck check (
  (scope = 'platform_to_stations' or target_station_id is null)
  and (scope = 'station_to_clients' or target_client_ids is null)
);

-- Lecture : un destinataire ne voit l'annonce que si elle n'est pas ciblée,
-- ou s'il fait partie de la cible. L'émetteur (Super Admin / la station
-- elle-même) continue de voir tout son historique sans filtre de ciblage.
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select using (
  app_role() = 'super_admin'
  or (
    scope = 'platform_to_stations' and current_station_id() is not null and active
    and (target_station_id is null or target_station_id = current_station_id())
  )
  or (scope = 'station_to_clients' and (
    station_id = current_station_id()
    or (
      active
      and public.client_knows_station_for_announcements(station_id)
      and (target_client_ids is null or auth.uid() = any(target_client_ids))
    )
  ))
);

-- ── Clients "connus" d'une station, pour peupler le sélecteur de
-- destinataires (abonnés avec compte + clients ayant réservé, dédupliqués).
-- Auto-scopée à l'appelant (current_station_id()) — aucun paramètre, donc
-- rien à usurper. Un client sans compte (station_client_subscriptions.
-- client_id encore null, cf. add_station_shop/station_subscriptions.sql)
-- n'a pas de clochette et ne peut donc pas être ciblé — exclu ici.
create or replace function public.station_known_clients()
returns table(client_id uuid, client_name text, client_phone text, is_subscriber boolean, subscription_status text)
language sql security definer stable
set search_path = public
as $$
  select distinct on (c.client_id)
    c.client_id, c.client_name, c.client_phone, c.is_subscriber, c.subscription_status
  from (
    select client_id, client_name, client_phone, true as is_subscriber, status as subscription_status, created_at
    from public.station_client_subscriptions
    where station_id = current_station_id() and client_id is not null
    union all
    select client_id, client_name, null::text, false, null::text, created_at
    from public.reservations
    where station_id = current_station_id() and client_id is not null
  ) c
  order by c.client_id, c.is_subscriber desc, c.created_at desc;
$$;
grant execute on function public.station_known_clients() to authenticated;
