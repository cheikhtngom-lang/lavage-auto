-- ══════════════════════════════════════════════════════════════════════
-- CESSION D'UNE STATION à un nouveau propriétaire.
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- Modèle repris de GestionImmo (property_transfer_requests) mais adapté :
-- ici la station NE BOUGE PAS (mêmes données, même station_id), seul le
-- propriétaire — donc le compte 'admin' — change.
--
-- Flux :
--   1. Le Super Admin crée une demande (create_station_transfer) : station +
--      nom/email de l'acquéreur.                                   → 'pending'
--   2. Le propriétaire voit une bannière sur son tableau de bord. Il peut
--      REFUSER (→ 'rejected') ou CÉDER (→ 'ceded') : à cet instant son compte
--      est détaché de la station (il redevient un compte automobiliste) et un
--      lien d'activation valable 7 jours part vers l'acquéreur.
--   3. L'acquéreur ouvre le lien, choisit son email de connexion + son mot de
--      passe : il devient le compte 'admin' de la station.        → 'completed'
--
-- Ce qui reste en place : toutes les données de la station, son abonnement,
-- son équipe (comptes 'staff').
--
-- Le Super Admin peut annuler tant que la cession n'est pas terminée ; si le
-- propriétaire avait déjà cédé, l'annulation lui REND sa station.
--
-- Les fonctions marquées "service_role" ne sont appelables que par les Edge
-- Functions (station-transfer, accept-station-transfer) : jamais depuis le
-- navigateur.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.station_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  station_name text not null,
  -- Propriétaire au moment de la demande (compte 'admin' de la station).
  seller_id uuid references auth.users(id) on delete set null,
  seller_name text,
  seller_email text,
  acquirer_name text not null,
  acquirer_email text not null,
  note text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'rejected', 'ceded', 'completed', 'cancelled')),
  -- Empreinte SHA-256 du lien d'activation : le lien lui-même n'est jamais
  -- stocké, donc jamais lisible depuis le navigateur.
  token_hash text,
  expires_at timestamptz,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null default auth.uid(),
  decided_at timestamptz,
  ceded_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  acquirer_id uuid references auth.users(id) on delete set null
);

-- Une seule demande ouverte à la fois par station.
create unique index if not exists station_transfer_one_open_per_station
  on public.station_transfer_requests(station_id)
  where status in ('pending', 'ceded');

create index if not exists station_transfer_status_idx
  on public.station_transfer_requests(status, requested_at desc);

alter table public.station_transfer_requests enable row level security;

-- Super Admin : lecture de tout. Aucune écriture directe : tout passe par les
-- fonctions ci-dessous (create/cancel) ou par les Edge Functions.
drop policy if exists station_transfer_super_admin_select on public.station_transfer_requests;
create policy station_transfer_super_admin_select on public.station_transfer_requests
  for select using (public.app_role() = 'super_admin');

-- Propriétaire (compte 'admin', jamais un 'staff') : voit uniquement les
-- demandes de SA station. Il ne peut rien modifier lui-même — la décision
-- passe par l'Edge Function station-transfer.
drop policy if exists station_transfer_owner_select on public.station_transfer_requests;
create policy station_transfer_owner_select on public.station_transfer_requests
  for select using (
    public.app_role() = 'admin'
    and station_id = public.current_station_id()
  );

-- ─── 1. Création (Super Admin) ────────────────────────────────────────
create or replace function public.create_station_transfer(
  p_station_id uuid,
  p_acquirer_name text,
  p_acquirer_email text,
  p_note text default ''
)
returns public.station_transfer_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_acquirer_email, '')));
  v_name text := trim(coalesce(p_acquirer_name, ''));
  v_station public.stations;
  v_seller public.profiles;
  v_row public.station_transfer_requests;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Le nom de l''acquéreur est requis.'; end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Email de l''acquéreur invalide.';
  end if;

  select * into v_station from public.stations where id = p_station_id;
  if v_station.id is null then raise exception 'Station introuvable.'; end if;

  select * into v_seller from public.profiles
    where station_id = p_station_id and role = 'admin';
  if v_seller.id is null then
    raise exception 'Cette station n''a pas de propriétaire actif : rien à céder.';
  end if;

  if lower(coalesce(v_seller.email, '')) = v_email then
    raise exception 'L''acquéreur ne peut pas être le propriétaire actuel.';
  end if;

  -- L'acquéreur reçoit un NOUVEAU compte : l'email ne doit pas déjà servir
  -- sur la plateforme (même limite que l'invitation d'équipe).
  if exists (select 1 from public.profiles where lower(email) = v_email)
     or exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Cet email est déjà utilisé sur la plateforme. Choisissez une autre adresse pour l''acquéreur.';
  end if;

  if exists (
    select 1 from public.station_transfer_requests
    where station_id = p_station_id and status in ('pending', 'ceded')
  ) then
    raise exception 'Une cession est déjà en cours pour cette station.';
  end if;

  insert into public.station_transfer_requests (
    station_id, station_name, seller_id, seller_name, seller_email,
    acquirer_name, acquirer_email, note
  ) values (
    p_station_id, v_station.name, v_seller.id, v_seller.full_name, v_seller.email,
    v_name, v_email, coalesce(p_note, '')
  )
  returning * into v_row;

  insert into public.audit_log (actor, action)
  values ('Super Admin', 'Cession de « ' || v_station.name || ' » initiée vers ' || v_name || ' (' || v_email || ')');

  return v_row;
end;
$$;
revoke all on function public.create_station_transfer(uuid, text, text, text) from public, anon;
grant execute on function public.create_station_transfer(uuid, text, text, text) to authenticated;

-- ─── 2. Annulation (Super Admin) ──────────────────────────────────────
-- 'pending' : simple annulation. 'ceded' : le propriétaire avait déjà cédé —
-- on lui rend sa station, tant que l'acquéreur n'a pas activé son compte.
create or replace function public.cancel_station_transfer(p_request_id uuid)
returns public.station_transfer_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.station_transfer_requests;
  v_seller public.profiles;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;

  select * into v_req from public.station_transfer_requests where id = p_request_id for update;
  if v_req.id is null then raise exception 'Demande introuvable.'; end if;
  if v_req.status not in ('pending', 'ceded') then
    raise exception 'Cette demande est déjà clôturée (%).', v_req.status;
  end if;

  if v_req.status = 'ceded' then
    -- Personne d'autre ne doit avoir pris la place entre-temps.
    if exists (select 1 from public.profiles where station_id = v_req.station_id and role = 'admin') then
      raise exception 'Cette station a déjà un propriétaire actif : impossible de la restituer.';
    end if;
    select * into v_seller from public.profiles where id = v_req.seller_id;
    if v_seller.id is null then
      raise exception 'Le compte de l''ancien propriétaire n''existe plus : impossible de lui rendre la station.';
    end if;
    if v_seller.role <> 'automobiliste' or v_seller.station_id is not null then
      raise exception 'Le compte de l''ancien propriétaire est déjà utilisé autrement (par ex. converti en une autre station) : restitution impossible.';
    end if;

    update public.profiles set role = 'admin', station_id = v_req.station_id where id = v_seller.id;
    update public.stations set created_by = v_seller.id where id = v_req.station_id;
  end if;

  update public.station_transfer_requests
    set status = 'cancelled', cancelled_at = now(), token_hash = null, expires_at = null
    where id = p_request_id
    returning * into v_req;

  insert into public.audit_log (actor, action)
  values ('Super Admin', 'Cession de « ' || v_req.station_name || ' » annulée');

  return v_req;
end;
$$;
revoke all on function public.cancel_station_transfer(uuid) from public, anon;
grant execute on function public.cancel_station_transfer(uuid) to authenticated;

-- ─── 3. Propriétaire : refus (service_role, via station-transfer) ─────
create or replace function public.reject_station_transfer(p_request_id uuid, p_seller_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.station_transfer_requests;
begin
  select * into v_req from public.station_transfer_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Cette demande n''est plus en attente.';
  end if;
  if v_req.seller_id is distinct from p_seller_id then
    raise exception 'Vous n''êtes pas le propriétaire de cette station.' using errcode = '42501';
  end if;

  update public.station_transfer_requests
    set status = 'rejected', decided_at = now()
    where id = p_request_id;

  insert into public.audit_log (actor, action)
  values (coalesce(v_req.seller_name, 'Propriétaire'), 'Cession de « ' || v_req.station_name || ' » refusée par le propriétaire');
end;
$$;
revoke all on function public.reject_station_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reject_station_transfer(uuid, uuid) to service_role;

-- ─── 4. Propriétaire : cession (service_role, via station-transfer) ───
-- Atomique : statut + détachement du compte du cédant + lien d'activation.
create or replace function public.cede_station_transfer(
  p_request_id uuid,
  p_seller_id uuid,
  p_token_hash text
)
returns public.station_transfer_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.station_transfer_requests;
begin
  select * into v_req from public.station_transfer_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Cette demande n''est plus en attente.';
  end if;
  if v_req.seller_id is distinct from p_seller_id then
    raise exception 'Vous n''êtes pas le propriétaire de cette station.' using errcode = '42501';
  end if;

  -- Le cédant perd tout accès : son compte redevient un compte automobiliste
  -- (l'index one_admin_per_station libère du même coup la place d'admin).
  update public.profiles set role = 'automobiliste', station_id = null
    where id = p_seller_id and station_id = v_req.station_id and role = 'admin';
  if not found then
    raise exception 'Le compte propriétaire ne correspond plus à cette station.';
  end if;

  -- created_by sert encore dans les règles d'accès (stations_select,
  -- profiles_insert) : on le vide pour que le cédant ne garde aucune prise.
  update public.stations set created_by = null where id = v_req.station_id;

  update public.station_transfer_requests
    set status = 'ceded', decided_at = now(), ceded_at = now(),
        token_hash = p_token_hash, expires_at = now() + interval '7 days'
    where id = p_request_id
    returning * into v_req;

  insert into public.audit_log (actor, action)
  values (coalesce(v_req.seller_name, 'Propriétaire'), 'Station « ' || v_req.station_name || ' » cédée à ' || v_req.acquirer_name);

  return v_req;
end;
$$;
revoke all on function public.cede_station_transfer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cede_station_transfer(uuid, uuid, text) to service_role;

-- ─── 5. Super Admin : nouveau lien (service_role) ─────────────────────
create or replace function public.renew_station_transfer_link(p_request_id uuid, p_token_hash text)
returns public.station_transfer_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.station_transfer_requests;
begin
  update public.station_transfer_requests
    set token_hash = p_token_hash, expires_at = now() + interval '7 days'
    where id = p_request_id and status = 'ceded'
    returning * into v_req;
  if v_req.id is null then
    raise exception 'Le lien ne peut être renvoyé que pour une station déjà cédée et non activée.';
  end if;
  return v_req;
end;
$$;
revoke all on function public.renew_station_transfer_link(uuid, text) from public, anon, authenticated;
grant execute on function public.renew_station_transfer_link(uuid, text) to service_role;

-- ─── 6. Acquéreur : activation (service_role, via accept-station-transfer)
-- Le compte auth existe déjà (créé par l'Edge Function) : on le rattache à
-- la station, on met à jour les coordonnées du propriétaire, on clôture.
create or replace function public.complete_station_transfer(
  p_request_id uuid,
  p_acquirer_id uuid,
  p_full_name text,
  p_email text,
  p_phone text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.station_transfer_requests;
begin
  select * into v_req from public.station_transfer_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'ceded' then
    raise exception 'Cette cession n''est plus disponible.';
  end if;
  if exists (select 1 from public.profiles where station_id = v_req.station_id and role = 'admin') then
    raise exception 'Cette station a déjà un propriétaire.';
  end if;

  insert into public.profiles (id, role, station_id, full_name, email, phone)
  values (p_acquirer_id, 'admin', v_req.station_id, p_full_name, lower(p_email), coalesce(p_phone, ''));

  update public.stations
    set created_by = p_acquirer_id,
        owner_name = p_full_name,
        owner_email = lower(p_email),
        owner_phone = coalesce(p_phone, '')
    where id = v_req.station_id;

  update public.station_transfer_requests
    set status = 'completed', completed_at = now(), acquirer_id = p_acquirer_id,
        token_hash = null, expires_at = null
    where id = p_request_id;

  insert into public.audit_log (actor, action)
  values (p_full_name, 'Cession de « ' || v_req.station_name || ' » finalisée : nouveau propriétaire ' || p_full_name);
end;
$$;
revoke all on function public.complete_station_transfer(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_station_transfer(uuid, uuid, text, text, text) to service_role;
