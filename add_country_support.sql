-- ══════════════════════════════════════════════════════════════════════
-- Extension à l'Afrique de l'Ouest (zone FCFA francophone) — socle « pays ».
--
--  1. stations.country : pays de la station (code ISO 3166-1 alpha-2, ex.
--     'SN', 'CI'). Défaut 'SN' : toutes les stations existantes restent au
--     Sénégal sans aucune migration de données. Les régions ('dakar',
--     'abidjan'…) restent dans stations.region, validées côté application
--     par le registre src/lib/countries.js (pays → régions).
--  2. profiles.country : dernier pays choisi à la main par un automobiliste
--     (repli quand la détection automatique échoue — voir src/lib/userCountry.js).
--  3. platform_countries : quels pays sont OUVERTS aux clients. Une station
--     peut s'inscrire dans n'importe quel pays déclaré dans le registre
--     (recrutement des stations pilotes) ; tant que le pays n'est pas ouvert
--     ici, un client qui s'y trouve voit « pas encore disponible dans votre
--     pays ». Lecture publique (les pages anonymes en ont besoin), écriture
--     Super Admin (interrupteur dans Super Admin > Paramètres).
--  4. convert_account_to_station : nouveau paramètre p_country (défaut 'SN').
--     L'ancienne signature est supprimée avant : sinon les deux surcharges
--     coexisteraient et un appel sans p_country serait ambigu.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Pays des stations ──────────────────────────────────────────────
alter table public.stations add column if not exists country text not null default 'SN';
alter table public.stations drop constraint if exists stations_country_format;
alter table public.stations add constraint stations_country_format check (country ~ '^[A-Z]{2}$');
create index if not exists stations_country_status_idx on public.stations (country, status);

-- ─── 2. Dernier pays choisi par un compte ──────────────────────────────
alter table public.profiles add column if not exists country text;
alter table public.profiles drop constraint if exists profiles_country_format;
alter table public.profiles add constraint profiles_country_format check (country is null or country ~ '^[A-Z]{2}$');

-- ─── 3. Pays ouverts aux clients ───────────────────────────────────────
create table if not exists public.platform_countries (
  code       text primary key check (code ~ '^[A-Z]{2}$'),
  open       boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Pays déclarés dans src/lib/countries.js : seul le Sénégal est ouvert au départ.
insert into public.platform_countries (code, open) values
  ('SN', true), ('CI', false), ('ML', false), ('BF', false), ('BJ', false), ('TG', false), ('NE', false)
on conflict (code) do nothing;

alter table public.platform_countries enable row level security;
grant select on public.platform_countries to anon, authenticated;

drop policy if exists "platform_countries_select" on public.platform_countries;
create policy "platform_countries_select" on public.platform_countries for select using (true);

drop policy if exists "platform_countries_insert" on public.platform_countries;
create policy "platform_countries_insert" on public.platform_countries for insert
  with check (app_role() = 'super_admin');

drop policy if exists "platform_countries_update" on public.platform_countries;
create policy "platform_countries_update" on public.platform_countries for update
  using (app_role() = 'super_admin') with check (app_role() = 'super_admin');

-- ─── 4. Conversion automobiliste -> station : ajout du pays ────────────
drop function if exists public.convert_account_to_station(text, text, text, text, text, double precision, double precision, text);

create or replace function public.convert_account_to_station(
  p_name text,
  p_address text default '',
  p_quartier text default '',
  p_region text default '',
  p_phone text default '',
  p_lat double precision default null,
  p_lng double precision default null,
  p_plan text default null,
  p_country text default 'SN'
)
returns public.stations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_station public.stations;
  v_country text := upper(coalesce(nullif(trim(p_country), ''), 'SN'));
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
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'Pays invalide.';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where key = p_plan) then
    raise exception 'Offre inconnue.';
  end if;

  insert into public.stations (
    created_by, name, owner_name, owner_email, owner_phone,
    address, quartier, region, country, lat, lng, status
  ) values (
    auth.uid(), trim(p_name), v_profile.full_name, v_profile.email,
    coalesce(nullif(trim(p_phone), ''), v_profile.phone),
    coalesce(p_address, ''), coalesce(p_quartier, ''), coalesce(p_region, ''), v_country,
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

grant execute on function public.convert_account_to_station(text, text, text, text, text, double precision, double precision, text, text) to authenticated;
