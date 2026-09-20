-- ══════════════════════════════════════════════════════════════════════
-- Historique de la Boutique — à exécuter une fois dans l'éditeur SQL
-- Supabase. Idempotent (rejouable sans risque).
--
-- Journalise, pour chaque station, les événements de vie de ses produits :
--   mis_en_ligne     produit publié (créé visible, ou remis en ligne)
--   retire           produit masqué (n'est plus visible des clients)
--   fin_de_stock     stock tombé à 0 (rupture)
--   reapprovisionne  stock remonté au-dessus de 0
--   supprime         produit supprimé du catalogue
--
-- Alimenté par un TRIGGER sur shop_products, pas par le navigateur : les
-- achats en ligne réduisent le stock depuis une Edge Function (service_role),
-- et une rupture causée par une vente en ligne doit apparaître elle aussi.
-- Le nom du produit est copié dans l'événement (le produit peut être
-- supprimé ensuite, l'historique reste lisible).
--
-- Lecture réservée à la station (et au Super Admin). Aucune policy d'écriture :
-- seul le trigger (security definer) écrit — l'historique n'est pas modifiable.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.shop_product_events (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  -- Pas de FK vers shop_products : l'événement doit survivre à la suppression du produit.
  product_id uuid,
  product_name text not null,
  category text,
  event_type text not null check (event_type in ('mis_en_ligne', 'retire', 'fin_de_stock', 'reapprovisionne', 'supprime')),
  stock_after integer,
  price integer,
  -- true = événement reconstitué à la création de cet historique (date
  -- approximative : created_at / updated_at du produit), pas observé en direct.
  backfilled boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_product_events_station_idx on public.shop_product_events(station_id, created_at desc);
create index if not exists shop_product_events_product_idx on public.shop_product_events(product_id);

alter table public.shop_product_events enable row level security;

drop policy if exists "shop_product_events_select" on public.shop_product_events;
create policy "shop_product_events_select" on public.shop_product_events for select
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- ─── Trigger ───────────────────────────────────────────────────────────
create or replace function public.shop_log_product_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Suppression en cascade d'une station : la station n'existe déjà plus,
    -- l'insertion violerait la clé étrangère (et l'historique part avec elle).
    if not exists (select 1 from public.stations where id = old.station_id) then
      return old;
    end if;
    insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
      values (old.station_id, old.id, old.name, old.category, 'supprime', old.stock, old.price);
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.active then
      insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
        values (new.station_id, new.id, new.name, new.category, 'mis_en_ligne', new.stock, new.price);
    end if;
    if new.stock = 0 then
      insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
        values (new.station_id, new.id, new.name, new.category, 'fin_de_stock', new.stock, new.price);
    end if;
    return new;
  end if;

  -- UPDATE (déclenché seulement quand `active` ou `stock` change, voir ci-dessous)
  if new.active and not old.active then
    insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
      values (new.station_id, new.id, new.name, new.category, 'mis_en_ligne', new.stock, new.price);
  elsif old.active and not new.active then
    insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
      values (new.station_id, new.id, new.name, new.category, 'retire', new.stock, new.price);
  end if;

  if new.stock = 0 and coalesce(old.stock, -1) <> 0 then
    insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
      values (new.station_id, new.id, new.name, new.category, 'fin_de_stock', new.stock, new.price);
  elsif coalesce(new.stock, 0) > 0 and old.stock = 0 then
    insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price)
      values (new.station_id, new.id, new.name, new.category, 'reapprovisionne', new.stock, new.price);
  end if;
  return new;
end;
$$;

drop trigger if exists shop_products_log_event on public.shop_products;
create trigger shop_products_log_event
  after insert or update of active, stock or delete on public.shop_products
  for each row execute function public.shop_log_product_event();

-- ─── Rattrapage : reconstitue le point de départ des produits existants ─
-- Un événement « mis en ligne » à la date de création pour chaque produit
-- publié qui n'a encore aucun événement, et « fin de stock » pour ceux qui
-- sont en rupture aujourd'hui (date = dernière modification, approximative).
insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price, backfilled, created_at)
select p.station_id, p.id, p.name, p.category, 'mis_en_ligne', p.stock, p.price, true, p.created_at
  from public.shop_products p
 where p.active
   and not exists (select 1 from public.shop_product_events e where e.product_id = p.id);

insert into public.shop_product_events (station_id, product_id, product_name, category, event_type, stock_after, price, backfilled, created_at)
select p.station_id, p.id, p.name, p.category, 'fin_de_stock', p.stock, p.price, true, p.updated_at
  from public.shop_products p
 where p.stock = 0
   and not exists (select 1 from public.shop_product_events e where e.product_id = p.id and e.event_type = 'fin_de_stock');
