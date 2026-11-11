-- ══════════════════════════════════════════════════════════════════════
-- Tapis : une station confie des tapis à une AUTRE station du système.
--
-- La station A (qui envoie) et la station B (qui lave) sont deux stations
-- Galsen. Deux façons de faire :
--  1. A confie un dépôt de son client à B (carpet_outsource) : un dépôt est
--     créé chez B, au nom de la station A ; les deux dépôts sont liés
--     (A.partner_order_id = B.id, B.from_order_id = A.id) ;
--  2. B enregistre elle-même un dépôt dont le client est la station A
--     (B.from_station_id = A, sans dépôt lié chez A).
-- Dans les deux cas A voit ce dépôt chez B (onglet « Chez un partenaire »).
--
-- Avancement : quand B fait avancer un dépôt lié, celui du client de A suit
-- (Lavage, Séchage ; « Prêt » quand A a récupéré les tapis chez B), sans
-- jamais reculer. Paiement : B encaisse A comme n'importe quel client (recette
-- « Tapis » chez B) et une dépense « Tapis (station partenaire) » s'ajoute
-- automatiquement chez A.
--
-- À exécuter après add_carpet_cleaning.sql et add_carpet_piece_notes.sql.
-- Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes de liaison ────────────────────────────────────────────
-- Sur le dépôt de B : la station qui l'a apporté, et son dépôt d'origine.
alter table public.carpet_orders add column if not exists from_station_id uuid references public.stations(id) on delete set null;
alter table public.carpet_orders add column if not exists from_order_id uuid references public.carpet_orders(id) on delete set null;
-- Sur le dépôt de A : le dépôt créé chez la station partenaire.
alter table public.carpet_orders add column if not exists partner_order_id uuid references public.carpet_orders(id) on delete set null;
create index if not exists carpet_orders_from_station_idx on public.carpet_orders (from_station_id) where from_station_id is not null;

-- ─── 2. Trigger : liaisons posées par les fonctions seulement ──────────
-- Un utilisateur (rôle authenticated) peut choisir la station cliente au
-- dépôt (from_station_id), jamais fabriquer un lien entre deux dépôts : seules
-- les fonctions ci-dessous (exécutées par leur propriétaire) le peuvent.
create or replace function public.carpet_orders_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    -- Un verrou par station : deux dépôts simultanés n'ont jamais le même numéro.
    perform pg_advisory_xact_lock(hashtext('carpet_ticket_' || new.station_id::text));
    select coalesce(max(ticket_no), 0) + 1 into new.ticket_no
      from public.carpet_orders where station_id = new.station_id;
    if not v_trusted then
      new.from_order_id := null;
      new.partner_order_id := null;
    end if;
    if new.from_station_id = new.station_id then new.from_station_id := null; end if;
  else
    new.updated_at := now();
    -- Le ticket, la station et le jeton ne changent jamais.
    new.ticket_no := old.ticket_no;
    new.station_id := old.station_id;
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

-- ─── 3. Droits : A voit ses dépôts chez B ──────────────────────────────
drop policy if exists "carpet_orders_select" on public.carpet_orders;
create policy "carpet_orders_select" on public.carpet_orders for select
  using (
    station_id = current_station_id()
    or client_id = auth.uid()
    or from_station_id = current_station_id()
    or app_role() = 'super_admin'
  );

-- ─── 4. Confier un dépôt à une station partenaire ──────────────────────
-- Les pièces partent sans les prix de A (B fixe les siens) ; la date promise
-- par défaut est celle de A.
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

  insert into public.carpet_orders (station_id, ticket_no, client_name, client_phone, items, piece_count, amount, promised_at, from_station_id, from_order_id)
  values (
    p_partner_station_id, 0, coalesce(nullif(trim(me.name), ''), 'Station partenaire'), me.owner_phone,
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

-- Reprendre un dépôt confié, tant que la station partenaire ne l'a pas commencé.
create or replace function public.carpet_outsource_cancel(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.carpet_orders%rowtype;
  p public.carpet_orders%rowtype;
begin
  select * into o from public.carpet_orders where id = p_order_id for update;
  if o.id is null then raise exception 'Dépôt introuvable'; end if;
  if o.station_id is distinct from current_station_id() then raise exception 'Accès refusé'; end if;
  if o.partner_order_id is null then return; end if;
  select * into p from public.carpet_orders where id = o.partner_order_id for update;
  if p.id is not null and p.status not in ('depose', 'annule') then
    raise exception 'La station partenaire a déjà commencé le lavage : appelez-la.';
  end if;
  if p.id is not null and p.status = 'depose' then
    update public.carpet_orders set status = 'annule' where id = p.id;
  end if;
  update public.carpet_orders set partner_order_id = null where id = o.id;
end;
$$;
revoke all on function public.carpet_outsource_cancel(uuid) from public, anon;
grant execute on function public.carpet_outsource_cancel(uuid) to authenticated;

-- ─── 5. Avancement recopié sur le dépôt du client de A ────────────────
create or replace function public.carpet_orders_sync_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
  v_current text;
  v_link uuid;
  rank_of constant jsonb := '{"depose":0,"lavage":1,"sechage":2,"pret":3,"recupere":4}';
begin
  -- Chez B : lavage et séchage suivent ; « prêt chez B » = toujours au séchage
  -- pour le client de A (les tapis ne sont pas encore revenus) ; récupéré par
  -- A = prêt pour son client.
  v_target := case new.status
    when 'lavage' then 'lavage'
    when 'sechage' then 'sechage'
    when 'pret' then 'sechage'
    when 'recupere' then 'pret'
    else null end;
  if v_target is null then return null; end if;
  select status, partner_order_id into v_current, v_link from public.carpet_orders where id = new.from_order_id;
  -- Seulement si le lien est toujours actif des deux côtés, et sans jamais reculer.
  if v_current is null or v_link is distinct from new.id or v_current in ('recupere', 'annule') then return null; end if;
  if (rank_of ->> v_target)::int > (rank_of ->> v_current)::int then
    update public.carpet_orders set status = v_target where id = new.from_order_id;
  end if;
  return null;
end;
$$;
drop trigger if exists carpet_orders_sync_partner on public.carpet_orders;
create trigger carpet_orders_sync_partner
  after update of status on public.carpet_orders
  for each row
  when (new.from_order_id is not null and new.status is distinct from old.status)
  execute function public.carpet_orders_sync_partner();

-- ─── 6. Encaissement : dépense automatique chez la station cliente ─────
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

  insert into public.transactions (station_id, client_id, client_name, vehicle_label, service, method, amount)
  values (o.station_id, o.client_id, o.client_name, 'Ticket tapis n° ' || o.ticket_no, 'Tapis', coalesce(nullif(trim(p_method), ''), 'Espèces'), v_amount)
  returning id into v_tx;

  update public.carpet_orders
     set paid = true, amount = v_amount, payment_method = coalesce(nullif(trim(p_method), ''), 'Espèces'), transaction_id = v_tx
   where id = o.id;

  -- Client = une station Galsen : la somme devient une dépense chez elle.
  if o.from_station_id is not null then
    select name into v_name from public.stations where id = o.station_id;
    insert into public.expenses (station_id, label, amount, category, activity)
    values (o.from_station_id, 'Lavage de tapis chez ' || coalesce(v_name, 'une station partenaire') || ' (ticket n° ' || o.ticket_no || ')',
            v_amount, 'Tapis (station partenaire)', 'lavage');
  end if;
  return v_tx;
end;
$$;
revoke all on function public.carpet_record_payment(uuid, text, integer) from public, anon;
grant execute on function public.carpet_record_payment(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
