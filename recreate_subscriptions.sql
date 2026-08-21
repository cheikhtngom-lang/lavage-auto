-- ══════════════════════════════════════════════════════════════════════
-- Script de correction du système d'abonnements (à exécuter une fois dans
-- l'éditeur SQL Supabase). Contrairement à l'ancienne version de ce fichier,
-- celle-ci ne supprime AUCUNE table/donnée existante — tout est idempotent
-- (peut être rejoué sans risque).
--
-- Corrige :
--  1. Colonnes manquantes si jamais absentes (balance / client_id).
--  2. Le trigger de déduction du solde : passe en BEFORE INSERT pour
--     bloquer un paiement "Abonnement" si le solde est insuffisant ou si
--     aucun abonnement actif ne correspond (au lieu de laisser passer un
--     lavage gratuit non tracé). Le téléphone est normalisé (chiffres
--     uniquement) pour ne plus rater le rapprochement à cause d'espaces
--     ou d'un préfixe +221.
--  3. Ajoute recharge_subscription() : recharge atomique du solde, pour ne
--     plus entrer en collision avec une déduction simultanée du trigger.
--  4. Corrige la policy de stockage (limite 2 Mo sur les logos/cachets),
--     qui ne fonctionnait pas du tout (comparait le nombre de chiffres de
--     la taille au lieu de la taille elle-même).
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Colonnes manquantes (sans effet si déjà présentes) ──────────────────
alter table public.station_client_subscriptions add column if not exists balance integer not null default 0;
alter table public.station_subscription_invoices add column if not exists client_id uuid references public.profiles(id) on delete set null;

-- ─── 2. Trigger de déduction : BEFORE INSERT + blocage + téléphone normalisé ─
create or replace function public.deduct_subscription_balance()
returns trigger as $$
declare
  v_sub_id uuid;
  v_balance integer;
begin
  if new.method = 'Abonnement' then
    select id, balance into v_sub_id, v_balance
    from public.station_client_subscriptions
    where station_id = new.station_id
      and status = 'actif'
      and (
        client_id = new.client_id
        or regexp_replace(client_phone, '\D', '', 'g') = regexp_replace(
             coalesce((select phone from public.profiles where id = new.client_id), ''), '\D', '', 'g'
           )
      )
    limit 1;

    if not found then
      raise exception 'Aucun abonnement actif trouvé pour ce paiement.';
    end if;

    if v_balance < new.amount then
      raise exception 'Solde d''abonnement insuffisant (solde: %, montant: %).', v_balance, new.amount;
    end if;

    update public.station_client_subscriptions
    set balance = balance - new.amount,
        status = case when (balance - new.amount) <= 0 then 'suspendu' else status end
    where id = v_sub_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists deduct_subscription_balance_trigger on public.transactions;
create trigger deduct_subscription_balance_trigger
before insert on public.transactions
for each row execute function public.deduct_subscription_balance();

-- ─── 3. Recharge atomique du solde ───────────────────────────────────────────
create or replace function public.recharge_subscription(p_sub_id uuid, p_amount integer)
returns void as $$
begin
  if not exists (
    select 1 from public.station_client_subscriptions
    where id = p_sub_id
      and (station_id = public.current_station_id() or public.app_role() = 'super_admin')
  ) then
    raise exception 'Abonnement introuvable ou non autorisé.';
  end if;

  update public.station_client_subscriptions
  set balance = balance + p_amount,
      status = 'actif'
  where id = p_sub_id;
end;
$$ language plpgsql security definer;

-- ─── 4. Correction de la policy de taille de fichier (storage) ─────────────
drop policy if exists "storage_public_insert" on storage.objects;
create policy "storage_public_insert" on storage.objects for insert
  with check (
    bucket_id = 'public'
    and auth.uid() is not null
    and ((select role from public.profiles where id = auth.uid()) = 'admin' or (select role from public.profiles where id = auth.uid()) = 'super_admin')
    and (coalesce((metadata->>'size')::bigint, 0) < 2097152)
    and (metadata->>'mimetype' like 'image/%')
  );
