-- ══════════════════════════════════════════════════════════════════════
-- Conversion automobiliste -> station, en self-service depuis Paramètres.
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent (create or
-- replace + grant).
--
-- Pourquoi un RPC plutôt que 2 requêtes côté client (insert stations +
-- update profiles), comme le fait déjà createStationAccount() pour une
-- INSCRIPTION classique (src/lib/accounts.js) ?
--   - profiles_update n'a pas de clause WITH CHECK dédiée (voir schema.sql) :
--     un utilisateur peut aujourd'hui mettre à jour SA propre ligne
--     `profiles` avec n'importe quel `station_id`/`role`, y compris ceux
--     d'une station existante. C'est sans risque pour l'inscription (créée
--     par le même flux, dans la même transaction logique) mais on ne veut
--     surtout pas ouvrir cette même porte à un compte automobiliste déjà
--     actif : ce RPC (SECURITY DEFINER) fait tout de façon atomique et ne
--     lie jamais le profil qu'à la station qu'il vient lui-même de créer.
--   - Garantit qu'un compte automobiliste ne peut se convertir qu'une seule
--     fois (vérifie role = 'automobiliste' avant toute écriture).
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.convert_account_to_station(
  p_name text,
  p_address text default '',
  p_quartier text default '',
  p_region text default '',
  p_phone text default '',
  p_lat double precision default null,
  p_lng double precision default null,
  p_plan text default null
)
returns public.stations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_station public.stations;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null then
    raise exception 'Profil introuvable.';
  end if;
  if v_profile.role <> 'automobiliste' then
    raise exception 'Seul un compte automobiliste peut être transformé en station.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Le nom de la station est requis.';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where key = p_plan) then
    raise exception 'Offre inconnue.';
  end if;

  insert into public.stations (
    created_by, name, owner_name, owner_email, owner_phone,
    address, quartier, region, lat, lng, status
  ) values (
    auth.uid(), trim(p_name), v_profile.full_name, v_profile.email,
    coalesce(nullif(trim(p_phone), ''), v_profile.phone),
    coalesce(p_address, ''), coalesce(p_quartier, ''), coalesce(p_region, ''),
    p_lat, p_lng,
    -- Même choix que createStationAccount() : visible immédiatement dans
    -- l'annuaire public, pas de validation manuelle préalable.
    'active'
  )
  returning * into v_station;

  -- handle_new_station() (voir add_station_trial.sql / change_trial_to_15_days.sql)
  -- vient de créer la ligne station_billing avec plan='Starter' + essai daté — on applique
  -- ensuite l'offre réellement choisie si elle diffère du défaut.
  if p_plan is not null then
    update public.station_billing set plan = p_plan where station_id = v_station.id;
  end if;

  -- Bascule le compte : l'espace automobiliste (véhicules, favoris...) reste
  -- en base mais n'est plus accessible avec ce compte, redevenu un compte
  -- station (role='admin', 1 seul par station — voir one_admin_per_station).
  update public.profiles
  set role = 'admin', station_id = v_station.id
  where id = auth.uid();

  return v_station;
end;
$$;

grant execute on function public.convert_account_to_station(text, text, text, text, text, double precision, double precision, text) to authenticated;
