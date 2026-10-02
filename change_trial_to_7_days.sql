-- ══════════════════════════════════════════════════════════════════════
-- Essai gratuit des stations : 7 jours au lieu de 15 (2026-10-02).
-- Idempotent (create or replace). Remplace change_trial_to_15_days.sql.
--
-- Ne concerne que les NOUVELLES stations (créées après l'exécution) : les
-- stations déjà en essai gardent leur `trial_ends_at` actuel (15 ou 30
-- jours) — les raccourcir rétroactivement couperait l'accès de stations à
-- qui les CGU en vigueur à leur inscription promettaient 15 jours. La barre
-- d'essai calcule la durée réellement accordée (lib/stationTrial.js).
--
-- Même corps que la version en production (essai daté + semis des rôles
-- catalogue, fusion d'add_station_team.sql) : seul l'intervalle change. Ne
-- jamais rejouer la version d'add_station_trial.sql, qui ne sème pas les rôles.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_station()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.station_billing (station_id, trial_ends_at)
    values (new.id, now() + interval '7 days');
  perform public.seed_builtin_station_roles(new.id);
  return new;
end;
$$;
-- (le trigger on_station_created existe déjà et pointe sur cette fonction)
