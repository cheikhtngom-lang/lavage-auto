-- ══════════════════════════════════════════════════════════════════════
-- OFFRE « SUR MESURE » — phase 2 : tableau de bord consolidé du patron.
-- À exécuter une fois dans l'éditeur SQL Supabase (après add_sur_mesure_groups.sql).
-- Idempotent.
--
-- Une seule fonction, group_dashboard(), calcule TOUT le tableau de bord côté
-- base : avec 20 stations et des mois d'historique, charger les données brutes
-- dans le navigateur serait beaucoup trop lourd. Les définitions reprennent
-- exactement celles du Bilan d'une station (src/lib/bilan.js) pour que les
-- chiffres du patron soient les mêmes que ceux de chaque station :
--   • chiffre d'affaires = somme des transactions (created_at) ;
--   • dépenses           = somme des dépenses (created_at) ;
--   • lavages            = réservations « termine » (completed_at) ;
--   • laveurs            = assigned_washer_names, à défaut assigned_to_name
--                          (un lavage à plusieurs crédite chacun) ;
--   • note               = moyenne des avis (station_reviews).
--
-- Sécurité : SECURITY DEFINER, donc c'est la fonction qui borne l'accès —
-- réservée au chef d'entreprise, et JAMAIS qu'aux stations de SON groupe
-- (non archivées), quel que soit le filtre demandé. Le Sénégal est en UTC :
-- toutes les heures / jours sont calculés en UTC.
-- ══════════════════════════════════════════════════════════════════════

-- Les lavages terminés sont lus par station et par date.
create index if not exists reservations_station_completed_idx
  on public.reservations(station_id, completed_at) where status = 'termine';

create or replace function public.group_dashboard(
  p_from timestamptz,
  p_to timestamptz,
  p_station_ids uuid[] default null,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org uuid;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_bucket text := coalesce(p_bucket, 'day');
  v_step interval;
  v_result jsonb;
begin
  select id into v_org from public.organizations where owner_id = auth.uid();
  if v_org is null then
    raise exception 'Réservé au chef d''entreprise.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Période invalide.';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'Période trop longue (400 jours maximum).';
  end if;
  if v_bucket not in ('day', 'week', 'month') then v_bucket := 'day'; end if;
  v_step := case v_bucket when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;

  -- Période précédente = même durée, juste avant.
  v_prev_to := p_from;
  v_prev_from := p_from - (p_to - p_from);

  with
  all_sts as (
    select s.id, s.name, s.city, s.group_origin, b.plan
    from public.stations s
    left join public.station_billing b on b.station_id = s.id
    where s.organization_id = v_org and s.group_archived_at is null
  ),
  sts as (
    select * from all_sts where p_station_ids is null or id = any(p_station_ids)
  ),
  tx as (
    select t.station_id,
      coalesce(sum(t.amount) filter (where t.created_at >= p_from), 0) as rev,
      count(*) filter (where t.created_at >= p_from) as n,
      coalesce(sum(t.amount) filter (where t.created_at < p_from), 0) as prev_rev,
      count(*) filter (where t.created_at < p_from) as prev_n
    from public.transactions t
    where t.station_id in (select id from sts) and t.created_at >= v_prev_from and t.created_at < p_to
    group by t.station_id
  ),
  ex as (
    select e.station_id,
      coalesce(sum(e.amount) filter (where e.created_at >= p_from), 0) as total,
      coalesce(sum(e.amount) filter (where e.created_at < p_from), 0) as prev_total
    from public.expenses e
    where e.station_id in (select id from sts) and e.created_at >= v_prev_from and e.created_at < p_to
    group by e.station_id
  ),
  wa as (
    select r.station_id,
      count(*) filter (where r.completed_at >= p_from) as washes,
      count(*) filter (where r.completed_at < p_from) as prev_washes
    from public.reservations r
    where r.status = 'termine' and r.station_id in (select id from sts)
      and r.completed_at >= v_prev_from and r.completed_at < p_to
    group by r.station_id
  ),
  rv as (
    select v.station_id, count(*) as cnt, round(avg(v.rating)::numeric, 2) as avg_rating
    from public.station_reviews v
    where v.station_id in (select id from sts) and v.created_at >= p_from and v.created_at < p_to
    group by v.station_id
  ),
  wn as (
    select r.station_id, n.name, r.amount
    from public.reservations r
    cross join lateral unnest(
      case
        when r.assigned_washer_names is not null and cardinality(r.assigned_washer_names) > 0 then r.assigned_washer_names
        when nullif(trim(coalesce(r.assigned_to_name, '')), '') is not null then array[trim(r.assigned_to_name)]
        else '{}'::text[]
      end
    ) as n(name)
    where r.status = 'termine' and r.station_id in (select id from sts)
      and r.completed_at >= p_from and r.completed_at < p_to
  ),
  wsum as (
    select station_id, name, count(*) as washes, coalesce(sum(amount), 0) as value
    from wn group by station_id, name
  ),
  wact as (
    select station_id, count(*) as active_washers from wsum group by station_id
  ),
  per as (
    select s.id as station_id, s.name, s.city, s.plan, s.group_origin as origin,
      coalesce(tx.rev, 0) as revenue, coalesce(tx.n, 0) as tx_count,
      coalesce(tx.prev_rev, 0) as prev_revenue, coalesce(tx.prev_n, 0) as prev_tx_count,
      coalesce(ex.total, 0) as expenses, coalesce(ex.prev_total, 0) as prev_expenses,
      coalesce(wa.washes, 0) as washes, coalesce(wa.prev_washes, 0) as prev_washes,
      coalesce(rv.cnt, 0) as review_count, rv.avg_rating,
      coalesce(wact.active_washers, 0) as active_washers
    from sts s
    left join tx on tx.station_id = s.id
    left join ex on ex.station_id = s.id
    left join wa on wa.station_id = s.id
    left join rv on rv.station_id = s.id
    left join wact on wact.station_id = s.id
  ),
  buckets as (
    select generate_series(
      date_trunc(v_bucket, p_from at time zone 'UTC'),
      (p_to - interval '1 microsecond') at time zone 'UTC',
      v_step
    ) as b
  ),
  tx_b as (
    select date_trunc(v_bucket, t.created_at at time zone 'UTC') as b, sum(t.amount) as rev
    from public.transactions t
    where t.station_id in (select id from sts) and t.created_at >= p_from and t.created_at < p_to
    group by 1
  ),
  ex_b as (
    select date_trunc(v_bucket, e.created_at at time zone 'UTC') as b, sum(e.amount) as total
    from public.expenses e
    where e.station_id in (select id from sts) and e.created_at >= p_from and e.created_at < p_to
    group by 1
  ),
  wa_b as (
    select date_trunc(v_bucket, r.completed_at at time zone 'UTC') as b, count(*) as washes
    from public.reservations r
    where r.status = 'termine' and r.station_id in (select id from sts)
      and r.completed_at >= p_from and r.completed_at < p_to
    group by 1
  ),
  trend as (
    select to_char(bk.b, 'YYYY-MM-DD') as label,
      coalesce(tx_b.rev, 0) as revenue, coalesce(ex_b.total, 0) as expenses, coalesce(wa_b.washes, 0) as washes
    from buckets bk
    left join tx_b on tx_b.b = bk.b
    left join ex_b on ex_b.b = bk.b
    left join wa_b on wa_b.b = bk.b
    order by bk.b
  ),
  by_service as (
    select coalesce(nullif(trim(t.service), ''), 'Autre') as label, sum(t.amount) as value
    from public.transactions t
    where t.station_id in (select id from sts) and t.created_at >= p_from and t.created_at < p_to
    group by 1
  ),
  by_method as (
    select coalesce(nullif(trim(t.method), ''), 'Autre') as label, sum(t.amount) as value
    from public.transactions t
    where t.station_id in (select id from sts) and t.created_at >= p_from and t.created_at < p_to
    group by 1
  ),
  by_expense as (
    select coalesce(nullif(trim(e.category), ''), 'Autre') as label, sum(e.amount) as value
    from public.expenses e
    where e.station_id in (select id from sts) and e.created_at >= p_from and e.created_at < p_to
    group by 1
  ),
  by_category as (
    select coalesce(nullif(trim(r.category), ''), 'Autre') as label, count(*) as value
    from public.reservations r
    where r.status = 'termine' and r.station_id in (select id from sts)
      and r.completed_at >= p_from and r.completed_at < p_to
    group by 1
  ),
  wt as (
    select coalesce(r.started_at, r.completed_at) at time zone 'UTC' as ts
    from public.reservations r
    where r.status = 'termine' and r.station_id in (select id from sts)
      and r.completed_at >= p_from and r.completed_at < p_to
  ),
  dow as (
    select gs.d, count(wt.ts) as c from generate_series(0, 6) gs(d)
    left join wt on extract(dow from wt.ts)::int = gs.d group by gs.d
  ),
  hr as (
    select gs.h, count(wt.ts) as c from generate_series(0, 23) gs(h)
    left join wt on extract(hour from wt.ts)::int = gs.h group by gs.h
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to, 'bucket', v_bucket),
    'stations', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'city', city, 'plan', plan, 'origin', group_origin) order by name), '[]'::jsonb) from all_sts),
    'per_station', (select coalesce(jsonb_agg(to_jsonb(per) order by revenue desc, name), '[]'::jsonb) from per),
    'trend', (select coalesce(jsonb_agg(to_jsonb(trend)), '[]'::jsonb) from trend),
    'by_service', (select coalesce(jsonb_agg(to_jsonb(x) order by value desc), '[]'::jsonb) from by_service x),
    'by_method', (select coalesce(jsonb_agg(to_jsonb(x) order by value desc), '[]'::jsonb) from by_method x),
    'expense_by_category', (select coalesce(jsonb_agg(to_jsonb(x) order by value desc), '[]'::jsonb) from by_expense x),
    'wash_by_category', (select coalesce(jsonb_agg(to_jsonb(x) order by value desc), '[]'::jsonb) from by_category x),
    'dow', (select jsonb_agg(c order by d) from dow),
    'hour', (select jsonb_agg(c order by h) from hr),
    'washers', (
      select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'station_id', w.station_id, 'station', s.name, 'washes', w.washes, 'value', w.value) order by w.washes desc, w.value desc), '[]'::jsonb)
      from (select * from wsum order by washes desc, value desc limit 25) w
      join all_sts s on s.id = w.station_id
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.group_dashboard(timestamptz, timestamptz, uuid[], text) from public, anon;
grant execute on function public.group_dashboard(timestamptz, timestamptz, uuid[], text) to authenticated;
