-- ══════════════════════════════════════════════════════════════════════
-- Lavage à plusieurs laveurs (bus / camion +50 places — catégorie tarifaire
-- "Camion", voir PRICING_CATEGORY_LABELS dans src/lib/vehicleBrands.js) — à
-- exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- assigned_to_name reste le laveur "principal" (compat avec tout le code
-- existant qui ne lit que ce champ : Analytics, historique, etc.).
-- assigned_washer_names ne contient une valeur QUE quand plusieurs laveurs
-- ont été assignés (véhicule volumineux) — null pour un lavage classique à
-- un seul laveur, voir startWash dans useAppState.jsx.
-- ══════════════════════════════════════════════════════════════════════

alter table public.reservations add column if not exists assigned_washer_names text[];
