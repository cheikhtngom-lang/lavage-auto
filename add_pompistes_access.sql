-- ════════════════════════════════════════════════════════════════════════
--  Pompistes : qui y a droit ? (complète add_pompistes.sql)
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Règle : la rubrique Pompistes n'est ouverte qu'aux stations
--   • en forfait Business ; ou
--   • d'un groupe « Sur mesure » dont le patron possède PLUS DE 3 stations
--     (4 ou plus, stations archivées non comptées) — quel que soit le forfait
--     de chaque station du groupe.
--
--  Une seule source de vérité : le front (menu, Paramètres, route) l'interroge
--  au chargement, comme station_has_vidange / station_has_shop.
--
--  L'appelant ne peut interroger que sa propre station (la station ouverte pour
--  un patron), le Super Admin de la plateforme ou le patron du groupe : toute
--  autre station répond « faux » sans rien révéler de son forfait.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.station_has_pompistes(sid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  -- coalesce : un compte sans station (automobiliste…) donne « faux », jamais NULL.
  select coalesce(
    (sid = public.current_station_id()
      or public.app_role() = 'super_admin'
      or public.group_owns_station(sid))
    and (
      coalesce((select sb.plan from public.station_billing sb where sb.station_id = sid), 'Starter') = 'Business'
      or exists (
        select 1 from public.stations s
        where s.id = sid
          and s.organization_id is not null
          and s.group_archived_at is null
          and (select count(*) from public.stations g
                where g.organization_id = s.organization_id and g.group_archived_at is null) > 3
      )
    ), false);
$$;

revoke all on function public.station_has_pompistes(uuid) from public, anon;
grant execute on function public.station_has_pompistes(uuid) to authenticated;
