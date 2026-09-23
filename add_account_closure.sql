-- Fermeture de compte en libre-service (automobiliste, station, chef d'entreprise
-- Sur mesure) + export des données du groupe pour le patron.
--
-- Règles (choisies le 23 septembre 2026) :
--   • 30 jours pour changer d'avis. La demande bloque tout de suite le compte
--     (l'interface n'affiche plus que « Fermeture programmée » + Annuler) et
--     retire la station de l'annuaire public ; se reconnecter permet d'annuler.
--     Au bout de 30 jours, une tâche quotidienne (pg_cron) finalise.
--   • Données d'activité d'une station CONSERVÉES MAIS ANONYMISÉES : la ligne
--     `stations` reste (sinon ON DELETE CASCADE effacerait réservations,
--     transactions, dépenses…), noms/coordonnées/plaques sont effacés, les
--     comptes (propriétaire + équipe) sont supprimés.
--   • Patron : les stations qu'il a créées ferment avec lui ; les stations
--     rattachées redeviennent indépendantes à la finalisation.
--   • Automobiliste : compte, profil et véhicules supprimés ; son nom et ses
--     plaques sont retirés de l'historique des stations (montants conservés).
--
-- À jouer après add_sur_mesure_groups.sql et add_station_transfer.sql.
-- Rejouable sans risque.

-- ─── 1. Liens vers les comptes : ne jamais bloquer ni effacer l'historique ─
-- Le propriétaire d'une station / d'une entreprise peut désormais disparaître
-- sans emporter la station, l'entreprise ni les paiements reçus par la plateforme.
alter table public.stations drop constraint if exists stations_created_by_fkey;
alter table public.stations add constraint stations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.organizations alter column owner_id drop not null;
alter table public.organizations drop constraint if exists organizations_owner_id_fkey;
alter table public.organizations add constraint organizations_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

-- Abonnements Super User / Plus : ce sont des encaissements de la plateforme,
-- on les garde (anonymes) au lieu de les effacer avec le compte.
alter table public.super_user_subscriptions alter column client_id drop not null;
alter table public.super_user_subscriptions drop constraint if exists super_user_subscriptions_client_id_fkey;
alter table public.super_user_subscriptions add constraint super_user_subscriptions_client_id_fkey
  foreign key (client_id) references public.profiles(id) on delete set null;

alter table public.stations add column if not exists closed_at timestamptz;

-- ─── 2. Demandes de fermeture ──────────────────────────────────────────
create table if not exists public.account_closures (
  id uuid primary key default gen_random_uuid(),
  -- Stations créées par un patron : une ligne « enfant » par station, rattachée
  -- à la demande du patron (annulée / finalisée avec elle).
  parent_id uuid references public.account_closures(id) on delete cascade,
  kind text not null check (kind in ('automobiliste', 'station', 'groupe')),
  user_id uuid references auth.users(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  label text,  -- nom de la station / de l'entreprise, effacé à la finalisation
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'done')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists account_closures_one_pending_per_user
  on public.account_closures(user_id) where status = 'pending' and parent_id is null;
create index if not exists account_closures_pending_station
  on public.account_closures(station_id) where status = 'pending';
create index if not exists account_closures_due
  on public.account_closures(scheduled_for) where status = 'pending' and parent_id is null;

alter table public.account_closures enable row level security;
drop policy if exists account_closures_select on public.account_closures;
create policy account_closures_select on public.account_closures for select
  using (user_id = auth.uid() or public.app_role() = 'super_admin');
-- Aucune policy d'écriture : tout passe par les fonctions ci-dessous.

-- ─── 3. Station en cours de fermeture = invisible et non réservable ────
create or replace function public.station_is_closing(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stations where id = sid and closed_at is not null)
      or exists (select 1 from public.account_closures where station_id = sid and status = 'pending');
$$;

-- Même corps qu'avant (voir add_station_subscription_gate.sql), plus la fermeture :
-- stations_select (annuaire public) s'appuie dessus.
create or replace function public.station_subscription_ok(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.station_is_closing(sid) and coalesce(
    (select sb.subscription_status <> 'en_retard'
       and not (sb.subscription_status = 'essai' and sb.trial_ends_at is not null and sb.trial_ends_at < now())
     from public.station_billing sb
     where sb.station_id = sid),
    true
  );
$$;

-- Pas de nouvelle réservation client dans une station qui ferme (l'annuaire la
-- masque déjà ; ceci ferme aussi les liens directs et les onglets restés ouverts).
create or replace function public.block_reservation_on_closing_station()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and public.station_is_closing(new.station_id) then
    raise exception 'Cette station est en cours de fermeture et ne prend plus de réservations.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reservations_block_closing_station on public.reservations;
create trigger reservations_block_closing_station before insert on public.reservations
  for each row execute function public.block_reservation_on_closing_station();

-- ─── 4. État de fermeture vu par le compte connecté ────────────────────
-- Sa propre demande (annulable), sinon celle de la station où il travaille
-- (collaborateur : non annulable par lui).
create or replace function public.my_account_closure()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c public.account_closures;
  v_station uuid;
begin
  if v_uid is null then return null; end if;
  select * into v_c from public.account_closures
   where user_id = v_uid and status = 'pending' and parent_id is null limit 1;
  if found then
    return jsonb_build_object('id', v_c.id, 'kind', v_c.kind, 'label', v_c.label,
      'requested_at', v_c.requested_at, 'scheduled_for', v_c.scheduled_for, 'can_cancel', true);
  end if;
  select station_id into v_station from public.profiles where id = v_uid;
  if v_station is not null then
    select * into v_c from public.account_closures
     where station_id = v_station and status = 'pending' order by requested_at limit 1;
    if found then
      return jsonb_build_object('id', v_c.id, 'kind', 'station', 'label', v_c.label,
        'requested_at', v_c.requested_at, 'scheduled_for', v_c.scheduled_for, 'can_cancel', false);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.my_account_closure() from public, anon;
grant execute on function public.my_account_closure() to authenticated;

-- ─── 5. Demander la fermeture ──────────────────────────────────────────
-- p_confirm : « FERMER » (automobiliste), le nom de la station, ou le nom de
-- l'entreprise (patron) — retapé pour éviter une fermeture par erreur.
create or replace function public.request_account_closure(p_confirm text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_st public.stations;
  v_org public.organizations;
  v_when timestamptz := now() + interval '30 days';
  v_parent uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_confirm text := lower(btrim(coalesce(p_confirm, '')));
  v_busy text;
begin
  if v_uid is null then raise exception 'Connexion requise.' using errcode = '42501'; end if;
  if v_reason is not null and length(v_reason) > 500 then v_reason := left(v_reason, 500); end if;
  select * into v_p from public.profiles where id = v_uid;
  if not found then raise exception 'Compte introuvable.'; end if;
  if exists (select 1 from public.account_closures where user_id = v_uid and status = 'pending' and parent_id is null) then
    raise exception 'La fermeture de votre compte est déjà programmée.';
  end if;

  if v_p.role = 'automobiliste' then
    if v_confirm <> 'fermer' then raise exception 'Tapez FERMER pour confirmer.'; end if;
    if exists (select 1 from public.reservations where client_id = v_uid and status in ('attente', 'en_cours')) then
      raise exception 'Vous avez un lavage en attente ou en cours : attendez qu''il soit terminé (ou annulez-le) avant de fermer votre compte.';
    end if;
    insert into public.account_closures (kind, user_id, reason, scheduled_for)
    values ('automobiliste', v_uid, v_reason, v_when);
    insert into public.audit_log (actor, action) values ('Automobiliste', 'Fermeture de compte automobiliste programmée');

  elsif v_p.role = 'admin' and not v_p.is_group_owner then
    select * into v_st from public.stations where id = v_p.station_id;
    if not found then raise exception 'Aucune station rattachée à ce compte.'; end if;
    if v_confirm <> lower(btrim(v_st.name)) then raise exception 'Tapez exactement le nom de la station pour confirmer.'; end if;
    if v_st.organization_id is not null then
      select * into v_org from public.organizations where id = v_st.organization_id;
      raise exception 'Votre station fait partie du groupe « % » : quittez d''abord le groupe (bandeau en haut de votre espace), puis fermez votre compte.', coalesce(v_org.name, '—');
    end if;
    if exists (select 1 from public.station_transfer_requests where station_id = v_st.id and status in ('pending', 'ceded')) then
      raise exception 'Une cession de cette station est en cours : annulez-la d''abord (Paramètres > Cession).';
    end if;
    if exists (select 1 from public.reservations where station_id = v_st.id and status in ('attente', 'en_cours')) then
      raise exception 'Des véhicules sont encore dans la file d''attente : terminez ou retirez-les avant de fermer la station.';
    end if;
    update public.group_join_requests set status = 'cancelled' where station_id = v_st.id and status = 'pending';
    insert into public.account_closures (kind, user_id, station_id, label, reason, scheduled_for)
    values ('station', v_uid, v_st.id, v_st.name, v_reason, v_when);
    insert into public.audit_log (actor, action) values (coalesce(v_p.full_name, 'Propriétaire'), 'Fermeture programmée de la station « ' || v_st.name || ' »');

  elsif v_p.role = 'admin' and v_p.is_group_owner then
    select * into v_org from public.organizations where owner_id = v_uid;
    if not found then raise exception 'Aucune entreprise rattachée à ce compte.'; end if;
    if v_confirm <> lower(btrim(v_org.name)) then raise exception 'Tapez exactement le nom de l''entreprise pour confirmer.'; end if;
    select string_agg(s.name, ', ') into v_busy from public.stations s
     where s.organization_id = v_org.id and s.group_origin = 'created' and s.group_archived_at is null
       and exists (select 1 from public.reservations r where r.station_id = s.id and r.status in ('attente', 'en_cours'));
    if v_busy is not null then
      raise exception 'Des véhicules sont encore dans la file de : %. Terminez ou retirez-les avant de fermer votre espace.', v_busy;
    end if;
    if exists (select 1 from public.station_transfer_requests t join public.stations s on s.id = t.station_id
                where s.organization_id = v_org.id and t.status in ('pending', 'ceded')) then
      raise exception 'Une cession de station est en cours dans votre groupe : annulez-la d''abord.';
    end if;
    insert into public.account_closures (kind, user_id, organization_id, label, reason, scheduled_for)
    values ('groupe', v_uid, v_org.id, v_org.name, v_reason, v_when)
    returning id into v_parent;
    insert into public.account_closures (parent_id, kind, station_id, organization_id, label, scheduled_for)
    select v_parent, 'station', s.id, v_org.id, s.name, v_when
      from public.stations s where s.organization_id = v_org.id and s.group_origin = 'created';
    update public.organization_orders set status = 'CANCELLED' where organization_id = v_org.id and status = 'PENDING';
    update public.group_join_requests set status = 'cancelled' where organization_id = v_org.id and status = 'pending';
    update public.profiles set station_id = null where id = v_uid; -- plus « dans » aucune station
    insert into public.audit_log (actor, action) values (coalesce(v_p.full_name, 'Chef d''entreprise'), 'Fermeture programmée de l''entreprise « ' || v_org.name || ' » et de ses stations');

  else
    raise exception 'Ce type de compte ne peut pas être fermé depuis l''application. Contactez le propriétaire de la station ou le support.' using errcode = '42501';
  end if;

  return public.my_account_closure();
end;
$$;
revoke all on function public.request_account_closure(text, text) from public, anon;
grant execute on function public.request_account_closure(text, text) to authenticated;

-- ─── 6. Annuler (pendant les 30 jours) ─────────────────────────────────
create or replace function public.cancel_account_closure()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c public.account_closures;
begin
  select * into v_c from public.account_closures
   where user_id = auth.uid() and status = 'pending' and parent_id is null for update;
  if not found then raise exception 'Aucune fermeture en cours sur ce compte.'; end if;
  update public.account_closures set status = 'cancelled', cancelled_at = now()
   where (id = v_c.id or parent_id = v_c.id) and status = 'pending';
  insert into public.audit_log (actor, action)
  values ('Titulaire du compte', 'Fermeture annulée' || coalesce(' (« ' || v_c.label || ' »)', ''));
end;
$$;
revoke all on function public.cancel_account_closure() from public, anon;
grant execute on function public.cancel_account_closure() to authenticated;

-- ─── 7. Finalisation (tâche quotidienne, jamais appelable du navigateur) ─
create or replace function public._strip_plate(p_label text)
returns text language plpgsql immutable as $$
declare v text;
begin
  v := regexp_replace(coalesce(p_label, ''), '\s*\([^)]*\)', '', 'g');
  v := regexp_replace(v, '\m[A-Za-z]{2}-?[0-9]{3,4}-?[A-Za-z]{1,2}\M', '', 'g');
  v := btrim(regexp_replace(v, '\s{2,}', ' ', 'g'));
  return case when v = '' then 'Véhicule' else v end;
end;
$$;

-- Supprime le compte d'authentification (profil, véhicules… suivent par cascade).
create or replace function public._delete_auth_user(p_uid uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if p_uid is null then return; end if;
  update public.stations set created_by = null where created_by = p_uid;
  delete from auth.users where id = p_uid;
end;
$$;

-- Retire le nom et les plaques d'un automobiliste de l'historique des stations.
create or replace function public._anonymize_client_everywhere(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reservations set client_name = 'Client supprimé', vehicle_label = public._strip_plate(vehicle_label) where client_id = p_uid;
  update public.transactions set client_name = 'Client supprimé', vehicle_label = public._strip_plate(vehicle_label) where client_id = p_uid;
  update public.vidange_bookings set client_name = 'Client supprimé', vehicle_label = public._strip_plate(vehicle_label) where client_id = p_uid;
  update public.shop_orders set client_name = 'Client supprimé', delivery_address = null, delivery_phone = null where client_id = p_uid;
  update public.station_client_subscriptions set client_name = 'Client supprimé', client_phone = '—', client_email = null, client_address = null where client_id = p_uid;
  update public.station_subscription_invoices set client_name = 'Client supprimé', client_phone = '—' where client_id = p_uid;
  update public.station_reviews set client_name = null where client_id = p_uid;
end;
$$;

-- Ferme une station : données d'activité gardées mais anonymes, comptes d'équipe supprimés.
create or replace function public._finalize_station_closure(p_station_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_staff uuid;
begin
  update public.stations set
    name = 'Station fermée', owner_name = null, owner_phone = null, owner_email = null,
    address = null, lat = null, lng = null, logo_url = null, cachet_url = null,
    promo_config = '{}'::jsonb, vidange_enabled = false, status = 'suspendue', closed_at = now()
  where id = p_station_id;

  update public.employees e set name = 'Employé ' || n.rn, avatar = null
    from (select id, row_number() over (order by created_at, id) rn from public.employees where station_id = p_station_id) n
   where e.id = n.id;
  update public.attendance_records set name = 'Employé' where station_id = p_station_id;

  update public.reservations set client_name = 'Client', vehicle_label = public._strip_plate(vehicle_label),
    assigned_to_name = null, assigned_washer_names = null where station_id = p_station_id;
  update public.transactions set client_name = 'Client', vehicle_label = public._strip_plate(vehicle_label) where station_id = p_station_id;
  update public.vidange_bookings set client_name = 'Client', vehicle_label = public._strip_plate(vehicle_label) where station_id = p_station_id;
  update public.shop_orders set client_name = 'Client', delivery_address = null, delivery_phone = null where station_id = p_station_id;
  update public.station_client_subscriptions set client_name = 'Client', client_phone = '—', client_email = null, client_address = null where station_id = p_station_id;
  update public.station_subscription_invoices set client_name = 'Client', client_phone = '—' where station_id = p_station_id;
  update public.station_reviews set client_name = null where station_id = p_station_id;
  update public.station_transfer_requests set station_name = 'Station fermée', seller_name = null, seller_email = null,
    acquirer_name = 'Acquéreur', acquirer_email = '—', note = '', token_hash = null where station_id = p_station_id;
  update public.disputes set station_name = 'Station fermée' where station_id = p_station_id;
  update public.announcements set active = false where station_id = p_station_id;
  update public.group_join_requests set status = 'cancelled' where station_id = p_station_id and status = 'pending';
  delete from public.station_invitations where station_id = p_station_id;
  delete from public.station_members where station_id = p_station_id;

  -- Comptes de l'équipe (collaborateurs invités pour cette station).
  for v_staff in select id from public.profiles where station_id = p_station_id and role = 'staff' loop
    perform public._delete_auth_user(v_staff);
  end loop;
  -- Un patron « ouvert » sur cette station n'y est plus.
  update public.profiles set station_id = null where station_id = p_station_id;
end;
$$;

create or replace function public.process_due_account_closures()
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare
  v_c public.account_closures;
  v_child public.account_closures;
  v_joined uuid;
  v_done integer := 0;
begin
  for v_c in select * from public.account_closures
              where status = 'pending' and parent_id is null and scheduled_for <= now()
              order by scheduled_for loop
    begin
      if v_c.kind = 'automobiliste' then
        perform public._anonymize_client_everywhere(v_c.user_id);
        perform public._delete_auth_user(v_c.user_id);

      elsif v_c.kind = 'station' then
        perform public._finalize_station_closure(v_c.station_id);
        perform public._delete_auth_user(v_c.user_id);

      elsif v_c.kind = 'groupe' then
        for v_child in select * from public.account_closures where parent_id = v_c.id and status = 'pending' loop
          perform public._finalize_station_closure(v_child.station_id);
          update public.account_closures set status = 'done', completed_at = now(), label = null where id = v_child.id;
        end loop;
        -- Stations rattachées : elles redeviennent indépendantes.
        for v_joined in select id from public.stations where organization_id = v_c.organization_id and group_origin = 'joined' loop
          perform public._detach_station(v_joined, 'Plateforme (fermeture du groupe)');
        end loop;
        update public.organizations set name = 'Entreprise fermée' where id = v_c.organization_id;
        delete from public.group_ai_reports where organization_id = v_c.organization_id;
        perform public._delete_auth_user(v_c.user_id);
      end if;

      update public.account_closures set status = 'done', completed_at = now(), label = null, reason = null where id = v_c.id;
      insert into public.audit_log (actor, action) values ('Plateforme', 'Fermeture de compte finalisée (' || v_c.kind || ')');
      v_done := v_done + 1;
    exception when others then
      -- Une fermeture en échec ne bloque pas les suivantes ; elle sera retentée demain.
      insert into public.audit_log (actor, action)
      values ('Plateforme', 'Échec de finalisation de fermeture ' || v_c.id || ' : ' || left(sqlerrm, 300));
    end;
  end loop;
  return v_done;
end;
$$;
revoke all on function public.process_due_account_closures() from public, anon, authenticated;
revoke all on function public._finalize_station_closure(uuid) from public, anon, authenticated;
revoke all on function public._anonymize_client_everywhere(uuid) from public, anon, authenticated;
revoke all on function public._delete_auth_user(uuid) from public, anon, authenticated;

-- Tous les jours à 03:15 UTC.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'account-closures-daily') then
    perform cron.unschedule('account-closures-daily');
  end if;
  perform cron.schedule('account-closures-daily', '15 3 * * *', 'select public.process_due_account_closures()');
end $$;

-- ─── 8. Portabilité : données d'une station du groupe, pour le patron ──
-- Le patron ne lit pas les tables des stations en direct (RLS = station
-- ouverte) : cette fonction renvoie tout le jeu de données d'UNE station de
-- son groupe, au même format que l'export des données d'une station (lib/rgpdExport.js).
create or replace function public.group_export_station(p_station_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_name text;
  v_station jsonb;
begin
  if not public.group_owns_station(p_station_id) then
    raise exception 'Cette station ne fait pas partie de votre groupe.' using errcode = '42501';
  end if;
  foreach v_name in array array[
    'employees', 'expenses', 'shift_templates', 'shift_schedule', 'custom_vehicle_types', 'attendance_records',
    'wash_pricing', 'vidange_pricing', 'reservations', 'transactions', 'station_reviews', 'station_ads',
    'station_renewal_payments', 'station_members', 'station_roles', 'station_pumps', 'pump_nozzles',
    'station_client_subscriptions', 'station_subscription_invoices', 'vidange_bookings', 'shop_products', 'shop_orders'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.station_id = $1', v_name)
      into v_rows using p_station_id;
    v_tables := v_tables || jsonb_build_object(v_name, v_rows);
  end loop;
  select to_jsonb(s) into v_station from public.stations s where s.id = p_station_id;
  return jsonb_build_object(
    'station', v_station,
    'station_billing', (select to_jsonb(b) from public.station_billing b where b.station_id = p_station_id),
    'tables', v_tables
  );
end;
$$;
revoke all on function public.group_export_station(uuid) from public, anon;
grant execute on function public.group_export_station(uuid) to authenticated;
