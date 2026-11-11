-- ══════════════════════════════════════════════════════════════════════
-- Tapis et moquettes : en plus des véhicules, la station lave les tapis de
-- salon et les moquettes que les clients lui déposent.
--
-- Parcours :
--  1. la station enregistre le dépôt (client, téléphone, pièces, prix, délai
--     promis, 48 h par défaut) et reçoit un ticket numéroté ;
--  2. elle envoie au client, sur WhatsApp, un lien /tapis.html?t=<jeton> :
--     sans compte, il y voit l'avancement ; un bouton l'amène à l'inscription
--     (ou à la connexion) et le dépôt rejoint alors son espace automobiliste,
--     rubrique « Mes tapis » ;
--  3. la station fait avancer le dépôt (Déposé, Lavage, Séchage, Prêt,
--     Récupéré) : le client voit « Prêt » avant de se déplacer ;
--  4. l'encaissement crée une ligne dans `transactions` (service « Tapis »),
--     donc le dépôt compte dans Transactions, Comptabilité, Analytique et
--     Bilan comme une activité à part.
--
-- Le jeton du lien est un uuid aléatoire, impossible à deviner. La page
-- publique ne montre que le prénom du client, jamais son téléphone ni la
-- note interne. À exécuter une fois. Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Dépôts ─────────────────────────────────────────────────────────
create table if not exists public.carpet_orders (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  -- Numéro de ticket propre à la station (1, 2, 3…), donné par le trigger.
  ticket_no integer not null,
  -- Jeton du lien de suivi envoyé au client.
  public_token uuid not null default gen_random_uuid() unique,
  -- Compte automobiliste, rempli quand le client ouvre le lien et se connecte.
  client_id uuid references public.profiles(id) on delete set null,
  client_name text not null check (length(trim(client_name)) > 0),
  client_phone text,
  -- [{ "kind": "Tapis de salon", "qty": 2 }, …]
  items jsonb not null default '[]'::jsonb,
  piece_count integer not null default 1 check (piece_count between 1 and 999),
  -- Prix total en FCFA (0 = prix fixé plus tard, au retrait).
  amount integer not null default 0 check (amount >= 0),
  paid boolean not null default false,
  payment_method text,
  transaction_id uuid references public.transactions(id) on delete set null,
  status text not null default 'depose'
    check (status in ('depose', 'lavage', 'sechage', 'pret', 'recupere', 'annule')),
  -- Date promise au client (« prêt sous 48 h »).
  promised_at timestamptz not null,
  ready_at timestamptz,
  picked_up_at timestamptz,
  -- Note interne de la station (taches, dimensions…) : jamais montrée au client.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (station_id, ticket_no)
);
create index if not exists carpet_orders_station_idx on public.carpet_orders (station_id, created_at desc);
create index if not exists carpet_orders_client_idx on public.carpet_orders (client_id) where client_id is not null;

-- ─── 2. Numéro de ticket et dates d'étape ──────────────────────────────
create or replace function public.carpet_orders_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Un verrou par station : deux dépôts simultanés n'ont jamais le même numéro.
    perform pg_advisory_xact_lock(hashtext('carpet_ticket_' || new.station_id::text));
    select coalesce(max(ticket_no), 0) + 1 into new.ticket_no
      from public.carpet_orders where station_id = new.station_id;
  else
    new.updated_at := now();
    -- Le ticket, la station et le jeton ne changent jamais.
    new.ticket_no := old.ticket_no;
    new.station_id := old.station_id;
    new.public_token := old.public_token;
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

drop trigger if exists carpet_orders_before_write on public.carpet_orders;
create trigger carpet_orders_before_write
  before insert or update on public.carpet_orders
  for each row execute function public.carpet_orders_before_write();

-- ─── 3. Droits (RLS) ───────────────────────────────────────────────────
-- La station voit et gère ses dépôts ; le client voit les siens (lecture
-- seule : le rattachement passe par carpet_claim ci-dessous).
alter table public.carpet_orders enable row level security;

drop policy if exists "carpet_orders_select" on public.carpet_orders;
create policy "carpet_orders_select" on public.carpet_orders for select
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');
drop policy if exists "carpet_orders_insert" on public.carpet_orders;
create policy "carpet_orders_insert" on public.carpet_orders for insert
  with check (station_id = current_station_id());
drop policy if exists "carpet_orders_update" on public.carpet_orders;
create policy "carpet_orders_update" on public.carpet_orders for update
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "carpet_orders_delete" on public.carpet_orders;
create policy "carpet_orders_delete" on public.carpet_orders for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- ─── 4. Page publique du lien de suivi (sans connexion) ────────────────
create or replace function public.carpet_public_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
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

-- ─── 5. Rattacher le dépôt au compte du client ─────────────────────────
-- Appelé depuis « Mes tapis » après l'inscription / la connexion. Un dépôt
-- déjà rattaché à un AUTRE compte reste où il est.
create or replace function public.carpet_claim(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(app_role(), '') <> 'automobiliste' then raise exception 'Réservé aux comptes automobilistes'; end if;
  select id, client_id into v_id, v_owner from public.carpet_orders where public_token = p_token for update;
  if v_id is null then raise exception 'Dépôt introuvable'; end if;
  if v_owner is not null and v_owner <> auth.uid() then raise exception 'Ce dépôt est déjà suivi par un autre compte'; end if;
  update public.carpet_orders set client_id = auth.uid() where id = v_id and client_id is null;
  return v_id;
end;
$$;
revoke all on function public.carpet_claim(uuid) from public;
-- Supabase donne d'office l'exécution à anon sur les nouvelles fonctions : retirée.
revoke execute on function public.carpet_claim(uuid) from anon;
grant execute on function public.carpet_claim(uuid) to authenticated;

-- ─── 6. Encaissement : une transaction « Tapis » ───────────────────────
-- p_amount : prix final (peut corriger le prix noté au dépôt).
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
  return v_tx;
end;
$$;
revoke all on function public.carpet_record_payment(uuid, text, integer) from public;
revoke execute on function public.carpet_record_payment(uuid, text, integer) from anon;
grant execute on function public.carpet_record_payment(uuid, text, integer) to authenticated;

-- ─── 7. Temps réel (le client voit « Prêt » sans recharger) ────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.carpet_orders;
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
