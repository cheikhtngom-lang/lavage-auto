-- ══════════════════════════════════════════════════════════════════════
-- Horaires du week-end (2026-09-27)
--
-- Jusqu'ici une station n'avait qu'un seul horaire (open_time / close_time)
-- valable du lundi au dimanche, alors que beaucoup ferment plus tôt ou plus
-- tard le week-end. open_time / close_time restent l'horaire des jours
-- ouvrables (lundi → vendredi) ; weekend_open_time / weekend_close_time,
-- facultatifs, s'appliquent le samedi et le dimanche. Vides = même horaire
-- toute la semaine (comportement d'avant, rien ne change pour les stations
-- existantes).
--
-- station_closing_at (liste d'attente avant fermeture, add_closing_waitlist.sql)
-- prend désormais l'horaire du bon jour, y compris la fin de nuit d'une plage
-- nocturne commencée la veille (ex. vendredi 20:00 → samedi 02:00).
--
-- À jouer APRÈS add_closing_waitlist.sql. Idempotent.
-- ══════════════════════════════════════════════════════════════════════

alter table public.stations add column if not exists weekend_open_time text;
alter table public.stations add column if not exists weekend_close_time text;

-- Les deux ou aucun : un horaire de week-end à moitié rempli n'a pas de sens.
alter table public.stations drop constraint if exists stations_weekend_hours_check;
alter table public.stations add constraint stations_weekend_hours_check
  check ((weekend_open_time is null) = (weekend_close_time is null));

-- Heure de fermeture qui s'applique à l'instant p_at (heure locale de la station).
create or replace function public.station_closing_at(p_station uuid, p_at timestamptz default now())
returns timestamptz
language plpgsql stable
set search_path = public
as $$
declare
  v_st public.stations%rowtype;
  v_tz text;
  v_local timestamp;
  v_date date;
  v_time time;
  v_open text;
  v_close text;
  v_o time;
  v_c time;
begin
  select * into v_st from public.stations where id = p_station;
  if v_st.id is null then return null; end if;
  v_tz := public.station_timezone(v_st.country);
  v_local := p_at at time zone v_tz;
  v_date := v_local::date;
  v_time := v_local::time;

  -- 1. Fin de nuit d'une plage nocturne commencée la veille.
  if extract(isodow from v_date - 1) in (6, 7) and v_st.weekend_close_time is not null then
    v_open := v_st.weekend_open_time; v_close := v_st.weekend_close_time;
  else
    v_open := v_st.open_time; v_close := v_st.close_time;
  end if;
  if v_open ~ '^\d{1,2}:\d{2}' and v_close ~ '^\d{1,2}:\d{2}' then
    v_o := v_open::time; v_c := v_close::time;
    if v_c <= v_o and v_time < v_c then
      return (v_date + v_c) at time zone v_tz;
    end if;
  end if;

  -- 2. Horaire du jour.
  if extract(isodow from v_date) in (6, 7) and v_st.weekend_close_time is not null then
    v_open := v_st.weekend_open_time; v_close := v_st.weekend_close_time;
  else
    v_open := v_st.open_time; v_close := v_st.close_time;
  end if;
  if v_close is null or v_close !~ '^\d{1,2}:\d{2}' then return null; end if;
  v_c := v_close::time;
  v_o := case when v_open ~ '^\d{1,2}:\d{2}' then v_open::time end;
  if v_o is not null and v_c <= v_o and v_time >= v_o then
    return (v_date + 1 + v_c) at time zone v_tz;  -- plage nocturne : ferme le lendemain
  end if;
  return (v_date + v_c) at time zone v_tz;
end;
$$;
