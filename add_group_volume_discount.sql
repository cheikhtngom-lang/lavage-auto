-- ═══════════════════════════════════════════════════════════════════════
--  Offre « Sur mesure » — TARIF DÉGRESSIF (remise de volume)
--
--  Le prix par station baisse avec la TAILLE DU GROUPE :
--    1 à 4 stations  →  0 %
--    5 à 9 stations  →  5 %
--    10 et plus      →  10 %
--  La taille du groupe = stations ACTIVES du groupe (hors archivées) + celles
--  de la commande en cours. La remise s'applique à TOUTES les stations au
--  renouvellement mensuel ; à une commande en cours de cycle, seules les
--  stations ajoutées en profitent tout de suite (les autres ont déjà payé
--  leur mois, sans remboursement) puis tout le groupe au renouvellement.
--
--  Les paliers vivent dans la table group_discount_tiers : pour les changer,
--  modifier ces lignes (aucun code à toucher). Le serveur reste la seule
--  source de vérité du montant facturé.
--
--  ORDRE D'EXÉCUTION : à lancer APRÈS add_sur_mesure_groups.sql, et jamais
--  avant : ce fichier redéfinit _group_price_lines et create_group_renewal.
--  Relancer add_sur_mesure_groups.sql ensuite ANNULERAIT la remise (elle
--  remet les fonctions d'origine) — dans ce cas, relancer ce fichier après.
--  Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Paliers ────────────────────────────────────────────────────────
create table if not exists public.group_discount_tiers (
  min_stations integer primary key check (min_stations >= 1),
  pct integer not null check (pct between 0 and 90)
);
insert into public.group_discount_tiers (min_stations, pct) values (1, 0), (5, 5), (10, 10)
on conflict (min_stations) do nothing;

alter table public.group_discount_tiers enable row level security;
drop policy if exists group_discount_tiers_select on public.group_discount_tiers;
create policy group_discount_tiers_select on public.group_discount_tiers
  for select to authenticated using (true);
-- Lecture seule côté navigateur ; les paliers se changent en SQL.
revoke all on table public.group_discount_tiers from anon;
revoke insert, update, delete, truncate on table public.group_discount_tiers from authenticated;

-- Remise (en %) applicable à un groupe de p_count stations.
create or replace function public.group_discount_pct(p_count integer)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pct from public.group_discount_tiers
    where min_stations <= greatest(coalesce(p_count, 0), 0)
    order by min_stations desc limit 1
  ), 0)
$$;
revoke all on function public.group_discount_pct(integer) from public, anon, authenticated;

-- ─── 2. Tarification d'une commande, remise comprise ──────────────────
-- Même contrat qu'avant ({lines, total, days_left, first_cycle}) + :
--   stations_count, discount_pct, subtotal (avant remise), discount_amount,
--   next_tier {min_stations, pct, missing} (prochain palier, ou null), tiers
--   (paliers > 0 %, pour l'affichage) ; chaque ligne porte en plus unit_price
--   (prix mensuel remisé), discount_pct et list_amount (montant avant remise).
create or replace function public._group_price_lines(p_org public.organizations, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_line jsonb;
  v_out jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_subtotal integer := 0;
  v_days integer := 30;
  v_price integer;
  v_unit integer;
  v_amount integer;
  v_list_amount integer;
  v_type text;
  v_plan text;
  v_name text;
  v_city text;
  v_sid uuid;
  v_st public.stations;
  v_seen uuid[] := '{}';
  v_active integer;
  v_count integer;
  v_pct integer;
  v_next jsonb;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une station à la commande.';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Une commande est limitée à 50 stations.';
  end if;
  if p_org.status = 'en_retard' then
    raise exception 'Le groupe est en retard de paiement : réglez d''abord le renouvellement.';
  end if;

  if p_org.next_billing_date is not null then
    v_days := greatest(1, least(30, ceil(extract(epoch from (p_org.next_billing_date - now())) / 86400.0)::integer));
  end if;

  -- Taille du groupe APRÈS la commande → palier de remise.
  select count(*) into v_active from public.stations
  where organization_id = p_org.id and group_archived_at is null and status = 'active';
  v_count := v_active + jsonb_array_length(p_lines);
  v_pct := public.group_discount_pct(v_count);

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type := v_line->>'type';
    v_plan := v_line->>'plan';
    select price into v_price from public.plans where key = v_plan;
    if v_price is null then raise exception 'Offre inconnue : %.', coalesce(v_plan, '(vide)'); end if;

    v_unit := round(v_price * (100 - v_pct) / 100.0)::integer;
    v_list_amount := case when p_org.next_billing_date is null then v_price
                          else greatest(1, round(v_price * v_days / 30.0)::integer) end;
    v_amount := case when p_org.next_billing_date is null then v_unit
                     else greatest(1, round(v_unit * v_days / 30.0)::integer) end;

    if v_type = 'new' then
      v_name := trim(coalesce(v_line->>'name', ''));
      v_city := trim(coalesce(v_line->>'city', ''));
      if length(v_name) < 2 or length(v_name) > 100 then raise exception 'Chaque station doit avoir un nom (2 à 100 caractères).'; end if;
      if length(v_city) > 80 then raise exception 'Nom de ville trop long.'; end if;
      v_out := v_out || jsonb_build_object('type', 'new', 'name', v_name, 'city', v_city, 'plan', v_plan,
        'price', v_price, 'unit_price', v_unit, 'discount_pct', v_pct, 'list_amount', v_list_amount, 'amount', v_amount);

    elsif v_type = 'existing' then
      begin
        v_sid := (v_line->>'station_id')::uuid;
      exception when others then
        raise exception 'Station invalide dans la commande.';
      end;
      if v_sid = any(v_seen) then raise exception 'Une station apparaît deux fois dans la commande.'; end if;
      v_seen := v_seen || v_sid;
      select * into v_st from public.stations where id = v_sid;
      if v_st.id is null then raise exception 'Station introuvable.'; end if;
      -- Soit une station qui a ACCEPTÉ de rejoindre le groupe, soit une station
      -- archivée du groupe que le patron réactive.
      if not (
        exists (select 1 from public.group_join_requests r
                where r.station_id = v_sid and r.organization_id = p_org.id and r.status = 'accepted')
        or (v_st.organization_id = p_org.id and v_st.group_archived_at is not null)
      ) then
        raise exception 'La station « % » n''a pas accepté de rejoindre votre groupe.', v_st.name;
      end if;
      v_out := v_out || jsonb_build_object('type', 'existing', 'station_id', v_sid, 'name', v_st.name, 'plan', v_plan,
        'price', v_price, 'unit_price', v_unit, 'discount_pct', v_pct, 'list_amount', v_list_amount, 'amount', v_amount);
    else
      raise exception 'Type de ligne inconnu.';
    end if;
    v_total := v_total + v_amount;
    v_subtotal := v_subtotal + v_list_amount;
  end loop;

  select jsonb_build_object('min_stations', t.min_stations, 'pct', t.pct, 'missing', t.min_stations - v_count)
    into v_next
  from public.group_discount_tiers t
  where t.min_stations > v_count and t.pct > v_pct
  order by t.min_stations limit 1;

  return jsonb_build_object(
    'lines', v_out, 'total', v_total, 'days_left', v_days, 'first_cycle', p_org.next_billing_date is null,
    'stations_count', v_count, 'discount_pct', v_pct, 'subtotal', v_subtotal, 'discount_amount', v_subtotal - v_total,
    'next_tier', v_next,
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('min_stations', min_stations, 'pct', pct) order by min_stations), '[]'::jsonb)
              from public.group_discount_tiers where pct > 0));
end;
$$;
revoke all on function public._group_price_lines(public.organizations, jsonb) from public, anon, authenticated;

-- ─── 3. Renouvellement mensuel, remise comprise ───────────────────────
-- Toutes les stations actives du groupe au tarif du palier de leur nombre.
create or replace function public.create_group_renewal()
returns public.organization_orders
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_lines jsonb;
  v_total integer;
  v_count integer;
  v_pct integer;
  v_row public.organization_orders;
begin
  select * into v_org from public.organizations where owner_id = auth.uid() for update;
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;
  if v_org.next_billing_date is null then
    raise exception 'Le groupe n''a pas encore de première commande payée : rien à renouveler.';
  end if;

  select count(*) into v_count
  from public.stations s
  join public.station_billing b on b.station_id = s.id
  join public.plans p on p.key = b.plan
  where s.organization_id = v_org.id and s.group_archived_at is null and s.status = 'active';
  v_pct := public.group_discount_pct(v_count);

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', 'renewal', 'station_id', s.id, 'name', s.name, 'plan', b.plan,
           'price', p.price, 'unit_price', round(p.price * (100 - v_pct) / 100.0)::integer,
           'discount_pct', v_pct, 'list_amount', p.price,
           'amount', round(p.price * (100 - v_pct) / 100.0)::integer)), '[]'::jsonb),
         coalesce(sum(round(p.price * (100 - v_pct) / 100.0)::integer), 0)
    into v_lines, v_total
  from public.stations s
  join public.station_billing b on b.station_id = s.id
  join public.plans p on p.key = b.plan
  where s.organization_id = v_org.id and s.group_archived_at is null and s.status = 'active';

  if v_total <= 0 then raise exception 'Aucune station active dans le groupe : rien à renouveler.'; end if;

  -- Réutilise le renouvellement déjà en attente (mise à jour du montant).
  select * into v_row from public.organization_orders
  where organization_id = v_org.id and kind = 'renouvellement' and status = 'PENDING'
    and paydunya_token is null and reference is null
  order by created_at desc limit 1;
  if v_row.id is not null then
    update public.organization_orders set amount = v_total, lines = v_lines where id = v_row.id returning * into v_row;
  else
    insert into public.organization_orders (organization_id, kind, amount, lines)
    values (v_org.id, 'renouvellement', v_total, v_lines) returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.create_group_renewal() from public, anon;
grant execute on function public.create_group_renewal() to authenticated;
