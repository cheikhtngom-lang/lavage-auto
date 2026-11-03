-- Super Admin > Facturation : encaisser un abonnement payé hors ligne
-- (espèces, Wave/Orange Money reçus directement) et vider les données
-- d'essai d'une station avant qu'elles n'entrent dans sa comptabilité.
-- Voir recordStationPayment / getTrialDataCounts / purgeTrialData dans
-- src/hooks/useSuperAdminState.jsx. Ré-exécutable sans risque.
--
-- 1. superadmin_record_station_payment : prolonge l'abonnement de N mois et
--    enregistre le paiement en CONFIRMED dans station_renewal_payments, pour
--    qu'il compte dans les revenus encaissés (lib/platformBilan.js). Avant,
--    « Marquer comme payé » n'existait que pour une station pas à jour,
--    repartait d'aujourd'hui (+30 j) et n'enregistrait aucune recette.
--    La période part de l'échéance en cours si la station est à jour, sinon
--    d'aujourd'hui ; p_start permet de choisir une autre date de début.
-- 2. superadmin_trial_data_counts / superadmin_purge_trial_data : efface ce
--    que la station a saisi pendant son essai (lavages, file, transactions,
--    dépenses, ventes et mouvements de la boutique, pointages, abonnements
--    clients, vidanges, avis). Gardés : la station, son offre, ses tarifs,
--    son équipe, son catalogue (stocks remis à 0), ses pompes, et tout ce qui
--    a transité par la plateforme (paiements PayDunya, pubs, renouvellements).
--    Refusé dès que la station a un abonnement payé ou illimité.

create or replace function public.superadmin_record_station_payment(
  p_station_id uuid,
  p_months integer,
  p_amount integer,
  p_method text default 'Espèces',
  p_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing public.station_billing%rowtype;
  v_start timestamptz;
  v_next timestamptz;
  v_payment_id uuid;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Durée invalide (1 à 24 mois).';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Montant invalide.';
  end if;

  select * into v_billing from public.station_billing where station_id = p_station_id for update;
  if not found then
    raise exception 'Station introuvable.';
  end if;

  v_start := coalesce(
    p_start::timestamptz,
    case when v_billing.subscription_status = 'a_jour' and v_billing.next_billing_date is not null
         then v_billing.next_billing_date else now() end
  );
  v_next := v_start + make_interval(months => p_months);

  update public.station_billing
     set subscription_status = 'a_jour', next_billing_date = v_next
   where station_id = p_station_id;

  insert into public.station_renewal_payments (station_id, status, plan, amount, method, reference, confirmed_at)
  values (
    p_station_id, 'CONFIRMED', v_billing.plan, p_amount,
    coalesce(nullif(left(trim(coalesce(p_method, '')), 40), ''), 'Espèces'),
    format('Saisie Super Admin : %s mois, du %s au %s', p_months, to_char(v_start, 'DD/MM/YYYY'), to_char(v_next, 'DD/MM/YYYY')),
    now()
  )
  returning id into v_payment_id;

  return jsonb_build_object('payment_id', v_payment_id, 'period_start', v_start, 'next_billing_date', v_next);
end;
$$;
revoke all on function public.superadmin_record_station_payment(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.superadmin_record_station_payment(uuid, integer, integer, text, date) to authenticated;

-- Comptage partagé par l'aperçu et le vidage (mêmes règles, jamais divergentes).
create or replace function public.trial_data_counts_internal(p_station_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reservations', (select count(*) from public.reservations where station_id = p_station_id),
    'transactions', (select count(*) from public.transactions where station_id = p_station_id and method is distinct from 'PayDunya'),
    'expenses', (select count(*) from public.expenses where station_id = p_station_id),
    'shop_sales', (select count(*) from public.shop_sales where station_id = p_station_id),
    'shop_stock_movements', (select count(*) from public.shop_stock_movements where station_id = p_station_id),
    'shop_orders', (select count(*) from public.shop_orders where station_id = p_station_id and payment_method is distinct from 'PayDunya'),
    'attendance_records', (select count(*) from public.attendance_records where station_id = p_station_id),
    'client_subscriptions', (select count(*) from public.station_client_subscriptions where station_id = p_station_id),
    'vidange_bookings', (select count(*) from public.vidange_bookings where station_id = p_station_id and payment_method is distinct from 'PayDunya'),
    'reviews', (select count(*) from public.station_reviews where station_id = p_station_id),
    'products_with_stock', (select count(*) from public.shop_products where station_id = p_station_id and coalesce(stock, 0) <> 0)
  );
$$;
revoke all on function public.trial_data_counts_internal(uuid) from public, anon, authenticated;

create or replace function public.superadmin_trial_data_counts(p_station_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.';
  end if;
  select subscription_status into v_status from public.station_billing where station_id = p_station_id;
  if v_status is null then
    raise exception 'Station introuvable.';
  end if;
  return public.trial_data_counts_internal(p_station_id) || jsonb_build_object('subscription_status', v_status);
end;
$$;
revoke all on function public.superadmin_trial_data_counts(uuid) from public, anon;
grant execute on function public.superadmin_trial_data_counts(uuid) to authenticated;

create or replace function public.superadmin_purge_trial_data(p_station_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_counts jsonb;
begin
  if coalesce(public.app_role(), '') <> 'super_admin' then
    raise exception 'Réservé au Super Admin.';
  end if;
  select subscription_status into v_status from public.station_billing where station_id = p_station_id for update;
  if v_status is null then
    raise exception 'Station introuvable.';
  end if;
  if v_status not in ('essai', 'a_payer') then
    raise exception 'Cette station a un abonnement payé ou illimité : ses données ne sont plus des données d''essai.';
  end if;

  v_counts := public.trial_data_counts_internal(p_station_id);

  -- Enfants d'abord : avis et ventes pointent vers les transactions,
  -- mouvements de stock vers les ventes (clés « set null », mais autant
  -- ne rien laisser à moitié).
  delete from public.station_reviews where station_id = p_station_id;
  delete from public.shop_stock_movements where station_id = p_station_id;
  delete from public.shop_sales where station_id = p_station_id;
  delete from public.shop_orders where station_id = p_station_id and payment_method is distinct from 'PayDunya';
  update public.shop_products set stock = 0, updated_at = now() where station_id = p_station_id and coalesce(stock, 0) <> 0;
  delete from public.transactions where station_id = p_station_id and method is distinct from 'PayDunya';
  delete from public.reservations where station_id = p_station_id;
  delete from public.expenses where station_id = p_station_id;
  delete from public.attendance_records where station_id = p_station_id;
  delete from public.vidange_bookings where station_id = p_station_id and payment_method is distinct from 'PayDunya';
  -- Factures et relances partent avec l'abonnement (on delete cascade).
  delete from public.station_client_subscriptions where station_id = p_station_id;

  return v_counts;
end;
$$;
revoke all on function public.superadmin_purge_trial_data(uuid) from public, anon;
grant execute on function public.superadmin_purge_trial_data(uuid) to authenticated;

notify pgrst, 'reload schema';
