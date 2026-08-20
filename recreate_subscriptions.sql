drop table if exists public.station_subscription_invoices cascade;
drop table if exists public.station_client_subscriptions cascade;

-- ─── Abonnements Clients dans une Station ────────────────────────────────────
create table public.station_client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null, -- Optionnel, lié plus tard si le client s'inscrit
  client_name text not null,
  client_phone text not null,
  client_email text,
  client_address text,
  status text not null default 'actif' check (status in ('actif', 'suspendu')),
  price integer not null default 15000,
  balance integer not null default 0,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (station_id, client_phone)
);

-- Factures d'abonnements mensuelles
create table public.station_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  subscription_id uuid not null references public.station_client_subscriptions(id) on delete cascade,
  client_id uuid references public.profiles(id) on delete set null,
  client_name text not null,
  client_phone text not null,
  amount integer not null,
  status text not null default 'a_payer' check (status in ('a_payer', 'paye', 'annule')),
  billing_month text not null, -- format 'YYYY-MM'
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ══════════════════════════════════════════════════════════════════════
alter table public.station_client_subscriptions enable row level security;
alter table public.station_subscription_invoices enable row level security;

-- L'administrateur de la station voit, crée et modifie les abonnements de SA station
create policy "station_client_subscriptions_select" on public.station_client_subscriptions for select
  using (
    station_id = public.current_station_id() 
    or client_id = auth.uid() 
    or client_phone = (select phone from public.profiles where id = auth.uid())
    or public.app_role() = 'super_admin'
  );

create policy "station_client_subscriptions_insert" on public.station_client_subscriptions for insert
  with check (station_id = public.current_station_id() or public.app_role() = 'super_admin');

create policy "station_client_subscriptions_update" on public.station_client_subscriptions for update
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

create policy "station_client_subscriptions_delete" on public.station_client_subscriptions for delete
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- Factures : le client peut voir ses factures, la station gère
create policy "station_subscription_invoices_select" on public.station_subscription_invoices for select
  using (station_id = public.current_station_id() or client_id = auth.uid() or public.app_role() = 'super_admin');

create policy "station_subscription_invoices_insert" on public.station_subscription_invoices for insert
  with check (station_id = public.current_station_id() or public.app_role() = 'super_admin');

create policy "station_subscription_invoices_update" on public.station_subscription_invoices for update
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

create policy "station_subscription_invoices_delete" on public.station_subscription_invoices for delete
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

-- ══════════════════════════════════════════════════════════════════════
-- Trigger pour déduire le solde automatiquement
-- ══════════════════════════════════════════════════════════════════════
create or replace function public.deduct_subscription_balance()
returns trigger as $$
declare
  v_sub_id uuid;
  v_balance integer;
begin
  if new.method = 'Abonnement' then
    -- Trouver l'abonnement actif pour ce client et cette station
    select id, balance into v_sub_id, v_balance 
    from public.station_client_subscriptions 
    where station_id = new.station_id 
      and (
        client_id = new.client_id 
        or client_phone = (select phone from public.profiles where id = new.client_id)
      )
      and status = 'actif'
    limit 1;

    if found then
      -- Déduire le montant
      update public.station_client_subscriptions 
      set balance = balance - new.amount,
          status = case when (balance - new.amount) <= 0 then 'suspendu' else status end
      where id = v_sub_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists deduct_subscription_balance_trigger on public.transactions;
create trigger deduct_subscription_balance_trigger
after insert on public.transactions
for each row execute function public.deduct_subscription_balance();
