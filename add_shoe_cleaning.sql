-- ══════════════════════════════════════════════════════════════════════
-- Lavage de chaussures : même principe que les tapis (demande des stations,
-- 13/11/2026). Le client dépose ses paires, reçoit un ticket et un lien de
-- suivi, la station fait avancer le dépôt (Déposé, Lavage, Séchage, Prêt,
-- Récupéré) et l'encaisse.
--
-- Les chaussures vivent dans la même table que les tapis (carpet_orders), avec
-- une colonne `activity` : 'tapis' (défaut, tous les dépôts existants) ou
-- 'chaussures'. Tout le reste est commun : lien /tapis.html?t=…, rattachement
-- au compte du client, notes internes, stations partenaires.
--
-- Ce qui change selon l'activité :
--  - numéro de ticket : une suite par station ET par activité (tapis n° 1, 2…
--    et chaussures n° 1, 2…) ;
--  - encaissement : transaction « Chaussures » (Comptabilité, Analytique à
--    part) et, pour une station partenaire, dépense « Chaussures (station
--    partenaire) ».
--
-- À exécuter après add_carpet_cleaning.sql, add_carpet_piece_notes.sql et
-- add_carpet_partner_stations.sql. Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Colonne activité ───────────────────────────────────────────────
alter table public.carpet_orders add column if not exists activity text not null default 'tapis';
do $$
begin
  alter table public.carpet_orders add constraint carpet_orders_activity_check check (activity in ('tapis', 'chaussures'));
exception when duplicate_object then null;
end $$;

-- Numéro de ticket unique par station et par activité.
alter table public.carpet_orders drop constraint if exists carpet_orders_station_id_ticket_no_key;
create unique index if not exists carpet_orders_station_activity_ticket_key on public.carpet_orders (station_id, activity, ticket_no);
create index if not exists carpet_orders_station_activity_idx on public.carpet_orders (station_id, activity, created_at desc);

-- ─── 2. Trigger : ticket par activité, activité figée ──────────────────
create or replace function public.carpet_orders_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    new.activity := coalesce(new.activity, 'tapis');
    -- Un verrou par station et activité : deux dépôts simultanés n'ont jamais le même numéro.
    perform pg_advisory_xact_lock(hashtext('carpet_ticket_' || new.station_id::text || '_' || new.activity));
    select coalesce(max(ticket_no), 0) + 1 into new.ticket_no
      from public.carpet_orders where station_id = new.station_id and activity = new.activity;
    if not v_trusted then
      new.from_order_id := null;
      new.partner_order_id := null;
    end if;
    if new.from_station_id = new.station_id then new.from_station_id := null; end if;
  else
    new.updated_at := now();
    -- Le ticket, la station, l'activité et le jeton ne changent jamais.
    new.ticket_no := old.ticket_no;
    new.station_id := old.station_id;
    new.activity := old.activity;
    new.public_token := old.public_token;
    if not v_trusted then
      new.from_station_id := old.from_station_id;
      new.from_order_id := old.from_order_id;
      new.partner_order_id := old.partner_order_id;
    end if;
  end if;
  if new.status = 'pret' and new.ready_at is null then new.ready_at := now(); end if;
  if new.status = 'recupere' then
    if new.ready_at is null then new.ready_at := now(); end if;
    if new.picked_up_at is null then new.picked_up_at := now(); end if;
  end if;
  -- Retour en arrière (erreur de clic) : on efface les dates devenues fausses.
  if new.status in ('depose', 'lavage', 'sechage') then new.ready_at := null; new.picked_up_at := null; end if;
  if new.status = 'pret' then new.picked_up_at := null; end if;
  return new;
end;
$$;

-- ─── 3. Page publique du lien de suivi : l'activité en plus ────────────
create or replace function public.carpet_public_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'activity', c.activity,
    'ticket_no', c.ticket_no,
    'first_name', split_part(trim(c.client_name), ' ', 1),
    'items', c.items,
    'piece_count', c.piece_count,
    'amount', c.amount,
    'paid', c.paid,
    'status', c.status,
    'promised_at', c.promised_at,
    'ready_at', c.ready_at,
    'picked_up_at', c.picked_up_at,
    'created_at', c.created_at,
    'claimed', c.client_id is not null,
    'station', jsonb_build_object(
      'name', st.name, 'phone', st.owner_phone, 'address', st.address, 'quartier', st.quartier,
      'lat', st.lat, 'lng', st.lng, 'open_time', st.open_time, 'close_time', st.close_time
    )
  )
  from public.carpet_orders c
  join public.stations st on st.id = c.station_id
  where c.public_token = p_token;
$$;
revoke all on function public.carpet_public_status(uuid) from public;
grant execute on function public.carpet_public_status(uuid) to anon, authenticated;

-- ─── 4. Confier à une station partenaire : même activité ───────────────
create or replace function public.carpet_outsource(p_order_id uuid, p_partner_station_id uuid, p_promised_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.carpet_orders%rowtype;
  me public.stations%rowtype;
  v_partner_status text;
  v_new uuid;
begin
  select * into o from public.carpet_orders where id = p_order_id for update;
  if o.id is null then raise exception 'Dépôt introuvable'; end if;
  if o.station_id is distinct from current_station_id() then raise exception 'Accès refusé'; end if;
  if o.status not in ('depose', 'lavage', 'sechage') then raise exception 'Ce dépôt est déjà prêt, récupéré ou annulé'; end if;
  if p_partner_station_id is null or p_partner_station_id = o.station_id then raise exception 'Choisissez une autre station'; end if;
  if not exists (select 1 from public.stations where id = p_partner_station_id and status = 'active') then
    raise exception 'Cette station n''est pas disponible';
  end if;
  if o.partner_order_id is not null then
    select status into v_partner_status from public.carpet_orders where id = o.partner_order_id;
    if v_partner_status is not null and v_partner_status <> 'annule' then
      raise exception 'Ce dépôt est déjà confié à une station partenaire';
    end if;
  end if;
  select * into me from public.stations where id = o.station_id;

  insert into public.carpet_orders (station_id, activity, ticket_no, client_name, client_phone, items, piece_count, amount, promised_at, from_station_id, from_order_id)
  values (
    p_partner_station_id, o.activity, 0, coalesce(nullif(trim(me.name), ''), 'Station partenaire'), me.owner_phone,
    coalesce((select jsonb_agg(it - 'price') from jsonb_array_elements(o.items) it), '[]'::jsonb),
    o.piece_count, 0, coalesce(p_promised_at, o.promised_at), o.station_id, o.id
  )
  returning id into v_new;

  update public.carpet_orders set partner_order_id = v_new where id = o.id;
  return v_new;
end;
$$;
revoke all on function public.carpet_outsource(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.carpet_outsource(uuid, uuid, timestamptz) to authenticated;

-- ─── 5. Encaissement : service « Tapis » ou « Chaussures » ─────────────
create or replace function public.carpet_record_payment(p_order_id uuid, p_method text, p_amount integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.carpet_orders%rowtype;
  v_amount integer;
  v_tx uuid;
  v_name text;
  v_shoes boolean;
begin
  select * into o from public.carpet_orders where id = p_order_id for update;
  if o.id is null then raise exception 'Dépôt introuvable'; end if;
  if o.station_id is distinct from current_station_id() and coalesce(app_role(), '') <> 'super_admin' then
    raise exception 'Accès refusé';
  end if;
  if o.paid then raise exception 'Ce dépôt est déjà encaissé'; end if;
  if o.status = 'annule' then raise exception 'Ce dépôt est annulé'; end if;
  v_amount := coalesce(p_amount, o.amount);
  if v_amount is null or v_amount <= 0 then raise exception 'Montant à indiquer'; end if;
  v_shoes := o.activity = 'chaussures';

  insert into public.transactions (station_id, client_id, client_name, vehicle_label, service, method, amount)
  values (
    o.station_id, o.client_id, o.client_name,
    case when v_shoes then 'Ticket chaussures n° ' else 'Ticket tapis n° ' end || o.ticket_no,
    case when v_shoes then 'Chaussures' else 'Tapis' end,
    coalesce(nullif(trim(p_method), ''), 'Espèces'), v_amount
  )
  returning id into v_tx;

  update public.carpet_orders
     set paid = true, amount = v_amount, payment_method = coalesce(nullif(trim(p_method), ''), 'Espèces'), transaction_id = v_tx
   where id = o.id;

  -- Client = une station Galsen : la somme devient une dépense chez elle.
  if o.from_station_id is not null then
    select name into v_name from public.stations where id = o.station_id;
    insert into public.expenses (station_id, label, amount, category, activity)
    values (
      o.from_station_id,
      case when v_shoes then 'Lavage de chaussures chez ' else 'Lavage de tapis chez ' end
        || coalesce(v_name, 'une station partenaire') || ' (ticket n° ' || o.ticket_no || ')',
      v_amount,
      case when v_shoes then 'Chaussures (station partenaire)' else 'Tapis (station partenaire)' end,
      'lavage'
    );
  end if;
  return v_tx;
end;
$$;
revoke all on function public.carpet_record_payment(uuid, text, integer) from public, anon;
grant execute on function public.carpet_record_payment(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
