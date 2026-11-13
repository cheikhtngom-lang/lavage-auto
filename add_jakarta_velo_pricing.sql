-- ══════════════════════════════════════════════════════════════════════
-- Deux-roues : Jakarta et Vélo, avec leur propre prix (demande des stations,
-- 13/11/2026). Comme la moto, une seule prestation : « Lavage Complet ».
--
-- Valeurs par défaut (lib/washDefaults.js) : Jakarta 1 500 F / 15 min,
-- Vélo 1 000 F / 10 min. Chaque station les change dans Paramètres >
-- Grille tarifaire et Temps estimés.
--
-- 1. Les stations qui ont déjà leur grille (lignes dans wash_pricing) reçoivent
--    les deux lignes manquantes, aux valeurs par défaut — sans toucher à une
--    ligne existante.
-- 2. reservation_duration_minutes (add_closing_waitlist.sql) connaît leurs
--    durées par défaut, pour une station sans grille.
--
-- Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Lignes manquantes des stations qui ont une grille ──────────────
insert into public.wash_pricing (station_id, category, service, price, duration_minutes)
select s.station_id, v.category, 'Lavage Complet', v.price, v.duration_minutes
  from (select distinct station_id from public.wash_pricing) s
  cross join (values ('Jakarta', 1500, 15), ('Vélo', 1000, 10)) as v(category, price, duration_minutes)
on conflict (station_id, category, service) do nothing;

-- ─── 2. Durée par défaut (même règle que l'appli) ──────────────────────
create or replace function public.reservation_duration_minutes(p_station uuid, p_category text, p_service text)
returns numeric
language sql stable
set search_path = public
as $$
  select case
    when exists (select 1 from public.wash_pricing wp where wp.station_id = p_station) then
      coalesce((select wp.duration_minutes from public.wash_pricing wp
                 where wp.station_id = p_station and wp.category = p_category and wp.service = p_service
                 limit 1), 30)
    else coalesce(case p_category
      when 'Moto' then case p_service when 'Lavage Complet' then 20 end
      when 'Jakarta' then case p_service when 'Lavage Complet' then 15 end
      when 'Vélo' then case p_service when 'Lavage Complet' then 10 end
      when 'Particulier' then case p_service when 'Lavage Simple' then 15 when 'Lavage Complet' then 30 when 'Lavage Moteur' then 25 end
      when 'Transport' then case p_service when 'Lavage Simple' then 20 when 'Lavage Complet' then 40 when 'Lavage Moteur' then 35 end
      when 'Camion' then case p_service when 'Lavage Simple' then 30 when 'Lavage Complet' then 45 when 'Lavage Moteur' then 40 end
    end, 30)
  end::numeric;
$$;

notify pgrst, 'reload schema';
