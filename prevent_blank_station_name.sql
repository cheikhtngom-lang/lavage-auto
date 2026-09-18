-- ══════════════════════════════════════════════════════════════════════
-- Interdit un nom de station vide (garde-fou côté base). À exécuter une fois
-- dans l'éditeur SQL Supabase, APRÈS le déploiement du code qui refuse déjà
-- les noms vides côté application (sinon un enregistrement de profil avec un
-- nom vidé échouerait en silence, avec tous les autres champs de la requête).
--
-- Contexte : la station « Baye Lavage » (id 752523ac-…) avait un nom vide en
-- base, donc l'espace station affichait « ⚙️ Configurer » à la place de son
-- nom et l'ancienne liste de stations Super Admin avait une ligne blanche.
-- Le nom a été rétabli à la main ; ce script empêche que ça se reproduise.
--
-- Idempotent : peut être rejoué sans risque.
-- ══════════════════════════════════════════════════════════════════════

-- Filet de sécurité : si un autre nom vide apparaissait avant l'exécution,
-- on le remplace (nom du gérant, sinon libellé neutre) pour que la contrainte
-- puisse être validée. Aucun effet quand tous les noms sont déjà renseignés.
update public.stations
   set name = coalesce(nullif(btrim(owner_name), ''), 'Station sans nom')
 where btrim(coalesce(name, '')) = '';

alter table public.stations drop constraint if exists stations_name_not_blank;
alter table public.stations add constraint stations_name_not_blank check (btrim(name) <> '');
