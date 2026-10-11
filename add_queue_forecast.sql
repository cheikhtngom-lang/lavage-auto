-- ══════════════════════════════════════════════════════════════════════
-- Temps d'attente « premier laveur libéré » (2026-10-11)
--
-- Avant : le temps d'attente additionnait le reste de TOUS les lavages en
-- cours + la durée de chaque véhicule en file, comme si un seul véhicule
-- était lavé à la fois. Avec 2 laveurs occupés (un lavage simple qui finit
-- dans 1 min 30, un lavage complet dans 18 min) et personne d'autre en file,
-- le client voyait ~20 min alors que son tour venait dans 1 min 30.
--
-- Maintenant : une simulation de la file, la même pour tout le monde
-- (station_queue_forecast) :
--   • chaque laveur pointé (hors pompistes, hors « Terminé » / « Fin de
--     service ») est un poste ; un lavage en cours occupe son ou ses laveurs
--     (bus/camion à plusieurs laveurs) jusqu'à sa fin estimée ;
--   • chaque véhicule en file, dans l'ordre d'arrivée, va au premier laveur
--     qui se libère ; son heure de passage = cette heure-là ;
--   • stations.wash_bays (facultatif) plafonne le nombre de véhicules lavés
--     en même temps (emplacements, matériel) ; jamais moins que les lavages
--     réellement en cours ;
--   • aucun laveur pointé : un seul poste (= l'ancien calcul) ;
--   • durées : médiane des lavages réellement constatés sur 30 jours (lancer →
--     terminer, entre 1 min et 4 h, au moins 5 lavages), sinon la grille de la
--     station (reservation_duration_minutes) ;
--   • un lavage qui dépasse son temps finit « dans 1 min » (marge glissante).
--
-- Utilisée par : la file anonymisée des clients (heure de passage de chaque
-- véhicule), les compteurs publics (passage estimé pour une nouvelle
-- réservation), la liste d'attente avant fermeture (vérification, garde à
-- l'insertion, promotion) — l'affichage et la décision serveur ne peuvent
-- donc plus diverger.
--
-- Précision : l'heure de passage annoncée est figée à la création
-- (reservations.forecast_start_at) et comparée à l'heure réelle de lancement
-- (queue_forecast_accuracy, Super Admin > Analytique).
--
-- Idempotent : peut être relancé sans risque.
-- ══════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Colonnes ───────────────────────────────────────────────────────
alter table public.stations add column if not exists wash_bays integer;
alter table public.stations drop constraint if exists stations_wash_bays_check;
alter table public.stations add constraint stations_wash_bays_check
  check (wash_bays is null or wash_bays between 1 and 50);

alter table public.reservations add column if not exists forecast_start_at timestamptz;

-- Lecture des lavages terminés récents d'une station (durées apprises).
create index if not exists reservations_station_completed_idx
  on public.reservations(station_id, completed_at) where status = 'termine';

-- ─── 2. Durées réelles apprises ────────────────────────────────────────
-- { "Particulier|Lavage Simple": 15.2, … } — seulement les couples
-- catégorie/service avec au moins 5 lavages mesurés sur 30 jours.
create or replace function public.station_learned_durations(p_station uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.k, round(t.m::numeric, 1)), '{}'::jsonb)
  from (
    select r.category || '|' || r.service as k,
           percentile_cont(0.5) within group (order by extract(epoch from (r.completed_at - r.started_at)) / 60) as m
    from public.reservations r
    where r.station_id = p_station and r.status = 'termine'
      and r.started_at is not null and r.completed_at is not null
      and r.completed_at > now() - interval '30 days'
      and r.completed_at - r.started_at between interval '1 minute' and interval '4 hours'
    group by r.category, r.service
    having count(*) >= 5
  ) t;
$$;
revoke execute on function public.station_learned_durations(uuid) from public, anon, authenticated;

-- ─── 3. Simulation de la file ──────────────────────────────────────────
-- Une ligne par lavage en cours (heure de fin estimée), par véhicule en
-- file (heure de passage estimée) et par véhicule hypothétique de p_extra
-- ([{ "category", "service" }, …], ajoutés en fin de file dans cet ordre,
-- reservation_id null, extra_index 0, 1, …). Un élément {} sert de sonde :
-- son heure de passage = celle d'une nouvelle réservation.
create or replace function public.station_queue_forecast(p_station uuid, p_extra jsonb default '[]'::jsonb)
returns table(reservation_id uuid, extra_index integer, status text, duration_minutes numeric,
              estimated_start_at timestamptz, estimated_end_at timestamptz)
language plpgsql stable
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_learned jsonb := public.station_learned_durations(p_station);
  v_washers integer;
  v_bays integer;
  v_washer_free timestamptz[] := '{}';
  v_bay_free timestamptz[] := '{}';
  v_busy_washers integer := 0;
  v_active integer := 0;
  v_dur numeric;
  v_start timestamptz;
  v_end timestamptz;
  v_wi integer;
  v_bi integer;
  r record;
begin
  select count(*) into v_washers
    from public.employees e
   where e.station_id = p_station
     and e.role is distinct from 'Pompiste'
     and e.daily_status = 'present'
     and coalesce(e.status, '') not in ('Terminé', 'Fin de service');
  select s.wash_bays into v_bays from public.stations s where s.id = p_station;

  -- Lavages en cours : chacun garde son ou ses laveurs et un poste jusqu'à sa fin.
  for r in
    select x.id, x.category, x.service, x.started_at,
           greatest(coalesce(array_length(x.assigned_washer_names, 1), 1), 1) as crew
      from public.reservations x
     where x.station_id = p_station and x.status = 'en_cours'
  loop
    v_dur := coalesce((v_learned->>(r.category || '|' || r.service))::numeric,
                      public.reservation_duration_minutes(p_station, r.category, r.service));
    v_end := coalesce(r.started_at, v_now - (v_dur / 2) * interval '1 minute') + v_dur * interval '1 minute';
    v_end := greatest(v_end, v_now + interval '1 minute');
    for i in 1..r.crew loop
      v_washer_free := v_washer_free || v_end;
    end loop;
    v_bay_free := v_bay_free || v_end;
    v_busy_washers := v_busy_washers + r.crew;
    v_active := v_active + 1;

    reservation_id := r.id; extra_index := null; status := 'en_cours';
    duration_minutes := round(v_dur, 1); estimated_start_at := r.started_at; estimated_end_at := v_end;
    return next;
  end loop;

  -- Laveurs pointés encore libres. Aucun laveur du tout : un seul poste.
  for i in 1..greatest(v_washers - v_busy_washers, 0) loop
    v_washer_free := v_washer_free || v_now;
  end loop;
  if coalesce(array_length(v_washer_free, 1), 0) = 0 then
    v_washer_free := array[v_now];
  end if;
  if v_bays is not null then
    for i in 1..greatest(v_bays - v_active, 0) loop
      v_bay_free := v_bay_free || v_now;
    end loop;
  end if;

  -- File puis véhicules hypothétiques : chacun va au premier laveur libéré.
  for r in
    select q.id, q.category, q.service, q.idx
      from (
        select x.id, x.category, x.service, null::integer as idx, 0 as grp, x.created_at as ts, 0::bigint as ord
          from public.reservations x
         where x.station_id = p_station and x.status = 'attente'
        union all
        select null::uuid, e.value->>'category', e.value->>'service', (e.ord - 1)::integer, 1, null::timestamptz, e.ord
          from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb)) with ordinality as e(value, ord)
      ) q
     order by q.grp, q.ts, q.ord, q.id
  loop
    v_dur := coalesce((v_learned->>(r.category || '|' || r.service))::numeric,
                      public.reservation_duration_minutes(p_station, r.category, r.service));
    select g.n into v_wi from generate_subscripts(v_washer_free, 1) as g(n) order by v_washer_free[g.n] limit 1;
    v_start := greatest(v_now, v_washer_free[v_wi]);
    if v_bays is not null then
      select g.n into v_bi from generate_subscripts(v_bay_free, 1) as g(n) order by v_bay_free[g.n] limit 1;
      v_start := greatest(v_start, v_bay_free[v_bi]);
    end if;
    v_end := v_start + v_dur * interval '1 minute';
    v_washer_free[v_wi] := v_end;
    if v_bays is not null then
      v_bay_free[v_bi] := v_end;
    end if;

    reservation_id := r.id; extra_index := r.idx; status := case when r.id is null then 'extra' else 'attente' end;
    duration_minutes := round(v_dur, 1); estimated_start_at := v_start; estimated_end_at := v_end;
    return next;
  end loop;
end;
$$;
revoke execute on function public.station_queue_forecast(uuid, jsonb) from public, anon, authenticated;

-- ─── 4. Minutes avant le passage d'une nouvelle réservation ────────────
-- (même nom qu'avant ; n'additionne plus tout en série)
create or replace function public.station_queue_minutes(p_station uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select greatest(0, extract(epoch from (f.estimated_start_at - now())) / 60)::numeric
    from public.station_queue_forecast(p_station, '[{}]'::jsonb) f
   where f.extra_index = 0;
$$;

-- ─── 5. Vérification avant réservation (appelée par l'appli) ───────────
-- Chaque véhicule de la réservation est ajouté à la simulation dans l'ordre ;
-- un véhicule qui ne finit pas avant la fermeture n'occupe pas la file.
-- Renvoie { closing_at, queue_minutes, fits: [bool…], start_minutes: [n|null…] }.
create or replace function public.check_closing_capacity(p_station uuid, p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_close timestamptz := public.station_closing_at(p_station);
  v_kept jsonb := '[]'::jsonb;
  v_fits jsonb := '[]'::jsonb;
  v_starts jsonb := '[]'::jsonb;
  v_item jsonb;
  v_start timestamptz;
  v_end timestamptz;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select f.estimated_start_at, f.estimated_end_at into v_start, v_end
      from public.station_queue_forecast(p_station, v_kept || jsonb_build_array(v_item)) f
     where f.extra_index = jsonb_array_length(v_kept);
    if v_close is null or v_end <= v_close then
      v_kept := v_kept || jsonb_build_array(v_item);
      v_fits := v_fits || 'true'::jsonb;
      v_starts := v_starts || to_jsonb(round(greatest(0, extract(epoch from (v_start - now())) / 60)::numeric, 1));
    else
      v_fits := v_fits || 'false'::jsonb;
      v_starts := v_starts || 'null'::jsonb;
    end if;
  end loop;
  return jsonb_build_object('closing_at', v_close, 'queue_minutes', public.station_queue_minutes(p_station),
                            'fits', v_fits, 'start_minutes', v_starts);
end;
$$;
grant execute on function public.check_closing_capacity(uuid, jsonb) to anon, authenticated;

-- ─── 6. Garde à l'insertion : liste d'attente + heure de passage figée ──
create or replace function public.reservation_closing_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_online boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_close timestamptz;
begin
  new.forecast_start_at := null;  -- jamais fourni par le navigateur

  if new.status = 'liste_attente' then
    if coalesce(new.paid, false) then
      raise exception 'Une réservation en liste d''attente se règle sur place.';
    end if;
    new.waitlisted_at := coalesce(new.waitlisted_at, now());
    return new;
  end if;

  if new.status = 'attente' then
    -- Réservation EN LIGNE d'un automobiliste pour lui-même, non payée
    -- (paiement sur place) : seule concernée par la liste d'attente. Une
    -- saisie de la station (client de passage, éventuellement relié par sa
    -- plaque) n'est jamais rétrogradée : le gérant décide seul. Une
    -- réservation déjà payée (Wave/OM via PayDunya, abonnement) non plus :
    -- l'appli vérifie la place AVANT de proposer le paiement en ligne.
    v_online := auth.uid() is not null and new.client_id = auth.uid() and not coalesce(new.paid, false);
    if v_online then
      perform pg_advisory_xact_lock(hashtext('ccg_waitlist:' || new.station_id::text));
    end if;
    select f.estimated_start_at, f.estimated_end_at into v_start, v_end
      from public.station_queue_forecast(new.station_id,
             jsonb_build_array(jsonb_build_object('category', new.category, 'service', new.service))) f
     where f.extra_index = 0;
    v_close := public.station_closing_at(new.station_id);
    if v_online and v_close is not null and v_end > v_close then
      new.status := 'liste_attente';
      new.waitlisted_at := now();
    else
      new.forecast_start_at := v_start;
    end if;
  end if;
  return new;
end;
$$;

-- ─── 7. Promotion automatique de la liste d'attente ────────────────────
create or replace function public.promote_closing_waitlist(p_station uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_deadline timestamptz;
  v_start timestamptz;
  v_end timestamptz;
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
      continue;
    end if;
    select f.estimated_start_at, f.estimated_end_at into v_start, v_end
      from public.station_queue_forecast(p_station,
             jsonb_build_array(jsonb_build_object('category', r.category, 'service', r.service))) f
     where f.extra_index = 0;
    if v_deadline is null or v_end <= v_deadline then
      update public.reservations
         set status = 'attente', created_at = clock_timestamp(), promoted_at = now(), promotion_source = 'auto',
             forecast_start_at = v_start
       where id = r.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.promote_closing_waitlist(uuid) from public, anon, authenticated;

-- ─── 8. File anonymisée : + heure de passage / de fin estimée ──────────
-- Le type de retour change : la fonction doit être recréée.
drop function if exists public.all_stations_queue_snapshot();
create function public.all_stations_queue_snapshot()
returns table(id uuid, station_id uuid, status text, category text, service text, created_at timestamptz,
              started_at timestamptz, duration_minutes numeric, estimated_start_at timestamptz, estimated_end_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  with busy as (
    select distinct x.station_id from public.reservations x where x.status in ('attente', 'en_cours')
  ), fc as (
    select f.* from busy cross join lateral public.station_queue_forecast(busy.station_id) f
  )
  select r.id, r.station_id, r.status, r.category, r.service, r.created_at, r.started_at,
         fc.duration_minutes, fc.estimated_start_at, fc.estimated_end_at
    from public.reservations r
    left join fc on fc.reservation_id = r.id
   where r.status in ('attente', 'en_cours', 'liste_attente');
$$;
grant execute on function public.all_stations_queue_snapshot() to anon, authenticated;

-- ─── 9. Compteurs publics : + passage estimé d'une nouvelle réservation ─
-- next_start_at null = file vide, passage immédiat.
drop function if exists public.station_public_stats();
create function public.station_public_stats()
returns table(station_id uuid, waiting_count bigint, active_count bigint, active_employees bigint, next_start_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select
    s.id,
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'attente'),
    (select count(*) from public.reservations r where r.station_id = s.id and r.status = 'en_cours'),
    (select count(*) from public.employees e where e.station_id = s.id and e.daily_status = 'present'),
    case when exists (select 1 from public.reservations r where r.station_id = s.id and r.status in ('attente', 'en_cours'))
      then (select f.estimated_start_at from public.station_queue_forecast(s.id, '[{}]'::jsonb) f where f.extra_index = 0)
    end
  from public.stations s;
$$;
grant execute on function public.station_public_stats() to anon, authenticated;

-- ─── 10. Précision des prévisions (Super Admin) ────────────────────────
-- Écart entre l'heure de passage annoncée à la création et l'heure réelle
-- de lancement : positif = lancé plus tard qu'annoncé. Une réservation en
-- ligne inclut le retard éventuel du client à se présenter.
create or replace function public.queue_forecast_accuracy(p_days integer default 30)
returns table(station_id uuid, station_name text, samples bigint,
              median_abs_error_minutes numeric, median_error_minutes numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.app_role() is distinct from 'super_admin' then
    raise exception 'Accès refusé.';
  end if;
  return query
  select s.id, s.name, count(*),
         round(percentile_cont(0.5) within group (order by abs(extract(epoch from (r.started_at - r.forecast_start_at)) / 60))::numeric, 1),
         round(percentile_cont(0.5) within group (order by extract(epoch from (r.started_at - r.forecast_start_at)) / 60)::numeric, 1)
    from public.reservations r
    join public.stations s on s.id = r.station_id
   where r.forecast_start_at is not null and r.started_at is not null
     and r.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
   group by s.id, s.name
   order by count(*) desc;
end;
$$;
revoke execute on function public.queue_forecast_accuracy(integer) from public, anon;
grant execute on function public.queue_forecast_accuracy(integer) to authenticated;

commit;
