-- ══════════════════════════════════════════════════════════════════════
-- Reconnaissance d'un client habitué par plaque d'immatriculation — à
-- exécuter une fois dans l'éditeur SQL Supabase. Idempotent (peut être
-- rejoué sans risque : `create or replace function`).
--
-- Permet à une station de retrouver, à partir d'une plaque tapée dans le
-- formulaire "Ajouter un véhicule" (client de passage), le compte
-- automobiliste propriétaire de ce véhicule — pour relier automatiquement
-- la réservation à ce compte (client_id) au lieu d'un simple nom libre.
-- RLS sur `vehicles` interdit normalement à un admin de lire le véhicule
-- d'un autre (owner_id = auth.uid() uniquement) ; cette fonction
-- security definer expose donc seulement le strict nécessaire (nom,
-- catégorie, marque), jamais le téléphone/email, et seulement aux rôles
-- admin/super_admin.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.find_vehicle_owner(p_plate text)
returns table(owner_id uuid, owner_name text, vehicle_id uuid, category text, brand text)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.full_name, v.id, v.category, v.brand
  from public.vehicles v
  join public.profiles p on p.id = v.owner_id
  where public.app_role() in ('admin', 'super_admin')
    and p_plate is not null and length(trim(p_plate)) > 0
    and regexp_replace(upper(v.plate), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_plate), '[^A-Z0-9]', '', 'g')
  limit 1;
$$;

grant execute on function public.find_vehicle_owner(text) to authenticated;
