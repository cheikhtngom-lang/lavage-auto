-- ═══════════════════════════════════════════════════════════════════════
-- Retour de l'essai gratuit de 7 jours (18/10/2026, demande de l'utilisateur).
-- Remplace remove_station_trial.sql pour handle_new_station() et
-- set_pending_station_plan(). Idempotent.
--
--   - handle_new_station() : une NOUVELLE station démarre en 'essai' pour
--     7 jours (trial_ends_at), avec accès immédiat à son espace et visibilité
--     publique. trial_started_at reste vide : il ne marque que les accès
--     OFFERTS par le Super Admin (add_affiliates_tracking.sql). Même corps que
--     la version en production (semis des rôles catalogue) : seul le statut
--     de départ change ;
--   - set_pending_station_plan(p_plan) : l'offre choisie à l'inscription est
--     aussi enregistrée pendant l'essai d'inscription en cours (avant : seulement
--     en 'a_payer', l'offre choisie était perdue pendant l'essai). Pas pendant
--     un accès offert ni après la fin de l'essai : l'offre se choisit alors à
--     l'écran de paiement (/admin/renouveler).
--
-- À la fin de l'essai, rien ne change : station_subscription_ok() ferme la
-- station au public et l'espace station affiche l'écran de paiement
-- (isSubscriptionEnded, lib/stationRenewal.js). Le statut 'a_payer' reste
-- valide (contrainte inchangée) mais n'est plus posé à la création.
-- Les stations existantes ne sont pas modifiées.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_station()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.station_billing (station_id, subscription_status, trial_ends_at)
    values (new.id, 'essai', now() + interval '7 days');
  perform public.seed_builtin_station_roles(new.id);
  return new;
end;
$$;
-- (le trigger on_station_created existe déjà et pointe sur cette fonction)

create or replace function public.set_pending_station_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_sid uuid := public.current_station_id();
begin
  if v_sid is null then raise exception 'Aucune station rattachée à ce compte.'; end if;
  if not exists (select 1 from public.plans where key = p_plan) then raise exception 'Offre inconnue.'; end if;
  update public.station_billing set plan = p_plan
   where station_id = v_sid
     and (subscription_status = 'a_payer'
          or (subscription_status = 'essai' and trial_started_at is null and trial_ends_at > now()));
end;
$$;

revoke all on function public.set_pending_station_plan(text) from public, anon;
grant execute on function public.set_pending_station_plan(text) to authenticated;
