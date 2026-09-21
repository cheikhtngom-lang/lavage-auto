-- ════════════════════════════════════════════════════════════════════════
--  Sur mesure : déplacer le Super Admin d'une station vers une autre
--
--  À exécuter une fois dans Supabase > SQL Editor (APRÈS
--  add_sur_mesure_groups.sql, dont il complète group_remove_station_admin).
--  Idempotent.
--
--  Le patron d'un groupe peut reprendre le Super Admin de la station A pour
--  l'affecter à la station B, sans le réinviter ni lui recréer de compte :
--  c'est le MÊME compte (même email, même mot de passe) qui change de station.
--
--  Règles :
--   • les deux stations sont au patron et non archivées ;
--   • un seul Super Admin par station : B ne doit pas déjà en avoir un
--     (le patron retire l'actuel d'abord — rien n'est supprimé en silence) ;
--   • le compte doit être actif ou suspendu : une invitation pas encore
--     acceptée n'a pas de compte à déplacer ;
--   • le plafond de comptes du forfait de B s'applique (comme à l'invitation).
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.group_move_station_admin(p_from_station_id uuid, p_to_station_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from record;
  v_to record;
  v_member record;
  v_role_id uuid;
  v_used integer;
  v_limit integer;
begin
  if p_from_station_id is null or p_to_station_id is null or p_from_station_id = p_to_station_id then
    raise exception 'Choisissez deux stations différentes.';
  end if;
  if not public.group_owns_station(p_from_station_id) or not public.group_owns_station(p_to_station_id) then
    raise exception 'Ces deux stations doivent faire partie de votre groupe.' using errcode = '42501';
  end if;

  -- Verrou dans l'ordre des id : deux déplacements simultanés ne peuvent ni
  -- s'entrecroiser ni se bloquer mutuellement.
  perform 1 from public.stations where id in (p_from_station_id, p_to_station_id) order by id for update;
  select name, group_archived_at into v_from from public.stations where id = p_from_station_id;
  select name, group_archived_at into v_to from public.stations where id = p_to_station_id;
  if v_from.group_archived_at is not null or v_to.group_archived_at is not null then
    raise exception 'Une station archivée ne peut pas recevoir ni perdre son Super Admin.';
  end if;

  -- Le Super Admin de la station de départ.
  select m.id, m.profile_id, m.email, m.status, m.employee_id into v_member
  from public.station_members m join public.station_roles r on r.id = m.role_id
  where m.station_id = p_from_station_id and r.key = 'super_admin_station'
    and m.status in ('invited', 'active', 'suspended')
  limit 1
  for update of m;
  if v_member.id is null then
    raise exception 'La station « % » n''a pas de Super Admin à déplacer.', v_from.name;
  end if;
  if v_member.profile_id is null or v_member.status = 'invited' then
    raise exception 'Ce Super Admin n''a pas encore activé son compte : une invitation en attente ne peut pas être déplacée. Retirez-le, puis nommez-le sur l''autre station.';
  end if;

  -- Un seul Super Admin par station : on ne remplace jamais quelqu'un en silence.
  if exists (
    select 1 from public.station_members m join public.station_roles r on r.id = m.role_id
    where m.station_id = p_to_station_id and r.key = 'super_admin_station'
      and m.status in ('invited', 'active', 'suspended')
  ) then
    raise exception 'La station « % » a déjà un Super Admin (un seul par station). Retirez-le d''abord.', v_to.name;
  end if;

  -- Plafond de comptes du forfait de la station d'arrivée (propriétaire +1),
  -- même règle que enforce_team_seat_limit — qui, elle, ne se déclenche pas
  -- sur un changement de station.
  if v_member.status = 'active' then
    select count(*) into v_used from public.station_members
     where station_id = p_to_station_id and status in ('invited', 'active');
    v_limit := public.station_team_seat_limit(p_to_station_id);
    if v_used + 1 >= v_limit then
      raise exception 'Limite de comptes atteinte pour « % » (% supports max, propriétaire compris).', v_to.name, v_limit;
    end if;
  end if;

  -- La personne a pu laisser une ancienne ligne sur B (invitation expirée,
  -- compte suspendu…) : unique (station_id, email) l'empêcherait d'arriver.
  if exists (
    select 1 from public.station_members
     where station_id = p_to_station_id and lower(email) = lower(v_member.email) and status = 'active'
  ) then
    raise exception 'Cette personne est déjà membre actif de « % ».', v_to.name;
  end if;
  delete from public.station_members
   where station_id = p_to_station_id and lower(email) = lower(v_member.email);

  select id into v_role_id from public.station_roles
   where station_id = p_to_station_id and key = 'super_admin_station';
  if v_role_id is null then
    perform public.seed_builtin_station_roles(p_to_station_id);
    select id into v_role_id from public.station_roles
     where station_id = p_to_station_id and key = 'super_admin_station';
  end if;

  update public.station_members
     set station_id = p_to_station_id, role_id = v_role_id, employee_id = null
   where id = v_member.id;
  -- Une éventuelle fiche laveur/pointage de la station de départ n'a plus lieu d'être.
  if v_member.employee_id is not null then
    delete from public.employees where id = v_member.employee_id;
  end if;

  -- Le compte change de station : c'est ce qui commande l'accès aux données
  -- (current_station_id()). S'il est incohérent, on annule tout plutôt que de
  -- laisser un Super Admin dont la ligne d'équipe et le compte divergent.
  update public.profiles set station_id = p_to_station_id
   where id = v_member.profile_id and role = 'staff' and station_id = p_from_station_id;
  if not found then
    raise exception 'Le compte de ce Super Admin n''est pas rattaché à « % » : déplacement annulé.', v_from.name;
  end if;

  insert into public.audit_log (actor, action)
  values ('Patron', 'Super Admin de station déplacé de « ' || v_from.name || ' » vers « ' || v_to.name || ' »');
end;
$$;

revoke all on function public.group_move_station_admin(uuid, uuid) from public, anon;
grant execute on function public.group_move_station_admin(uuid, uuid) to authenticated;
