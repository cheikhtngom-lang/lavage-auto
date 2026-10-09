-- ═══════════════════════════════════════════════════════════════════════
-- Fin de l'essai gratuit : une NOUVELLE station choisit une offre et paie
-- avant d'accéder à son espace.
--
--   - nouveau statut station_billing.subscription_status = 'a_payer'
--     (« En attente de paiement ») : posé par handle_new_station() à la
--     création, sans date d'essai ;
--   - station_subscription_ok() : une station 'a_payer' est fermée au public
--     (annuaire, réservations), comme une station impayée ;
--   - set_pending_station_plan(p_plan) : enregistre l'offre choisie à
--     l'inscription (avant : un UPDATE direct de station_billing, refusé en
--     silence par le RLS — l'offre choisie n'était jamais gardée). Possible
--     uniquement tant que la station est 'a_payer'.
--
-- Le paiement (create-platform-payment + finalizePayment, kind 'saas')
-- applique l'offre payée et passe la station 'a_jour' ; le prix est imposé
-- côté serveur depuis la table plans.
-- Les stations déjà en essai le gardent jusqu'à sa date de fin (rien ne
-- touche leurs lignes ici). Remplace change_trial_to_7_days.sql pour
-- handle_new_station(). Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.station_billing drop constraint if exists station_billing_subscription_status_check;
alter table public.station_billing add constraint station_billing_subscription_status_check
  check (subscription_status = any (array['essai', 'a_jour', 'en_retard', 'illimite', 'a_payer']));

create or replace function public.handle_new_station()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.station_billing (station_id, subscription_status, trial_ends_at)
    values (new.id, 'a_payer', null);
  perform public.seed_builtin_station_roles(new.id);
  return new;
end;
$$;
-- (le trigger on_station_created existe déjà et pointe sur cette fonction)

create or replace function public.station_subscription_ok(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not public.station_is_closing(sid) and coalesce(
    (select sb.subscription_status not in ('en_retard', 'a_payer')
       and not (sb.subscription_status = 'essai' and sb.trial_ends_at is not null and sb.trial_ends_at < now())
     from public.station_billing sb
     where sb.station_id = sid),
    true
  );
$$;

create or replace function public.set_pending_station_plan(p_plan text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_sid uuid := public.current_station_id();
begin
  if v_sid is null then raise exception 'Aucune station rattachée à ce compte.'; end if;
  if not exists (select 1 from public.plans where key = p_plan) then raise exception 'Offre inconnue.'; end if;
  update public.station_billing set plan = p_plan
   where station_id = v_sid and subscription_status = 'a_payer';
end;
$$;

revoke all on function public.set_pending_station_plan(text) from public, anon;
grant execute on function public.set_pending_station_plan(text) to authenticated;
