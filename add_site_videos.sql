-- ═══════════════════════════════════════════════════════════════════════
-- Vidéos de la page de connexion / inscription (login.html)
--
-- Le Super Admin les envoie depuis Super Admin > Vidéos de connexion
-- (src/pages/SuperAdmin/SiteVideos.jsx) : pubs, présentation, témoignages…
-- La page de connexion les enchaîne dans l'ordre choisi (src/auth-videos.js).
--
-- Fichiers : bucket public « site-videos » (30 Mo par fichier ; vidéo MP4,
-- WebM ou MOV, et l'image de départ en JPEG/PNG/WebP prise dans la vidéo).
-- Lecture publique des seules vidéos actives ; envoi, modification et
-- suppression réservés au Super Admin. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.site_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  -- chemins dans le bucket site-videos (jamais une URL externe)
  video_path text not null check (video_path ~ '^[A-Za-z0-9/_.-]{1,200}$'),
  poster_path text check (poster_path is null or poster_path ~ '^[A-Za-z0-9/_.-]{1,200}$'),
  placement text not null default 'connexion' check (placement in ('connexion')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_videos_placement_idx on public.site_videos(placement, active, sort_order);

alter table public.site_videos enable row level security;

drop policy if exists site_videos_select on public.site_videos;
create policy site_videos_select on public.site_videos for select using (
  active or public.app_role() = 'super_admin'
);

drop policy if exists site_videos_write on public.site_videos;
create policy site_videos_write on public.site_videos for all
  using (public.app_role() = 'super_admin')
  with check (public.app_role() = 'super_admin');

-- Data API (obligatoire pour les nouvelles tables à partir du 30/10/2026,
-- voir supabase/data_api_grants.sql).
grant select on public.site_videos to anon;
grant select, insert, update, delete on public.site_videos to authenticated;
grant select, insert, update, delete on public.site_videos to service_role;

-- ─── Fichiers ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-videos', 'site-videos', true, 31457280,
        array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket public : la lecture des fichiers passe par l'URL publique, sans
-- règle. Toutes les autres opérations : Super Admin seulement.
drop policy if exists site_videos_files_super_admin on storage.objects;
create policy site_videos_files_super_admin on storage.objects for all to authenticated
  using (bucket_id = 'site-videos' and public.app_role() = 'super_admin')
  with check (bucket_id = 'site-videos' and public.app_role() = 'super_admin');
