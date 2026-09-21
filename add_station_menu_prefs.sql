-- ════════════════════════════════════════════════════════════════════════
--  Rubriques du menu station : cocher / décocher (Paramètres > Menu)
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  stations.hidden_menu = clés des rubriques MASQUÉES du menu latéral de la
--  station (voir src/lib/adminNav.js). C'est un simple désencombrement de
--  l'interface, pas un contrôle d'accès : la route reste joignable et les
--  permissions/forfaits continuent de s'appliquer indépendamment.
--
--  Par défaut 'pompistes' est masquée : la rubrique n'a de sens que pour une
--  station qui vend aussi du carburant, elle s'active à la demande. (Un
--  "add column ... default" s'applique aussi aux stations déjà existantes.)
-- ════════════════════════════════════════════════════════════════════════

alter table public.stations
  add column if not exists hidden_menu text[] not null default array['pompistes']::text[];

do $$
begin
  begin
    alter table public.stations
      add constraint stations_hidden_menu_size check (cardinality(hidden_menu) <= 30);
  exception when duplicate_object then null;
  end;
end $$;
