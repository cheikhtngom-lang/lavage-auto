-- ═══════════════════════════════════════════════════════════════════════
-- Bandeau défilant en haut du hero de la page d'accueil (index.html)
--
-- Messages écrits par le Super Admin (Super Admin > Bandeau d'accueil) :
-- annonce, mot de bienvenue pour une station (station_id), mise en avant
-- payée… Le bandeau y ajoute tout seul les publicités payées et actives des
-- stations (station_ads, déjà lisibles publiquement — policy station_ads_select).
--
-- Lecture publique (anon) des seuls messages actifs et dans leurs dates ;
-- écriture réservée au Super Admin. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.site_ticker_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) between 1 and 200),
  station_id uuid references public.stations(id) on delete set null,
  link_url text check (link_url is null or link_url ~* '^(https?://|/)'),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_ticker_messages_active_idx on public.site_ticker_messages(active, sort_order);

alter table public.site_ticker_messages enable row level security;

drop policy if exists site_ticker_messages_select on public.site_ticker_messages;
create policy site_ticker_messages_select on public.site_ticker_messages for select using (
  public.app_role() = 'super_admin'
  or (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
);

drop policy if exists site_ticker_messages_write on public.site_ticker_messages;
create policy site_ticker_messages_write on public.site_ticker_messages for all
  using (public.app_role() = 'super_admin')
  with check (public.app_role() = 'super_admin');

-- Data API (obligatoire pour les nouvelles tables à partir du 30/10/2026,
-- voir supabase/data_api_grants.sql).
grant select on public.site_ticker_messages to anon;
grant select, insert, update, delete on public.site_ticker_messages to authenticated;
grant select, insert, update, delete on public.site_ticker_messages to service_role;
