-- ══════════════════════════════════════════════════════════════════════
-- CARBURANT : activité des dépenses + analytique / comptabilité séparées
-- (lavage ≠ carburant) pour le patron Sur mesure, et vue Super Admin.
--
-- À exécuter une fois dans l'éditeur SQL Supabase, APRÈS add_pompistes.sql,
-- add_station_pumps.sql, add_pump_nozzles.sql et add_group_dashboard.sql.
-- Idempotent.
--
--   1. expenses.activity : 'lavage' (défaut — toutes les dépenses existantes) ou
--      'carburant'. Une dépense se classe dans UNE activité : c'est ce qui permet
--      un vrai résultat par activité.
--   2. Le tableau de bord lavage du patron (_group_dashboard_core) ne compte plus
--      que les dépenses de lavage (sinon un achat de carburant viendrait se
--      soustraire du chiffre d'affaires lavage). Reprise à l'identique de
--      add_group_dashboard.sql, à ces trois filtres près.
--   3. Carburant : _fuel_dashboard_core (agrégats sur attendance_records) et ses
--      deux enveloppes : group_fuel_dashboard (patron) et superadmin_fuel_overview.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Activité d'une dépense ─────────────────────────────────────────
alter table public.expenses add column if not exists activity text not null default 'lavage';

do $$
begin
  begin
    alter table public.expenses
      add constraint expenses_activity_check check (activity in ('lavage', 'carburant'));
  exception when duplicate_object then null;
  end;
end $$;

-- ─── 2. Tableau de bord lavage : dépenses de lavage uniquement ─────────
create or replace function public._group_dashboard_core(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_station_ids uuid[],
  p_bucket text
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
  v_org := p_org;
  if v_org is null then
    raise exception 'Groupe introuvable.';
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
    where e.station_id in (select id from sts) and e.activity = 'lavage' and e.created_at >= v_prev_from and e.created_at < p_to
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
    where e.station_id in (select id from sts) and e.activity = 'lavage' and e.created_at >= p_from and e.created_at < p_to
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
    where e.station_id in (select id from sts) and e.activity = 'lavage' and e.created_at >= p_from and e.created_at < p_to
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
revoke all on function public._group_dashboard_core(uuid, timestamptz, timestamptz, uuid[], text) from public, anon, authenticated;
grant execute on function public._group_dashboard_core(uuid, timestamptz, timestamptz, uuid[], text) to service_role;

-- ─── 3. Carburant : agrégats communs (patron Sur mesure + Super Admin) ──────
-- Les relevés des pompistes vivent dans attendance_records (rôle 'Pompiste',
-- une ligne par pompiste et par jour : litres, argent encaissé, et le détail par
-- pistolet dans pump_lines — voir add_pompistes.sql et add_pump_nozzles.sql).
-- « Chiffre d'affaires carburant » = argent encaissé déclaré par les pompistes.
-- C'est du BRUT : l'achat du carburant se saisit en dépense d'activité
-- « carburant ». Ces montants ne sont volontairement PAS dans transactions
-- (l'essence n'est pas du lavage : ni Bilan station, ni commissions plateforme).
--
-- Cœur SANS contrôle d'accès : seuls les deux enveloppes ci-dessous l'appellent
-- (elles calculent la liste de stations autorisée). Tous les jours sont calculés
-- en UTC (le Sénégal y est), comme le tableau de bord lavage.
create index if not exists attendance_records_station_date_idx
  on public.attendance_records(station_id, work_date);

create or replace function public._fuel_dashboard_core(
  p_station_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_bucket text := coalesce(p_bucket, 'day');
  v_step interval;
  v_from date;
  v_to date;
  v_prev_from date;
  v_prev_from_ts timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Période invalide.';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'Période trop longue (400 jours maximum).';
  end if;
  if v_bucket not in ('day', 'week', 'month') then v_bucket := 'day'; end if;
  v_step := case v_bucket when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;

  -- Jours entiers [v_from, v_to) ; période précédente = même nombre de jours, juste avant.
  v_from := (p_from at time zone 'UTC')::date;
  v_to := ((p_to - interval '1 microsecond') at time zone 'UTC')::date + 1;
  v_prev_from := v_from - (v_to - v_from);
  v_prev_from_ts := p_from - (p_to - p_from);

  with
  sts as (
    select s.id, s.name, s.city, b.plan
    from public.stations s
    left join public.station_billing b on b.station_id = s.id
    where s.id = any(coalesce(p_station_ids, '{}'::uuid[]))
  ),
  att as (
    select a.station_id, a.employee_id, a.name, a.work_date, a.daily_status, a.pump_label,
      a.liters, a.amount_collected, a.pump_lines, (a.work_date >= v_from) as is_cur
    from public.attendance_records a
    where a.station_id in (select id from sts) and a.role = 'Pompiste'
      and a.work_date >= v_prev_from and a.work_date < v_to
      and (a.daily_status = 'present' or a.liters is not null or a.amount_collected is not null)
  ),
  att_lines as (
    select a.station_id, a.is_cur, a.work_date, l->>'fuel' as fuel, l->>'label' as label,
      case when jsonb_typeof(l->'liters') = 'number' then (l->>'liters')::numeric else 0 end as liters,
      case when jsonb_typeof(l->'amount') = 'number' then (l->>'amount')::numeric else 0 end as amount
    from att a
    cross join lateral jsonb_array_elements(case when jsonb_typeof(a.pump_lines) = 'array' then a.pump_lines else '[]'::jsonb end) l
  ),
  reg as (
    select e.station_id, count(*) as registered
    from public.employees e
    where e.station_id in (select id from sts) and e.role = 'Pompiste' and e.status <> 'Archivé'
    group by e.station_id
  ),
  att_s as (
    select station_id,
      coalesce(sum(liters) filter (where is_cur), 0) as liters,
      coalesce(sum(amount_collected) filter (where is_cur), 0) as amount,
      coalesce(sum(liters) filter (where not is_cur), 0) as prev_liters,
      coalesce(sum(amount_collected) filter (where not is_cur), 0) as prev_amount,
      coalesce(sum(liters) filter (where is_cur and pump_lines is null), 0) as undetailed_liters,
      coalesce(sum(amount_collected) filter (where is_cur and pump_lines is null), 0) as undetailed_amount,
      count(*) filter (where is_cur and daily_status = 'present') as days_worked,
      count(distinct employee_id) filter (where is_cur) as pompistes,
      count(*) filter (where is_cur and (liters is not null or amount_collected is not null)) as readings
    from att group by station_id
  ),
  ln_s as (
    select station_id,
      coalesce(sum(liters) filter (where is_cur and fuel = 'essence'), 0) as essence_liters,
      coalesce(sum(amount) filter (where is_cur and fuel = 'essence'), 0) as essence_amount,
      coalesce(sum(liters) filter (where is_cur and fuel = 'gasoil'), 0) as gasoil_liters,
      coalesce(sum(amount) filter (where is_cur and fuel = 'gasoil'), 0) as gasoil_amount
    from att_lines group by station_id
  ),
  ex as (
    select e.station_id,
      coalesce(sum(e.amount) filter (where e.created_at >= p_from), 0) as expenses,
      coalesce(sum(e.amount) filter (where e.created_at < p_from), 0) as prev_expenses
    from public.expenses e
    where e.station_id in (select id from sts) and e.activity = 'carburant'
      and e.created_at >= v_prev_from_ts and e.created_at < p_to
    group by e.station_id
  ),
  per as (
    select s.id as station_id, s.name, s.city, s.plan,
      (coalesce(reg.registered, 0) > 0
        or exists (select 1 from public.station_pumps p where p.station_id = s.id)
        or att_s.station_id is not null
        or coalesce(ex.expenses, 0) + coalesce(ex.prev_expenses, 0) > 0) as has_fuel,
      coalesce(reg.registered, 0) as registered,
      coalesce(att_s.liters, 0) as liters, coalesce(att_s.amount, 0) as amount,
      coalesce(att_s.prev_liters, 0) as prev_liters, coalesce(att_s.prev_amount, 0) as prev_amount,
      coalesce(att_s.undetailed_liters, 0) as undetailed_liters, coalesce(att_s.undetailed_amount, 0) as undetailed_amount,
      coalesce(att_s.days_worked, 0) as days_worked, coalesce(att_s.pompistes, 0) as pompistes, coalesce(att_s.readings, 0) as readings,
      coalesce(ln_s.essence_liters, 0) as essence_liters, coalesce(ln_s.essence_amount, 0) as essence_amount,
      coalesce(ln_s.gasoil_liters, 0) as gasoil_liters, coalesce(ln_s.gasoil_amount, 0) as gasoil_amount,
      coalesce(ex.expenses, 0) as expenses, coalesce(ex.prev_expenses, 0) as prev_expenses
    from sts s
    left join reg on reg.station_id = s.id
    left join att_s on att_s.station_id = s.id
    left join ln_s on ln_s.station_id = s.id
    left join ex on ex.station_id = s.id
  ),
  buckets as (
    select generate_series(
      date_trunc(v_bucket, p_from at time zone 'UTC'),
      (p_to - interval '1 microsecond') at time zone 'UTC',
      v_step
    ) as b
  ),
  att_b as (
    select date_trunc(v_bucket, a.work_date::timestamp) as b,
      sum(a.liters) as liters, sum(a.amount_collected) as amount
    from att a where a.is_cur group by 1
  ),
  ex_b as (
    select date_trunc(v_bucket, e.created_at at time zone 'UTC') as b, sum(e.amount) as expenses
    from public.expenses e
    where e.station_id in (select id from sts) and e.activity = 'carburant'
      and e.created_at >= p_from and e.created_at < p_to
    group by 1
  ),
  trend as (
    select to_char(bk.b, 'YYYY-MM-DD') as label,
      coalesce(att_b.liters, 0) as liters, coalesce(att_b.amount, 0) as amount, coalesce(ex_b.expenses, 0) as expenses
    from buckets bk
    left join att_b on att_b.b = bk.b
    left join ex_b on ex_b.b = bk.b
    order by bk.b
  ),
  by_fuel as (
    select fuel, sum(liters) as liters, sum(amount) as amount from att_lines where is_cur group by fuel
  ),
  by_nozzle as (
    select label, fuel, sum(liters) as liters, sum(amount) as amount from att_lines where is_cur group by label, fuel
  ),
  by_pump as (
    select coalesce(nullif(trim(a.pump_label), ''), 'Sans pompe') as label,
      sum(a.liters) as liters, sum(a.amount_collected) as amount
    from att a where a.is_cur and (a.liters is not null or a.amount_collected is not null) group by 1
  ),
  by_pompiste as (
    select a.employee_id, max(a.name) as name, a.station_id,
      count(*) filter (where a.daily_status = 'present') as days,
      coalesce(sum(a.liters), 0) as liters, coalesce(sum(a.amount_collected), 0) as amount
    from att a where a.is_cur group by a.employee_id, a.station_id
  ),
  by_expense as (
    select coalesce(nullif(trim(e.category), ''), 'Autre') as label, sum(e.amount) as value
    from public.expenses e
    where e.station_id in (select id from sts) and e.activity = 'carburant'
      and e.created_at >= p_from and e.created_at < p_to
    group by 1
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'bucket', v_bucket),
    'has_fuel', (select coalesce(bool_or(has_fuel), false) from per),
    'per_station', (select coalesce(jsonb_agg(to_jsonb(per) order by amount desc, name), '[]'::jsonb) from per),
    'trend', (select coalesce(jsonb_agg(to_jsonb(trend)), '[]'::jsonb) from trend),
    'by_fuel', (select coalesce(jsonb_agg(to_jsonb(x) order by amount desc), '[]'::jsonb) from by_fuel x),
    'by_nozzle', (select coalesce(jsonb_agg(to_jsonb(x) order by label), '[]'::jsonb) from by_nozzle x),
    'by_pump', (select coalesce(jsonb_agg(to_jsonb(x) order by amount desc), '[]'::jsonb) from by_pump x),
    'expense_by_category', (select coalesce(jsonb_agg(to_jsonb(x) order by value desc), '[]'::jsonb) from by_expense x),
    'pompistes', (
      select coalesce(jsonb_agg(jsonb_build_object('name', w.name, 'station_id', w.station_id, 'station', s.name, 'days', w.days, 'liters', w.liters, 'amount', w.amount) order by w.amount desc, w.liters desc), '[]'::jsonb)
      from (select * from by_pompiste order by amount desc, liters desc limit 25) w
      join sts s on s.id = w.station_id
    )
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public._fuel_dashboard_core(uuid[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public._fuel_dashboard_core(uuid[], timestamptz, timestamptz, text) to service_role;

-- Patron connecté : SON groupe seulement (stations non archivées), quel que soit le filtre.
create or replace function public.group_fuel_dashboard(
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
  v_ids uuid[];
begin
  select id into v_org from public.organizations where owner_id = auth.uid();
  if v_org is null then
    raise exception 'Réservé au chef d''entreprise.' using errcode = '42501';
  end if;
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids
  from public.stations s
  where s.organization_id = v_org and s.group_archived_at is null
    and (p_station_ids is null or s.id = any(p_station_ids));
  return public._fuel_dashboard_core(v_ids, p_from, p_to, p_bucket);
end;
$$;
revoke all on function public.group_fuel_dashboard(timestamptz, timestamptz, uuid[], text) from public, anon;
grant execute on function public.group_fuel_dashboard(timestamptz, timestamptz, uuid[], text) to authenticated;

-- Super Admin : toutes les stations de la plateforme.
create or replace function public.superadmin_fuel_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  return public._fuel_dashboard_core((select coalesce(array_agg(id), '{}'::uuid[]) from public.stations), p_from, p_to, p_bucket);
end;
$$;
revoke all on function public.superadmin_fuel_overview(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.superadmin_fuel_overview(timestamptz, timestamptz, text) to authenticated;
