-- ══════════════════════════════════════════════════════════════════════
-- Offres de publicité "à la une" (3 jours / 1 semaine / 1 mois) — à exécuter
-- une fois dans l'éditeur SQL Supabase. Idempotent (peut être rejoué sans
-- risque).
--
-- Ajoute duration_days sur station_ads : jusqu'ici la durée de diffusion
-- (AD_CAMPAIGN_DAYS, 7 jours) était fixe et codée en dur côté app — chaque
-- pub garde maintenant sa propre durée, choisie par la station au moment du
-- paiement (voir lib/ads.js AD_PLANS).
-- ══════════════════════════════════════════════════════════════════════

alter table public.station_ads add column if not exists duration_days integer not null default 7;
