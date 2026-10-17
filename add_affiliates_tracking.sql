-- ══════════════════════════════════════════════════════════════════════
-- Super Admin > Affiliés : d'où viennent les visiteurs du site public
-- (réseaux sociaux, recherche Google, liens d'affiliés…) et ce qu'ils font
-- ensuite : message par le formulaire Contact, clic WhatsApp / appel,
-- inscription (station, automobiliste, groupe).
-- Voir src/lib/trafficSources.js, src/lib/attribution.js,
-- src/visit-tracker.js et src/pages/SuperAdmin/Affiliates.jsx.
--
--   - affiliates      : partenaires qui partagent un lien ?ref=<code> ;
--   - site_events     : visites et contacts, avec leur provenance ;
--   - contact_messages: + colonnes de provenance (remplies par l'Edge
--                       Function send-contact-message) ;
--   - record_site_event()  : SEULE porte d'écriture pour les visiteurs
--                       (valeurs contrôlées, limite de débit) ;
--   - site_traffic_stats() : chiffres agrégés, Super Admin seulement.
--
-- Mesure propre au site, sans cookie publicitaire ni IP en clair : une
-- empreinte du jour (IP + navigateur + sel tiré au hasard chaque jour,
-- supprimé le surlendemain) sert seulement à limiter le débit ; elle ne
-- permet pas de suivre quelqu'un d'un jour à l'autre. Purge à 13 mois.
--
-- + Accès gratuit offert par le Super Admin (1 semaine, 10 jours, 1 mois,
--   Facturation) : station_billing.trial_started_at = début de la période
--   offerte (barre de progression juste).
--
-- Les clés de source doivent rester identiques à SOURCES dans
-- src/lib/trafficSources.js. Idempotent (rejouable sans risque).
-- ══════════════════════════════════════════════════════════════════════

-- ─── Accès gratuit offert ────────────────────────────────────────────────
alter table public.station_billing add column if not exists trial_started_at timestamptz;

-- ─── Affiliés ────────────────────────────────────────────────────────────
create table if not exists public.affiliates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  code        text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  network     text not null default 'autre' check (network in (
                'facebook', 'instagram', 'tiktok', 'whatsapp', 'linkedin', 'youtube', 'x',
                'snapchat', 'telegram', 'site', 'autre')),
  contact     text check (contact is null or char_length(contact) <= 120),
  note        text check (note is null or char_length(note) <= 300),
  active      boolean not null default true
);

alter table public.affiliates enable row level security;
grant select, insert, update, delete on public.affiliates to authenticated;
grant select, insert, update, delete on public.affiliates to service_role;

drop policy if exists "affiliates_super_admin" on public.affiliates;
create policy "affiliates_super_admin" on public.affiliates for all
  using (public.app_role() = 'super_admin') with check (public.app_role() = 'super_admin');

-- ─── Visites et contacts ─────────────────────────────────────────────────
create table if not exists public.site_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in (
                  'visite', 'whatsapp', 'appel',
                  'inscription_station', 'inscription_automobiliste', 'inscription_groupe')),
  source        text not null check (source in (
                  'facebook', 'instagram', 'tiktok', 'whatsapp', 'linkedin', 'youtube', 'x',
                  'snapchat', 'telegram', 'google', 'recherche', 'site', 'direct', 'autre')),
  medium        text check (medium is null or char_length(medium) <= 60),
  campaign      text check (campaign is null or char_length(campaign) <= 60),
  ref           text check (ref is null or char_length(ref) <= 30),
  affiliate_id  uuid references public.affiliates(id) on delete set null,
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  landing_path  text check (landing_path is null or char_length(landing_path) <= 200),
  device        text check (device is null or device in ('mobile', 'tablette', 'ordinateur')),
  session_id    text not null check (char_length(session_id) between 8 and 64),
  visitor_hash  text,
  profile_id    uuid references public.profiles(id) on delete set null
);

create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_session_idx on public.site_events (session_id, kind);
create index if not exists site_events_visitor_idx on public.site_events (visitor_hash, created_at desc);
create index if not exists site_events_affiliate_idx on public.site_events (affiliate_id) where affiliate_id is not null;
-- Une inscription n'est comptée qu'une fois par compte.
create unique index if not exists site_events_signup_once on public.site_events (profile_id)
  where kind in ('inscription_station', 'inscription_automobiliste', 'inscription_groupe');

alter table public.site_events enable row level security;
-- Aucun accès anonyme direct : les visiteurs passent par record_site_event().
revoke all on public.site_events from anon;
grant select, delete on public.site_events to authenticated;
grant select, insert, update, delete on public.site_events to service_role;

drop policy if exists "site_events_select" on public.site_events;
create policy "site_events_select" on public.site_events for select
  using (public.app_role() = 'super_admin');
drop policy if exists "site_events_delete" on public.site_events;
create policy "site_events_delete" on public.site_events for delete
  using (public.app_role() = 'super_admin');

-- Sel du jour de l'empreinte (illisible via l'API : RLS sans policy, aucun droit).
create table if not exists public.site_event_salts (
  day  date primary key,
  salt text not null
);
alter table public.site_event_salts enable row level security;
revoke all on public.site_event_salts from anon, authenticated;
grant select, insert, update, delete on public.site_event_salts to service_role;

-- ─── Provenance des messages du formulaire Contact ──────────────────────
alter table public.contact_messages
  add column if not exists source        text,
  add column if not exists medium        text,
  add column if not exists campaign      text,
  add column if not exists ref           text,
  add column if not exists affiliate_id  uuid references public.affiliates(id) on delete set null,
  add column if not exists referrer_host text,
  add column if not exists landing_path  text;
create index if not exists contact_messages_source_idx on public.contact_messages (source, created_at desc);

-- ─── Enregistrement d'un événement (visiteurs, clé publique) ────────────
create or replace function public.record_site_event(
  p_kind          text,
  p_session       text,
  p_source        text default 'direct',
  p_medium        text default null,
  p_campaign      text default null,
  p_ref           text default null,
  p_referrer_host text default null,
  p_landing_path  text default null,
  p_device        text default null
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_session text := btrim(coalesce(p_session, ''));
  v_source  text := lower(btrim(coalesce(p_source, '')));
  v_ref     text := nullif(lower(btrim(coalesce(p_ref, ''))), '');
  v_device  text := lower(btrim(coalesce(p_device, '')));
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

  -- Empreinte du jour (limite de débit seulement).
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
                                  landing_path, device, session_id, visitor_hash, profile_id)
  values (v_kind, v_source,
          nullif(left(btrim(coalesce(p_medium, '')), 60), ''),
          nullif(left(btrim(coalesce(p_campaign, '')), 60), ''),
          v_ref, v_aff_id,
          nullif(left(lower(btrim(coalesce(p_referrer_host, ''))), 120), ''),
          nullif(left(btrim(coalesce(p_landing_path, '')), 200), ''),
          v_device, v_session, v_hash, v_uid)
  on conflict do nothing;

  -- Conservation : 13 mois (purge de temps en temps, sans coût à chaque visite).
  if random() < 0.02 then
    delete from public.site_events where created_at < now() - interval '13 months';
  end if;
end;
$$;

revoke all on function public.record_site_event(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.record_site_event(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ─── Chiffres agrégés pour la page Affiliés (Super Admin) ───────────────
-- p_bucket : 'hour' | 'day' | 'month' (courbe des visites).
create or replace function public.site_traffic_stats(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_bucket text := case when p_bucket in ('hour', 'day', 'month') then p_bucket else 'day' end;
begin
  if public.app_role() is distinct from 'super_admin' then
    raise exception 'Accès réservé au Super Admin.';
  end if;
  return json_build_object(
    'events', coalesce((select json_agg(x) from (
        select source, kind, count(*)::int as count
          from public.site_events where created_at >= p_from and created_at < p_to
         group by source, kind) x), '[]'::json),
    'messages', coalesce((select json_agg(x) from (
        select coalesce(source, 'inconnu') as source, count(*)::int as count
          from public.contact_messages where created_at >= p_from and created_at < p_to
         group by 1) x), '[]'::json),
    'series', coalesce((select json_agg(x order by x.bucket) from (
        select date_trunc(v_bucket, created_at) as bucket, source, count(*)::int as count
          from public.site_events where kind = 'visite' and created_at >= p_from and created_at < p_to
         group by 1, 2) x), '[]'::json),
    'devices', coalesce((select json_agg(x) from (
        select coalesce(device, 'inconnu') as device, count(*)::int as count
          from public.site_events where kind = 'visite' and created_at >= p_from and created_at < p_to
         group by 1) x), '[]'::json),
    'campaigns', coalesce((select json_agg(x) from (
        select campaign, source, count(*)::int as count
          from public.site_events
         where kind = 'visite' and campaign is not null and created_at >= p_from and created_at < p_to
         group by 1, 2 order by 3 desc limit 10) x), '[]'::json),
    'affiliates', coalesce((select json_agg(x) from (
        select affiliate_id, kind, count(*)::int as count
          from public.site_events
         where affiliate_id is not null and created_at >= p_from and created_at < p_to
         group by 1, 2) x), '[]'::json),
    'affiliate_messages', coalesce((select json_agg(x) from (
        select affiliate_id, count(*)::int as count
          from public.contact_messages
         where affiliate_id is not null and created_at >= p_from and created_at < p_to
         group by 1) x), '[]'::json),
    'first_event_at', (select min(created_at) from public.site_events)
  );
end;
$$;

revoke all on function public.site_traffic_stats(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.site_traffic_stats(timestamptz, timestamptz, text) to authenticated;
