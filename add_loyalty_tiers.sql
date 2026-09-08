-- ══════════════════════════════════════════════════════════════════════
-- Fidélité Avancée (module "mod_fidelite_plus", voir Super Admin > Modules)
-- — plusieurs paliers de récompenses au lieu du seuil unique actuel
-- (stations.loyalty_threshold). `loyalty_tiers` reste vide par défaut :
-- tant qu'une station n'a pas configuré de paliers (ou n'a pas le module),
-- tout le monde retombe sur le comportement actuel à seuil unique — voir
-- lib/loyalty.js.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

alter table public.stations
  add column if not exists loyalty_tiers jsonb;
