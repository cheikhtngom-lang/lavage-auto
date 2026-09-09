-- ══════════════════════════════════════════════════════════════════════
-- PayDunya PER (Paiement Et Redistribution) — passerelle de paiement en
-- ligne réelle pour Clean Car Galsen. Remplace la simulation (setTimeout)
-- qui marquait un lavage « payé » sans encaisser quoi que ce soit.
--
-- Modèle retenu (voir la conversation d'intégration) :
--   • Lavage client        : commission plateforme 10 %, le reste est
--                            reversé AUTOMATIQUEMENT à la station sur SON
--                            compte PayDunya (API disburse / PER).
--   • Abonnement station    : 100 % plateforme, aucune redistribution.
--   • Super User (client)   : 100 % plateforme, aucune redistribution.
--   • Publicité station     : 100 % plateforme, aucune redistribution.
--
-- Les tables PENDING existantes (super_user_subscriptions,
-- station_renewal_payments, station_ads) NE CHANGENT PAS de logique : la
-- confirmation manuelle par le Super Admin reste possible en secours. Le
-- callback PayDunya ne fait que la déclencher tout seul quand le paiement
-- en ligne aboutit.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Alias PayDunya + taux de commission par station ────────────────
-- Rangés sur station_billing (privé : lisible par la station concernée +
-- Super Admin via station_billing_select, jamais exposé dans l'annuaire
-- public `stations`). L'écriture directe reste réservée au Super Admin
-- (station_billing_update) — la station passe par la fonction
-- set_station_paydunya_alias() ci-dessous, qui ne touche QUE cette colonne.
alter table public.station_billing
  add column if not exists paydunya_account_alias text,
  add column if not exists commission_rate numeric;   -- % ; null => valeur par défaut (secret PLATFORM_DEFAULT_COMMISSION_PERCENT)

comment on column public.station_billing.paydunya_account_alias is
  'Email ou n° mobile money du compte PayDunya de la station — cible de la redistribution PER.';
comment on column public.station_billing.commission_rate is
  'Commission plateforme en % sur les paiements de lavage en ligne. null => secret PLATFORM_DEFAULT_COMMISSION_PERCENT.';

-- La station renseigne/modifie son propre alias depuis Admin > Paramètres.
-- SECURITY DEFINER + colonne unique ciblée = pas besoin d'ouvrir un UPDATE
-- large sur station_billing (qui laisserait changer plan, statut, etc.).
create or replace function public.set_station_paydunya_alias(p_alias text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_station_id() is null then
    raise exception 'Aucune station associée à ce compte';
  end if;
  update public.station_billing
     set paydunya_account_alias = nullif(trim(p_alias), '')
   where station_id = public.current_station_id();
end;
$$;
grant execute on function public.set_station_paydunya_alias(text) to authenticated;

-- ─── 2. Journal des redistributions PER (lavages) ─────────────────────--
-- Une ligne par facture PayDunya de lavage. `paydunya_token` unique =
-- garde-fou d'idempotence : PayDunya peut rappeler le callback plusieurs
-- fois, on ne redistribue / n'encaisse qu'une seule fois.
create table if not exists public.paiements_lavage (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  client_id uuid references public.profiles(id) on delete set null,
  montant_total integer not null,
  part_station integer not null,
  part_plateforme integer not null,
  taux_commission numeric not null,
  paydunya_token text not null unique,
  reservation_ids uuid[] not null default '{}',
  statut_redistribution text not null default 'en_attente'
    check (statut_redistribution in ('en_attente', 'reussi', 'echec')),
  redistribution_detail text,
  created_at timestamptz not null default now()
);

alter table public.paiements_lavage enable row level security;

-- Lecture : la station voit ses propres reversements, le Super Admin voit
-- tout. Aucune policy d'écriture : seules les Edge Functions écrivent, via
-- la clé service_role (qui contourne RLS) — comme paiements_lavage n'est
-- jamais alimentée depuis le front, c'est volontaire.
drop policy if exists "paiements_lavage_select" on public.paiements_lavage;
create policy "paiements_lavage_select" on public.paiements_lavage for select
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

do $$
begin
  begin
    alter publication supabase_realtime add table public.paiements_lavage;
  exception when others then null;
  end;
end $$;

-- ─── 3. Idempotence pour les paiements plateforme ────────────────────--
-- On corrèle le callback PayDunya à la bonne ligne PENDING par son id
-- (transmis dans custom_data). `paydunya_token` sert uniquement de trace
-- + verrou : si la ligne porte déjà un token, le callback a déjà été
-- traité, on ne rejoue pas.
alter table public.super_user_subscriptions add column if not exists paydunya_token text;
alter table public.station_renewal_payments add column if not exists paydunya_token text;
alter table public.station_ads             add column if not exists paydunya_token text;

-- ══════════════════════════════════════════════════════════════════════
-- Rappel — secrets à définir (Supabase > Edge Functions > Manage secrets),
-- JAMAIS les clés Supabase (injectées automatiquement) :
--   PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY, PAYDUNYA_TOKEN
--   PAYDUNYA_MODE=test | live
--   PAYDUNYA_RETURN_URL=https://galsenautocleaner.com/paiement-succes.html
--   PAYDUNYA_CANCEL_URL=https://galsenautocleaner.com/paiement-annule.html
--   PAYDUNYA_CALLBACK_URL=https://kyilblxendvqclifregf.supabase.co/functions/v1/paydunya-callback
--   PLATFORM_DEFAULT_COMMISSION_PERCENT=10
-- ══════════════════════════════════════════════════════════════════════
