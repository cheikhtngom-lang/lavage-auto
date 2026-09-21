-- ════════════════════════════════════════════════════════════════════════
--  Pompes à essence de la station (complète add_pompistes.sql)
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Une station qui vend du carburant déclare ses pompes (« Pompe 1 »,
--  « Gasoil », « Pompe B »…) dans Paramètres > Pompistes & pompes. Chaque
--  jour, on poste un pompiste sur l'une d'elles depuis la page Pompistes.
--
--  L'affectation reste un LIBELLÉ figé (employees.pump_label = pompe
--  habituelle, attendance_records.pump_label = pompe tenue ce jour-là) : un
--  relevé passé ne change donc jamais si on renomme ou retire une pompe plus
--  tard. « Retirer » une pompe la désactive (active = false) au lieu de la
--  supprimer, pour la même raison.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.station_pumps (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Deux pompes d'une même station ne portent pas le même nom (sans tenir compte
-- de la casse ni des espaces autour) : « Pompe B » et « pompe b » = la même.
create unique index if not exists station_pumps_station_name_uniq
  on public.station_pumps (station_id, lower(btrim(name)));
create index if not exists station_pumps_station_idx on public.station_pumps (station_id);

alter table public.station_pumps enable row level security;

-- Même règle que employees / attendance_records : gérées par LEUR station.
drop policy if exists "station_pumps_all" on public.station_pumps;
create policy "station_pumps_all" on public.station_pumps for all
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');
