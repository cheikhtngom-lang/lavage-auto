-- Repositionnement des offres (23 septembre 2026).
--
--   • Starter et Pro : tout ce qui concerne la station de LAVAGE (file
--     d'attente, équipe, comptabilité…) — le cœur historique de l'application.
--   • L'offre « Business » devient l'offre « Station de service » : tout Pro,
--     plus les rubriques d'une station-service — Pompistes (carburant),
--     Boutique, Vidange et Bilan.
--
-- La CLÉ interne reste 'Business' (station_billing.plan, commandes de groupe,
-- modules, fonctions SQL existantes) : seul le libellé change. Le Bilan reste
-- réservé à cette offre (ou au module mod_bilan), comme avant.
--
-- Rejouable sans risque.

-- ─── 1. Libellé de l'offre (affiché partout via la table plans) ────────
update public.plans set label = 'Station de service' where key = 'Business';

-- ─── 2. Boutique : Station de service seulement (ou module mod_boutique) ─
-- Jusqu'ici Pro ET Business (add_plan_gating.sql). Aucune station Pro n'avait
-- de produit en ligne au moment du changement.
create or replace function public.station_has_shop(sid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.station_billing sb
    where sb.station_id = sid
      and (sb.plan = 'Business' or 'mod_boutique' = any(sb.active_modules))
  );
$$;

-- ─── 3. Vidange : déjà réservée à cette offre, message renommé ─────────
create or replace function public.enforce_vidange_plan()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vidange_enabled and not public.station_has_vidange(new.id) then
    raise exception 'La vidange est réservée à l''offre Station de service (ou au module vidange).';
  end if;
  return new;
end;
$$;

-- ─── 4. Stations Pro qui utilisaient déjà Pompistes → Station de service ─
-- (décision de l'exploitant). Pompistes n'est plus inclus dans Pro ; une station
-- qui a déjà déclaré des pompes ou des pompistes passe à l'offre qui les inclut.
-- Pour une station d'un groupe Sur mesure, le prochain renouvellement du groupe
-- relit le forfait de chaque station (create_group_renewal) : il tiendra compte
-- du nouveau prix automatiquement.
do $$
declare
  v_st record;
begin
  for v_st in
    select s.id, s.name from public.stations s
    join public.station_billing b on b.station_id = s.id
    where b.plan = 'Pro' and s.closed_at is null
      and (exists (select 1 from public.station_pumps p where p.station_id = s.id)
           or exists (select 1 from public.employees e where e.station_id = s.id and e.role = 'Pompiste'))
  loop
    update public.station_billing set plan = 'Business' where station_id = v_st.id;
    insert into public.audit_log (actor, action)
    values ('Plateforme', 'Station « ' || v_st.name || ' » passée de Pro à Station de service (utilise Pompistes)');
  end loop;
end $$;
