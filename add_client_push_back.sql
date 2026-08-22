-- ══════════════════════════════════════════════════════════════════════
-- Report de position en file d'attente, en libre-service pour les clients
-- abonnés d'une station (station_client_subscriptions, status='actif') — à
-- exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- Un client ne peut modifier QUE ses propres réservations (RLS reservations
-- classique), donc impossible de faire l'échange de created_at nécessaire
-- (voir pushBackOnePosition, useAppState.jsx, même principe côté station)
-- directement depuis le client : il faudrait écrire la ligne d'un AUTRE
-- client. Cette fonction security definer fait l'échange de façon contrôlée
-- — elle ne peut JAMAIS faire avancer l'appelant (elle ne regarde que les
-- réservations créées APRÈS la sienne), seulement la reculer.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.client_push_back_reservation(p_reservation_id uuid, p_positions integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_station_id uuid;
  v_created_at timestamptz;
  v_client_id uuid;
  v_target_id uuid;
  v_target_created_at timestamptz;
begin
  select station_id, created_at, client_id into v_station_id, v_created_at, v_client_id
  from public.reservations where id = p_reservation_id and status = 'attente';

  if v_station_id is null then
    raise exception 'Réservation introuvable ou déjà en cours de lavage';
  end if;
  if v_client_id is distinct from auth.uid() then
    raise exception 'Non autorisé';
  end if;

  -- Réservé aux clients ayant un abonnement actif dans CETTE station (même
  -- correspondance client_id/téléphone que useClientAccount.jsx loadActivity).
  if not exists (
    select 1 from public.station_client_subscriptions scs
    left join public.profiles p on p.id = auth.uid()
    where scs.station_id = v_station_id and scs.status = 'actif'
      and (scs.client_id = auth.uid() or scs.client_phone = p.phone)
  ) then
    raise exception 'Réservé aux clients abonnés de cette station';
  end if;

  -- La réservation p_positions rangs plus loin dans la file (strictement
  -- après la sienne) ; si la file est plus courte que ça, se cale sur la
  -- toute dernière place au lieu de ne rien faire.
  select id, created_at into v_target_id, v_target_created_at
  from public.reservations
  where station_id = v_station_id and status = 'attente' and created_at > v_created_at and id != p_reservation_id
  order by created_at asc
  offset greatest(p_positions - 1, 0) limit 1;

  if v_target_id is null then
    select id, created_at into v_target_id, v_target_created_at
    from public.reservations
    where station_id = v_station_id and status = 'attente' and created_at > v_created_at and id != p_reservation_id
    order by created_at desc limit 1;
  end if;

  if v_target_id is null then
    return; -- déjà dernier (ou seul dans la file) : rien à faire
  end if;

  update public.reservations set created_at = v_target_created_at where id = p_reservation_id;
  update public.reservations set created_at = v_created_at where id = v_target_id;
end;
$$;

grant execute on function public.client_push_back_reservation(uuid, integer) to authenticated;
