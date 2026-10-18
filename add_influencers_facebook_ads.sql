-- ══════════════════════════════════════════════════════════════════════
-- Super Admin > Affiliés (section Marketing) : affiliés enrichis,
-- influenceurs et cashout, Facebook Ads. À exécuter APRÈS
-- add_affiliates_tracking.sql. Idempotent (rejouable sans risque).
-- Voir src/pages/SuperAdmin/Affiliates.jsx et src/components/marketing/.
--
--   - site_events.visitor_id : identifiant de visiteur anonyme (tiré au
--     hasard dans le navigateur, gardé seulement si le visiteur a accepté
--     la mesure d'audience) pour compter les visiteurs UNIQUES. Sans lui,
--     on retombe sur l'empreinte du jour (même visiteur compté une fois par
--     jour) puis sur l'onglet. Les visites déjà enregistrées restent valables.
--   - affiliates.is_influencer / commission_rate : un affilié « influenceur »
--     touche commission_rate % (20 % par défaut) de CHAQUE paiement confirmé
--     (abonnement station_renewal_payments CONFIRMED, publicité station_ads
--     payée) des stations inscrites par son lien, pendant les 3 mois qui
--     suivent le 1er paiement de la station. Le taux actuel s'applique à tous
--     les paiements (y compris passés).
--   - affiliate_payouts : versements faits aux influenceurs (Wave, Orange
--     Money, espèces…), chaque ajout / suppression inscrit au journal d'audit.
--   - ad_spends : dépenses publicitaires saisies par campagne (le nom de
--     campagne = utm_campaign des liens de suivi).
--   - marketing_stats() : tous les chiffres des trois vues, Super Admin seulement.
--
-- Conversion = station inscrite via le site (événement inscription_station)
-- qui a payé au moins une fois la plateforme (abonnement ou publicité).
-- ══════════════════════════════════════════════════════════════════════

-- ─── Visiteur anonyme ────────────────────────────────────────────────────
alter table public.site_events add column if not exists visitor_id text;
do $$ begin
  alter table public.site_events add constraint site_events_visitor_id_check
    check (visitor_id is null or visitor_id ~ '^[A-Za-z0-9_-]{8,64}$');
exception when duplicate_object then null; end $$;
create index if not exists site_events_visitor_id_idx on public.site_events (visitor_id) where visitor_id is not null;

-- Nouvelle signature (+ p_visitor) : l'ancienne est supprimée pour éviter
-- deux fonctions homonymes (PostgREST ne saurait pas laquelle appeler). Les
-- pages encore en cache qui n'envoient pas p_visitor continuent de marcher.
drop function if exists public.record_site_event(text, text, text, text, text, text, text, text, text);

create or replace function public.record_site_event(
  p_kind          text,
  p_session       text,
  p_source        text default 'direct',
  p_medium        text default null,
  p_campaign      text default null,
  p_ref           text default null,
  p_referrer_host text default null,
  p_landing_path  text default null,
  p_device        text default null,
  p_visitor       text default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_session text := btrim(coalesce(p_session, ''));
  v_source  text := lower(btrim(coalesce(p_source, '')));
  v_ref     text := nullif(lower(btrim(coalesce(p_ref, ''))), '');
  v_device  text := lower(btrim(coalesce(p_device, '')));
  v_visitor text := nullif(btrim(coalesce(p_visitor, '')), '');
  v_uid     uuid := auth.uid();
  v_aff_id  uuid;
  v_aff_net text;
  v_headers json;
  v_ip      text;
  v_salt    text;
  v_hash    text;
begin
  if v_kind not in ('visite', 'whatsapp', 'appel', 'inscription_station', 'inscription_automobiliste', 'inscription_groupe') then
    return;
  end if;
  if v_session !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  if v_visitor is not null and v_visitor !~ '^[A-Za-z0-9_-]{8,64}$' then v_visitor := null; end if;
  if v_source not in ('facebook', 'instagram', 'tiktok', 'whatsapp', 'linkedin', 'youtube', 'x',
                      'snapchat', 'telegram', 'google', 'recherche', 'site', 'direct', 'autre') then
    v_source := 'autre';
  end if;
  if v_ref is not null and v_ref !~ '^[a-z0-9][a-z0-9_-]{1,29}$' then v_ref := null; end if;
  if v_device not in ('mobile', 'tablette', 'ordinateur') then v_device := null; end if;

  -- Inscription : uniquement le compte connecté qui vient d'être créé, une
  -- seule fois. Visite / clic : jamais rattaché à un compte.
  if v_kind like 'inscription_%' then
    if v_uid is null then return; end if;
    if exists (select 1 from public.site_events where profile_id = v_uid and kind like 'inscription_%') then return; end if;
  else
    v_uid := null;
  end if;

  -- Empreinte du jour (limite de débit, et visiteurs uniques à défaut de visitor_id).
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(coalesce(split_part(v_headers->>'x-forwarded-for', ',', 1), v_headers->>'x-real-ip', '')), '');
  if v_ip is not null then
    select salt into v_salt from public.site_event_salts where day = current_date;
    if v_salt is null then
      insert into public.site_event_salts (day, salt) values (current_date, encode(gen_random_bytes(16), 'hex'))
        on conflict (day) do nothing;
      select salt into v_salt from public.site_event_salts where day = current_date;
      delete from public.site_event_salts where day < current_date - 1;
    end if;
    v_hash := encode(digest(v_ip || '|' || coalesce(v_headers->>'user-agent', '') || '|' || v_salt, 'sha256'), 'hex');
    if (select count(*) from public.site_events
         where visitor_hash = v_hash and created_at > now() - interval '1 hour') >= 60 then
      return;
    end if;
  end if;

  -- Une visite par onglet ; un clic WhatsApp / appel compté une fois par 30 min.
  if v_kind = 'visite' and exists (
       select 1 from public.site_events where session_id = v_session and kind = 'visite') then
    return;
  end if;
  if v_kind in ('whatsapp', 'appel') and exists (
       select 1 from public.site_events
        where session_id = v_session and kind = v_kind and created_at > now() - interval '30 minutes') then
    return;
  end if;

  -- Lien d'affilié : rattachement, et réseau de l'affilié si l'arrivée n'en dit rien.
  if v_ref is not null then
    select id, network into v_aff_id, v_aff_net from public.affiliates where code = v_ref and active;
    if v_aff_id is not null and v_source in ('direct', 'autre') and v_aff_net <> 'autre' then
      v_source := v_aff_net;
    end if;
  end if;

  insert into public.site_events (kind, source, medium, campaign, ref, affiliate_id, referrer_host,
                                  landing_path, device, session_id, visitor_hash, profile_id, visitor_id)
  values (v_kind, v_source,
          nullif(left(btrim(coalesce(p_medium, '')), 60), ''),
          nullif(left(btrim(coalesce(p_campaign, '')), 60), ''),
          v_ref, v_aff_id,
          nullif(left(lower(btrim(coalesce(p_referrer_host, ''))), 120), ''),
          nullif(left(btrim(coalesce(p_landing_path, '')), 200), ''),
          v_device, v_session, v_hash, v_uid, v_visitor)
  on conflict do nothing;

  -- Conservation : 13 mois (purge de temps en temps, sans coût à chaque visite).
  if random() < 0.02 then
    delete from public.site_events where created_at < now() - interval '13 months';
  end if;
end;
$$;

revoke all on function public.record_site_event(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.record_site_event(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ─── Influenceurs ────────────────────────────────────────────────────────
alter table public.affiliates
  add column if not exists is_influencer   boolean not null default false,
  add column if not exists commission_rate numeric(5, 2) not null default 20;
do $$ begin
  alter table public.affiliates add constraint affiliates_commission_rate_check
    check (commission_rate >= 0 and commission_rate <= 100);
exception when duplicate_object then null; end $$;

create table if not exists public.affiliate_payouts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  affiliate_id uuid not null references public.affiliates(id) on delete restrict,
  amount       integer not null check (amount > 0),
  method       text not null default 'wave' check (method in ('wave', 'orange_money', 'especes', 'autre')),
  reference    text check (reference is null or char_length(reference) <= 80),
  paid_on      date not null default current_date,
  note         text check (note is null or char_length(note) <= 300),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid()
);
create index if not exists affiliate_payouts_affiliate_idx on public.affiliate_payouts (affiliate_id, paid_on desc);

alter table public.affiliate_payouts enable row level security;
revoke all on public.affiliate_payouts from anon;
grant select, insert, update, delete on public.affiliate_payouts to authenticated;
grant select, insert, update, delete on public.affiliate_payouts to service_role;

drop policy if exists "affiliate_payouts_super_admin" on public.affiliate_payouts;
create policy "affiliate_payouts_super_admin" on public.affiliate_payouts for all
  using (public.app_role() = 'super_admin') with check (public.app_role() = 'super_admin');

-- Journal d'audit : versements et réglages de commission.
create or replace function public.audit_affiliate_payout()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row  public.affiliate_payouts;
  v_name text;
  v_how  text;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  select name into v_name from public.affiliates where id = v_row.affiliate_id;
  v_how := case v_row.method when 'wave' then 'Wave' when 'orange_money' then 'Orange Money'
                             when 'especes' then 'espèces' else 'autre moyen' end;
  insert into public.audit_log (actor, action) values ('Super Admin',
    case when tg_op = 'DELETE' then 'Versement influenceur supprimé : ' else 'Versement influenceur : ' end
    || replace(to_char(v_row.amount, 'FM999,999,999'), ',', ' ') || ' FCFA à ' || coalesce(v_name, 'affilié supprimé')
    || ' (' || v_how || coalesce(', réf. ' || v_row.reference, '') || ', le ' || to_char(v_row.paid_on, 'DD/MM/YYYY') || ')');
  return null;
end;
$$;

drop trigger if exists affiliate_payouts_audit on public.affiliate_payouts;
create trigger affiliate_payouts_audit after insert or delete on public.affiliate_payouts
  for each row execute function public.audit_affiliate_payout();

-- 20.00 → « 20 », 12.50 → « 12,5 ».
create or replace function public.fmt_rate(p numeric)
returns text language sql immutable set search_path = public
as $$ select replace(rtrim(rtrim(p::text, '0'), '.'), '.', ','); $$;

create or replace function public.audit_affiliate_commission()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_influencer is distinct from old.is_influencer then
    insert into public.audit_log (actor, action) values ('Super Admin',
      case when new.is_influencer
        then new.name || ' devient influenceur (commission ' || public.fmt_rate(new.commission_rate) || ' %)'
        else new.name || ' n''est plus influenceur' end);
  elsif new.is_influencer and new.commission_rate is distinct from old.commission_rate then
    insert into public.audit_log (actor, action) values ('Super Admin',
      'Commission de ' || new.name || ' : ' || public.fmt_rate(old.commission_rate) || ' % → '
      || public.fmt_rate(new.commission_rate) || ' %');
  end if;
  return null;
end;
$$;

drop trigger if exists affiliates_commission_audit on public.affiliates;
create trigger affiliates_commission_audit after update of is_influencer, commission_rate on public.affiliates
  for each row execute function public.audit_affiliate_commission();

-- ─── Dépenses publicitaires (Facebook Ads…) ─────────────────────────────
create table if not exists public.ad_spends (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  campaign     text not null check (char_length(btrim(campaign)) between 1 and 60),
  network      text not null default 'facebook' check (network in ('facebook', 'instagram', 'tiktok', 'google', 'autre')),
  amount       integer not null check (amount > 0),
  period_start date not null,
  period_end   date not null,
  note         text check (note is null or char_length(note) <= 300),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  check (period_end >= period_start)
);

alter table public.ad_spends enable row level security;
revoke all on public.ad_spends from anon;
grant select, insert, update, delete on public.ad_spends to authenticated;
grant select, insert, update, delete on public.ad_spends to service_role;

drop policy if exists "ad_spends_super_admin" on public.ad_spends;
create policy "ad_spends_super_admin" on public.ad_spends for all
  using (public.app_role() = 'super_admin') with check (public.app_role() = 'super_admin');

-- ─── Chiffres des trois vues (Super Admin) ──────────────────────────────
-- Nom de campagne comparé sans tenir compte des majuscules ni des espaces
-- (« Promo Octobre » = « promo-octobre », forme des liens de suivi).
create or replace function public.campaign_key(p text)
returns text language sql immutable set search_path = public
as $$ select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', '-', 'g')), ''); $$;

-- Période [p_from, p_to) : visites et inscriptions des affiliés. Influenceurs
-- et campagnes : depuis le début (soldes à payer, coût total d'une campagne).
create or replace function public.marketing_stats(p_from timestamptz, p_to timestamptz)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result json;
begin
  if public.app_role() is distinct from 'super_admin' then
    raise exception 'Accès réservé au Super Admin.';
  end if;

  with
  -- Paiements confirmés des stations à la plateforme.
  payments as (
    select station_id, amount, coalesce(confirmed_at, created_at) as paid_at, 'abonnement'::text as kind
      from public.station_renewal_payments where status = 'CONFIRMED'
    union all
    select station_id, amount, coalesce(confirmed_at, starts_at, created_at), 'publicite'
      from public.station_ads where confirmed_at is not null and status in ('ACTIVE', 'EXPIRED')
  ),
  station_pay as (
    select station_id, min(paid_at) as first_paid_at, sum(amount)::bigint as revenue
      from payments group by 1
  ),
  -- Stations inscrites via le site (le compte du propriétaire porte l'événement).
  signups as (
    select distinct on (st.id) st.id as station_id, st.name as station_name, e.created_at as signed_up_at,
           e.affiliate_id, public.campaign_key(e.campaign) as campaign_key
      from public.site_events e
      join lateral (
        select s.id, s.name, s.created_at from public.stations s
         where s.created_by = e.profile_id
            or s.id = (select p.station_id from public.profiles p where p.id = e.profile_id)
         order by s.created_at limit 1
      ) st on true
     where e.kind = 'inscription_station'
     order by st.id, e.created_at
  ),
  signups_paid as (
    select s.*, sp.first_paid_at, coalesce(sp.revenue, 0) as revenue
      from signups s left join station_pay sp using (station_id)
  ),
  visits as (
    select affiliate_id, created_at, public.campaign_key(campaign) as campaign_key, campaign, source,
           coalesce('v' || visitor_id, 'h' || visitor_hash, 's' || session_id) as ukey
      from public.site_events where kind = 'visite'
  ),
  period_visits as (
    select * from visits where created_at >= p_from and created_at < p_to
  ),
  -- ── Affiliés ──
  aff_visits as (
    select affiliate_id, count(*)::int as visits, count(distinct ukey)::int as uniques
      from period_visits where affiliate_id is not null group by 1
  ),
  aff_last as (
    select affiliate_id, max(created_at) as last_click from visits where affiliate_id is not null group by 1
  ),
  aff_signups as (
    select affiliate_id, count(*)::int as signups, count(first_paid_at)::int as paying, sum(revenue)::bigint as revenue
      from signups_paid
     where affiliate_id is not null and signed_up_at >= p_from and signed_up_at < p_to
     group by 1
  ),
  -- ── Influenceurs (depuis le début) ──
  -- Un ancien influenceur déjà payé reste listé (même calcul) pour garder son historique.
  influencers as (
    select a.id, a.commission_rate from public.affiliates a
     where a.is_influencer or exists (select 1 from public.affiliate_payouts po where po.affiliate_id = a.id)
  ),
  inf_payments as (
    select s.affiliate_id, s.station_id, pm.amount,
           round(pm.amount * i.commission_rate / 100)::bigint as commission
      from signups_paid s
      join influencers i on i.id = s.affiliate_id
      join payments pm on pm.station_id = s.station_id
     where pm.paid_at < s.first_paid_at + interval '3 months'
  ),
  inf_stations as (
    select s.affiliate_id, s.station_id, s.station_name, s.signed_up_at, s.first_paid_at,
           s.first_paid_at + interval '3 months' as window_end,
           coalesce(sum(ip.amount), 0)::bigint as eligible_amount,
           count(ip.amount)::int as payments,
           coalesce(sum(ip.commission), 0)::bigint as commission
      from signups_paid s
      join influencers i on i.id = s.affiliate_id
      left join inf_payments ip on ip.station_id = s.station_id and ip.affiliate_id = s.affiliate_id
     group by 1, 2, 3, 4, 5
  ),
  inf_paid as (
    select affiliate_id, sum(amount)::bigint as paid from public.affiliate_payouts group by 1
  ),
  -- ── Campagnes (depuis le début) ──
  camp_visits as (
    select campaign_key, count(*)::int as visits, count(distinct ukey)::int as uniques,
           mode() within group (order by campaign) as label,
           array_agg(distinct source) as sources, min(created_at) as first_visit, max(created_at) as last_visit
      from visits where campaign_key is not null group by 1
  ),
  camp_signups as (
    select campaign_key, count(*)::int as signups, count(first_paid_at)::int as paying, sum(revenue)::bigint as revenue
      from signups_paid where campaign_key is not null group by 1
  ),
  camp_spends as (
    select public.campaign_key(campaign) as campaign_key, sum(amount)::bigint as spend, count(*)::int as entries,
           min(period_start) as period_start, max(period_end) as period_end,
           mode() within group (order by btrim(campaign)) as label
      from public.ad_spends group by 1
  ),
  camp_keys as (
    select campaign_key from camp_spends union select campaign_key from camp_visits
    union select campaign_key from camp_signups
  )
  select json_build_object(
    'affiliates', coalesce((select json_agg(x) from (
        select a.id as affiliate_id,
               coalesce(v.visits, 0) as visits, coalesce(v.uniques, 0) as uniques,
               coalesce(s.signups, 0) as signups, coalesce(s.paying, 0) as paying,
               coalesce(s.revenue, 0) as revenue, l.last_click
          from public.affiliates a
          left join aff_visits v on v.affiliate_id = a.id
          left join aff_last l on l.affiliate_id = a.id
          left join aff_signups s on s.affiliate_id = a.id) x), '[]'::json),
    'affiliate_totals', json_build_object(
        'visits', (select count(*) from period_visits where affiliate_id is not null),
        'uniques', (select count(distinct ukey) from period_visits where affiliate_id is not null),
        'signups', (select count(*) from signups_paid where affiliate_id is not null and signed_up_at >= p_from and signed_up_at < p_to),
        'paying', (select count(first_paid_at) from signups_paid where affiliate_id is not null and signed_up_at >= p_from and signed_up_at < p_to)),
    'influencers', coalesce((select json_agg(x) from (
        select a.id as affiliate_id,
               coalesce((select sum(commission) from inf_stations i where i.affiliate_id = a.id), 0) as earned,
               coalesce(p.paid, 0) as paid,
               coalesce((select json_agg(json_build_object(
                   'station_id', i.station_id, 'station_name', i.station_name, 'signed_up_at', i.signed_up_at,
                   'first_paid_at', i.first_paid_at, 'window_end', i.window_end, 'payments', i.payments,
                   'eligible_amount', i.eligible_amount, 'commission', i.commission)
                   order by i.first_paid_at nulls last, i.signed_up_at desc)
                  from inf_stations i where i.affiliate_id = a.id), '[]'::json) as stations,
               coalesce((select json_agg(json_build_object(
                   'id', po.id, 'amount', po.amount, 'method', po.method, 'reference', po.reference,
                   'paid_on', po.paid_on, 'note', po.note, 'created_at', po.created_at)
                   order by po.paid_on desc, po.created_at desc)
                  from public.affiliate_payouts po where po.affiliate_id = a.id), '[]'::json) as payouts
          from influencers a
          left join inf_paid p on p.affiliate_id = a.id) x), '[]'::json),
    'campaigns', coalesce((select json_agg(x order by x.spend desc, x.visits desc) from (
        select k.campaign_key, coalesce(cs.label, cv.label, k.campaign_key) as label,
               coalesce(cs.spend, 0) as spend, coalesce(cs.entries, 0) as entries,
               cs.period_start, cs.period_end,
               coalesce(cv.visits, 0) as visits, coalesce(cv.uniques, 0) as uniques,
               cv.sources, cv.first_visit, cv.last_visit,
               coalesce(cg.signups, 0) as signups, coalesce(cg.paying, 0) as paying,
               coalesce(cg.revenue, 0) as revenue
          from camp_keys k
          left join camp_spends cs on cs.campaign_key = k.campaign_key
          left join camp_visits cv on cv.campaign_key = k.campaign_key
          left join camp_signups cg on cg.campaign_key = k.campaign_key) x), '[]'::json),
    'spends', coalesce((select json_agg(x order by x.period_start desc, x.created_at desc) from (
        select id, created_at, campaign, network, amount, period_start, period_end, note from public.ad_spends) x), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.marketing_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.marketing_stats(timestamptz, timestamptz) to authenticated;
