-- ══════════════════════════════════════════════════════════════════════
-- Emails de rétention (bienvenue immédiat + relance J+3 si inactif) — à
-- exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
--
-- welcome_email_sent_at / retention_email_sent_at empêchent un double envoi
-- si les Edge Functions send-welcome-email / send-retention-reminders sont
-- rappelées plusieurs fois (retry réseau côté client, ré-exécution du cron).
-- Couvre les deux rôles (profiles.role) : automobiliste ET admin (station) —
-- un seul compte de connexion par station, voir profiles.station_id.
-- ══════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;
alter table public.profiles add column if not exists retention_email_sent_at timestamptz;
