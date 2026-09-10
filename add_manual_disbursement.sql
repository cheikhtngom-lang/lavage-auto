-- ══════════════════════════════════════════════════════════════════════
-- Reversement manuel des lavages payés en ligne — complète PayDunya PER
-- (add_paydunya_per.sql). Jusqu'ici, une station SANS compte PayDunya
-- renseigné ne pouvait tout simplement pas accepter de paiement en ligne,
-- et une redistribution PER qui échoue (ex: PER pas encore activé sur le
-- compte marchand plateforme) plantait toute la finalisation. Les deux
-- cas sont désormais traités comme un même état : la réservation et le
-- reçu du client restent acquis, l'argent reste sur le compte PayDunya de
-- la PLATEFORME, et le Super Admin reverse manuellement la station
-- (Wave/Orange Money/banque, hors application) — traçable via
-- paiements_lavage, qui indique déjà exactement combien chaque station a
-- droit à recevoir (part_station).
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Nouveau statut "manuel" ────────────────────────────────────────
-- 'echec' reste dans la liste pour compatibilité mais n'est plus écrit par
-- le code applicatif : un échec de redistribution automatique (alias
-- absent, PER indisponible, erreur PayDunya...) est désormais toujours
-- rangé en 'manuel' — c'est la même action qui en découle côté Super
-- Admin (reverser à la main), peu importe la raison technique de l'échec.
alter table public.paiements_lavage drop constraint if exists paiements_lavage_statut_redistribution_check;
alter table public.paiements_lavage add constraint paiements_lavage_statut_redistribution_check
  check (statut_redistribution in ('en_attente', 'reussi', 'echec', 'manuel'));

-- ─── 2. RPC Super Admin : marquer des reversements comme réglés à la main
-- Aucune policy UPDATE n'existe sur paiements_lavage (lecture seule côté
-- client, seules les Edge Functions écrivent via service_role) — ce RPC
-- SECURITY DEFINER est le seul moyen, réservé à app_role() = 'super_admin',
-- de faire passer des lignes en 'reussi' une fois le virement fait hors
-- application.
create or replace function public.mark_lavage_payments_settled(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_role() <> 'super_admin' then
    raise exception 'Réservé au Super Admin';
  end if;
  update public.paiements_lavage
     set statut_redistribution = 'reussi',
         redistribution_detail = 'Reversé manuellement par le Super Admin le ' || to_char(now(), 'DD/MM/YYYY à HH24:MI')
   where id = any(p_ids)
     and statut_redistribution <> 'reussi';
end;
$$;
grant execute on function public.mark_lavage_payments_settled(uuid[]) to authenticated;
