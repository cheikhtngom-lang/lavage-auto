-- ════════════════════════════════════════════════════════════════════════
--  Pistolets des pompes (complète add_pompistes.sql + add_station_pumps.sql)
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Une pompe (« Pompe A », « Pompe B »…) porte des PISTOLETS : Essence 1,
--  Gasoil 1, Essence 2, Gasoil 2… Le gérant coche, pour chaque pompe, ceux
--  qu'elle a (parfois seulement Essence 1 + Gasoil 1) : la numérotation est
--  celle de la station (Essence 3 et 4 sur la Pompe B si la Pompe A a 1 et 2).
--  Un pistolet appartient à UNE seule pompe.
--
--  Chaque jour, on poste un pompiste sur une pompe ET on coche les pistolets
--  qu'il tient (« Cheikh → Pompe A, Essence 1 + Gasoil 4 ») :
--    · attendance_records.pump_nozzles = libellés des pistolets tenus ce jour-là
--    · attendance_records.pump_lines   = relevé de fin de journée PAR pistolet
--                                        [{label, fuel, liters, amount}]
--  Ce sont des LIBELLÉS figés, comme pump_label : renommer, déplacer ou décocher
--  un pistolet plus tard ne réécrit jamais un relevé passé.
--
--  Les colonnes liters / amount_collected existantes restent le TOTAL du
--  relevé (Excel, récap, stations sans pistolets). Quand pump_lines est
--  renseigné, un trigger les recalcule depuis les lignes : total et détail ne
--  peuvent donc pas diverger.
-- ════════════════════════════════════════════════════════════════════════

-- Clé cible de la clé étrangère composite : un pistolet ne peut pas pointer sur
-- la pompe d'une AUTRE station.
create unique index if not exists station_pumps_id_station_uniq
  on public.station_pumps (id, station_id);

create table if not exists public.pump_nozzles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  pump_id uuid not null,
  fuel text not null check (fuel in ('essence', 'gasoil')),
  number integer not null check (number between 1 and 99),
  created_at timestamptz not null default now(),
  constraint pump_nozzles_pump_fk
    foreign key (pump_id, station_id) references public.station_pumps (id, station_id) on delete cascade,
  -- « Essence 3 » n'existe qu'une fois par station (donc sur une seule pompe).
  constraint pump_nozzles_station_fuel_number_uniq unique (station_id, fuel, number)
);

create index if not exists pump_nozzles_pump_idx on public.pump_nozzles (pump_id);

alter table public.pump_nozzles enable row level security;

-- Même règle que station_pumps : gérés par LEUR station.
drop policy if exists "pump_nozzles_all" on public.pump_nozzles;
create policy "pump_nozzles_all" on public.pump_nozzles for all
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');

-- ─── Affectation et relevé par pistolet, sur la ligne (pompiste, jour) ──
alter table public.attendance_records
  add column if not exists pump_nozzles text[],
  add column if not exists pump_lines jsonb;

do $$
begin
  begin
    alter table public.attendance_records
      add constraint attendance_pump_nozzles_len check (pump_nozzles is null or cardinality(pump_nozzles) <= 60);
  exception when duplicate_object then null;
  end;
  begin
    alter table public.attendance_records
      add constraint attendance_pump_lines_shape
      check (pump_lines is null or (jsonb_typeof(pump_lines) = 'array' and jsonb_array_length(pump_lines) <= 60));
  exception when duplicate_object then null;
  end;
end $$;

-- ─── Total = somme des lignes ──────────────────────────────────────────
-- Valide chaque ligne (carburant connu, libellé court, litres/montant positifs
-- et bornés) puis réécrit liters et amount_collected depuis les lignes. Sans
-- pump_lines (station sans pistolets), le total saisi à la main est laissé tel quel.
create or replace function public.attendance_sync_pump_lines()
returns trigger
language plpgsql
as $$
declare
  e jsonb;
  v_l numeric;
  v_a numeric;
  v_liters numeric;
  v_amount numeric;
begin
  if new.pump_lines is null then
    return new;
  end if;

  -- Le trigger passe AVANT la contrainte CHECK : on refuse ici, proprement, ce qui n'est pas un tableau.
  if jsonb_typeof(new.pump_lines) <> 'array' then
    raise exception 'pump_lines doit etre un tableau.' using errcode = '23514';
  end if;

  if jsonb_array_length(new.pump_lines) = 0 then
    new.pump_lines := null;
    return new;
  end if;

  for e in select * from jsonb_array_elements(new.pump_lines) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(btrim(e->>'label'), '') = ''
       or char_length(e->>'label') > 40
       or coalesce(e->>'fuel', '') not in ('essence', 'gasoil') then
      raise exception 'Ligne de relevé invalide (libellé ou carburant).' using errcode = '22023';
    end if;

    v_l := null;
    v_a := null;
    if jsonb_typeof(e->'liters') = 'number' then v_l := (e->>'liters')::numeric; end if;
    if jsonb_typeof(e->'amount') = 'number' then v_a := (e->>'amount')::numeric; end if;
    if v_l is not null and (v_l < 0 or v_l > 99999999) then
      raise exception 'Litres invalides pour %.', e->>'label' using errcode = '22003';
    end if;
    if v_a is not null and (v_a < 0 or v_a > 2000000000 or v_a <> trunc(v_a)) then
      raise exception 'Montant invalide pour %.', e->>'label' using errcode = '22003';
    end if;

    if v_l is not null then v_liters := coalesce(v_liters, 0) + v_l; end if;
    if v_a is not null then v_amount := coalesce(v_amount, 0) + v_a; end if;
  end loop;

  new.liters := case when v_liters is null then null else round(v_liters, 2) end;
  new.amount_collected := v_amount::integer;
  return new;
end;
$$;

drop trigger if exists attendance_sync_pump_lines on public.attendance_records;
create trigger attendance_sync_pump_lines
  before insert or update of pump_lines, liters, amount_collected on public.attendance_records
  for each row execute function public.attendance_sync_pump_lines();
