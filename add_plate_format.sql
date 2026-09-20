-- ══════════════════════════════════════════════════════════════════════
-- Format unique des plaques d'immatriculation — à exécuter une fois dans
-- l'éditeur SQL Supabase. Idempotent (rejouable sans risque).
--
-- Règle (miroir de src/lib/plateFormat.js) : lettres en majuscules, un tiret
-- à chaque passage lettres <-> chiffres, comme les plaques sénégalaises :
--   aa189ds -> AA-189-DS        AA186ER -> AA-186-ER        dk 9875 pm -> DK-9875-PM
--
-- 1. public.format_plate(text)  : la règle, réutilisable.
-- 2. Trigger sur `vehicles`     : toute plaque écrite (site, API directe) est
--                                 corrigée automatiquement à l'enregistrement.
-- 3. Rattrapage                 : corrige les plaques déjà en base.
--
-- find_vehicle_owner() (add_plate_lookup.sql) compare les plaques SANS
-- ponctuation : la reconnaissance d'un client par sa plaque n'est pas affectée.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.format_plate(p text)
returns text
language sql immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        left(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), 14),
        '([A-Z])([0-9])', '\1-\2', 'g'),
      '([0-9])([A-Z])', '\1-\2', 'g'),
    '');
$$;

create or replace function public.vehicles_format_plate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.plate := public.format_plate(new.plate);
  return new;
end;
$$;

drop trigger if exists vehicles_format_plate on public.vehicles;
create trigger vehicles_format_plate
  before insert or update of plate on public.vehicles
  for each row execute function public.vehicles_format_plate();

-- Rattrapage des plaques existantes (ne touche que celles qui changent).
update public.vehicles
   set plate = public.format_plate(plate)
 where plate is distinct from public.format_plate(plate);
