-- ══════════════════════════════════════════════════════════════════════
-- Essai gratuit d'un mois pour les stations — à exécuter une fois dans
-- l'éditeur SQL Supabase. Idempotent (peut être rejoué sans risque).
--
-- Ajoute `trial_ends_at` à station_billing pour dater la fin de l'essai
-- gratuit (1 mois à partir de la création de la station), affiché comme
-- barre de progression côté station (AdminLayout.jsx) et côté Super Admin
-- (Billing.jsx). Ne déclenche AUCUNE action automatique à l'expiration —
-- le passage à "en_retard"/"a_jour" reste une décision manuelle du Super
-- Admin, comme markSubscriptionPaid/markSubscriptionOverdue déjà en place
-- (voir useSuperAdminState.jsx).
-- ══════════════════════════════════════════════════════════════════════

alter table public.station_billing
  add column if not exists trial_ends_at timestamptz;

-- Rétro-remplit les stations déjà en essai, à partir de leur date de
-- création réelle (pas "maintenant", pour ne pas leur offrir un mois
-- gratuit supplémentaire au moment d'exécuter cette migration).
update public.station_billing sb
set trial_ends_at = s.created_at + interval '1 month'
from public.stations s
where sb.station_id = s.id and sb.trial_ends_at is null;

-- Toute nouvelle station démarre désormais avec un essai d'un mois daté.
create or replace function public.handle_new_station()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.station_billing (station_id, trial_ends_at) values (new.id, now() + interval '1 month');
  return new;
end;
$$;
