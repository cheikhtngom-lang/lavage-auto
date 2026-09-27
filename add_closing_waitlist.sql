-- ══════════════════════════════════════════════════════════════════════
-- Liste d'attente « avant fermeture » (2026-09-27)
--
-- Quand un automobiliste réserve en ligne mais que les véhicules déjà en
-- lavage + en file ne laissent plus le temps de laver le sien avant l'heure
-- de fermeture de la station (stations.close_time), sa réservation ne rejoint
-- PAS la file : elle part sur une liste d'attente séparée (status
-- 'liste_attente'), qu'il a acceptée en connaissance de cause côté appli.
--
-- Dès qu'une place se libère avant la fermeture (véhicule retiré/absent,
-- désistement du client, lavage terminé plus tôt que prévu), le premier de la
-- liste qui tient encore dans le temps passe AUTOMATIQUEMENT en fin de file
-- (promotion_source 'auto') ; le client est prévenu par la notification
-- Realtime habituelle. Le gérant peut aussi l'intégrer lui-même en acceptant
-- de dépasser l'heure (promotion_source 'station'). À la fermeture, les
-- demandes restantes expirent (status 'annule', cancel_reason 'fermeture').
--
-- Règles côté serveur (le navigateur ne fait qu'afficher) :
--   • le calcul du temps restant = celui de l'appli (estimateItemWaitTime,
--     lib/stationData.js) : reste des lavages en cours + durée de chaque
--     véhicule en file, durées de wash_pricing (sinon les valeurs par défaut
--     de lib/washDefaults.js, sinon 30 min) ;
--   • une réservation en ligne qui ne tient plus est rétrogradée en liste
--     d'attente même si le navigateur l'a envoyée en 'attente' (deux clients
--     qui réservent à la même seconde : verrou par station) ;
--   • une réservation en liste d'attente ne peut pas être payée d'avance
--     (paiement sur place uniquement : rien à rembourser si elle expire).
--
-- Idempotent : peut être relancé sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Nouveau statut + colonnes de suivi ─────────────────────────────
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('attente', 'en_cours', 'termine', 'annule', 'liste_attente'));

alter table public.reservations add column if not exists waitlisted_at timestamptz;
alter table public.reservations add column if not exists promoted_at timestamptz;
alter table public.reservations add column if not exists promotion_source text;
alter table public.reservations add column if not exists cancel_reason text;

alter table public.reservations drop constraint if exists reservations_promotion_source_check;
alter table public.reservations add constraint reservations_promotion_source_check
  check (promotion_source is null or promotion_source in ('auto', 'station'));
alter table public.reservations drop constraint if exists reservations_cancel_reason_check;
alter table public.reservations add constraint reservations_cancel_reason_check
  check (cancel_reason is null or cancel_reason in ('client', 'fermeture'));

create index if not exists reservations_waitlist_idx
  on public.reservations(station_id, created_at) where status = 'liste_attente';

-- ─── 2. Fuseau horaire d'une station (heures d'ouverture = heure locale) ──
-- Sénégal, Côte d'Ivoire, Mali, Burkina, Togo, Guinée : UTC+0 toute l'année.
-- Bénin, Niger : UTC+1.
create or replace function public.station_timezone(p_country text)
returns text
language sql immutable
as $$
  select case upper(coalesce(p_country, 'SN'))
    when 'BJ' then 'Africa/Lagos'
    when 'NE' then 'Africa/Lagos'
    else 'Africa/Dakar'
  end;
$$;

-- ─── 3. Durée estimée d'un lavage (même règle que l'appli) ─────────────
-- getStationDurationConfig : la grille de la station si elle en a une (case
-- manquante = 30 min), sinon la grille par défaut (lib/washDefaults.js).
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
      when 'Particulier' then case p_service when 'Lavage Simple' then 15 when 'Lavage Complet' then 30 when 'Lavage Moteur' then 25 end
      when 'Transport' then case p_service when 'Lavage Simple' then 20 when 'Lavage Complet' then 40 when 'Lavage Moteur' then 35 end
      when 'Camion' then case p_service when 'Lavage Simple' then 30 when 'Lavage Complet' then 45 when 'Lavage Moteur' then 40 end
    end, 30)
  end::numeric;
$$;

-- ─── 4. Minutes de travail déjà engagées (en lavage + en file) ─────────
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

-- ─── 5. Heure de fermeture (du jour de p_at) ───────────────────────────
-- null = pas d'heure de fermeture renseignée : aucune limite.
-- Plage nocturne (ex. 18:00 → 02:00) : après l'ouverture, la fermeture tombe
-- le lendemain (même logique que isStationOpenNow, lib/stationData.js).
create or replace function public.station_closing_at(p_station uuid, p_at timestamptz default now())
returns timestamptz
language plpgsql stable
set search_path = public
as $$
declare
  v_open text;
  v_close text;
  v_country text;
  v_tz text;
  v_local timestamp;
  v_open_t time;
  v_close_t time;
  v_close_at timestamp;
begin
  select open_time, close_time, country into v_open, v_close, v_country from public.stations where id = p_station;
  if v_close is null or v_close !~ '^\d{1,2}:\d{2}' then return null; end if;
  v_tz := public.station_timezone(v_country);
  v_local := p_at at time zone v_tz;
  v_close_t := v_close::time;
  v_open_t := case when v_open ~ '^\d{1,2}:\d{2}' then v_open::time end;
  v_close_at := v_local::date + v_close_t;
  if v_open_t is not null and v_close_t <= v_open_t and v_local::time >= v_open_t then
    v_close_at := v_close_at + interval '1 day';
  end if;
  return v_close_at at time zone v_tz;
end;
$$;

-- ─── 6. Vérification avant réservation (appelée par l'appli) ───────────
-- p_items : [{ "category": "...", "service": "..." }, …] dans l'ordre de
-- passage. Les véhicules d'une même réservation passent l'un après l'autre :
-- le 2e ne tient que si le 1er ET lui tiennent avant la fermeture.
-- Renvoie { closing_at, queue_minutes, fits: [true|false, …] }.
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

-- ─── 7. Garde à l'insertion d'une réservation ──────────────────────────
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

drop trigger if exists reservations_closing_guard on public.reservations;
create trigger reservations_closing_guard
  before insert on public.reservations
  for each row execute function public.reservation_closing_guard();

-- ─── 8. Promotion automatique de la liste d'attente ────────────────────
-- Parcourt la liste dans l'ordre d'arrivée : chaque véhicule qui tient
-- encore avant la fermeture passe en FIN de file (created_at = maintenant,
-- l'ordre de la file étant dérivé de created_at partout dans l'appli). Une
-- demande dont la fermeture est déjà passée expire au passage.
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

-- Une place se libère quand un véhicule de la file ou en lavage sort
-- (terminé, retiré, désistement) ou est supprimé.
create or replace function public.reservation_waitlist_promote_trigger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('attente', 'en_cours') then perform public.promote_closing_waitlist(old.station_id); end if;
    return old;
  end if;
  if old.status in ('attente', 'en_cours') and new.status in ('termine', 'annule') then
    perform public.promote_closing_waitlist(new.station_id);
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_waitlist_promote on public.reservations;
create trigger reservations_waitlist_promote
  after update of status or delete on public.reservations
  for each row execute function public.reservation_waitlist_promote_trigger();

-- ─── 9. Le gérant intègre un véhicule malgré l'heure ───────────────────
create or replace function public.station_admit_waitlisted(p_reservation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_station uuid;
begin
  select station_id into v_station from public.reservations
   where id = p_reservation_id and status = 'liste_attente' for update;
  if v_station is null then
    raise exception 'Ce véhicule n''est plus en liste d''attente.';
  end if;
  if v_station is distinct from public.current_station_id() and public.app_role() is distinct from 'super_admin' then
    raise exception 'Accès refusé.';
  end if;
  update public.reservations
     set status = 'attente', created_at = clock_timestamp(), promoted_at = now(), promotion_source = 'station'
   where id = p_reservation_id;
end;
$$;
grant execute on function public.station_admit_waitlisted(uuid) to authenticated;

-- ─── 10. Désistement de l'automobiliste ────────────────────────────────
-- Seulement tant que le lavage n'a pas commencé et que rien n'a été payé
-- (sinon il faudrait un remboursement : c'est la station qui gère).
create or replace function public.client_cancel_reservation(p_reservation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if v_res.id is null or v_res.client_id is distinct from auth.uid() then
    raise exception 'Réservation introuvable.';
  end if;
  if v_res.status not in ('attente', 'liste_attente') then
    raise exception 'Ce lavage a déjà commencé ou est terminé : il ne peut plus être annulé.';
  end if;
  if v_res.paid then
    raise exception 'Cette réservation est déjà payée : adressez-vous à la station pour l''annuler.';
  end if;
  update public.reservations set status = 'annule', cancel_reason = 'client' where id = p_reservation_id;
end;
$$;
grant execute on function public.client_cancel_reservation(uuid) to authenticated;

-- ─── 11. File anonymisée : inclut la liste d'attente ───────────────────
-- (même forme qu'avant ; l'appli filtre par statut, donc les positions et
-- temps d'attente de la file ne changent pas — la liste d'attente sert
-- seulement à calculer « vous êtes 2e sur la liste d'attente »).
create or replace function public.all_stations_queue_snapshot()
returns table(id uuid, station_id uuid, status text, category text, service text, created_at timestamptz, started_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select id, station_id, status, category, service, created_at, started_at
  from public.reservations
  where status in ('attente', 'en_cours', 'liste_attente');
$$;
grant execute on function public.all_stations_queue_snapshot() to anon, authenticated;

-- ─── 12. Balayage toutes les 5 minutes ─────────────────────────────────
-- Filet de sécurité : une place a pu se libérer sans évènement (lavage
-- terminé plus tôt que prévu puis heure qui tourne…), et les demandes dont
-- la fermeture est passée doivent expirer même si rien ne bouge en station.
create or replace function public.sweep_closing_waitlists()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  s record;
  v_total integer := 0;
begin
  for s in select distinct station_id from public.reservations where status = 'liste_attente' loop
    v_total := v_total + public.promote_closing_waitlist(s.station_id);
  end loop;
  return v_total;
end;
$$;
revoke execute on function public.sweep_closing_waitlists() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'closing-waitlist-sweep') then
    perform cron.unschedule('closing-waitlist-sweep');
  end if;
  perform cron.schedule('closing-waitlist-sweep', '*/5 * * * *', 'select public.sweep_closing_waitlists()');
end $$;
