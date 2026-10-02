-- ═══════════════════════════════════════════════════════════════════════
-- Rôles catalogue des stations : Gérant sans Finances sensibles,
-- suppression du rôle Superviseur (doublon du Gérant).
--
--   - Gérant : perd 'accounting.manage' (Comptabilité, dépenses, Bilan) et
--     'analytics.view' (Analytique). Il garde l'exploitation, les
--     transactions, les abonnements clients, les paramètres et les annonces.
--   - Superviseur : retiré du catalogue. Ses droits (file, laveurs, pompistes,
--     vidange) sont tous inclus dans ceux du Gérant ; un éventuel membre
--     encore rattaché est basculé sur le Gérant avant la suppression
--     (station_members.role_id est en "on delete restrict").
--
-- Même mécanique que add_pompistes.sql : on redéfinit
-- seed_builtin_station_roles (version la plus récente = add_pompistes.sql)
-- pour les PROCHAINES stations, puis on met à jour celles déjà créées.
-- Idempotent : peut être relancé sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.seed_builtin_station_roles(p_station_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.station_roles (station_id, key, name, description, permissions, is_builtin)
  values
    (p_station_id, 'super_admin_station', 'Super Admin Station',
     'Tous les droits sur la station.', array['*'], true),
    (p_station_id, 'gerant', 'Gérant',
     'Gestion au quotidien, sauf l''équipe, la comptabilité et l''analytique.',
     array['dashboard','washers.manage','pompistes.manage','vidange.manage','transactions.view','subscriptions.manage','settings.manage','announcements.manage'], true),
    (p_station_id, 'caissier', 'Caissier / Comptable',
     'Encaissements, transactions, comptabilité, dépenses et analytique.',
     array['dashboard','transactions.view','accounting.manage','subscriptions.manage','analytics.view'], true),
    (p_station_id, 'reception', 'Réception',
     'File d''attente, nouveau lavage et suivi des transactions.',
     array['dashboard','transactions.view'], true),
    (p_station_id, 'laveur', 'Laveur',
     'Voit la file d''attente et ses lavages ; gère son pointage.',
     array['dashboard','washer.self'], true)
  on conflict (station_id, key) do nothing;
end;
$$;

-- ─── Gérant : retrait de la comptabilité et de l'analytique ───────────
update public.station_roles
   set permissions = array_remove(array_remove(permissions, 'accounting.manage'), 'analytics.view'),
       description = 'Gestion au quotidien, sauf l''équipe, la comptabilité et l''analytique.'
 where is_builtin
   and key = 'gerant'
   and not ('*' = any(permissions));

-- ─── Superviseur : membres basculés sur le Gérant, puis suppression ───
update public.station_members m
   set role_id = g.id
  from public.station_roles s
  join public.station_roles g
    on g.station_id = s.station_id and g.key = 'gerant' and g.is_builtin
 where m.role_id = s.id
   and s.is_builtin
   and s.key = 'superviseur';

delete from public.station_roles
 where is_builtin
   and key = 'superviseur';
