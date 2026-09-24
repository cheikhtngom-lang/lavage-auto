-- Droits « Data API » (supabase-js / PostgREST) sur les tables du schéma public.
--
-- Contexte : à partir du 30 octobre 2026, Supabase n'accorde plus
-- automatiquement ces droits aux NOUVELLES tables de public. Les tables
-- existantes gardent les leurs : rien à faire pour la production actuelle.
-- Sans droit, une table est injoignable depuis l'application (« permission denied »).
--
-- RÈGLE POUR TOUTE NOUVELLE MIGRATION qui crée une table — ajouter juste après
-- le « create table » (et avant les policies RLS) :
--
--   alter table public.ma_table enable row level security;
--   grant select on public.ma_table to anon;
--   grant select, insert, update, delete on public.ma_table to authenticated;
--   grant select, insert, update, delete on public.ma_table to service_role;
--
-- (sans le « to anon » si la table n'a rien à montrer aux visiteurs non connectés).
-- Ce sont les policies RLS qui décident ensuite ligne par ligne : les droits ne
-- font qu'ouvrir la porte de la table.
--
-- Pourquoi « anon » en lecture seule : vérifié le 24/09/2026, aucune policy ne
-- laisse un visiteur non connecté écrire (les écritures anonymes, ex. le
-- formulaire Contact, passent par une Edge Function avec la clé service_role).
--
-- CE FICHIER : rattrapage idempotent pour une base reconstruite (nouveau projet,
-- branche de prévisualisation, « supabase db reset ») — à jouer APRÈS toutes les
-- migrations. Il n'ajoute que des droits, n'en retire aucun ; inutile sur la
-- production actuelle. Rejouable sans risque.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    -- Exceptions voulues, à garder alignées sur leur migration d'origine.
    if t.relname = 'group_discount_tiers' then
      -- add_group_volume_discount.sql : lecture pour les comptes connectés, écriture serveur seulement.
      execute format('grant select on public.%I to authenticated', t.relname);
    else
      execute format('grant select on public.%I to anon', t.relname);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
    end if;
    execute format('grant select, insert, update, delete on public.%I to service_role', t.relname);
  end loop;
end $$;
