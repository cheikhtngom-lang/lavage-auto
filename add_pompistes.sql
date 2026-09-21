-- ════════════════════════════════════════════════════════════════════════
--  Pompistes (stations d'essence qui font aussi du lavage) — forfait Business
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Concept : un pompiste est une fiche `employees` de rôle 'Pompiste' (comme
--  un laveur : pas de compte de connexion). Son pointage réutilise donc tel
--  quel employees (état du jour) + attendance_records (un instantané par
--  jour). Ce qui est NOUVEAU : la pompe à laquelle il est affecté et, en fin
--  de journée, le relevé de ce qu'il a vendu (litres) et encaissé (montant).
--
--  Ces relevés vivent sur la ligne attendance_records du (pompiste, jour) —
--  même clé unique (employee_id, work_date), même RLS station — pas dans
--  `transactions` : l'essence n'est pas du chiffre d'affaires lavage et ne
--  doit fausser ni le Bilan, ni l'Analytique, ni les commissions plateforme.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. Pompe habituelle du pompiste (modifiable jour par jour) ─────────
alter table public.employees
  add column if not exists pump_label text;

-- ─── 2. Relevé de fin de journée ───────────────────────────────────────
-- pump_label : pompe réellement tenue CE jour-là (figée avec la journée).
-- liters / amount_collected : NULL = relevé pas encore saisi (≠ 0 vendu).
alter table public.attendance_records
  add column if not exists pump_label text,
  add column if not exists liters numeric(10, 2),
  add column if not exists amount_collected integer;

do $$
begin
  begin
    alter table public.attendance_records
      add constraint attendance_liters_nonneg check (liters is null or liters >= 0);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.attendance_records
      add constraint attendance_amount_nonneg check (amount_collected is null or amount_collected >= 0);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.attendance_records
      add constraint attendance_pump_label_len check (pump_label is null or char_length(pump_label) <= 40);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.employees
      add constraint employees_pump_label_len check (pump_label is null or char_length(pump_label) <= 40);
  exception when duplicate_object then null;
  end;
end $$;

-- ─── 3. Permission 'pompistes.manage' pour les rôles catalogue ─────────
-- Même mécanique que vidange.manage / announcements.manage : on redéfinit
-- seed_builtin_station_roles (version la plus récente = add_announcements.sql,
-- + pompistes.manage) pour les PROCHAINES stations, et on met à jour ici
-- celles déjà créées (le "on conflict do nothing" de la fonction ne les
-- aurait pas touchées).
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
     'Gestion complète au quotidien, sauf la gestion de l''équipe.',
     array['dashboard','washers.manage','pompistes.manage','vidange.manage','transactions.view','accounting.manage','subscriptions.manage','analytics.view','settings.manage','announcements.manage'], true),
    (p_station_id, 'caissier', 'Caissier / Comptable',
     'Encaissements, transactions, comptabilité, dépenses et analytique.',
     array['dashboard','transactions.view','accounting.manage','subscriptions.manage','analytics.view'], true),
    (p_station_id, 'superviseur', 'Superviseur',
     'File d''attente, laveurs, pompistes, planning et pointage.',
     array['dashboard','washers.manage','pompistes.manage','vidange.manage'], true),
    (p_station_id, 'reception', 'Réception',
     'File d''attente, nouveau lavage et suivi des transactions.',
     array['dashboard','transactions.view'], true),
    (p_station_id, 'laveur', 'Laveur',
     'Voit la file d''attente et ses lavages ; gère son pointage.',
     array['dashboard','washer.self'], true)
  on conflict (station_id, key) do nothing;
end;
$$;

update public.station_roles
   set permissions = array_append(permissions, 'pompistes.manage')
 where is_builtin
   and key in ('gerant', 'superviseur')
   and not ('pompistes.manage' = any(permissions))
   and not ('*' = any(permissions));
