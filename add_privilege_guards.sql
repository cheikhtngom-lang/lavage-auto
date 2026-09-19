-- ══════════════════════════════════════════════════════════════════════
-- VERROUS SERVEUR — correctif de sécurité (audit du 19/09/2026).
--
-- Problème : les règles RLS de modification (UPDATE) de `profiles` et `stations`
-- n'ont pas de WITH CHECK dédié : Postgres réapplique alors la clause USING
-- (« c'est bien MA ligne »), qui ne dit rien sur QUELLES colonnes on modifie.
-- Résultat, avec le simple jeton d'un compte connecté (API REST directe, sans
-- passer par l'interface) :
--   • un automobiliste pouvait faire  PATCH /profiles?id=eq.<lui>  {"role":"super_admin"}
--     et devenir Super Admin (accès à toutes les stations et à tous les clients) ;
--     ou pointer son `station_id` vers la station d'un autre pour en prendre la main ;
--   • une station suspendue pouvait remettre elle-même  stations.status = 'active' ;
--   • un client pouvait s'insérer un abonnement Super User / une station une pub
--     directement en statut ACTIVE, sans payer (l'interface n'envoie que PENDING,
--     mais le serveur acceptait tout).
--
-- Correctif : des triggers qui, pour les appels venant de l'API avec un compte
-- (rôle Postgres « authenticated » ou « anon ») qui n'est PAS Super Admin :
--   1. interdisent de changer profiles.role / profiles.station_id ;
--   2. interdisent de changer stations.status / stations.created_by ;
--   3. forcent le statut PENDING (et vident les dates de confirmation) à la création
--      d'un abonnement Super User, d'une publicité ou d'un paiement de renouvellement.
--
-- Ne sont PAS concernés (current_user différent) : les fonctions SECURITY DEFINER
-- (ex. convert_account_to_station), les Edge Functions (clé service_role — paiements
-- PayDunya, invitations…), l'éditeur SQL Supabase, et le Super Admin connecté.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. profiles : role et station_id figés ────────────────────────────
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    if new.role is distinct from old.role or new.station_id is distinct from old.station_id then
      raise exception 'Modification interdite : le rôle et la station d''un compte ne peuvent pas être changés depuis l''application.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ─── 2. stations : status et created_by figés ──────────────────────────
create or replace function public.guard_station_privileged_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    if new.status is distinct from old.status or new.created_by is distinct from old.created_by then
      raise exception 'Modification interdite : le statut d''une station est réservé à l''administration de la plateforme.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_station_privileged_columns on public.stations;
create trigger guard_station_privileged_columns
  before update on public.stations
  for each row execute function public.guard_station_privileged_columns();

-- ─── 3. Paiements en attente : création toujours en PENDING ────────────
-- jsonb_populate_record ignore les clés que la table n'a pas (starts_at n'existe
-- pas partout) : une seule fonction sert les trois tables.
create or replace function public.guard_pending_only_insert()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    new := jsonb_populate_record(
      new,
      jsonb_build_object('status', 'PENDING', 'confirmed_at', null, 'starts_at', null, 'expires_at', null)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists guard_pending_only_insert on public.super_user_subscriptions;
create trigger guard_pending_only_insert
  before insert on public.super_user_subscriptions
  for each row execute function public.guard_pending_only_insert();

drop trigger if exists guard_pending_only_insert on public.station_ads;
create trigger guard_pending_only_insert
  before insert on public.station_ads
  for each row execute function public.guard_pending_only_insert();

drop trigger if exists guard_pending_only_insert on public.station_renewal_payments;
create trigger guard_pending_only_insert
  before insert on public.station_renewal_payments
  for each row execute function public.guard_pending_only_insert();
