-- ══════════════════════════════════════════════════════════════════════
-- Essai gratuit des stations : 15 jours au lieu d'1 mois.
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent (create or
-- replace).
--
-- Ne concerne que les NOUVELLES stations (créées après l'exécution) : les
-- stations déjà en essai gardent leur `trial_ends_at` actuel — les raccourcir
-- rétroactivement couperait l'accès de stations à qui on avait promis un mois.
--
-- Reprend la version fusionnée de handle_new_station() définie dans
-- add_station_team.sql (essai daté + semis des rôles catalogue) : ne remplacez
-- pas celle d'add_station_trial.sql, qui ne sème pas les rôles.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_station()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.station_billing (station_id, trial_ends_at)
    values (new.id, now() + interval '15 days');
  perform public.seed_builtin_station_roles(new.id);
  return new;
end;
$$;
-- (le trigger on_station_created existe déjà et pointe sur cette fonction)
