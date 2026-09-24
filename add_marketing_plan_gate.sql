-- Annonces aux clients et publicité : à partir de l'offre Pro (24 septembre 2026).
--
-- Une station Starter ne peut plus ni envoyer d'annonce à ses clients
-- (announcements, scope 'station_to_clients') ni passer de publicité payante
-- (station_ads). Pro et Station de service (clé 'Business') le peuvent.
-- Ce qui a déjà été envoyé ou payé reste en place (aucune station Starter
-- n'en avait au moment du changement) ; retirer une annonce reste possible.
-- La plateforme (Super Admin -> stations) n'est pas concernée.
--
-- À jouer après add_announcements.sql et add_station_ads.sql. Rejouable sans risque.

create or replace function public.station_has_marketing(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.station_billing sb
    where sb.station_id = sid and sb.plan in ('Pro', 'Business')
  );
$$;
revoke all on function public.station_has_marketing(uuid) from public, anon;
grant execute on function public.station_has_marketing(uuid) to authenticated;

-- Même règle qu'avant, plus l'offre pour les annonces d'une station.
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert
  with check (
    (scope = 'platform_to_stations' and public.app_role() = 'super_admin')
    or (scope = 'station_to_clients' and station_id = public.current_station_id()
        and public.station_has_marketing(station_id))
  );

drop policy if exists station_ads_insert on public.station_ads;
create policy station_ads_insert on public.station_ads for insert
  with check (station_id = public.current_station_id() and public.station_has_marketing(station_id));
