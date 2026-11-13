-- ══════════════════════════════════════════════════════════════════════
-- Offre « Pressing » (pressing seul, sans lavage auto) et modules facturés
-- au renouvellement — demande du 13/11/2026.
--
-- 1. Nouvelle offre de base 'Pressing' à 15 000 F/mois (table plans) : un
--    pressing qui ne lave pas de voitures. Son espace s'ouvre sur la rubrique
--    Pressing ; les rubriques du lavage auto sont masquées (lib/adminNav.js).
--    Le module mod_pressing est compris dans l'offre (ajouté tout seul).
-- 2. Un pressing n'apparaît pas dans l'annuaire des stations de lavage :
--    stations.business_type ('lavage' | 'pressing'), lisible par tous, tenu à
--    jour depuis l'offre de la station.
-- 3. Une station de lavage qui ajoute le Pressing paie 10 000 F de plus :
--    jusqu'ici le paiement en ligne ne facturait que l'offre (table plans),
--    les modules jamais. Désormais le montant = offre + modules payants
--    actifs (table module_prices), sauf les modules compris dans l'offre
--    (Station de service : vidange, bilan, boutique ; Pressing : pressing)
--    et ceux que le Super Admin offre (station_billing.free_modules).
--    Restent offerts : les options actives avant ce script (Vedette, Rappels…,
--    jamais facturées en ligne) et Tapis / Chaussures pour les stations qui en
--    avaient déjà des dépôts. Salon et Pressing (lancés le 13/11) sont facturés.
--    Le Super Admin coche ou décoche « Offert » station par station.
--
-- À exécuter après add_salon_pressing.sql. Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. L'offre Pressing ───────────────────────────────────────────────
insert into public.plans (key, label, price) values ('Pressing', 'Pressing', 15000)
on conflict (key) do nothing;

-- ─── 2. Prix des modules (copie de src/lib/stationModules.js) ──────────
create table if not exists public.module_prices (
  key text primary key,
  label text not null,
  price integer not null check (price >= 0)
);
alter table public.module_prices enable row level security;
drop policy if exists "module_prices_select" on public.module_prices;
create policy "module_prices_select" on public.module_prices for select using (true);
drop policy if exists "module_prices_write" on public.module_prices;
create policy "module_prices_write" on public.module_prices for all
  using (app_role() = 'super_admin') with check (app_role() = 'super_admin');
insert into public.module_prices (key, label, price) values
  ('mod_tapis', 'Tapis et moquettes', 5000),
  ('mod_chaussures', 'Chaussures', 3000),
  ('mod_salon', 'Salon', 5000),
  ('mod_pressing', 'Pressing', 10000),
  ('mod_vidange', 'Vidange', 8000),
  ('mod_bilan', 'Bilan d''activité', 8000),
  ('mod_boutique', 'Boutique', 10000),
  ('mod_vedette', 'Station en Vedette', 5000),
  ('mod_fidelite_plus', 'Fidélité Avancée', 8000),
  ('mod_rappels', 'Rappels automatiques', 10000),
  ('mod_support', 'Support Prioritaire', 15000),
  ('mod_api', 'Accès API externe', 25000)
on conflict (key) do nothing;

-- ─── 3. Modules offerts ────────────────────────────────────────────────
alter table public.station_billing add column if not exists free_modules text[] not null default '{}';
-- Une seule fois (la colonne vient d'être créée vide) : les options actives
-- n'ont jamais été facturées en ligne, elles restent offertes ; Tapis et
-- Chaussures aussi pour les stations qui en avaient des dépôts. Salon et
-- Pressing, lancés le 13/11/2026, sont facturés.
do $$
begin
  if not exists (select 1 from public.station_billing where coalesce(array_length(free_modules, 1), 0) > 0) then
    update public.station_billing b
       set free_modules = coalesce((
             select array_agg(m order by m) from unnest(b.active_modules) m
              where m not in ('mod_tapis', 'mod_chaussures', 'mod_salon', 'mod_pressing')
                 or (m in ('mod_tapis', 'mod_chaussures') and exists (
                       select 1 from public.carpet_orders c
                        where (c.station_id = b.station_id or c.from_station_id = b.station_id)
                          and c.activity = substr(m, 5)))
           ), '{}')
     where coalesce(array_length(b.active_modules, 1), 0) > 0;
  end if;
end $$;

-- Modules compris dans une offre (jamais facturés en plus).
create or replace function public.plan_included_modules(p_plan text)
returns text[]
language sql
immutable
as $$
  select case p_plan
    when 'Business' then array['mod_vidange', 'mod_bilan', 'mod_boutique']
    when 'Pressing' then array['mod_pressing']
    else '{}'::text[]
  end;
$$;

-- ─── 4. L'offre Pressing comprend le module Pressing ; type de station ─
alter table public.stations add column if not exists business_type text not null default 'lavage';
do $$
begin
  alter table public.stations add constraint stations_business_type_check check (business_type in ('lavage', 'pressing'));
exception when duplicate_object then null;
end $$;

create or replace function public.station_billing_plan_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Jamais deux fois le même module (il serait facturé deux fois).
  new.active_modules := coalesce((select array_agg(distinct m) from unnest(coalesce(new.active_modules, '{}')) m), '{}');
  if new.plan = 'Pressing' and not ('mod_pressing' = any (coalesce(new.active_modules, '{}'))) then
    new.active_modules := coalesce(new.active_modules, '{}') || 'mod_pressing';
  end if;
  -- Un module retiré n'est plus offert.
  new.free_modules := coalesce((select array_agg(m) from unnest(coalesce(new.free_modules, '{}')) m where m = any (coalesce(new.active_modules, '{}'))), '{}');
  update public.stations
     set business_type = case when new.plan = 'Pressing' then 'pressing' else 'lavage' end
   where id = new.station_id
     and business_type is distinct from case when new.plan = 'Pressing' then 'pressing' else 'lavage' end;
  return new;
end;
$$;
drop trigger if exists station_billing_plan_sync on public.station_billing;
create trigger station_billing_plan_sync
  before insert or update of plan, active_modules, free_modules on public.station_billing
  for each row execute function public.station_billing_plan_sync();

-- Une station ne change pas son type elle-même (il suit l'offre).
create or replace function public.stations_keep_business_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') and coalesce(app_role(), '') <> 'super_admin' then
    new.business_type := old.business_type;
  end if;
  return new;
end;
$$;
drop trigger if exists stations_keep_business_type on public.stations;
create trigger stations_keep_business_type
  before update of business_type on public.stations
  for each row execute function public.stations_keep_business_type();

-- La fonction du trigger de facturation écrit stations.business_type en
-- tant que propriétaire (security definer) : current_user = postgres.

-- Rattrapage des stations déjà en offre Pressing (aucune a priori).
update public.station_billing set plan = plan where plan = 'Pressing';

-- ─── 5. Montant d'un renouvellement : offre + modules payants ──────────
create or replace function public.station_subscription_amount(p_station_id uuid, p_plan text default null)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.station_billing%rowtype;
  v_plan text;
  v_base integer;
  v_modules integer;
begin
  -- (security definer : current_user vaut toujours le propriétaire, on ne
  -- peut donc se fier qu'à la station et au rôle du compte connecté)
  if p_station_id is distinct from current_station_id()
     and coalesce(app_role(), '') <> 'super_admin' then
    raise exception 'Accès refusé';
  end if;
  select * into b from public.station_billing where station_id = p_station_id;
  if b.station_id is null then raise exception 'Station introuvable'; end if;
  v_plan := coalesce(nullif(trim(p_plan), ''), b.plan);
  select price into v_base from public.plans where key = v_plan;
  if v_base is null then raise exception 'Offre inconnue'; end if;
  select coalesce(sum(mp.price), 0) into v_modules
    from (select distinct unnest(coalesce(b.active_modules, '{}')) as m) x
    join public.module_prices mp on mp.key = x.m
   where not (x.m = any (coalesce(b.free_modules, '{}')))
     and not (x.m = any (public.plan_included_modules(v_plan)));
  -- Passer à l'offre Pressing : le module Pressing y est compris.
  return v_base + v_modules;
end;
$$;
revoke all on function public.station_subscription_amount(uuid, text) from public, anon;
grant execute on function public.station_subscription_amount(uuid, text) to authenticated;

-- ─── 6. Le module Pressing suit aussi l'offre côté base ────────────────
create or replace function public.station_has_activity(p_station_id uuid, p_activity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.station_billing b
     where b.station_id = p_station_id
       and (('mod_' || p_activity) = any (coalesce(b.active_modules, '{}'))
            or (p_activity = 'pressing' and b.plan = 'Pressing'))
  );
$$;

notify pgrst, 'reload schema';
