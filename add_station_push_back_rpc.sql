-- ══════════════════════════════════════════════════════════════════════
-- Recul d'un rang côté STATION (bouton "2nd rang", StationDashboard.jsx) —
-- rendu atomique. Jusqu'ici pushBackOnePosition (useAppState.jsx) faisait
-- deux `update` Supabase séparés depuis le navigateur pour échanger les
-- `created_at` de la réservation en tête de file et de la suivante ; une
-- coupure réseau entre les deux pouvait laisser l'ordre de la file
-- incohérent (pas de perte de données, juste un ordre à corriger à la
-- main). Cette fonction fait l'échange dans une seule transaction Postgres
-- — même principe que client_push_back_reservation (add_client_push_back.sql),
-- adapté au cas station : toujours exactement un rang, pas de vérification
-- d'abonnement (la station gère sa propre file).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.station_push_back_one_position(p_reservation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_station_id uuid;
  v_created_at timestamptz;
  v_target_id uuid;
  v_target_created_at timestamptz;
begin
  select station_id, created_at into v_station_id, v_created_at
  from public.reservations where id = p_reservation_id and status = 'attente';

  if v_station_id is null then
    raise exception 'Réservation introuvable ou déjà en cours de lavage';
  end if;
  if v_station_id is distinct from public.current_station_id() and public.app_role() <> 'super_admin' then
    raise exception 'Non autorisé';
  end if;

  -- La réservation immédiatement suivante dans la file de CETTE station —
  -- rien à faire si l'appelant est déjà dernier (ou seul dans la file).
  select id, created_at into v_target_id, v_target_created_at
  from public.reservations
  where station_id = v_station_id and status = 'attente' and created_at > v_created_at and id != p_reservation_id
  order by created_at asc limit 1;

  if v_target_id is null then
    return;
  end if;

  update public.reservations set created_at = v_target_created_at where id = p_reservation_id;
  update public.reservations set created_at = v_created_at where id = v_target_id;
end;
$$;

grant execute on function public.station_push_back_one_position(uuid) to authenticated;
