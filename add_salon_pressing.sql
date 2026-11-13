-- ══════════════════════════════════════════════════════════════════════
-- Activités à la carte : Tapis, Chaussures, Salon et Pressing (13/11/2026)
--
-- Demande de l'utilisateur :
--  - Tapis et Chaussures ne sont plus offerts d'office : le Super Admin les
--    active pour une station qui le souhaite (Super Admin > Modules) ;
--  - nouvelle activité Salon (canapés, fauteuils, matelas), à la station ou
--    à domicile ;
--  - nouvelle activité Pressing (vêtements, linge), avec ce qu'un logiciel de
--    pressing propose : traitement par article (lavage + repassage, nettoyage
--    à sec, repassage seul, détachage), tarifs de la station, express, avance
--    (acompte) puis solde, emplacement sur le portant, étiquettes, collecte et
--    livraison ;
--  - chaque activité est un abonnement à part (module payant).
--
-- Tout reste dans carpet_orders (colonne `activity`) : ticket numéroté par
-- activité, lien de suivi /tapis.html, « Mes dépôts » du client, stations
-- partenaires, Comptabilité (service « Salon », « Pressing »).
--
-- À exécuter après add_shoe_cleaning.sql. Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Quatre activités ───────────────────────────────────────────────
alter table public.carpet_orders drop constraint if exists carpet_orders_activity_check;
alter table public.carpet_orders add constraint carpet_orders_activity_check
  check (activity in ('tapis', 'chaussures', 'salon', 'pressing'));

-- ─── 2. Avance, express, domicile, emplacement ─────────────────────────
alter table public.carpet_orders
  -- Total déjà encaissé (avances comprises). paid = true quand tout est réglé.
  add column if not exists amount_paid integer not null default 0 check (amount_paid >= 0),
  -- Pressing express : supplément compris dans amount.
  add column if not exists express boolean not null default false,
  add column if not exists express_fee integer not null default 0 check (express_fee >= 0),
  -- 'station' (dépôt) ou 'domicile' (salon nettoyé chez le client, linge collecté et livré).
  add column if not exists place text not null default 'station',
  add column if not exists address text,
  -- Frais de déplacement ou de livraison, compris dans amount.
  add column if not exists travel_fee integer not null default 0 check (travel_fee >= 0),
  -- Emplacement du linge prêt (« Portant B, 12 ») : la station le retrouve vite.
  add column if not exists rack text;
do $$
begin
  alter table public.carpet_orders add constraint carpet_orders_place_check check (place in ('station', 'domicile'));
exception when duplicate_object then null;
end $$;

-- Dépôts déjà encaissés : tout est payé.
update public.carpet_orders set amount_paid = amount where paid and amount_paid = 0 and amount > 0;

-- ─── 3. Modules : une activité ne sert qu'aux stations qui l'ont ───────
-- Clé du module = 'mod_' || activité (lib/stationModules.js).
create or replace function public.station_has_activity(p_station_id uuid, p_activity text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.station_billing b
     where b.station_id = p_station_id
       and ('mod_' || p_activity) = any (coalesce(b.active_modules, '{}'))
  );
$$;
revoke all on function public.station_has_activity(uuid, text) from public, anon;
grant execute on function public.station_has_activity(uuid, text) to authenticated;

-- Une station n'enregistre un dépôt que dans une activité activée.
drop policy if exists "carpet_orders_insert" on public.carpet_orders;
create policy "carpet_orders_insert" on public.carpet_orders for insert
  with check (station_id = current_station_id() and public.station_has_activity(station_id, activity));

-- Les stations qui utilisaient déjà Tapis ou Chaussures les gardent : le
-- module correspondant est activé pour elles (rien ne disparaît de leur menu).
-- (une ligne par station, tous ses modules d'un coup : un UPDATE … FROM ne
-- prend qu'une ligne source par station)
update public.station_billing b
   set active_modules = (select array(select distinct x from unnest(coalesce(b.active_modules, '{}') || a.mods) x order by x))
  from (
    select u.station_id, array_agg(distinct 'mod_' || u.activity) mods
      from (select station_id, activity from public.carpet_orders where activity in ('tapis', 'chaussures')
            union
            select from_station_id, activity from public.carpet_orders where from_station_id is not null and activity in ('tapis', 'chaussures')) u
     group by u.station_id
  ) a
 where b.station_id = a.station_id
   and not (a.mods <@ coalesce(b.active_modules, '{}'));

-- ─── 4. Tarifs de la station, par activité ─────────────────────────────
create table if not exists public.deposit_price_lists (
  station_id uuid not null references public.stations(id) on delete cascade,
  activity text not null check (activity in ('tapis', 'chaussures', 'salon', 'pressing')),
  -- { "Chemise": 500, "Pantalon": 700, … } : prix de base par type de pièce.
  prices jsonb not null default '{}'::jsonb,
  -- { "expressRate": 50, "travelFee": 1000, "factors": { "sec": 1.5, … } }
  options jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (station_id, activity)
);
alter table public.deposit_price_lists enable row level security;
drop policy if exists "deposit_price_lists_select" on public.deposit_price_lists;
create policy "deposit_price_lists_select" on public.deposit_price_lists for select
  using (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "deposit_price_lists_insert" on public.deposit_price_lists;
create policy "deposit_price_lists_insert" on public.deposit_price_lists for insert
  with check (station_id = current_station_id());
drop policy if exists "deposit_price_lists_update" on public.deposit_price_lists;
create policy "deposit_price_lists_update" on public.deposit_price_lists for update
  using (station_id = current_station_id()) with check (station_id = current_station_id());
drop policy if exists "deposit_price_lists_delete" on public.deposit_price_lists;
create policy "deposit_price_lists_delete" on public.deposit_price_lists for delete
  using (station_id = current_station_id());

-- ─── 5. Lien de suivi : avance, express, domicile ──────────────────────
-- L'adresse et l'emplacement ne sortent jamais sur la page publique.
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
    'amount_paid', c.amount_paid,
    'paid', c.paid,
    'express', c.express,
    'express_fee', c.express_fee,
    'place', c.place,
    'travel_fee', c.travel_fee,
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

-- ─── 6. Encaissement : avance ou solde, quatre services ────────────────
-- p_advance = false (défaut, comme avant) : solde. p_amount = ce que le client
-- paie maintenant (défaut : le reste dû) ; le dépôt passe « payé » et son
-- montant final = tout ce qui a été encaissé. Sans avance, c'est exactement
-- l'ancien comportement (p_amount corrige le prix).
-- p_advance = true : avance ; le dépôt reste à encaisser pour le reste (sauf
-- si l'avance couvre tout).
drop function if exists public.carpet_record_payment(uuid, text, integer);
create or replace function public.carpet_record_payment(p_order_id uuid, p_method text, p_amount integer default null, p_advance boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.carpet_orders%rowtype;
  v_amount integer;
  v_due integer;
  v_final boolean;
  v_tx uuid;
  v_name text;
  v_service text;
  v_method text := coalesce(nullif(trim(p_method), ''), 'Espèces');
begin
  select * into o from public.carpet_orders where id = p_order_id for update;
  if o.id is null then raise exception 'Dépôt introuvable'; end if;
  if o.station_id is distinct from current_station_id() and coalesce(app_role(), '') <> 'super_admin' then
    raise exception 'Accès refusé';
  end if;
  if o.paid then raise exception 'Ce dépôt est déjà encaissé'; end if;
  if o.status = 'annule' then raise exception 'Ce dépôt est annulé'; end if;
  v_due := greatest(o.amount - o.amount_paid, 0);
  if coalesce(p_advance, false) then
    v_amount := p_amount;
    v_final := o.amount > 0 and coalesce(v_amount, 0) >= v_due;
  else
    v_amount := coalesce(p_amount, v_due);
    v_final := true;
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Montant à indiquer'; end if;
  v_service := case o.activity when 'chaussures' then 'Chaussures' when 'salon' then 'Salon' when 'pressing' then 'Pressing' else 'Tapis' end;

  insert into public.transactions (station_id, client_id, client_name, vehicle_label, service, method, amount)
  values (
    o.station_id, o.client_id, o.client_name,
    'Ticket ' || lower(v_service) || ' n° ' || o.ticket_no || case when v_final then '' else ' (avance)' end,
    v_service, v_method, v_amount
  )
  returning id into v_tx;

  if v_final then
    update public.carpet_orders
       set paid = true, amount_paid = o.amount_paid + v_amount, amount = o.amount_paid + v_amount,
           payment_method = v_method, transaction_id = v_tx
     where id = o.id;
  else
    update public.carpet_orders
       set amount_paid = o.amount_paid + v_amount, payment_method = v_method, transaction_id = v_tx
     where id = o.id;
  end if;

  -- Client = une station Galsen : la somme devient une dépense chez elle.
  if o.from_station_id is not null then
    select name into v_name from public.stations where id = o.station_id;
    insert into public.expenses (station_id, label, amount, category, activity)
    values (
      o.from_station_id,
      v_service || ' chez ' || coalesce(v_name, 'une station partenaire') || ' (ticket n° ' || o.ticket_no || ')',
      v_amount,
      v_service || ' (station partenaire)',
      'lavage'
    );
  end if;
  return v_tx;
end;
$$;
revoke all on function public.carpet_record_payment(uuid, text, integer, boolean) from public, anon;
grant execute on function public.carpet_record_payment(uuid, text, integer, boolean) to authenticated;

-- ─── 7. Stations partenaires : seulement celles qui ont l'activité ─────
create or replace function public.carpet_partner_stations(p_activity text)
returns table (id uuid, name text, owner_phone text, quartier text, city text, region text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.owner_phone, s.quartier, s.city, s.region
    from public.stations s
    join public.station_billing b on b.station_id = s.id
   where s.status = 'active'
     and ('mod_' || p_activity) = any (coalesce(b.active_modules, '{}'))
   order by s.name;
$$;
revoke all on function public.carpet_partner_stations(text) from public, anon;
grant execute on function public.carpet_partner_stations(text) to authenticated;

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
  if o.place = 'domicile' and o.activity = 'salon' then raise exception 'Une intervention à domicile ne se confie pas'; end if;
  if p_partner_station_id is null or p_partner_station_id = o.station_id then raise exception 'Choisissez une autre station'; end if;
  if not exists (select 1 from public.stations where id = p_partner_station_id and status = 'active') then
    raise exception 'Cette station n''est pas disponible';
  end if;
  if not public.station_has_activity(p_partner_station_id, o.activity) then
    raise exception 'Cette station ne propose pas cette activité';
  end if;
  if o.partner_order_id is not null then
    select status into v_partner_status from public.carpet_orders where id = o.partner_order_id;
    if v_partner_status is not null and v_partner_status <> 'annule' then
      raise exception 'Ce dépôt est déjà confié à une station partenaire';
    end if;
  end if;
  select * into me from public.stations where id = o.station_id;

  insert into public.carpet_orders (station_id, activity, ticket_no, client_name, client_phone, items, piece_count, amount, promised_at, from_station_id, from_order_id, express)
  values (
    p_partner_station_id, o.activity, 0, coalesce(nullif(trim(me.name), ''), 'Station partenaire'), me.owner_phone,
    coalesce((select jsonb_agg(it - 'price') from jsonb_array_elements(o.items) it), '[]'::jsonb),
    o.piece_count, 0, coalesce(p_promised_at, o.promised_at), o.station_id, o.id, o.express
  )
  returning id into v_new;

  update public.carpet_orders set partner_order_id = v_new where id = o.id;
  return v_new;
end;
$$;
revoke all on function public.carpet_outsource(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.carpet_outsource(uuid, uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
