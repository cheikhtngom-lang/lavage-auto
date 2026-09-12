-- ══════════════════════════════════════════════════════════════════════
-- Achat en ligne dans la Boutique de station (add_station_shop.sql, v1
-- catalogue + contact seulement). Le client choisit un produit + une
-- quantité, retrait en station ou livraison, et paie en ligne (Wave/Orange
-- Money via PayDunya) — même circuit que le lavage/la vidange : rien n'est
-- créé avant confirmation du paiement (voir _shared/finalizePayment.ts),
-- même grand livre de reversements (paiements_lavage, type_service
-- 'boutique'), même taux de commission (station_billing.commission_rate).
-- « Contacter la station » (WhatsApp) reste disponible en parallèle pour
-- les promos BOGO, non gérées par l'achat en ligne (voir create-shop-payment).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Commandes ───────────────────────────────────────────────────────
create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text not null,
  -- on delete set null : l'historique de commande doit survivre à la
  -- suppression du produit par la station — nom/prix figés ci-dessous.
  product_id uuid references public.shop_products(id) on delete set null,
  product_name text not null,
  unit_price integer not null,
  quantity integer not null check (quantity >= 1),
  amount integer not null,
  fulfillment_type text not null check (fulfillment_type in ('retrait', 'livraison')),
  delivery_address text,
  delivery_phone text,
  paid boolean not null default false,
  payment_method text,
  status text not null default 'confirmee' check (status in ('confirmee', 'terminee', 'annulee')),
  created_at timestamptz not null default now(),
  constraint shop_orders_delivery_ck check (
    fulfillment_type = 'retrait' or (delivery_address is not null and length(trim(delivery_address)) > 0)
  )
);
create index if not exists shop_orders_station_idx on public.shop_orders(station_id, created_at desc);

-- ─── 2. Extension du grand livre des reversements (voir add_paydunya_per.sql
-- + add_vidange_feature.sql) — troisième type de paiement en ligne partageant
-- exactement le même circuit de redistribution/reversement manuel.
alter table public.paiements_lavage drop constraint if exists paiements_lavage_type_service_check;
alter table public.paiements_lavage add constraint paiements_lavage_type_service_check
  check (type_service in ('lavage', 'vidange', 'boutique'));
alter table public.paiements_lavage add column if not exists shop_order_ids uuid[] not null default '{}';

-- ─── 3. Row Level Security ─────────────────────────────────────────────
alter table public.shop_orders enable row level security;

-- Lecture : la station voit ses commandes, le client voit les siennes.
-- Pas de policy d'insert : comme paiements_lavage à l'origine, une commande
-- payée en ligne n'existe qu'une fois créée par l'Edge Function
-- (service_role, contourne RLS) — jamais insérée depuis le navigateur.
drop policy if exists "shop_orders_select" on public.shop_orders;
create policy "shop_orders_select" on public.shop_orders for select
  using (station_id = current_station_id() or client_id = auth.uid() or app_role() = 'super_admin');

-- Statut modifiable par la station (remise/annulée) ou le Super Admin.
drop policy if exists "shop_orders_update" on public.shop_orders;
create policy "shop_orders_update" on public.shop_orders for update
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- Suppression réservée à la station propriétaire — même bouton "Vider
-- l'historique" (Paramètres > Sécurité) que reservations_delete/vidange_bookings_delete.
drop policy if exists "shop_orders_delete" on public.shop_orders;
create policy "shop_orders_delete" on public.shop_orders for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- ─── 4. Realtime ────────────────────────────────────────────────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.shop_orders;
  exception when others then null;
  end;
end $$;
