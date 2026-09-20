-- ══════════════════════════════════════════════════════════════════════
-- Annonces de station — public visé (audience) : à exécuter une fois dans
-- l'éditeur SQL Supabase. Idempotent (rejouable sans risque).
--
-- Une annonce d'une station à ses clients (scope 'station_to_clients') a
-- maintenant trois publics possibles :
--   • audience = 'all' (défaut)  TOUS les clients qui ont déjà réservé chez la
--     station via le site — abonnés ou non — ainsi que ses abonnés et les
--     clients qui l'ont en favori (règle historique, inchangée).
--   • audience = 'subscribers'   UNIQUEMENT les clients qui ont un abonnement
--     mensuel ACTIF chez la station (station_client_subscriptions.status =
--     'actif'). Contrôlé par la base : un non-abonné ne peut pas lire cette
--     annonce, même en interrogeant l'API directement.
--   • target_client_ids renseigné  une sélection précise de clients (inchangé,
--     voir add_announcement_targeting.sql) — audience reste alors 'all'.
--
-- Comme pour le prélèvement de l'abonnement (deduct_subscription_balance,
-- recreate_subscriptions.sql), un abonné est reconnu par son compte
-- (client_id) OU, à défaut, par son numéro de téléphone (chiffres seuls) : une
-- station saisit souvent l'abonné à la main avant qu'il ne crée son compte.
--
-- ATTENTION : ce fichier redéfinit la policy `announcements_select` dans sa
-- version COMPLÈTE (plateforme + ciblage clients + audience). Ne pas rejouer
-- add_announcement_retire.sql / add_announcement_targeting.sql APRÈS celui-ci :
-- leurs versions de la policy sont plus anciennes et l'écraseraient.
-- ══════════════════════════════════════════════════════════════════════

alter table public.announcements add column if not exists audience text not null default 'all';

alter table public.announcements drop constraint if exists announcements_audience_ck;
alter table public.announcements add constraint announcements_audience_ck check (
  audience in ('all', 'subscribers')
  and (audience = 'all' or (scope = 'station_to_clients' and target_client_ids is null))
);

-- Le client connecté a-t-il un abonnement ACTIF chez cette station ?
create or replace function public.client_has_active_subscription(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
      from public.station_client_subscriptions s
     where s.station_id = sid
       and s.status = 'actif'
       and (
         s.client_id = auth.uid()
         or (
           length(regexp_replace(coalesce(s.client_phone, ''), '\D', '', 'g')) > 0
           and regexp_replace(s.client_phone, '\D', '', 'g') = regexp_replace(
                 coalesce((select p.phone from public.profiles p where p.id = auth.uid()), ''), '\D', '', 'g')
         )
       )
  );
$$;
grant execute on function public.client_has_active_subscription(uuid) to authenticated;

drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements for select using (
  app_role() = 'super_admin'
  or (
    scope = 'platform_to_stations' and current_station_id() is not null and active
    and (target_station_id is null or target_station_id = current_station_id())
  )
  or (scope = 'station_to_clients' and (
    -- la station émettrice voit tout son historique (actif ou retiré, tout public)
    station_id = current_station_id()
    or (
      active and (
        (
          audience = 'all'
          -- un abonné actif compte comme client de la station, même sans réservation
          and (public.client_knows_station_for_announcements(station_id) or public.client_has_active_subscription(station_id))
          and (target_client_ids is null or auth.uid() = any(target_client_ids))
        )
        or (audience = 'subscribers' and public.client_has_active_subscription(station_id))
      )
    )
  ))
);
