-- ══════════════════════════════════════════════════════════════════════
-- OFFRE « SUR MESURE » — phase 3 : analyste IA du groupe.
-- À exécuter une fois dans l'éditeur SQL Supabase (après add_group_dashboard.sql).
-- Idempotent.
--
-- L'IA (Edge Functions group-ai et group-ai-weekly) reçoit UNIQUEMENT les
-- chiffres agrégés de group_dashboard() — jamais de nom de client, de plaque
-- ni de nom de laveur — et rédige un rapport ou répond à une question.
--   • Rapport à la demande (kind 'report') et question libre (kind 'question') :
--     comptent dans la limite mensuelle du groupe (organizations.ai_monthly_limit,
--     30 par défaut, réglable par le Super Admin).
--   • Rapport hebdomadaire automatique (kind 'weekly') : un seul par groupe et
--     par semaine (index unique), NE compte PAS dans la limite.
-- Le coût est borné côté base : group_ai_begin() verrouille le groupe, vérifie
-- la limite et réserve la demande AVANT d'appeler l'API (deux requêtes
-- simultanées ne peuvent donc pas dépasser la limite).
-- ══════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists ai_monthly_limit integer not null default 30
  check (ai_monthly_limit between 0 and 1000);

create table if not exists public.group_ai_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('weekly', 'report', 'question')),
  period_from timestamptz not null,
  period_to timestamptz not null,
  period_label text,
  -- Filtre de stations appliqué (null = toutes).
  station_ids uuid[],
  question text,
  -- '' = demande réservée mais pas encore terminée.
  answer text not null default '',
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists group_ai_reports_org_idx on public.group_ai_reports(organization_id, created_at desc);
-- Un seul rapport hebdomadaire par groupe et par semaine (idempotence du cron).
create unique index if not exists group_ai_weekly_once
  on public.group_ai_reports(organization_id, period_from) where kind = 'weekly';

alter table public.group_ai_reports enable row level security;
drop policy if exists group_ai_reports_select on public.group_ai_reports;
create policy group_ai_reports_select on public.group_ai_reports for select
  using (
    (organization_id = public.my_organization_id() and answer <> '')
    or public.app_role() = 'super_admin'
  );

-- Demandes du mois en cours (UTC) comptées dans la limite : terminées, ou
-- réservées depuis moins de 10 minutes (une réservation restée en plan plus
-- longtemps — coupure d'une fonction — ne bloque pas le groupe).
create or replace function public._group_ai_used(p_org uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.group_ai_reports
  where organization_id = p_org
    and kind in ('report', 'question')
    and created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
    and (answer <> '' or created_at > now() - interval '10 minutes');
$$;
revoke all on function public._group_ai_used(uuid) from public, anon, authenticated;
grant execute on function public._group_ai_used(uuid) to service_role;

-- Usage du patron connecté (et son groupe, pour l'Edge Function).
create or replace function public.group_ai_usage()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where owner_id = auth.uid();
  if v_org.id is null then
    raise exception 'Réservé au chef d''entreprise.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'org_id', v_org.id,
    'org_name', v_org.name,
    'used', public._group_ai_used(v_org.id),
    'limit', v_org.ai_monthly_limit,
    'resets_on', ((date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC')
  );
end;
$$;
revoke all on function public.group_ai_usage() from public, anon;
grant execute on function public.group_ai_usage() to authenticated;

-- Réserve une demande (service_role, via les Edge Functions). Renvoie l'id de
-- la ligne réservée ; pour un rapport hebdomadaire déjà fait, renvoie null.
create or replace function public.group_ai_begin(
  p_org uuid,
  p_kind text,
  p_from timestamptz,
  p_to timestamptz,
  p_label text,
  p_station_ids uuid[],
  p_question text,
  p_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_id uuid;
begin
  if p_kind not in ('weekly', 'report', 'question') then raise exception 'Type invalide.'; end if;
  -- Le verrou sur le groupe sérialise les demandes concurrentes.
  select ai_monthly_limit into v_limit from public.organizations where id = p_org for update;
  if v_limit is null then raise exception 'Groupe introuvable.'; end if;

  -- Ménage : réservations abandonnées et historique de plus de 13 mois.
  delete from public.group_ai_reports
   where organization_id = p_org
     and ((answer = '' and created_at < now() - interval '10 minutes') or created_at < now() - interval '400 days');

  if p_kind in ('report', 'question') then
    if public._group_ai_used(p_org) >= v_limit then
      raise exception 'AI_LIMIT_REACHED';
    end if;
    insert into public.group_ai_reports (organization_id, kind, period_from, period_to, period_label, station_ids, question, created_by)
    values (p_org, p_kind, p_from, p_to, p_label, p_station_ids, left(p_question, 600), p_user)
    returning id into v_id;
  else
    insert into public.group_ai_reports (organization_id, kind, period_from, period_to, period_label, station_ids, created_by)
    values (p_org, 'weekly', p_from, p_to, p_label, null, p_user)
    on conflict (organization_id, period_from) where kind = 'weekly' do nothing
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.group_ai_begin(uuid, text, timestamptz, timestamptz, text, uuid[], text, uuid) from public, anon, authenticated;
grant execute on function public.group_ai_begin(uuid, text, timestamptz, timestamptz, text, uuid[], text, uuid) to service_role;

create or replace function public.group_ai_finish(p_id uuid, p_answer text, p_model text, p_in integer, p_out integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.group_ai_reports
     set answer = p_answer, model = p_model, input_tokens = p_in, output_tokens = p_out
   where id = p_id and answer = '';
$$;
revoke all on function public.group_ai_finish(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.group_ai_finish(uuid, text, text, integer, integer) to service_role;

-- Annule une réservation (échec de l'API) : la demande ne compte pas.
create or replace function public.group_ai_abort(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.group_ai_reports where id = p_id and answer = '';
$$;
revoke all on function public.group_ai_abort(uuid) from public, anon, authenticated;
grant execute on function public.group_ai_abort(uuid) to service_role;

-- Le patron supprime une entrée de son historique.
create or replace function public.group_ai_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_ai_reports
   where id = p_id and organization_id = public.my_organization_id() and answer <> '';
  if not found then raise exception 'Entrée introuvable.'; end if;
end;
$$;
revoke all on function public.group_ai_delete(uuid) from public, anon;
grant execute on function public.group_ai_delete(uuid) to authenticated;

-- Le Super Admin règle la limite mensuelle d'un groupe.
create or replace function public.superadmin_set_group_ai_limit(p_org_id uuid, p_limit integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 1000 then
    raise exception 'La limite doit être comprise entre 0 et 1000.';
  end if;
  update public.organizations set ai_monthly_limit = p_limit where id = p_org_id;
  if not found then raise exception 'Groupe introuvable.'; end if;
  insert into public.audit_log (actor, action)
  values ('Super Admin', 'Limite IA mensuelle d''un groupe réglée à ' || p_limit);
end;
$$;
revoke all on function public.superadmin_set_group_ai_limit(uuid, integer) from public, anon;
grant execute on function public.superadmin_set_group_ai_limit(uuid, integer) to authenticated;
