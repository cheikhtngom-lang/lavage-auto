-- ══════════════════════════════════════════════════════════════════════
-- Suppression différée des colonnes du calcul retiré (2026-10-11)
--
-- Suite de revert_queue_forecast.sql : stations.wash_bays et
-- reservations.forecast_start_at ne servent plus, mais un onglet resté
-- ouvert sur la version retirée les lisait/écrivait encore. Leur suppression
-- est donc programmée la nuit suivante (12 octobre 2026, 03:00 GMT = heure
-- de Dakar, stations fermées), par une tâche pg_cron unique qui se retire
-- elle-même après son passage.
--
-- Suivi : select * from cron.job_run_details
--          where jobid = (select jobid from cron.job where jobname = 'drop-queue-forecast-columns');
-- (la ligne de cron.job disparaît après le passage : consulter plutôt
--  information_schema.columns pour vérifier que les colonnes n'existent plus).
--
-- Idempotent : peut être relancé sans risque.
-- ══════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from cron.job where jobname = 'drop-queue-forecast-columns') then
    perform cron.unschedule('drop-queue-forecast-columns');
  end if;
  perform cron.schedule('drop-queue-forecast-columns', '0 3 12 10 *', $job$
    alter table public.reservations drop column if exists forecast_start_at;
    alter table public.stations drop constraint if exists stations_wash_bays_check;
    alter table public.stations drop column if exists wash_bays;
    select cron.unschedule('drop-queue-forecast-columns');
  $job$);
end $$;
