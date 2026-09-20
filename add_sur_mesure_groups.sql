-- ══════════════════════════════════════════════════════════════════════
-- OFFRE « SUR MESURE » — chef d'entreprise multi-stations (phase 1).
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- Modèle :
--   • Un GROUPE (organizations) appartient à un compte « patron ». Le patron
--     garde profiles.role = 'admin' + profiles.is_group_owner = true : il
--     "ouvre" une station à la fois (open_group_station change son
--     profiles.station_id), et toute l'interface station + le RLS existants
--     (current_station_id()) fonctionnent alors tels quels, avec tous les droits.
--   • Les stations du groupe portent stations.organization_id. Leur abonnement
--     reste dans station_billing (plan, statut, échéance) : la porte
--     d'abonnement, la visibilité publique et le MRR du Super Admin continuent
--     de marcher sans rien changer. UNE seule échéance pour tout le groupe
--     (organizations.next_billing_date), prorata pour les ajouts en cours de cycle.
--   • Une commande (organization_orders) = un devis PAYÉ EN UNE FOIS. Les
--     stations ne sont créées / rattachées qu'APRÈS confirmation du paiement
--     (PayDunya, ou confirmation manuelle du Super Admin).
--   • Une station existante rejoint un groupe avec l'ACCORD de son propriétaire
--     (group_join_requests), puis via une ligne de commande.
--   • Un seul « Super Admin de station » (rôle super_admin_station) par station.
--
-- Les fonctions marquées "service_role" ne sont appelables que par les Edge
-- Functions (paydunya-callback, finalize-paydunya-payment).
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Compte patron ─────────────────────────────────────────────────
alter table public.profiles add column if not exists is_group_owner boolean not null default false;

-- Le patron peut être "ouvert" sur une station qui a déjà son propre
-- propriétaire (station rattachée) : il ne compte donc pas dans l'unicité
-- « un seul admin par station ».
drop index if exists public.one_admin_per_station;
create unique index one_admin_per_station on public.profiles(station_id)
  where role = 'admin' and not is_group_owner;

-- ─── 2. Groupes ───────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  -- en_attente : aucun paiement encore confirmé ; a_jour ; en_retard (impayé)
  status text not null default 'en_attente' check (status in ('en_attente', 'a_jour', 'en_retard')),
  next_billing_date timestamptz,
  created_at timestamptz not null default now()
);

alter table public.stations add column if not exists organization_id uuid references public.organizations(id) on delete set null;
-- 'created' : créée par le patron ; 'joined' : station existante rattachée avec l'accord de son propriétaire.
alter table public.stations add column if not exists group_origin text check (group_origin in ('created', 'joined'));
-- Renseignée quand le patron retire (archive) une station qu'il a créée.
alter table public.stations add column if not exists group_archived_at timestamptz;
create index if not exists stations_organization_idx on public.stations(organization_id) where organization_id is not null;

-- ─── 3. Verrous : personne ne se met lui-même dans un groupe ──────────
-- (stations_update / stations_insert / profiles_update sont ouverts à leur
-- propriétaire — sans ça une station pourrait s'attribuer n'importe quel groupe.)
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    if new.role is distinct from old.role
       or new.station_id is distinct from old.station_id
       or new.is_group_owner is distinct from old.is_group_owner then
      raise exception 'Modification interdite : le rôle et la station d''un compte ne peuvent pas être changés depuis l''application.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_profile_group_flag_insert()
returns trigger language plpgsql as $$
begin
  if new.is_group_owner and current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Statut de patron réservé à la création d''un groupe.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_group_flag_insert on public.profiles;
create trigger guard_profile_group_flag_insert
  before insert on public.profiles
  for each row execute function public.guard_profile_group_flag_insert();

create or replace function public.guard_station_group_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.app_role(), '') <> 'super_admin' then
    if tg_op = 'INSERT' then
      if new.organization_id is not null or new.group_origin is not null or new.group_archived_at is not null then
        raise exception 'Le rattachement à un groupe se fait uniquement par une commande Sur mesure.' using errcode = '42501';
      end if;
    elsif new.organization_id is distinct from old.organization_id
       or new.group_origin is distinct from old.group_origin
       or new.group_archived_at is distinct from old.group_archived_at then
      raise exception 'Le rattachement à un groupe ne peut pas être modifié depuis l''application.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_station_group_columns on public.stations;
create trigger guard_station_group_columns
  before insert or update on public.stations
  for each row execute function public.guard_station_group_columns();

-- ─── 4. Helpers RLS ───────────────────────────────────────────────────
create or replace function public.my_organization_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from public.organizations where owner_id = auth.uid();
$$;

create or replace function public.is_group_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.organizations where owner_id = auth.uid());
$$;

create or replace function public.group_owns_station(sid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.stations s
    join public.organizations o on o.id = s.organization_id
    where s.id = sid and o.owner_id = auth.uid()
  );
$$;

-- ─── 5. Commandes / paiements du groupe ───────────────────────────────
create table if not exists public.organization_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('commande', 'renouvellement')),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  amount integer not null check (amount > 0),
  -- Lignes de la commande, déjà tarifées côté serveur :
  --   {type:'new', name, city, plan, price, amount} | {type:'existing', station_id, name, plan, price, amount}
  lines jsonb not null default '[]'::jsonb,
  days_left integer,
  method text,
  reference text,
  paydunya_token text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists organization_orders_org_idx on public.organization_orders(organization_id, created_at desc);

-- ─── 6. Demandes de rattachement d'une station existante ──────────────
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  plan text not null references public.plans(key),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'refused', 'cancelled', 'attached')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
-- Une station ne peut avoir qu'une demande ouverte à la fois.
create unique index if not exists group_join_one_open_per_station
  on public.group_join_requests(station_id) where status in ('pending', 'accepted');

-- ─── 7. RLS (lecture seule : toute écriture passe par les fonctions) ──
alter table public.organizations enable row level security;
alter table public.organization_orders enable row level security;
alter table public.group_join_requests enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select
  using (owner_id = auth.uid() or public.app_role() = 'super_admin');

-- Le propriétaire d'une station rattachée (ou sollicitée) peut lire le NOM et
-- l'état du groupe concerné — jamais celui d'un autre groupe.
create or replace function public.org_visible_to_my_station(oid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.app_role() = 'admin' and (
    exists (select 1 from public.stations where id = public.current_station_id() and organization_id = oid)
    or exists (
      select 1 from public.group_join_requests
      where organization_id = oid and station_id = public.current_station_id() and status in ('pending', 'accepted')
    )
  );
$$;
drop policy if exists organizations_select_station on public.organizations;
create policy organizations_select_station on public.organizations for select
  using (public.org_visible_to_my_station(id));

drop policy if exists organization_orders_select on public.organization_orders;
create policy organization_orders_select on public.organization_orders for select
  using (organization_id = public.my_organization_id() or public.app_role() = 'super_admin');

drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select on public.group_join_requests for select
  using (
    organization_id = public.my_organization_id()
    or public.app_role() = 'super_admin'
    or (station_id = public.current_station_id() and public.app_role() = 'admin' and not public.is_group_owner())
  );

-- Le patron voit ses stations (même archivées / suspendues), leur facturation
-- et leurs membres — en plus des règles existantes (les policies s'additionnent).
drop policy if exists stations_select_group_owner on public.stations;
create policy stations_select_group_owner on public.stations for select
  using (organization_id is not null and organization_id = public.my_organization_id());

drop policy if exists station_billing_select_group_owner on public.station_billing;
create policy station_billing_select_group_owner on public.station_billing for select
  using (public.group_owns_station(station_id));

drop policy if exists station_members_select_group_owner on public.station_members;
create policy station_members_select_group_owner on public.station_members for select
  using (public.group_owns_station(station_id));

-- (catalogue de rôles : nécessaire pour reconnaître le Super Admin d'une station)
drop policy if exists station_roles_select_group_owner on public.station_roles;
create policy station_roles_select_group_owner on public.station_roles for select
  using (public.group_owns_station(station_id));

-- ─── 8. Un seul Super Admin par station ───────────────────────────────
create or replace function public.enforce_single_station_super_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  if new.status not in ('invited', 'active') then return new; end if;
  select key into v_key from public.station_roles where id = new.role_id;
  if v_key is distinct from 'super_admin_station' then return new; end if;
  if exists (
    select 1 from public.station_members m
    join public.station_roles r on r.id = m.role_id
    where m.station_id = new.station_id
      and r.key = 'super_admin_station'
      and m.status in ('invited', 'active')
      and m.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'Cette station a déjà un Super Admin (un seul par station). Retirez l''actuel avant d''en nommer un autre.';
  end if;
  return new;
end;
$$;
drop trigger if exists station_members_single_super_admin on public.station_members;
create trigger station_members_single_super_admin
  before insert or update of role_id, status on public.station_members
  for each row execute function public.enforce_single_station_super_admin();

-- ─── 9. Devenir patron (compte automobiliste → groupe) ────────────────
create or replace function public.convert_account_to_group(p_name text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_org public.organizations;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then raise exception 'Profil introuvable.'; end if;
  if v_profile.role <> 'automobiliste' then
    raise exception 'Seul un compte automobiliste peut être transformé en compte Sur mesure.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Le nom de l''entreprise est requis.'; end if;

  insert into public.organizations (name, owner_id) values (trim(p_name), auth.uid())
  returning * into v_org;

  update public.profiles set role = 'admin', is_group_owner = true, station_id = null
  where id = auth.uid();

  insert into public.audit_log (actor, action)
  values (coalesce(v_profile.full_name, 'Patron'), 'Nouveau groupe Sur mesure : « ' || v_org.name || ' »');
  return v_org;
end;
$$;
revoke all on function public.convert_account_to_group(text) from public, anon;
grant execute on function public.convert_account_to_group(text) to authenticated;

-- ─── 10. Tarification d'une commande (serveur = seule source de vérité) ─
-- p_lines : [{type:'new', name, city, plan} | {type:'existing', station_id, plan}]
-- Renvoie {lines:[…tarifées], total, days_left}. Le prorata s'applique aux
-- ajouts EN COURS de cycle ; le premier paiement (pas encore d'échéance) est
-- facturé au mois entier.
create or replace function public._group_price_lines(p_org public.organizations, p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_line jsonb;
  v_out jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_days integer := 30;
  v_price integer;
  v_amount integer;
  v_type text;
  v_plan text;
  v_name text;
  v_city text;
  v_sid uuid;
  v_st public.stations;
  v_seen uuid[] := '{}';
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une station à la commande.';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'Une commande est limitée à 50 stations.';
  end if;
  if p_org.status = 'en_retard' then
    raise exception 'Le groupe est en retard de paiement : réglez d''abord le renouvellement.';
  end if;

  if p_org.next_billing_date is not null then
    v_days := greatest(1, least(30, ceil(extract(epoch from (p_org.next_billing_date - now())) / 86400.0)::integer));
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_type := v_line->>'type';
    v_plan := v_line->>'plan';
    select price into v_price from public.plans where key = v_plan;
    if v_price is null then raise exception 'Offre inconnue : %.', coalesce(v_plan, '(vide)'); end if;

    v_amount := case when p_org.next_billing_date is null then v_price
                     else greatest(1, round(v_price * v_days / 30.0)::integer) end;

    if v_type = 'new' then
      v_name := trim(coalesce(v_line->>'name', ''));
      v_city := trim(coalesce(v_line->>'city', ''));
      if length(v_name) < 2 or length(v_name) > 100 then raise exception 'Chaque station doit avoir un nom (2 à 100 caractères).'; end if;
      if length(v_city) > 80 then raise exception 'Nom de ville trop long.'; end if;
      v_out := v_out || jsonb_build_object('type', 'new', 'name', v_name, 'city', v_city, 'plan', v_plan, 'price', v_price, 'amount', v_amount);

    elsif v_type = 'existing' then
      begin
        v_sid := (v_line->>'station_id')::uuid;
      exception when others then
        raise exception 'Station invalide dans la commande.';
      end;
      if v_sid = any(v_seen) then raise exception 'Une station apparaît deux fois dans la commande.'; end if;
      v_seen := v_seen || v_sid;
      select * into v_st from public.stations where id = v_sid;
      if v_st.id is null then raise exception 'Station introuvable.'; end if;
      -- Soit une station qui a ACCEPTÉ de rejoindre le groupe, soit une station
      -- archivée du groupe que le patron réactive.
      if not (
        exists (select 1 from public.group_join_requests r
                where r.station_id = v_sid and r.organization_id = p_org.id and r.status = 'accepted')
        or (v_st.organization_id = p_org.id and v_st.group_archived_at is not null)
      ) then
        raise exception 'La station « % » n''a pas accepté de rejoindre votre groupe.', v_st.name;
      end if;
      v_out := v_out || jsonb_build_object('type', 'existing', 'station_id', v_sid, 'name', v_st.name, 'plan', v_plan, 'price', v_price, 'amount', v_amount);
    else
      raise exception 'Type de ligne inconnu.';
    end if;
    v_total := v_total + v_amount;
  end loop;

  return jsonb_build_object('lines', v_out, 'total', v_total, 'days_left', v_days, 'first_cycle', p_org.next_billing_date is null);
end;
$$;
revoke all on function public._group_price_lines(public.organizations, jsonb) from public, anon, authenticated;

create or replace function public.group_quote(p_lines jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where owner_id = auth.uid();
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;
  return public._group_price_lines(v_org, p_lines);
end;
$$;
revoke all on function public.group_quote(jsonb) from public, anon;
grant execute on function public.group_quote(jsonb) to authenticated;

-- ─── 11. Créer la commande (PENDING) ──────────────────────────────────
create or replace function public.create_group_order(p_lines jsonb)
returns public.organization_orders
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_quote jsonb;
  v_row public.organization_orders;
begin
  select * into v_org from public.organizations where owner_id = auth.uid() for update;
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;

  v_quote := public._group_price_lines(v_org, p_lines);

  -- Une nouvelle commande remplace les anciennes encore en attente (sans
  -- paiement engagé) : une seule commande ouverte à la fois.
  update public.organization_orders set status = 'CANCELLED'
  where organization_id = v_org.id and kind = 'commande' and status = 'PENDING'
    and paydunya_token is null and reference is null;

  insert into public.organization_orders (organization_id, kind, amount, lines, days_left)
  values (v_org.id, 'commande', (v_quote->>'total')::integer, v_quote->'lines', (v_quote->>'days_left')::integer)
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.create_group_order(jsonb) from public, anon;
grant execute on function public.create_group_order(jsonb) to authenticated;

-- Renouvellement mensuel : somme des plans des stations actives du groupe.
create or replace function public.create_group_renewal()
returns public.organization_orders
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_lines jsonb;
  v_total integer;
  v_row public.organization_orders;
begin
  select * into v_org from public.organizations where owner_id = auth.uid() for update;
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;
  if v_org.next_billing_date is null then
    raise exception 'Le groupe n''a pas encore de première commande payée : rien à renouveler.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('type', 'renewal', 'station_id', s.id, 'name', s.name, 'plan', b.plan, 'price', p.price, 'amount', p.price)), '[]'::jsonb),
         coalesce(sum(p.price), 0)
    into v_lines, v_total
  from public.stations s
  join public.station_billing b on b.station_id = s.id
  join public.plans p on p.key = b.plan
  where s.organization_id = v_org.id and s.group_archived_at is null and s.status = 'active';

  if v_total <= 0 then raise exception 'Aucune station active dans le groupe : rien à renouveler.'; end if;

  -- Réutilise le renouvellement déjà en attente (mise à jour du montant).
  select * into v_row from public.organization_orders
  where organization_id = v_org.id and kind = 'renouvellement' and status = 'PENDING'
    and paydunya_token is null and reference is null
  order by created_at desc limit 1;
  if v_row.id is not null then
    update public.organization_orders set amount = v_total, lines = v_lines where id = v_row.id returning * into v_row;
  else
    insert into public.organization_orders (organization_id, kind, amount, lines)
    values (v_org.id, 'renouvellement', v_total, v_lines) returning * into v_row;
  end if;
  return v_row;
end;
$$;
revoke all on function public.create_group_renewal() from public, anon;
grant execute on function public.create_group_renewal() to authenticated;

-- Le patron indique comment il a payé hors ligne (Wave / Orange Money) : le
-- Super Admin confirme ensuite. Jamais d'activation automatique.
create or replace function public.set_group_order_payment_info(p_order_id uuid, p_method text, p_reference text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.organization_orders
     set method = nullif(trim(p_method), ''), reference = nullif(trim(p_reference), '')
   where id = p_order_id and organization_id = public.my_organization_id() and status = 'PENDING';
  if not found then raise exception 'Commande introuvable ou déjà traitée.'; end if;
end;
$$;
revoke all on function public.set_group_order_payment_info(uuid, text, text) from public, anon;
grant execute on function public.set_group_order_payment_info(uuid, text, text) to authenticated;

-- ─── 12. Application d'une commande payée ─────────────────────────────
-- Interne : appelée par les Edge Functions (service_role) et par la
-- confirmation manuelle du Super Admin. Idempotente.
create or replace function public._apply_group_order(p_order_id uuid, p_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_order public.organization_orders;
  v_org public.organizations;
  v_owner public.profiles;
  v_line jsonb;
  v_date timestamptz;
  v_sid uuid;
begin
  select * into v_order from public.organization_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Commande introuvable.'; end if;
  if v_order.status <> 'PENDING' then return; end if; -- déjà traitée : idempotent

  select * into v_org from public.organizations where id = v_order.organization_id for update;
  select * into v_owner from public.profiles where id = v_org.owner_id;

  if v_order.kind = 'commande' then
    v_date := coalesce(v_org.next_billing_date, now() + interval '30 days');

    for v_line in select * from jsonb_array_elements(v_order.lines) loop
      if v_line->>'type' = 'new' then
        insert into public.stations (
          created_by, name, owner_name, owner_email, owner_phone, city, country, status, organization_id, group_origin
        ) values (
          v_org.owner_id, v_line->>'name', v_owner.full_name, v_owner.email, coalesce(v_owner.phone, ''),
          coalesce(nullif(v_line->>'city', ''), ''), coalesce(v_owner.country, 'SN'), 'active', v_org.id, 'created'
        ) returning id into v_sid;
      else
        v_sid := (v_line->>'station_id')::uuid;
        update public.stations
           set organization_id = v_org.id,
               group_origin = coalesce(group_origin, 'joined'),
               group_archived_at = null,
               status = 'active'
         where id = v_sid;
        update public.group_join_requests set status = 'attached', decided_at = coalesce(decided_at, now())
         where station_id = v_sid and organization_id = v_org.id and status = 'accepted';
      end if;

      -- Le groupe paie : pas d'essai, abonnement à jour jusqu'à l'échéance commune.
      update public.station_billing
         set plan = v_line->>'plan', subscription_status = 'a_jour',
             next_billing_date = v_date, trial_ends_at = null
       where station_id = v_sid;
    end loop;

    update public.organizations set status = 'a_jour', next_billing_date = v_date where id = v_org.id;

  else -- renouvellement : +30 jours pour tout le groupe
    v_date := greatest(coalesce(v_org.next_billing_date, now()), now()) + interval '30 days';
    update public.station_billing
       set subscription_status = 'a_jour', next_billing_date = v_date
     where station_id in (
       select id from public.stations
       where organization_id = v_org.id and group_archived_at is null and status = 'active'
     );
    update public.organizations set status = 'a_jour', next_billing_date = v_date where id = v_org.id;
  end if;

  update public.organization_orders
     set status = 'CONFIRMED', confirmed_at = now(), paydunya_token = coalesce(p_token, paydunya_token)
   where id = p_order_id;

  insert into public.audit_log (actor, action)
  values (case when p_token is null then 'Super Admin' else 'PayDunya' end,
          'Groupe « ' || v_org.name || ' » : ' || v_order.kind || ' de ' || v_order.amount || ' FCFA confirmé(e)');
end;
$$;
revoke all on function public._apply_group_order(uuid, text) from public, anon, authenticated;
grant execute on function public._apply_group_order(uuid, text) to service_role;

-- Point d'entrée des Edge Functions (service_role).
create or replace function public.apply_group_order(p_order_id uuid, p_token text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._apply_group_order(p_order_id, p_token);
end;
$$;
revoke all on function public.apply_group_order(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_group_order(uuid, text) to service_role;

-- Confirmation / rejet manuels (Super Admin).
create or replace function public.confirm_group_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  perform public._apply_group_order(p_order_id, null);
end;
$$;
revoke all on function public.confirm_group_order(uuid) from public, anon;
grant execute on function public.confirm_group_order(uuid) to authenticated;

create or replace function public.reject_group_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  update public.organization_orders set status = 'REJECTED' where id = p_order_id and status = 'PENDING';
  if not found then raise exception 'Commande introuvable ou déjà traitée.'; end if;
end;
$$;
revoke all on function public.reject_group_order(uuid) from public, anon;
grant execute on function public.reject_group_order(uuid) to authenticated;

-- Impayé / à jour au niveau du groupe (Super Admin) : répercuté sur toutes
-- ses stations actives, donc sur la porte d'abonnement existante.
create or replace function public.superadmin_set_group_status(p_org_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  if p_status not in ('a_jour', 'en_retard') then raise exception 'Statut invalide.'; end if;
  update public.organizations set status = p_status where id = p_org_id returning * into v_org;
  if v_org.id is null then raise exception 'Groupe introuvable.'; end if;
  update public.station_billing
     set subscription_status = p_status
   where station_id in (select id from public.stations where organization_id = p_org_id and group_archived_at is null);
  insert into public.audit_log (actor, action)
  values ('Super Admin', 'Groupe « ' || v_org.name || ' » marqué ' || case when p_status = 'en_retard' then 'impayé' else 'à jour' end);
end;
$$;
revoke all on function public.superadmin_set_group_status(uuid, text) from public, anon;
grant execute on function public.superadmin_set_group_status(uuid, text) to authenticated;

-- ─── 13. Ouvrir / fermer une station (le patron « entre » dans la station) ─
create or replace function public.open_group_station(p_station_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.group_owns_station(p_station_id) then
    raise exception 'Cette station ne fait pas partie de votre groupe.' using errcode = '42501';
  end if;
  if exists (select 1 from public.stations where id = p_station_id and group_archived_at is not null) then
    raise exception 'Cette station est archivée : réactivez-la d''abord depuis une commande.';
  end if;
  update public.profiles set station_id = p_station_id where id = auth.uid() and is_group_owner;
  return p_station_id;
end;
$$;
revoke all on function public.open_group_station(uuid) from public, anon;
grant execute on function public.open_group_station(uuid) to authenticated;

create or replace function public.close_group_station()
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set station_id = null where id = auth.uid() and is_group_owner;
end;
$$;
revoke all on function public.close_group_station() from public, anon;
grant execute on function public.close_group_station() to authenticated;

-- ─── 14. Rattachement d'une station existante (avec accord) ───────────
create or replace function public.request_group_join(p_station_id uuid, p_plan text)
returns public.group_join_requests
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_st public.stations;
  v_row public.group_join_requests;
begin
  select * into v_org from public.organizations where owner_id = auth.uid();
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where key = p_plan) then raise exception 'Offre inconnue.'; end if;

  select * into v_st from public.stations where id = p_station_id;
  if v_st.id is null or v_st.status <> 'active' then raise exception 'Station introuvable.'; end if;
  if v_st.organization_id is not null then raise exception 'Cette station fait déjà partie d''un groupe.'; end if;
  if not exists (select 1 from public.profiles where station_id = p_station_id and role = 'admin' and not is_group_owner) then
    raise exception 'Cette station n''a pas de propriétaire pouvant donner son accord.';
  end if;
  if exists (select 1 from public.station_transfer_requests where station_id = p_station_id and status in ('pending', 'ceded')) then
    raise exception 'Une cession est en cours pour cette station.';
  end if;
  if (select count(*) from public.group_join_requests where organization_id = v_org.id and status = 'pending') >= 50 then
    raise exception 'Trop de demandes en attente.';
  end if;
  if exists (select 1 from public.group_join_requests where station_id = p_station_id and status in ('pending', 'accepted')) then
    raise exception 'Une demande de rattachement est déjà en cours pour cette station.';
  end if;

  insert into public.group_join_requests (organization_id, station_id, plan)
  values (v_org.id, p_station_id, p_plan) returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.request_group_join(uuid, text) from public, anon;
grant execute on function public.request_group_join(uuid, text) to authenticated;

create or replace function public.respond_group_join(p_request_id uuid, p_accept boolean)
returns public.group_join_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req public.group_join_requests;
begin
  select * into v_req from public.group_join_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then raise exception 'Cette demande n''est plus en attente.'; end if;
  -- Seul le propriétaire de la station (pas un collaborateur, pas un patron) répond.
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_group_owner and station_id = v_req.station_id
  ) then
    raise exception 'Seul le propriétaire de la station peut répondre.' using errcode = '42501';
  end if;
  update public.group_join_requests
     set status = case when p_accept then 'accepted' else 'refused' end, decided_at = now()
   where id = p_request_id returning * into v_req;
  return v_req;
end;
$$;
revoke all on function public.respond_group_join(uuid, boolean) from public, anon;
grant execute on function public.respond_group_join(uuid, boolean) to authenticated;

create or replace function public.cancel_group_join(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.group_join_requests set status = 'cancelled', decided_at = now()
   where id = p_request_id and organization_id = public.my_organization_id() and status in ('pending', 'accepted');
  if not found then raise exception 'Demande introuvable.'; end if;
end;
$$;
revoke all on function public.cancel_group_join(uuid) from public, anon;
grant execute on function public.cancel_group_join(uuid) to authenticated;

-- ─── 15. Sortir une station du groupe ─────────────────────────────────
-- Station rattachée : elle redevient indépendante (son abonnement et son
-- échéance actuels sont conservés : elle est couverte jusque-là, puis repasse
-- sur son propre renouvellement). Le propriétaire ne peut pas la « supprimer »
-- : elle ne lui appartient pas.
create or replace function public._detach_station(p_station_id uuid, p_actor text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_st public.stations;
begin
  select * into v_st from public.stations where id = p_station_id for update;
  update public.stations set organization_id = null, group_origin = null, group_archived_at = null where id = p_station_id;
  -- Le patron n'a plus rien à faire dans cette station.
  update public.profiles set station_id = null where station_id = p_station_id and is_group_owner;
  insert into public.audit_log (actor, action)
  values (p_actor, 'Station « ' || v_st.name || ' » sortie de son groupe');
end;
$$;
revoke all on function public._detach_station(uuid, text) from public, anon, authenticated;

-- Le propriétaire d'une station rattachée quitte le groupe.
create or replace function public.leave_group()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_st public.stations;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.role <> 'admin' or v_profile.is_group_owner or v_profile.station_id is null then
    raise exception 'Réservé au propriétaire de la station.' using errcode = '42501';
  end if;
  select * into v_st from public.stations where id = v_profile.station_id;
  if v_st.organization_id is null or v_st.group_origin <> 'joined' then
    raise exception 'Cette station ne fait pas partie d''un groupe en tant que station rattachée.';
  end if;
  perform public._detach_station(v_st.id, coalesce(v_profile.full_name, 'Propriétaire'));
end;
$$;
revoke all on function public.leave_group() from public, anon;
grant execute on function public.leave_group() to authenticated;

-- Le patron retire une station : 'release' (rattachée → indépendante),
-- 'archive' (créée par lui → masquée, plus facturée, données conservées),
-- 'delete' (créée par lui → définitif ; le nom doit être retapé).
create or replace function public.group_remove_station(p_station_id uuid, p_mode text, p_confirm_name text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org public.organizations;
  v_st public.stations;
begin
  select * into v_org from public.organizations where owner_id = auth.uid();
  if v_org.id is null then raise exception 'Réservé au chef d''entreprise.' using errcode = '42501'; end if;
  select * into v_st from public.stations where id = p_station_id and organization_id = v_org.id for update;
  if v_st.id is null then raise exception 'Cette station ne fait pas partie de votre groupe.'; end if;

  if p_mode = 'release' then
    if v_st.group_origin <> 'joined' then raise exception 'Seule une station rattachée peut être libérée : archivez ou supprimez une station que vous avez créée.'; end if;
    perform public._detach_station(p_station_id, 'Patron');

  elsif p_mode = 'archive' then
    if v_st.group_origin <> 'created' then raise exception 'Une station rattachée ne s''archive pas : libérez-la.'; end if;
    update public.stations set status = 'suspendue', group_archived_at = now() where id = p_station_id;
    update public.profiles set station_id = null where station_id = p_station_id and is_group_owner;
    insert into public.audit_log (actor, action) values ('Patron', 'Station « ' || v_st.name || ' » archivée par son groupe');

  elsif p_mode = 'delete' then
    if v_st.group_origin <> 'created' then raise exception 'Une station rattachée ne peut pas être supprimée : elle ne vous appartient pas. Libérez-la.'; end if;
    if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_st.name)) then
      raise exception 'Le nom de confirmation ne correspond pas.';
    end if;
    update public.profiles set station_id = null where station_id = p_station_id and is_group_owner;
    -- Les comptes d'équipe n'ont plus de station : ils redeviennent de simples comptes.
    update public.profiles set role = 'automobiliste', station_id = null where station_id = p_station_id and role = 'staff';
    delete from public.stations where id = p_station_id;
    insert into public.audit_log (actor, action) values ('Patron', 'Station « ' || v_st.name || ' » supprimée définitivement par son groupe');

  else
    raise exception 'Action inconnue.';
  end if;
end;
$$;
revoke all on function public.group_remove_station(uuid, text, text) from public, anon;
grant execute on function public.group_remove_station(uuid, text, text) to authenticated;

-- ─── 16. Retirer le Super Admin d'une station (patron) ────────────────
create or replace function public.group_remove_station_admin(p_station_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_member record;
begin
  if not public.group_owns_station(p_station_id) then
    raise exception 'Cette station ne fait pas partie de votre groupe.' using errcode = '42501';
  end if;
  select m.id, m.profile_id, m.employee_id into v_member
  from public.station_members m join public.station_roles r on r.id = m.role_id
  where m.station_id = p_station_id and r.key = 'super_admin_station' and m.status in ('invited', 'active', 'suspended')
  limit 1;
  if v_member.id is null then raise exception 'Cette station n''a pas de Super Admin.'; end if;

  delete from public.station_members where id = v_member.id;
  if v_member.employee_id is not null then delete from public.employees where id = v_member.employee_id; end if;
  -- Son compte perd tout lien avec la station (sinon il garderait l'accès
  -- aux données malgré la suppression de son rôle).
  if v_member.profile_id is not null then
    update public.profiles set role = 'automobiliste', station_id = null
     where id = v_member.profile_id and role = 'staff' and station_id = p_station_id;
  end if;
  insert into public.audit_log (actor, action) values ('Patron', 'Super Admin de station retiré');
end;
$$;
revoke all on function public.group_remove_station_admin(uuid) from public, anon;
grant execute on function public.group_remove_station_admin(uuid) to authenticated;

-- ─── 17. Cession de station : compatibilité avec les groupes ──────────
-- (redéfinitions de add_station_transfer.sql) Le patron « ouvert » sur une
-- station n'est PAS son propriétaire : on l'exclut partout où l'on cherche
-- LE propriétaire, et une station de groupe ne peut pas être cédée.
create or replace function public.create_station_transfer(
  p_station_id uuid, p_acquirer_name text, p_acquirer_email text, p_note text default ''
)
returns public.station_transfer_requests
language plpgsql security definer set search_path = public as $$
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
  if v_station.organization_id is not null then
    raise exception 'Cette station fait partie d''un groupe Sur mesure : retirez-la du groupe avant de la céder.';
  end if;

  select * into v_seller from public.profiles
    where station_id = p_station_id and role = 'admin' and not is_group_owner;
  if v_seller.id is null then
    raise exception 'Cette station n''a pas de propriétaire actif : rien à céder.';
  end if;

  if lower(coalesce(v_seller.email, '')) = v_email then
    raise exception 'L''acquéreur ne peut pas être le propriétaire actuel.';
  end if;

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

create or replace function public.cancel_station_transfer(p_request_id uuid)
returns public.station_transfer_requests
language plpgsql security definer set search_path = public as $$
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
    if exists (select 1 from public.profiles where station_id = v_req.station_id and role = 'admin' and not is_group_owner) then
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

create or replace function public.complete_station_transfer(
  p_request_id uuid, p_acquirer_id uuid, p_full_name text, p_email text, p_phone text default ''
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.station_transfer_requests;
begin
  select * into v_req from public.station_transfer_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'ceded' then
    raise exception 'Cette cession n''est plus disponible.';
  end if;
  if exists (select 1 from public.profiles where station_id = v_req.station_id and role = 'admin' and not is_group_owner) then
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

-- Un patron « ouvert » sur une station ne voit pas ses demandes de cession.
drop policy if exists station_transfer_owner_select on public.station_transfer_requests;
create policy station_transfer_owner_select on public.station_transfer_requests
  for select using (
    public.app_role() = 'admin'
    and not public.is_group_owner()
    and station_id = public.current_station_id()
  );
