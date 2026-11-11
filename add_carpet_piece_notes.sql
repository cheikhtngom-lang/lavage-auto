-- ══════════════════════════════════════════════════════════════════════
-- Tapis : prix, taille et note PAR PIÈCE, et notes internes à l'abri du client.
--
-- 1. Chaque pièce déposée est une entrée de carpet_orders.items :
--    { "id", "kind", "qty": 1, "size", "price" }. Le prix total
--    (carpet_orders.amount) est la somme des prix, calculée par l'écran.
--    Type, taille et prix sont visibles par le client (message WhatsApp, lien
--    de suivi, « Mes tapis ») : c'est voulu. Aucune colonne à ajouter.
--
-- 2. Les notes internes (celle du dépôt et celle de chaque pièce) quittent
--    carpet_orders : la règle RLS « client_id = auth.uid() » y ouvre au client
--    sa ligne ENTIÈRE, donc il pouvait lire la note par l'API. Elles vont dans
--    carpet_order_notes, que seule la station lit.
--
-- À exécuter après add_carpet_cleaning.sql. Ré-exécutable sans risque.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.carpet_order_notes (
  order_id uuid primary key references public.carpet_orders(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  -- Note du dépôt entier.
  note text,
  -- Note de chaque pièce : { "<id de la pièce>": "tache de café" }.
  piece_notes jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists carpet_order_notes_station_idx on public.carpet_order_notes (station_id);

alter table public.carpet_order_notes enable row level security;

drop policy if exists "carpet_order_notes_select" on public.carpet_order_notes;
create policy "carpet_order_notes_select" on public.carpet_order_notes for select
  using (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "carpet_order_notes_insert" on public.carpet_order_notes;
create policy "carpet_order_notes_insert" on public.carpet_order_notes for insert
  with check (
    station_id = current_station_id()
    and exists (select 1 from public.carpet_orders c where c.id = order_id and c.station_id = current_station_id())
  );
drop policy if exists "carpet_order_notes_update" on public.carpet_order_notes;
create policy "carpet_order_notes_update" on public.carpet_order_notes for update
  using (station_id = current_station_id() or app_role() = 'super_admin')
  with check (station_id = current_station_id() or app_role() = 'super_admin');
drop policy if exists "carpet_order_notes_delete" on public.carpet_order_notes;
create policy "carpet_order_notes_delete" on public.carpet_order_notes for delete
  using (station_id = current_station_id() or app_role() = 'super_admin');

-- Reprise des notes déjà saisies, puis effacement dans carpet_orders.
insert into public.carpet_order_notes (order_id, station_id, note)
  select id, station_id, note from public.carpet_orders where note is not null and trim(note) <> ''
  on conflict (order_id) do update set note = excluded.note, updated_at = now();
update public.carpet_orders set note = null where note is not null;
comment on column public.carpet_orders.note is 'Obsolète : les notes internes sont dans carpet_order_notes (lisibles par la station seule).';

-- Temps réel : un autre poste de la station voit la note modifiée.
do $$
begin
  begin
    alter publication supabase_realtime add table public.carpet_order_notes;
  exception when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
