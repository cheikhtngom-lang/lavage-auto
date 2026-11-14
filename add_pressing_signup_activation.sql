-- ═══════════════════════════════════════════════════════════════════════
-- Inscription : compte Pressing, même e-mail pour une station et un
-- pressing, e-mail d'activation des stations et pressings (14/11/2026).
--
-- 1. Activation : un compte station ou pressing créé depuis login.html
--    (role 'admin') doit cliquer le lien reçu par e-mail avant de se
--    connecter (profiles.activation_required / activated_at). Son
--    établissement reste « en_attente » (caché de l'annuaire public, même
--    règle que les stations remises en attente par le Super Admin) jusqu'au
--    clic. Les comptes existants ne sont pas concernés (activation_required
--    = false). Les particuliers ouvrent leur compte tout de suite.
--    Jeton : envoyé par l'Edge Function send-activation-email (Resend), seul
--    son empreinte SHA-256 est gardée ; activate_account() le consomme.
-- 2. Plusieurs établissements, un seul e-mail : un compte station peut
--    ajouter un pressing (et l'inverse) avec add_establishment() ; ses
--    établissements sont listés dans account_stations, my_establishments()
--    les rend et switch_establishment() change celui qui est ouvert
--    (profiles.station_id, comme open_group_station() pour un groupe).
--    Un établissement de chaque sorte par compte.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 0. Correctif : passer une station à l'offre Pressing ───
-- `tableau || 'mod_pressing'` était lu comme deux tableaux (« malformed array
-- literal ») : toute mise à l'offre Pressing d'une station sans le module
-- échouait (inscription Pressing restée en Starter, set_pending_station_plan
-- n'étant que journalisé). Même fonction qu'add_pressing_offer.sql, avec
-- array_append.
create or replace function public.station_billing_plan_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Jamais deux fois le même module (il serait facturé deux fois).
  new.active_modules := coalesce((select array_agg(distinct m) from unnest(coalesce(new.active_modules, '{}')) m), '{}');
  if new.plan = 'Pressing' and not ('mod_pressing' = any (coalesce(new.active_modules, '{}'))) then
    new.active_modules := array_append(coalesce(new.active_modules, '{}'), 'mod_pressing');
  end if;
  -- Un module retiré n'est plus offert.
  new.free_modules := coalesce((select array_agg(m) from unnest(coalesce(new.free_modules, '{}')) m where m = any (coalesce(new.active_modules, '{}'))), '{}');
  update public.stations
     set business_type = case when new.plan = 'Pressing' then 'pressing' else 'lavage' end
   where id = new.station_id
     and business_type is distinct from case when new.plan = 'Pressing' then 'pressing' else 'lavage' end;
  return new;
end;
$$;

-- ─── 1. Activation ───
alter table public.profiles add column if not exists activation_required boolean not null default false;
alter table public.profiles add column if not exists activated_at timestamptz;

-- Profil créé depuis le navigateur : un compte établissement doit s'activer,
-- personne ne peut se déclarer « déjà activé ».
create or replace function public.profiles_activation_on_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.activation_required := (new.role = 'admin');
    new.activated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_activation_on_insert on public.profiles;
create trigger profiles_activation_on_insert before insert on public.profiles
  for each row execute function public.profiles_activation_on_insert();

create or replace function public.guard_profile_activation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.activation_required is distinct from old.activation_required
          or new.activated_at is distinct from old.activated_at) then
    raise exception 'Modification interdite : l''activation du compte passe par le lien reçu par e-mail.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_activation on public.profiles;
create trigger guard_profile_activation before update on public.profiles
  for each row execute function public.guard_profile_activation();

-- Établissement créé depuis le navigateur (inscription) : en attente jusqu'à
-- l'activation du compte. Le Super Admin (Super Admin > Stations) n'est pas
-- concerné, les fonctions serveur (security definer) non plus.
create or replace function public.stations_pending_until_activation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    new.status := 'en_attente';
  end if;
  return new;
end;
$$;

drop trigger if exists stations_pending_until_activation on public.stations;
create trigger stations_pending_until_activation before insert on public.stations
  for each row execute function public.stations_pending_until_activation();

create table if not exists public.account_activation_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists account_activation_tokens_user_idx on public.account_activation_tokens(user_id, created_at desc);
alter table public.account_activation_tokens enable row level security;
-- Aucune règle : seuls la fonction send-activation-email (service_role) et
-- activate_account() (security definer) y touchent.
revoke all on public.account_activation_tokens from anon, authenticated;
grant select, insert, update, delete on public.account_activation_tokens to service_role;

create or replace function public.activate_account(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row public.account_activation_tokens;
  v_kind text;
begin
  if coalesce(length(p_token), 0) < 32 or length(p_token) > 128 then
    return json_build_object('ok', false, 'reason', 'invalide');
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into v_row from public.account_activation_tokens where token_hash = v_hash for update;
  if v_row is null then return json_build_object('ok', false, 'reason', 'invalide'); end if;
  if v_row.used_at is not null then
    -- Lien déjà cliqué : le compte est activé, on le dit simplement.
    if exists (select 1 from public.profiles where id = v_row.user_id and activated_at is not null) then
      return json_build_object('ok', true, 'already', true,
        'kind', (select s.business_type from public.profiles p join public.stations s on s.id = p.station_id where p.id = v_row.user_id));
    end if;
    return json_build_object('ok', false, 'reason', 'utilise');
  end if;
  if v_row.expires_at <= now() then return json_build_object('ok', false, 'reason', 'expire'); end if;

  update public.account_activation_tokens set used_at = now() where user_id = v_row.user_id and used_at is null;
  update public.profiles set activated_at = now() where id = v_row.user_id and activated_at is null;
  -- Ses établissements en attente d'activation sortent dans l'annuaire.
  update public.stations s set status = 'active'
   where s.status = 'en_attente'
     and (s.created_by = v_row.user_id
          or s.id in (select station_id from public.account_stations where user_id = v_row.user_id));

  select s.business_type into v_kind from public.profiles p join public.stations s on s.id = p.station_id where p.id = v_row.user_id;
  return json_build_object('ok', true, 'kind', v_kind);
end;
$$;

-- Super Admin > Stations > « Valider / Activer » d'un établissement en
-- attente : active aussi le compte de son propriétaire (e-mail jamais reçu…).
create or replace function public.superadmin_activate_station_owner(p_station_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  update public.profiles p set activated_at = now()
   where p.activated_at is null and p.activation_required
     and (p.station_id = p_station_id
          or p.id in (select user_id from public.account_stations where station_id = p_station_id)
          or p.id = (select created_by from public.stations where id = p_station_id));
  update public.account_activation_tokens t set used_at = now()
   where t.used_at is null
     and t.user_id in (select created_by from public.stations where id = p_station_id);
end;
$$;
revoke all on function public.superadmin_activate_station_owner(uuid) from public;
grant execute on function public.superadmin_activate_station_owner(uuid) to authenticated;

-- ─── 2. Plusieurs établissements pour un même compte ───
create table if not exists public.account_stations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);
create index if not exists account_stations_station_idx on public.account_stations(station_id);
alter table public.account_stations enable row level security;
drop policy if exists account_stations_select on public.account_stations;
create policy account_stations_select on public.account_stations for select
  using (user_id = auth.uid() or public.app_role() = 'super_admin');
grant select on public.account_stations to authenticated;
grant select, insert, update, delete on public.account_stations to service_role;

-- Établissements du compte connecté (celui ouvert en premier).
create or replace function public.my_establishments()
returns table (id uuid, name text, business_type text, status text, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.station_id from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and not p.is_group_owner
  ), ids as (
    select station_id from me where station_id is not null
    union
    select a.station_id from public.account_stations a join me on me.id = a.user_id
  )
  select s.id, s.name, s.business_type, s.status, s.id = (select station_id from me)
    from public.stations s join ids on ids.station_id = s.id
   order by (s.id = (select station_id from me)) desc, s.created_at;
$$;

-- Ouvre un autre établissement du compte.
create or replace function public.switch_establishment(p_station_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'admin' or v_profile.is_group_owner then
    raise exception 'Réservé au propriétaire d''un établissement.' using errcode = '42501';
  end if;
  if v_profile.station_id = p_station_id then return p_station_id; end if;
  if not exists (select 1 from public.account_stations where user_id = auth.uid() and station_id = p_station_id) then
    raise exception 'Cet établissement ne fait pas partie de votre compte.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where station_id = p_station_id and role = 'admin' and not is_group_owner and id <> auth.uid()) then
    raise exception 'Cet établissement a un autre propriétaire.' using errcode = '42501';
  end if;
  update public.profiles set station_id = p_station_id where id = auth.uid();
  return p_station_id;
end;
$$;

-- Ajoute un établissement (p_kind 'pressing' ou 'lavage') au compte connecté
-- et l'ouvre. Même e-mail, même mot de passe ; abonnement et essai propres.
create or replace function public.add_establishment(
  p_kind text,
  p_name text,
  p_address text default '',
  p_quartier text default '',
  p_region text default '',
  p_country text default 'SN',
  p_phone text default '',
  p_lat double precision default null,
  p_lng double precision default null,
  p_plan text default null
)
returns public.stations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_current public.stations;
  v_station public.stations;
  v_country text := upper(coalesce(nullif(trim(p_country), ''), 'SN'));
  v_plan text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'admin' or v_profile.is_group_owner or v_profile.station_id is null then
    raise exception 'Seul le propriétaire d''une station ou d''un pressing peut ajouter un établissement à son compte.' using errcode = '42501';
  end if;
  if p_kind not in ('pressing', 'lavage') then raise exception 'Type d''établissement inconnu.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom est requis.'; end if;
  if v_country !~ '^[A-Z]{2}$' then raise exception 'Pays invalide.'; end if;
  v_plan := case when p_kind = 'pressing' then 'Pressing'
                 when p_plan in ('Starter', 'Pro', 'Business') then p_plan
                 else 'Starter' end;

  select * into v_current from public.stations where id = v_profile.station_id;
  if exists (
    select 1 from public.stations s
     where s.business_type = p_kind
       and (s.id = v_profile.station_id
            or s.id in (select station_id from public.account_stations where user_id = auth.uid()))
  ) then
    raise exception '%', case when p_kind = 'pressing' then 'Ce compte a déjà un pressing. Connectez-vous pour l''ouvrir.'
                              else 'Ce compte a déjà une station de lavage. Connectez-vous pour l''ouvrir.' end;
  end if;

  insert into public.stations (
    created_by, name, owner_name, owner_email, owner_phone,
    address, quartier, region, country, lat, lng, status
  ) values (
    auth.uid(), trim(p_name), v_profile.full_name, v_profile.email,
    coalesce(nullif(trim(p_phone), ''), v_profile.phone, ''),
    coalesce(p_address, ''), coalesce(p_quartier, ''), coalesce(p_region, ''), v_country,
    p_lat, p_lng,
    case when v_profile.activation_required and v_profile.activated_at is null then 'en_attente' else 'active' end
  )
  returning * into v_station;

  -- handle_new_station() a créé l'essai de 7 jours ; station_billing_plan_sync()
  -- règle business_type et le module Pressing d'après l'offre.
  update public.station_billing set plan = v_plan where station_id = v_station.id;

  insert into public.account_stations (user_id, station_id)
    values (auth.uid(), v_current.id), (auth.uid(), v_station.id)
    on conflict do nothing;
  update public.profiles set station_id = v_station.id where id = auth.uid();

  select * into v_station from public.stations where id = v_station.id;
  return v_station;
end;
$$;

revoke all on function public.activate_account(text) from public;
grant execute on function public.activate_account(text) to anon, authenticated;
revoke all on function public.my_establishments() from public;
grant execute on function public.my_establishments() to authenticated;
revoke all on function public.switch_establishment(uuid) from public;
grant execute on function public.switch_establishment(uuid) to authenticated;
revoke all on function public.add_establishment(text, text, text, text, text, text, text, double precision, double precision, text) from public;
grant execute on function public.add_establishment(text, text, text, text, text, text, text, double precision, double precision, text) to authenticated;
