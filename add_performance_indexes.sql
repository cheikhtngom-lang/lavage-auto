-- ══════════════════════════════════════════════════════════════════════
-- Index de performance — colonnes station_id/client_id/owner_id filtrées
-- en permanence (RLS + requêtes applicatives) mais jamais indexées jusqu'ici
-- (schema.sql ne crée QUE les clés primaires + un index unique). Postgres
-- n'indexe jamais automatiquement une colonne `references` : sans ça, CHAQUE
-- lecture scoped-station/scoped-client (file d'attente, transactions,
-- réservations, employés...) fait un scan séquentiel de la table entière.
--
-- Invisible aujourd'hui (peu de lignes par table) — devient le facteur n°1
-- de lenteur/latence qui grimpe sous charge concurrente à mesure que
-- l'historique grandit (des mois de lavages/réservations/transactions).
-- Ajout 100% sûr : purement additif, aucun changement de comportement, pas
-- de verrou notable à ce volume de données.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

-- ─── Réservations (file d'attente — la table la plus lue de l'app) ──────
create index if not exists reservations_station_status_idx on public.reservations(station_id, status);
create index if not exists reservations_client_idx on public.reservations(client_id);
-- Sert spécifiquement all_stations_queue_snapshot() (schema.sql) : filtre
-- SEULEMENT par status, toutes stations confondues, pas de station_id ici.
create index if not exists reservations_open_status_idx on public.reservations(status) where status in ('attente', 'en_cours');

-- ─── Transactions (encaissements — Bilan/Analytique/Comptabilité/carte
-- "Recette générée par les stations" côté Super Admin) ───────────────────
create index if not exists transactions_station_created_idx on public.transactions(station_id, created_at desc);
create index if not exists transactions_client_idx on public.transactions(client_id);

-- ─── Reste des tables scoped-station sans index sur station_id ──────────
create index if not exists employees_station_status_idx on public.employees(station_id, daily_status);
create index if not exists expenses_station_created_idx on public.expenses(station_id, created_at desc);
create index if not exists shift_templates_station_idx on public.shift_templates(station_id);
create index if not exists shift_schedule_station_idx on public.shift_schedule(station_id);
create index if not exists attendance_records_station_idx on public.attendance_records(station_id);
create index if not exists station_ads_station_idx on public.station_ads(station_id);
create index if not exists station_reviews_station_idx on public.station_reviews(station_id);

-- ─── Scoped-client ───────────────────────────────────────────────────────
create index if not exists vehicles_owner_idx on public.vehicles(owner_id);
create index if not exists super_user_subscriptions_client_idx on public.super_user_subscriptions(client_id);

-- ─── Paiements / abonnements (add_paydunya_per.sql, add_station_subscription_gate.sql,
-- supabase/migrations/station_subscriptions.sql) ─────────────────────────
create index if not exists paiements_lavage_station_idx on public.paiements_lavage(station_id);
create index if not exists paiements_lavage_client_idx on public.paiements_lavage(client_id);
create index if not exists station_renewal_payments_station_idx on public.station_renewal_payments(station_id);
create index if not exists station_client_subscriptions_station_idx on public.station_client_subscriptions(station_id);
create index if not exists station_client_subscriptions_client_idx on public.station_client_subscriptions(client_id);
create index if not exists station_subscription_invoices_station_idx on public.station_subscription_invoices(station_id);
create index if not exists station_subscription_invoices_subscription_idx on public.station_subscription_invoices(subscription_id);
