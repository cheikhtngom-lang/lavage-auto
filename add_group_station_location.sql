-- ═══════════════════════════════════════════════════════════════════════
--  Offre « Sur mesure » — QUARTIER, RÉGION ET POSITION d'une nouvelle station
--
--  Quand le patron ajoute une nouvelle station à sa commande, il renseigne
--  aussi son quartier et sa région (comme à l'inscription d'une station) : ce
--  sont eux qui permettent aux automobilistes de la trouver par la recherche.
--  Le navigateur peut y joindre lat/lng (calculés depuis le quartier) pour
--  que la station apparaisse tout de suite dans « Ma position ».
--
--  Redéfinit _group_price_lines (devis / commande : quartier et région
--  obligatoires, lat/lng facultatifs et bornés) et _apply_group_order (les
--  copie dans la station créée après paiement).
--
--  ORDRE D'EXÉCUTION : APRÈS add_sur_mesure_groups.sql ET
--  add_group_volume_discount.sql. Relancer l'un d'eux ANNULE ce changement
--  (ils remettent les fonctions d'origine) : relancer alors ce fichier en
--  dernier. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

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
  v_quartier text;
  v_region text;
  v_lat double precision;
  v_lng double precision;
  v_geo jsonb;
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
      -- Position géographique : le quartier et la région permettent aux automobilistes
      -- de trouver la station ; lat/lng (facultatifs, calculés par le navigateur à
      -- partir du quartier) affinent la distance affichée.
      v_quartier := trim(coalesce(v_line->>'quartier', ''));
      v_region := trim(coalesce(v_line->>'region', ''));
      if length(v_quartier) < 2 or length(v_quartier) > 100 then raise exception 'Renseignez le quartier de chaque station (2 à 100 caractères).'; end if;
      if length(v_region) < 1 or length(v_region) > 60 then raise exception 'Choisissez la région de chaque station.'; end if;
      v_geo := '{}'::jsonb;
      if jsonb_typeof(v_line->'lat') = 'number' and jsonb_typeof(v_line->'lng') = 'number' then
        v_lat := (v_line->>'lat')::double precision;
        v_lng := (v_line->>'lng')::double precision;
        if v_lat between -90 and 90 and v_lng between -180 and 180 then
          v_geo := jsonb_build_object('lat', v_lat, 'lng', v_lng);
        end if;
      end if;
      v_out := v_out || (jsonb_build_object('type', 'new', 'name', v_name, 'city', v_city, 'quartier', v_quartier, 'region', v_region, 'plan', v_plan,
        'price', v_price, 'unit_price', v_unit, 'discount_pct', v_pct, 'list_amount', v_list_amount, 'amount', v_amount) || v_geo);

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

create or replace function public._apply_group_order(p_order_id uuid, p_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.organization_orders;
  v_org public.organizations;
  v_owner public.profiles;
  v_line jsonb;
  v_date timestamptz;
  v_sid uuid;
begin
  select * into v_order from public.organization_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Commande introuvable.'; end if;
  if v_order.status <> 'PENDING' then return; end if; -- déjà traitée : idempotent

  select * into v_org from public.organizations where id = v_order.organization_id for update;
  select * into v_owner from public.profiles where id = v_org.owner_id;

  if v_order.kind = 'commande' then
    v_date := coalesce(v_org.next_billing_date, now() + interval '30 days');

    for v_line in select * from jsonb_array_elements(v_order.lines) loop
      if v_line->>'type' = 'new' then
        insert into public.stations (
          created_by, name, owner_name, owner_email, owner_phone, city, quartier, region, lat, lng, country, status, organization_id, group_origin
        ) values (
          v_org.owner_id, v_line->>'name', v_owner.full_name, v_owner.email, coalesce(v_owner.phone, ''),
          coalesce(nullif(v_line->>'city', ''), ''), nullif(v_line->>'quartier', ''), nullif(v_line->>'region', ''),
          case when jsonb_typeof(v_line->'lat') = 'number' then (v_line->>'lat')::double precision end,
          case when jsonb_typeof(v_line->'lng') = 'number' then (v_line->>'lng')::double precision end,
          coalesce(v_owner.country, 'SN'), 'active', v_org.id, 'created'
        ) returning id into v_sid;
      else
        v_sid := (v_line->>'station_id')::uuid;
        update public.stations
           set organization_id = v_org.id,
               group_origin = coalesce(group_origin, 'joined'),
               group_archived_at = null,
               status = 'active'
         where id = v_sid;
        update public.group_join_requests set status = 'attached', decided_at = coalesce(decided_at, now())
         where station_id = v_sid and organization_id = v_org.id and status = 'accepted';
      end if;

      -- Le groupe paie : pas d'essai, abonnement à jour jusqu'à l'échéance commune.
      update public.station_billing
         set plan = v_line->>'plan', subscription_status = 'a_jour',
             next_billing_date = v_date, trial_ends_at = null
       where station_id = v_sid;
    end loop;

    update public.organizations set status = 'a_jour', next_billing_date = v_date where id = v_org.id;

  else -- renouvellement : +30 jours pour tout le groupe
    v_date := greatest(coalesce(v_org.next_billing_date, now()), now()) + interval '30 days';
    update public.station_billing
       set subscription_status = 'a_jour', next_billing_date = v_date
     where station_id in (
       select id from public.stations
       where organization_id = v_org.id and group_archived_at is null and status = 'active'
     );
    update public.organizations set status = 'a_jour', next_billing_date = v_date where id = v_org.id;
  end if;

  update public.organization_orders
     set status = 'CONFIRMED', confirmed_at = now(), paydunya_token = coalesce(p_token, paydunya_token)
   where id = p_order_id;

  insert into public.audit_log (actor, action)
  values (case when p_token is null then 'Super Admin' else 'PayDunya' end,
          'Groupe « ' || v_org.name || ' » : ' || v_order.kind || ' de ' || v_order.amount || ' FCFA confirmé(e)');
end;
$$;
revoke all on function public._apply_group_order(uuid, text) from public, anon, authenticated;
grant execute on function public._apply_group_order(uuid, text) to service_role;
