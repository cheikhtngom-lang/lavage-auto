-- ══════════════════════════════════════════════════════════════════════
-- Modules & Add-ons — le Super Admin peut activer/désactiver des options
-- indépendantes pour UNE station, sans changer son plan de base (Starter/
-- Pro/Business). Même principe que "Gestion Dynamique des Abonnements" du
-- projet GestionImmo de l'utilisateur (agencies.active_modules) — voir
-- Super Admin > Modules (nouvelle page) et lib/stationModules.js pour le
-- catalogue.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

alter table public.station_billing
  add column if not exists active_modules text[] not null default '{}';

-- Aucun changement de policy nécessaire : station_billing_select permet
-- déjà à la station de lire sa propre ligne (donc ses modules actifs), et
-- station_billing_update est déjà réservée au Super Admin (donc seul lui
-- peut les activer/désactiver) — voir supabase/schema.sql.
