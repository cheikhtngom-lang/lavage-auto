-- ══════════════════════════════════════════════════════════════════════
-- Accès illimité (gratuit à vie) qu'un Super Admin peut accorder à une
-- station partenaire — à exécuter une fois dans l'éditeur SQL Supabase.
-- Idempotent (peut être rejoué sans risque).
--
-- Ajoute la valeur 'illimite' au statut d'abonnement d'une station
-- (station_billing.subscription_status). Une station "illimite" ne voit
-- plus jamais la bannière d'essai (elle ne vaut que pour 'essai', voir
-- TrialBanner.jsx) et sort du calcul du MRR/revenus (voir Billing.jsx et
-- Analytics.jsx) puisqu'elle ne paie rien. Réversible à tout moment par
-- le Super Admin (bouton "Retirer l'accès illimité").
-- ══════════════════════════════════════════════════════════════════════

alter table public.station_billing drop constraint if exists station_billing_subscription_status_check;
alter table public.station_billing add constraint station_billing_subscription_status_check
  check (subscription_status in ('essai', 'a_jour', 'en_retard', 'illimite'));
