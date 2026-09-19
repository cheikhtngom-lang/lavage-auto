-- ══════════════════════════════════════════════════════════════════════
-- Formulaire « Contact » du footer public (fenêtre "Envoyez-nous un
-- message") — voir src/contact-modal.js et
-- supabase/functions/send-contact-message.
--
-- Les visiteurs ne sont pas connectés : AUCUNE policy d'écriture n'est
-- ouverte. L'insertion passe uniquement par l'Edge Function (clé service
-- role), qui valide le contenu, limite le débit par IP hashée (l'IP en
-- clair n'est jamais stockée) et supprime les messages de plus de 12 mois
-- (durée de conservation annoncée dans confidentialite.html).
-- Lecture / traitement : Super Admin uniquement.
--
-- À exécuter une fois dans l'éditeur SQL Supabase. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 100),
  email       text not null check (char_length(email) between 5 and 254),
  subject     text not null check (char_length(subject) between 1 and 100),
  message     text not null check (char_length(message) between 10 and 2000),
  ip_hash     text,
  status      text not null default 'nouveau' check (status in ('nouveau', 'traite')),
  notified_at timestamptz
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
create index if not exists contact_messages_ip_idx on public.contact_messages (ip_hash, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists "contact_messages_select" on public.contact_messages;
create policy "contact_messages_select" on public.contact_messages for select
  using (app_role() = 'super_admin');

drop policy if exists "contact_messages_update" on public.contact_messages;
create policy "contact_messages_update" on public.contact_messages for update
  using (app_role() = 'super_admin') with check (app_role() = 'super_admin');
