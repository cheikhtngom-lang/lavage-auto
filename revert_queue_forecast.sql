-- ══════════════════════════════════════════════════════════════════════
-- Retour à l'ancien temps d'attente (2026-10-11)
--
-- Le calcul « premier laveur libéré » (add_queue_forecast.sql, appliqué
-- puis retiré le même jour à la demande de l'exploitant) est annulé : le
-- temps d'attente redevient la somme du reste des lavages en cours + la
-- durée de chaque véhicule en file, côté appli comme côté serveur (liste
-- d'attente avant fermeture).
--
-- Remet les fonctions EXACTEMENT comme add_closing_waitlist.sql et
-- supabase/schema.sql les définissent, puis supprime les fonctions et l'index ajoutés par
-- add_queue_forecast.sql (colonnes laissées pour l'instant, voir section 3).
--
-- Idempotent : peut être relancé sans risque.
-- ══════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Fonctions de la liste d'attente (add_closing_waitlist.sql) ─────
create or replace function public.station_queue_minutes(p_station uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(
    case when r.status = 'en_cours' then
      -- Temps RÉELLEMENT restant (durée − temps écoulé), comme l'appli.
      greatest(0, d.m - coalesce(extract(epoch from (now() - r.started_at)) / 60, d.m / 2))
    else d.m end
  ), 0)
  from public.reservations r
  cross join lateral (select public.reservation_duration_minutes(r.station_id, r.category, r.service) as m) d
  where r.station_id = p_station and r.status in ('attente', 'en_cours');
$$;

create or replace function public.check_closing_capacity(p_station uuid, p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_close timestamptz := public.station_closing_at(p_station);
  v_minutes numeric := public.station_queue_minutes(p_station);
  v_fits jsonb := '[]'::jsonb;
  v_item jsonb;
  v_dur numeric;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_dur := public.reservation_duration_minutes(p_station, v_item->>'category', v_item->>'service');
    if v_close is null or now() + ((v_minutes + v_dur) * interval '1 minute') <= v_close then
      v_minutes := v_minutes + v_dur;  -- ce véhicule occupera la file
      v_fits := v_fits || 'true'::jsonb;
    else
      v_fits := v_fits || 'false'::jsonb;
    end if;
  end loop;
  return jsonb_build_object('closing_at', v_close, 'queue_minutes', public.station_queue_minutes(p_station), 'fits', v_fits);
end;
$$;
grant execute on function public.check_closing_capacity(uuid, jsonb) to anon, authenticated;

create or replace function public.reservation_closing_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'liste_attente' then
    if coalesce(new.paid, false) then
      raise exception 'Une réservation en liste d''attente se règle sur place.';
    end if;
    new.waitlisted_at := coalesce(new.waitlisted_at, now());
    return new;
  end if;

  -- Réservation EN LIGNE d'un automobiliste pour lui-même, non payée
  -- (paiement sur place). Une saisie de la station (client de passage,
  -- éventuellement relié par sa plaque) n'est jamais concernée : le gérant
  -- décide seul. Une réservation déjà payée (Wave/OM via PayDunya,
  -- abonnement) n'est pas rétrogradée non plus : l'appli vérifie la place
  -- AVANT de proposer le paiement en ligne.
  if new.status = 'attente' and auth.uid() is not null and new.client_id = auth.uid()
     and not coalesce(new.paid, false) then
    perform pg_advisory_xact_lock(hashtext('ccg_waitlist:' || new.station_id::text));
    if public.station_closing_at(new.station_id) is not null
       and now() + ((public.station_queue_minutes(new.station_id)
                     + public.reservation_duration_minutes(new.station_id, new.category, new.service))
                    * interval '1 minute') > public.station_closing_at(new.station_id) then
      new.status := 'liste_attente';
      new.waitlisted_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.promote_closing_waitlist(p_station uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_deadline timestamptz;
  v_count integer := 0;
begin
  if not exists (select 1 from public.reservations where station_id = p_station and status = 'liste_attente') then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtext('ccg_waitlist:' || p_station::text));

  for r in
    select id, category, service, coalesce(waitlisted_at, created_at) as since
    from public.reservations
    where station_id = p_station and status = 'liste_attente'
    order by created_at
  loop
    v_deadline := public.station_closing_at(p_station, r.since);
    if v_deadline is not null and v_deadline <= now() then
      update public.reservations set status = 'annule', cancel_reason = 'fermeture' where id = r.id;
    elsif v_deadline is null
       or now() + ((public.station_queue_minutes(p_station)
                    + public.reservation_duration_minutes(p_station, r.category, r.service))
                   * interval '1 minute') <= v_deadline then
      update public.reservations
         set status = 'attente', created_at = clock_timestamp(), promoted_at = now(), promotion_source = 'auto'
       where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.promote_closing_waitlist(uuid) from public, anon, authenticated;

-- ─── 2. File anonymisée et compteurs publics (type de retour d'origine) ─
drop function if exists public.all_stations_queue_snapshot();
create function public.all_stations_queue_snapshot()
returns table(id uuid, station_id uuid, status text, category text, service text, created_at timestamptz, started_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, station_id, status, category, service, created_at, started_at
  from public.reservations
  where status in ('attente', 'en_cours', 'liste_attente');
$$;
grant execute on function public.all_stations_queue_snapshot() to anon, authenticated;

drop function if exists public.station_public_stats();
create function public.station_public_stats()
returns table(station_id uuid, waiting_count bigint, active_count bigint, active_employees bigint)
language sql security definer stable
set search_path = public
as $$
  select
    s.id,
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'attente'),
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'en_cours'),
    (select count(*) from public.employees e where e.station_id = s.id and e.daily_status = 'present')
  from public.stations s;
$$;
grant execute on function public.station_public_stats() to anon, authenticated;

-- ─── 3. Objets ajoutés par add_queue_forecast.sql ──────────────────────
drop function if exists public.queue_forecast_accuracy(integer);
drop function if exists public.station_queue_forecast(uuid, jsonb);
drop function if exists public.station_learned_durations(uuid);
drop index if exists public.reservations_station_completed_idx;
-- Colonnes stations.wash_bays et reservations.forecast_start_at LAISSÉES en
-- place (vides, plus lues ni écrites) : un onglet ouvert avant le retour
-- arrière les lit/écrit encore ; les supprimer ferait échouer sa réservation
-- ou l'enregistrement de ses paramètres. Suppression programmée le
-- 12 octobre 2026 à 03:00 GMT (drop_queue_forecast_columns.sql, pg_cron) :
--   alter table public.reservations drop column if exists forecast_start_at;
--   alter table public.stations drop constraint if exists stations_wash_bays_check;
--   alter table public.stations drop column if exists wash_bays;

commit;
