-- ══════════════════════════════════════════════════════════════════════
-- Ajuste les restrictions de forfait pour trois fonctionnalités :
--   • Vidange   : réservée au forfait Business (ou module mod_vidange) —
--                 jusqu'ici ouverte à toutes les stations sans distinction.
--   • Boutique  : élargie aux forfaits Pro ET Business (jusqu'ici Business
--                 uniquement), ou module mod_boutique.
--   • Équipe    : plafond de comptes ("supports") selon le forfait —
--                 Starter 3, Pro 5, Business 10+ (propriétaire compris).
--
-- Chaque contrôle existe à deux niveaux, comme le reste de la plateforme :
-- l'UI (masque les boutons/onglets — voir lib/shop.js, lib/vidange.js,
-- lib/planLimits.js) ET Postgres (RLS / trigger — ici), qui reste la seule
-- protection réelle si quelqu'un contourne l'UI.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Boutique : Pro ET Business (au lieu de Business seul) ──────────
create or replace function public.station_has_shop(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.station_billing sb
    where sb.station_id = sid
      and (sb.plan in ('Pro', 'Business') or 'mod_boutique' = any(sb.active_modules))
  );
$$;

-- ─── 2. Vidange : Business uniquement (ou module mod_vidange) ──────────
create or replace function public.station_has_vidange(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.station_billing sb
    where sb.station_id = sid
      and (sb.plan = 'Business' or 'mod_vidange' = any(sb.active_modules))
  );
$$;
grant execute on function public.station_has_vidange(uuid) to anon, authenticated;

-- vidange_pricing : écriture désormais conditionnée à station_has_vidange
-- (comme shop_products_insert pour la boutique) — la lecture reste publique.
drop policy if exists "vidange_pricing_write" on public.vidange_pricing;
create policy "vidange_pricing_write" on public.vidange_pricing for insert
  with check (
    (station_id = current_station_id() and public.station_has_vidange(station_id))
    or app_role() = 'super_admin'
  );
drop policy if exists "vidange_pricing_update" on public.vidange_pricing;
create policy "vidange_pricing_update" on public.vidange_pricing for update
  using (
    (station_id = current_station_id() and public.station_has_vidange(station_id))
    or app_role() = 'super_admin'
  );

-- La colonne stations.vidange_enabled n'a pas sa propre policy (RLS est au
-- niveau ligne, pas colonne) : un trigger empêche de la passer à true si la
-- station n'a pas droit à la vidange — la seule vraie barrière si quelqu'un
-- contourne Paramètres > Vidange en appelant l'API directement.
create or replace function public.enforce_vidange_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vidange_enabled and not public.station_has_vidange(new.id) then
    raise exception 'La vidange est réservée au forfait Business (ou au module vidange).';
  end if;
  return new;
end;
$$;
drop trigger if exists stations_enforce_vidange_plan on public.stations;
create trigger stations_enforce_vidange_plan
  before update of vidange_enabled on public.stations
  for each row execute function public.enforce_vidange_plan();

-- ─── 3. Équipe : plafond de comptes par forfait ────────────────────────
-- Même valeurs que src/lib/planLimits.js (TEAM_SEAT_LIMITS) et
-- supabase/functions/invite-station-member/index.ts — à maintenir en synchro
-- si les paliers changent. Le propriétaire compte pour 1 (jamais une ligne
-- station_members), d'où le "- 1" : Starter (3) autorise donc jusqu'à 2
-- collaborateurs (invités ou actifs — un compte suspendu libère son siège).
create or replace function public.station_team_seat_limit(sid uuid)
returns integer
language sql security definer stable
set search_path = public
as $$
  select case coalesce((select plan from public.station_billing where station_id = sid), 'Starter')
    when 'Business' then 9999
    when 'Pro' then 5
    else 3
  end;
$$;

create or replace function public.enforce_team_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_limit integer;
begin
  if new.status not in ('invited', 'active') then
    return new;
  end if;
  select count(*) into v_used
    from public.station_members
   where station_id = new.station_id
     and status in ('invited', 'active')
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_limit := public.station_team_seat_limit(new.station_id);
  -- +1 pour le propriétaire, jamais représenté par une ligne station_members.
  if v_used + 1 >= v_limit then
    raise exception 'Limite de comptes atteinte pour ce forfait (% supports max).', v_limit;
  end if;
  return new;
end;
$$;
drop trigger if exists station_members_enforce_seat_limit on public.station_members;
create trigger station_members_enforce_seat_limit
  before insert on public.station_members
  for each row execute function public.enforce_team_seat_limit();
-- Réactiver un membre suspendu reprend aussi un siège : même contrôle sur update.
drop trigger if exists station_members_enforce_seat_limit_upd on public.station_members;
create trigger station_members_enforce_seat_limit_upd
  before update of status on public.station_members
  for each row when (new.status in ('invited', 'active') and old.status not in ('invited', 'active'))
  execute function public.enforce_team_seat_limit();
