-- ══════════════════════════════════════════════════════════════════════
-- Verrou serveur sur les colonnes image en base64 (logo/cachet station,
-- photo de profil, visuel de publicité) — à exécuter une fois dans
-- l'éditeur SQL Supabase. Idempotent (vérifie pg_constraint avant d'ajouter).
--
-- Aujourd'hui, la limite "1,5 Mo / JPG-PNG-WEBP" n'est vérifiée QUE côté
-- navigateur (voir Client/Settings.jsx, Admin/Settings.jsx, lib/ads.js) —
-- entièrement contournable en appelant l'API Supabase directement avec son
-- propre token. Ces contraintes ajoutent un vrai plancher côté base :
--   - format : la valeur doit être un data URL "data:image/..." reconnu
--   - taille : ~2,2 Mo de texte base64 (= 1,5 Mo binaire + marge d'encodage)
--
-- `not valid` : n'exige pas que les lignes déjà en base respectent la
-- contrainte (pas de risque d'échec si une image existante dépasse déjà la
-- limite) — seules les nouvelles écritures sont bloquées à partir de
-- maintenant. Retirer `not valid` plus tard (VALIDATE CONSTRAINT) si besoin
-- de vérifier aussi les données existantes.
-- ══════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stations_logo_url_format') then
    alter table public.stations add constraint stations_logo_url_format
      check (logo_url is null or logo_url ~ '^data:image/(png|jpe?g|webp|gif);base64,') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stations_logo_url_size') then
    alter table public.stations add constraint stations_logo_url_size
      check (logo_url is null or length(logo_url) <= 2200000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stations_cachet_url_format') then
    alter table public.stations add constraint stations_cachet_url_format
      check (cachet_url is null or cachet_url ~ '^data:image/(png|jpe?g|webp|gif);base64,') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stations_cachet_url_size') then
    alter table public.stations add constraint stations_cachet_url_size
      check (cachet_url is null or length(cachet_url) <= 2200000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_photo_url_format') then
    alter table public.profiles add constraint profiles_photo_url_format
      check (photo_url is null or photo_url ~ '^data:image/(png|jpe?g|webp|gif);base64,') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_photo_url_size') then
    alter table public.profiles add constraint profiles_photo_url_size
      check (photo_url is null or length(photo_url) <= 2200000) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'station_ads_image_url_format') then
    alter table public.station_ads add constraint station_ads_image_url_format
      check (image_url is null or image_url ~ '^data:image/(png|jpe?g|webp|gif);base64,') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'station_ads_image_url_size') then
    alter table public.station_ads add constraint station_ads_image_url_size
      check (image_url is null or length(image_url) <= 2200000) not valid;
  end if;
end $$;
