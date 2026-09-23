-- Un pistolet ne sert qu'à un pompiste EN SERVICE à la fois.
--
-- Règle (demandée le 23 septembre 2026) : tant que le pompiste qui tient
-- « Essence 1 » n'a pas fait sa descente, ce pistolet ne peut pas être donné à
-- un autre pompiste en service. Dès la descente, il est libre : le pompiste
-- suivant peut le prendre (relais dans la journée). Le pompiste descendu garde
-- le pistolet sur SA ligne du jour, pour son relevé.
--
-- « En service » = présent, arrivée pointée, pas encore descendu
-- (attendance_records : daily_status 'present', clock_in_at renseigné,
-- clock_out_at vide). La page Pompistes applique déjà la règle ; ce trigger
-- la garantit aussi en base (deux appareils en même temps, onglet périmé…).
--
-- Vérifié quand la ligne entre en service (arrivée, « Reprendre service ») :
-- tous ses pistolets ; quand seuls ses pistolets changent : les pistolets
-- ajoutés. Corriger la ligne d'un pompiste déjà descendu reste libre.
-- À jouer après add_pump_nozzles.sql. Rejouable sans risque.

create or replace function public.attendance_nozzle_exclusive()
returns trigger
language plpgsql as $$
declare
  v_checked text[];
  v_label text;
  v_holder text;
begin
  -- Ligne qui n'est pas (ou plus) en service : rien à vérifier.
  if new.pump_nozzles is null or cardinality(new.pump_nozzles) = 0
     or new.daily_status is distinct from 'present' or new.clock_in_at is null or new.clock_out_at is not null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.daily_status is distinct from 'present' or old.clock_in_at is null or old.clock_out_at is not null then
    v_checked := new.pump_nozzles;                       -- entre en service : tout est vérifié
  elsif new.pump_nozzles is distinct from old.pump_nozzles then
    select coalesce(array_agg(l), '{}') into v_checked   -- seuls les pistolets ajoutés
      from unnest(new.pump_nozzles) l
     where not (l = any (coalesce(old.pump_nozzles, '{}')));
  else
    return new;
  end if;

  if cardinality(v_checked) = 0 then return new; end if;
  -- Deux appareils qui donnent le même pistolet au même instant : l'un attend l'autre.
  perform pg_advisory_xact_lock(hashtext('nozzle:' || new.station_id::text || ':' || new.work_date::text));

  foreach v_label in array v_checked loop
    select coalesce(o.name, 'un autre pompiste') into v_holder
      from public.attendance_records o
     where o.station_id = new.station_id
       and o.work_date = new.work_date
       and o.employee_id <> new.employee_id
       and o.daily_status = 'present'
       and o.clock_in_at is not null
       and o.clock_out_at is null
       and v_label = any (coalesce(o.pump_nozzles, '{}'))
     limit 1;
    if found then
      raise exception 'Le pistolet % est tenu par % jusqu''à sa descente.', v_label, v_holder
        using errcode = 'P0001', hint = 'nozzle_busy';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists attendance_nozzle_exclusive on public.attendance_records;
create trigger attendance_nozzle_exclusive
  before insert or update on public.attendance_records
  for each row execute function public.attendance_nozzle_exclusive();
