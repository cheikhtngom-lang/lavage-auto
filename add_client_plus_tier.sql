-- ══════════════════════════════════════════════════════════════════════
-- 3e palier automobiliste « Plus » (2 500 FCFA/mois, jusqu'à 5 véhicules)
-- entre l'offre Gratuite (2 véhicules) et Super User (illimité, 5000 FCFA/mois)
-- — à exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- Remplace is_super_user() (booléen) par client_vehicle_cap() (entier), qui
-- renvoie le plafond de véhicules RÉEL de l'automobiliste selon son plan —
-- même principe de vérification serveur que l'ancienne fonction (voir
-- vehicles_insert plus bas), juste plus granulaire pour supporter 3 paliers
-- au lieu de 2. Les abonnements ACTIVE existants (tous payés 5000 FCFA avant
-- ce palier) prennent plan='SUPER_USER' par défaut — donc restent illimités,
-- aucune rétrogradation silencieuse.
-- ══════════════════════════════════════════════════════════════════════

alter table public.super_user_subscriptions
  add column if not exists plan text not null default 'SUPER_USER' check (plan in ('PLUS', 'SUPER_USER'));

create or replace function public.client_vehicle_cap(uid uuid)
returns integer
language sql security definer stable
set search_path = public
as $$
  select coalesce(
    (select case when plan = 'PLUS' then 5 else 999999 end
     from public.super_user_subscriptions
     where client_id = uid and status = 'ACTIVE' and expires_at > now()
     order by created_at desc limit 1),
    2
  );
$$;

drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert" on public.vehicles for insert
  with check (
    owner_id = auth.uid()
    and (select count(*) from public.vehicles v where v.owner_id = auth.uid()) < public.client_vehicle_cap(auth.uid())
  );

drop function if exists public.is_super_user(uuid);
