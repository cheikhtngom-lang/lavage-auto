-- ════════════════════════════════════════════════════════════════════════
--  Gestion d'équipe multi-comptes par station + catalogue de rôles
--  (modèle inspiré de la copie d'écran "Rôles de l'Agence" fournie).
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Concept :
--   - Le propriétaire de la station garde son compte role='admin' (inchangé,
--     l'index one_admin_per_station tient toujours).
--   - Les collaborateurs sont des profils role='staff', station_id renseigné,
--     rattachés à une ligne station_members qui pointe vers un station_roles.
--   - station_roles = catalogue par station : 6 rôles "catalogue" (is_builtin,
--     non modifiables côté UI) + jusqu'à 10 rôles personnalisés.
--   - Invitation par email : station_invitations porte un token à usage unique ;
--     l'Edge Function accept-station-invite crée le compte auth + le profil.
--
--  Sécurité v1 = "interface seulement" : le RLS reste au niveau station
--  (current_station_id() renvoie bien la station du staff, donc toutes les
--  policies station_id = current_station_id() existantes fonctionnent tel quel).
--  Seuls les écritures sensibles (équipe / rôles / invitations) sont vraiment
--  verrouillées ci-dessous via has_station_perm('team.manage').
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. Nouveau rôle applicatif 'staff' ─────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'automobiliste', 'staff'));

-- ─── 2. Catalogue de rôles par station ─────────────────────────────────
create table if not exists public.station_roles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  key text not null,                       -- 'super_admin_station' | 'gerant' | ... | 'custom-xxxx'
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}', -- liste de clés, ou ['*'] = tout
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (station_id, key)
);
create index if not exists station_roles_station_idx on public.station_roles(station_id);

-- ─── 3. Membres (collaborateurs) ──────────────────────────────────────
create table if not exists public.station_members (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,  -- null tant que l'invitation n'est pas acceptée
  role_id uuid not null references public.station_roles(id) on delete restrict,
  email text not null,
  full_name text not null default '',
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  employee_id uuid references public.employees(id) on delete set null, -- lien fiche "Laveur" (planning / pointage)
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (station_id, email)
);
create index if not exists station_members_station_idx on public.station_members(station_id);
create index if not exists station_members_profile_idx on public.station_members(profile_id);

-- ─── 4. Invitations (token à usage unique) ────────────────────────────
create table if not exists public.station_invitations (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  member_id uuid not null references public.station_members(id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
create index if not exists station_invitations_token_idx on public.station_invitations(token);

-- ─── 5. Permissions effectives d'un membre (helper RLS) ───────────────
-- true si l'utilisateur courant possède `perm` (ou '*') sur SA station.
-- Le propriétaire (role='admin') a tout. SECURITY DEFINER : contourne le RLS
-- de station_members/station_roles pour éviter toute récursion de policy.
create or replace function public.has_station_perm(perm text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    public.app_role() = 'admin'
    or exists (
      select 1
      from public.station_members m
      join public.station_roles r on r.id = m.role_id
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (r.permissions @> array['*'] or r.permissions @> array[perm])
    );
$$;

-- ─── 6. RLS ──────────────────────────────────────────────────────────
alter table public.station_roles enable row level security;
alter table public.station_members enable row level security;
alter table public.station_invitations enable row level security;

-- station_roles : lisible par tout membre de la station ; écriture réservée
-- à qui a 'team.manage' (propriétaire inclus). Super admin voit tout.
drop policy if exists station_roles_select on public.station_roles;
create policy station_roles_select on public.station_roles for select
  using (station_id = public.current_station_id() or public.app_role() = 'super_admin');

drop policy if exists station_roles_write on public.station_roles;
create policy station_roles_write on public.station_roles for all
  using (station_id = public.current_station_id() and public.has_station_perm('team.manage') and is_builtin = false)
  with check (station_id = public.current_station_id() and public.has_station_perm('team.manage') and is_builtin = false);

-- station_members : lisible par tout membre de la station (liste "Collaborateurs")
-- + par le membre lui-même. Écriture réservée à 'team.manage'.
drop policy if exists station_members_select on public.station_members;
create policy station_members_select on public.station_members for select
  using (
    station_id = public.current_station_id()
    or profile_id = auth.uid()
    or public.app_role() = 'super_admin'
  );

drop policy if exists station_members_write on public.station_members;
create policy station_members_write on public.station_members for all
  using (station_id = public.current_station_id() and public.has_station_perm('team.manage'))
  with check (station_id = public.current_station_id() and public.has_station_perm('team.manage'));

-- station_invitations : jamais exposée au navigateur (uniquement l'Edge
-- Function en service_role). On autorise malgré tout une lecture "team.manage"
-- pour un éventuel écran de suivi, rien d'autre côté client.
drop policy if exists station_invitations_select on public.station_invitations;
create policy station_invitations_select on public.station_invitations for select
  using (station_id = public.current_station_id() and public.has_station_perm('team.manage'));

-- ─── 7. Rôles "catalogue" pour une station donnée ────────────────────
create or replace function public.seed_builtin_station_roles(p_station_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.station_roles (station_id, key, name, description, permissions, is_builtin)
  values
    (p_station_id, 'super_admin_station', 'Super Admin Station',
     'Tous les droits sur la station.', array['*'], true),
    (p_station_id, 'gerant', 'Gérant',
     'Gestion complète au quotidien, sauf la gestion de l''équipe.',
     array['dashboard','washers.manage','transactions.view','accounting.manage','subscriptions.manage','analytics.view','settings.manage'], true),
    (p_station_id, 'caissier', 'Caissier / Comptable',
     'Encaissements, transactions, comptabilité, dépenses et analytique.',
     array['dashboard','transactions.view','accounting.manage','subscriptions.manage','analytics.view'], true),
    (p_station_id, 'superviseur', 'Superviseur',
     'File d''attente, laveurs, planning et pointage.',
     array['dashboard','washers.manage'], true),
    (p_station_id, 'reception', 'Réception',
     'File d''attente, nouveau lavage et suivi des transactions.',
     array['dashboard','transactions.view'], true),
    (p_station_id, 'laveur', 'Laveur',
     'Voit la file d''attente et ses lavages ; gère son pointage.',
     array['dashboard','washer.self'], true)
  on conflict (station_id, key) do nothing;
end;
$$;

-- ─── 8. Semer pour les stations existantes ───────────────────────────
do $$
declare s record;
begin
  for s in select id from public.stations loop
    perform public.seed_builtin_station_roles(s.id);
  end loop;
end $$;

-- ─── 9. Semer automatiquement à la création d'une station ────────────
-- IMPORTANT : cette fonction est aussi (re)définie par add_station_trial.sql
-- (colonne trial_ends_at). On garde ici la version fusionnée : essai d'un
-- mois daté + semis des rôles catalogue. Le `coalesce` sur trial_ends_at rend
-- la ligne robuste même si add_station_trial.sql n'a pas encore été exécuté.
create or replace function public.handle_new_station()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.station_billing (station_id, trial_ends_at)
      values (new.id, now() + interval '1 month');
  exception when undefined_column then
    -- add_station_trial.sql pas encore passé : on retombe sur l'insert simple.
    insert into public.station_billing (station_id) values (new.id);
  end;
  perform public.seed_builtin_station_roles(new.id);
  return new;
end;
$$;
-- (le trigger on_station_created existe déjà et pointe sur cette fonction)

-- ─── 10. Realtime (facultatif — la page Équipe se rafraîchit aussi au focus) ──
do $$
begin
  begin
    alter publication supabase_realtime add table public.station_members;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.station_roles;
  exception when others then null;
  end;
end $$;
