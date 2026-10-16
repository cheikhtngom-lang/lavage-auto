-- ══════════════════════════════════════════════════════════════════════
-- Boutique : gestion de stock + ventes sur place — à exécuter une fois dans
-- l'éditeur SQL Supabase, APRÈS add_station_shop.sql, add_shop_orders.sql et
-- add_shop_history.sql. Idempotent (rejouable sans risque).
--
-- 1. shop_products.low_stock_threshold : seuil de l'alerte « stock bas ».
-- 2. shop_sales : ventes saisies à la main par la station (un client vient
--    acheter sur place) — produits, quantités, prix, moyen de paiement.
--    Chaque vente crée AUSSI une ligne dans transactions (service
--    « Boutique ») : elle apparaît donc dans la Comptabilité, les
--    Transactions, l'Analytique et le Bilan comme tout autre encaissement.
-- 3. shop_stock_movements : journal de TOUS les mouvements de stock (stock
--    initial, entrées, ventes sur place, ventes en ligne, corrections,
--    annulations). Écrit par un TRIGGER sur shop_products.stock, comme
--    shop_product_events : il capte aussi les ventes en ligne, dont le stock
--    est baissé par l'Edge Function finalizePayment.ts (clé service_role).
-- 4. Fonctions appelées par l'app : shop_record_sale, shop_cancel_sale,
--    shop_stock_entry, shop_stock_set. Elles verrouillent la ligne produit
--    (FOR UPDATE) : deux ventes simultanées ne vendent jamais deux fois le
--    dernier article, et une vente supérieure au stock est REFUSÉE.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Seuil d'alerte « stock bas » ───────────────────────────────────
-- Alerte quand 0 < stock <= seuil ; stock = 0 = épuisé. Ignoré si le stock
-- n'est pas suivi (stock null = « sur commande »).
alter table public.shop_products add column if not exists low_stock_threshold integer not null default 3;
alter table public.shop_products drop constraint if exists shop_products_low_stock_ck;
alter table public.shop_products add constraint shop_products_low_stock_ck check (low_stock_threshold >= 0);

-- ─── 2. Ventes sur place ───────────────────────────────────────────────
create table if not exists public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  -- Lignes figées au moment de la vente (le produit peut changer de prix ou
  -- être supprimé ensuite) :
  -- [{product_id, name, category, unit_price, quantity, amount, stock_tracked}]
  items jsonb not null default '[]'::jsonb,
  amount integer not null default 0 check (amount >= 0),
  payment_method text not null check (payment_method in ('Espèces', 'Wave', 'Orange Money', 'Carte')),
  note text,
  -- La recette correspondante (Comptabilité). Le nom du client n'est stocké
  -- QUE dans transactions : il y est anonymisé à la fermeture d'un compte
  -- (add_account_closure.sql) sans autre table à maintenir.
  transaction_id uuid references public.transactions(id) on delete set null,
  status text not null default 'validee' check (status in ('validee', 'annulee')),
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid, -- compte qui a saisi la vente (pas de FK : simple trace)
  created_at timestamptz not null default now()
);
create index if not exists shop_sales_station_idx on public.shop_sales(station_id, created_at desc);

alter table public.shop_sales enable row level security;
grant select, insert, update, delete on public.shop_sales to authenticated;
grant select, insert, update, delete on public.shop_sales to service_role;

-- Lecture : la station et le Super Admin. Pas de policy d'insert/update : une
-- vente ne s'écrit que par shop_record_sale / shop_cancel_sale (stock +
-- recette dans la même transaction). Suppression : bouton « Vider
-- l'historique » (Paramètres), comme shop_orders_delete.
drop policy if exists "shop_sales_select" on public.shop_sales;
create policy "shop_sales_select" on public.shop_sales for select
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');
drop policy if exists "shop_sales_delete" on public.shop_sales;
create policy "shop_sales_delete" on public.shop_sales for delete
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- ─── 3. Journal des mouvements de stock ────────────────────────────────
create table if not exists public.shop_stock_movements (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  -- Pas de FK vers shop_products : le mouvement survit à la suppression du produit.
  product_id uuid,
  product_name text not null,
  movement_type text not null check (movement_type in (
    'stock_initial',    -- premier stock saisi (création du produit ou début du suivi)
    'entree',           -- réapprovisionnement
    'vente_sur_place',  -- vente saisie par la station (shop_record_sale)
    'vente_en_ligne',   -- commande payée en ligne (finalizePayment.ts)
    'correction',       -- inventaire / casse / modification directe
    'annulation_vente', -- vente sur place annulée : retour en stock
    'suivi_arrete'      -- le produit repasse « sur commande » (stock null)
  )),
  quantity integer not null,  -- variation signée : + entrée, − sortie
  stock_before integer,       -- null = stock pas encore suivi
  stock_after integer,        -- null = suivi arrêté
  note text,
  sale_id uuid references public.shop_sales(id) on delete set null,
  created_by uuid,
  -- true = mouvement reconstitué à la création de ce journal (stock constaté).
  backfilled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shop_stock_movements_station_idx on public.shop_stock_movements(station_id, created_at desc);
create index if not exists shop_stock_movements_product_idx on public.shop_stock_movements(product_id, created_at desc);

alter table public.shop_stock_movements enable row level security;
grant select, insert, update, delete on public.shop_stock_movements to authenticated;
grant select, insert, update, delete on public.shop_stock_movements to service_role;

-- Lecture seule pour la station : seul le trigger (security definer) écrit.
drop policy if exists "shop_stock_movements_select" on public.shop_stock_movements;
create policy "shop_stock_movements_select" on public.shop_stock_movements for select
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');
drop policy if exists "shop_stock_movements_delete" on public.shop_stock_movements;
create policy "shop_stock_movements_delete" on public.shop_stock_movements for delete
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- Trigger : un mouvement pour chaque changement de shop_products.stock. Le
-- motif vient du contexte posé par les fonctions de la section 4
-- (set_config local à la transaction) ; sans contexte, il est déduit.
create or replace function public.shop_log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.shop_stock_reason', true), '');
  v_note text := nullif(current_setting('app.shop_stock_note', true), '');
  v_sale uuid := nullif(current_setting('app.shop_stock_sale', true), '')::uuid;
  v_type text;
begin
  if tg_op = 'INSERT' then
    if new.stock is null then return new; end if;
    insert into public.shop_stock_movements (station_id, product_id, product_name, movement_type, quantity, stock_before, stock_after, note, created_by)
      values (new.station_id, new.id, new.name, 'stock_initial', new.stock, null, new.stock, v_note, auth.uid());
    return new;
  end if;

  if new.stock is not distinct from old.stock then return new; end if;

  if old.stock is null then
    v_type := 'stock_initial';
  elsif new.stock is null then
    v_type := 'suivi_arrete';
  elsif v_reason is not null then
    v_type := v_reason;
  elsif auth.role() = 'service_role' then
    -- Seul l'achat en ligne (finalizePayment.ts) modifie le stock avec la clé
    -- service_role sans passer par les fonctions ci-dessous.
    v_type := 'vente_en_ligne';
    v_note := coalesce(v_note, 'Commande payée en ligne');
  else
    v_type := 'correction'; -- ancien bouton ±1 (shop_adjust_stock), éditeur SQL…
  end if;

  insert into public.shop_stock_movements (station_id, product_id, product_name, movement_type, quantity, stock_before, stock_after, note, sale_id, created_by)
    values (new.station_id, new.id, new.name, v_type,
            case when v_type = 'suivi_arrete' then 0 else coalesce(new.stock, 0) - coalesce(old.stock, 0) end,
            old.stock, new.stock, v_note, v_sale, auth.uid());
  return new;
end;
$$;

drop trigger if exists shop_products_log_stock on public.shop_products;
create trigger shop_products_log_stock
  after insert or update of stock on public.shop_products
  for each row execute function public.shop_log_stock_movement();

-- ─── 4. Fonctions appelées par l'app ───────────────────────────────────

-- Efface le contexte du journal en fin de fonction : un autre changement de
-- stock dans la même transaction ne doit pas hériter de ce motif.
create or replace function public._shop_stock_context_clear()
returns void
language sql
as $$
  select set_config('app.shop_stock_reason', '', true), set_config('app.shop_stock_sale', '', true), set_config('app.shop_stock_note', '', true);
$$;
revoke all on function public._shop_stock_context_clear() from public, anon;

-- Vente sur place. p_items = [{product_id, quantity, unit_price}] ; le prix
-- est celui saisi par la station (prix affiché, remise négociée…). Refuse
-- toute la vente si une ligne dépasse le stock disponible. Renvoie
-- {sale_id, transaction_id, amount, items}.
create or replace function public.shop_record_sale(
  p_items jsonb,
  p_payment_method text,
  p_client_name text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station uuid := public.current_station_id();
  v_sale_id uuid;
  v_item jsonb;
  v_product public.shop_products%rowtype;
  v_qty integer;
  v_price integer;
  v_lines jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_tx_id uuid;
begin
  if v_station is null then
    raise exception 'Aucune station associée à ce compte.';
  end if;
  if not public.station_has_shop(v_station) then
    raise exception 'La boutique n''est pas activée pour cette station.';
  end if;
  if p_payment_method is null or p_payment_method not in ('Espèces', 'Wave', 'Orange Money', 'Carte') then
    raise exception 'Moyen de paiement non reconnu.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Ajoutez au moins un produit à la vente.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Trop de lignes dans une seule vente (50 au maximum).';
  end if;

  insert into public.shop_sales (station_id, payment_method, note, created_by)
    values (v_station, p_payment_method, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    returning id into v_sale_id;

  -- Contexte lu par le trigger du journal (local à cette transaction).
  perform set_config('app.shop_stock_reason', 'vente_sur_place', true);
  perform set_config('app.shop_stock_sale', v_sale_id::text, true);
  perform set_config('app.shop_stock_note', '', true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception 'Quantité invalide (au moins 1).';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Prix invalide.';
    end if;

    select * into v_product from public.shop_products
     where id = (v_item->>'product_id')::uuid and station_id = v_station
       for update;
    if not found then
      raise exception 'Produit introuvable dans votre boutique.';
    end if;

    if v_product.stock is not null then
      if v_product.stock < v_qty then
        raise exception 'Stock insuffisant pour « % » : % disponible(s), % demandé(s).', v_product.name, v_product.stock, v_qty;
      end if;
      update public.shop_products set stock = stock - v_qty where id = v_product.id;
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'name', v_product.name, 'category', v_product.category,
      'unit_price', v_price, 'quantity', v_qty, 'amount', v_price * v_qty,
      'stock_tracked', v_product.stock is not null));
    v_total := v_total + v_price * v_qty;
  end loop;
  perform public._shop_stock_context_clear();

  -- La recette, comme un encaissement de lavage : Comptabilité, Transactions,
  -- Analytique et Bilan la comptent sans autre changement.
  insert into public.transactions (station_id, client_id, client_name, vehicle_label, service, method, amount)
    values (v_station, null, coalesce(nullif(trim(coalesce(p_client_name, '')), ''), 'Client de passage'), null, 'Boutique', p_payment_method, v_total)
    returning id into v_tx_id;

  update public.shop_sales set items = v_lines, amount = v_total, transaction_id = v_tx_id where id = v_sale_id;

  return jsonb_build_object('sale_id', v_sale_id, 'transaction_id', v_tx_id, 'amount', v_total, 'items', v_lines);
end;
$$;
revoke all on function public.shop_record_sale(jsonb, text, text, text) from public, anon;
grant execute on function public.shop_record_sale(jsonb, text, text, text) to authenticated;

-- Annule une vente sur place (erreur de saisie, client qui rend l'article) :
-- les articles reviennent en stock (si leur stock était suivi à la vente et
-- l'est toujours) et la recette sort de la Comptabilité. La vente reste
-- visible, marquée « annulée ».
create or replace function public.shop_cancel_sale(p_sale_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.shop_sales%rowtype;
  v_item jsonb;
begin
  select * into v_sale from public.shop_sales
   where id = p_sale_id and station_id = public.current_station_id()
     for update;
  if not found then
    raise exception 'Vente introuvable.';
  end if;
  if v_sale.status = 'annulee' then
    raise exception 'Cette vente est déjà annulée.';
  end if;

  perform set_config('app.shop_stock_reason', 'annulation_vente', true);
  perform set_config('app.shop_stock_sale', v_sale.id::text, true);
  perform set_config('app.shop_stock_note', coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''), true);

  for v_item in select value from jsonb_array_elements(v_sale.items) loop
    if coalesce((v_item->>'stock_tracked')::boolean, false) then
      update public.shop_products set stock = stock + (v_item->>'quantity')::integer
       where id = (v_item->>'product_id')::uuid and station_id = v_sale.station_id and stock is not null;
    end if;
  end loop;
  perform public._shop_stock_context_clear();

  if v_sale.transaction_id is not null then
    delete from public.transactions where id = v_sale.transaction_id;
  end if;

  update public.shop_sales
     set status = 'annulee', cancel_reason = nullif(trim(coalesce(p_reason, '')), ''), cancelled_at = now(), transaction_id = null
   where id = v_sale.id;
end;
$$;
revoke all on function public.shop_cancel_sale(uuid, text) from public, anon;
grant execute on function public.shop_cancel_sale(uuid, text) to authenticated;

-- Entrée de stock (réapprovisionnement) : ajoute p_quantity. Sur un produit
-- « sur commande », démarre le suivi à p_quantity. Renvoie le nouveau stock.
create or replace function public.shop_stock_entry(p_product_id uuid, p_quantity integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Indiquez une quantité d''au moins 1.';
  end if;
  perform set_config('app.shop_stock_reason', 'entree', true);
  perform set_config('app.shop_stock_note', coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), true);
  update public.shop_products set stock = coalesce(stock, 0) + p_quantity
   where id = p_product_id and station_id = public.current_station_id()
  returning stock into v_new;
  if not found then
    raise exception 'Produit introuvable dans votre boutique.';
  end if;
  perform public._shop_stock_context_clear();
  return v_new;
end;
$$;
revoke all on function public.shop_stock_entry(uuid, integer, text) from public, anon;
grant execute on function public.shop_stock_entry(uuid, integer, text) to authenticated;

-- Correction / inventaire : fixe le stock à la quantité comptée (p_stock).
-- p_stock null = ne plus suivre le stock (produit « sur commande »).
create or replace function public.shop_stock_set(p_product_id uuid, p_stock integer, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  if p_stock is not null and p_stock < 0 then
    raise exception 'Le stock ne peut pas être négatif.';
  end if;
  perform set_config('app.shop_stock_reason', 'correction', true);
  perform set_config('app.shop_stock_note', coalesce(nullif(trim(coalesce(p_note, '')), ''), ''), true);
  update public.shop_products set stock = p_stock
   where id = p_product_id and station_id = public.current_station_id()
  returning stock into v_new;
  if not found then
    raise exception 'Produit introuvable dans votre boutique.';
  end if;
  perform public._shop_stock_context_clear();
  return v_new;
end;
$$;
revoke all on function public.shop_stock_set(uuid, integer, text) from public, anon;
grant execute on function public.shop_stock_set(uuid, integer, text) to authenticated;

-- ─── 5. Rattrapage : point de départ des produits déjà suivis ──────────
-- Un mouvement « stock initial » (stock constaté aujourd'hui) pour chaque
-- produit suivi qui n'a encore aucun mouvement.
insert into public.shop_stock_movements (station_id, product_id, product_name, movement_type, quantity, stock_before, stock_after, note, backfilled, created_at)
select p.station_id, p.id, p.name, 'stock_initial', p.stock, null, p.stock, 'Stock constaté à la mise en place du suivi', true, now()
  from public.shop_products p
 where p.stock is not null
   and not exists (select 1 from public.shop_stock_movements m where m.product_id = p.id);
