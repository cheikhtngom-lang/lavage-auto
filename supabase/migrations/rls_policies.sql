-- Création du bucket 'public' pour les fichiers publics (logos de station, cachets, etc.)
insert into storage.buckets (id, name, public) 
values ('public', 'public', true)
on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- Storage Row Level Security (Taille et Type)
-- ══════════════════════════════════════════════════════════════════════

-- Permettre à tout le monde de lire les fichiers publics
create policy "storage_public_select" on storage.objects for select
  using ( bucket_id = 'public' );

-- Permettre aux admins et super_admins d'insérer des fichiers (logos, cachets)
-- Limite stricte : Taille < 2 Mo (2097152 bytes) et Type MIME = image/*
create policy "storage_public_insert" on storage.objects for insert
  with check (
    bucket_id = 'public'
    and auth.uid() is not null
    and ((select role from public.profiles where id = auth.uid()) = 'admin' or (select role from public.profiles where id = auth.uid()) = 'super_admin')
    and (coalesce((metadata->>'size')::bigint, 0) < 2097152)
    and (metadata->>'mimetype' like 'image/%')
  );

-- Permettre la suppression / mise à jour
create policy "storage_public_update" on storage.objects for update
  using (
    bucket_id = 'public'
    and auth.uid() is not null
    and ((select role from public.profiles where id = auth.uid()) = 'admin' or (select role from public.profiles where id = auth.uid()) = 'super_admin')
  );

create policy "storage_public_delete" on storage.objects for delete
  using (
    bucket_id = 'public'
    and auth.uid() is not null
    and ((select role from public.profiles where id = auth.uid()) = 'admin' or (select role from public.profiles where id = auth.uid()) = 'super_admin')
  );
