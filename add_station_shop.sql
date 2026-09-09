-- ══════════════════════════════════════════════════════════════════════
-- Boutique de station — les stations au forfait Business (ou avec le
-- module `mod_boutique`) publient un catalogue de produits (pneus, huile
-- moteur, huile boîte, pare-brise, batterie, filtres…). Les automobilistes
-- qui ont déjà réservé chez une station peuvent consulter sa boutique
-- depuis leur tableau de bord et contacter la station pour un produit.
--
-- Pas de commande / paiement en ligne des produits en v1 : catalogue +
-- consultation + contact. (Extension possible plus tard via PayDunya.)
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── Produits ────────────────────────────────────────────────────────--
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  name text not null,
  description text,
  -- Catégorie libre (dropdown côté app : Pneus, Huile moteur, Huile boîte,
  -- Pare-brise / Vitrage, Batterie, Filtres, Freinage, Accessoires, Autre).
  category text not null default 'Autre',
  price integer not null default 0 check (price >= 0),
  currency text not null default 'FCFA',
  -- Photo en base64 (pas de Supabase Storage sur ce projet) — format/taille
  -- vérifiés aussi côté serveur (~2,2 Mo), comme stations.logo_url / station_ads.image_url.
  image_url text check (
    image_url is null or
    (image_url ~ '^data:image/(png|jpe?g|webp|gif);base64,' and length(image_url) <= 2200000)
  ),
  stock integer,                          -- null = non suivi / « sur commande »
  active boolean not null default true,   -- publié (visible clients) / masqué
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_station_idx on public.shop_products(station_id);
-- Accélère le test RLS « ce client a-t-il réservé chez cette station ? ».
create index if not exists reservations_client_station_idx
  on public.reservations(client_id, station_id);

-- updated_at auto sur UPDATE.
create or replace function public.touch_shop_product()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists shop_products_touch on public.shop_products;
create trigger shop_products_touch
  before update on public.shop_products
  for each row execute function public.touch_shop_product();

-- ─── Fonctions d'aide (SECURITY DEFINER : contournent volontairement RLS
-- pour un simple test booléen) ───────────────────────────────────────--

-- La station a-t-elle droit à une boutique ? (plan Business, ou module
-- `mod_boutique` activé par le Super Admin — même principe que mod_bilan.)
create or replace function public.station_has_shop(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.station_billing sb
    where sb.station_id = sid
      and (sb.plan = 'Business' or 'mod_boutique' = any(sb.active_modules))
  );
$$;
grant execute on function public.station_has_shop(uuid) to anon, authenticated;

-- Le client connecté connaît-il cette station ? (au moins une réservation
-- passée OU station mise en favori). Sert à n'ouvrir la boutique qu'aux
-- clients de la station, jamais à un visiteur anonyme.
create or replace function public.client_knows_station(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    exists (
      select 1 from public.reservations r
      where r.station_id = sid and r.client_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and sid = any(p.favorite_station_ids)
    );
$$;
grant execute on function public.client_knows_station(uuid) to authenticated;

-- ─── Row Level Security ──────────────────────────────────────────────--
alter table public.shop_products enable row level security;

-- Lecture :
--  • la station voit TOUS ses produits (actifs ou masqués) ;
--  • le Super Admin voit tout ;
--  • un client voit les produits ACTIFS d'une station qui a une boutique
--    ET chez qui il a déjà réservé / qu'il a en favori.
drop policy if exists "shop_products_select" on public.shop_products;
create policy "shop_products_select" on public.shop_products for select using (
  station_id = public.current_station_id()
  or public.app_role() = 'super_admin'
  or (
    active
    and public.station_has_shop(station_id)
    and public.client_knows_station(station_id)
  )
);

-- Écriture : uniquement la station propriétaire, et seulement si elle a
-- effectivement droit à une boutique (Business / module).
drop policy if exists "shop_products_insert" on public.shop_products;
create policy "shop_products_insert" on public.shop_products for insert with check (
  station_id = public.current_station_id() and public.station_has_shop(station_id)
);

drop policy if exists "shop_products_update" on public.shop_products;
create policy "shop_products_update" on public.shop_products for update
  using (station_id = public.current_station_id())
  with check (station_id = public.current_station_id());

drop policy if exists "shop_products_delete" on public.shop_products;
create policy "shop_products_delete" on public.shop_products for delete
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- ─── Realtime ────────────────────────────────────────────────────────--
do $$
begin
  begin
    alter publication supabase_realtime add table public.shop_products;
  exception when others then null;
  end;
end $$;
