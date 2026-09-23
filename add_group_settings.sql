-- Paramètres de l'espace chef d'entreprise (offre Sur mesure) — /groupe/parametres.
--
-- organizations n'a volontairement AUCUNE policy UPDATE (statut, échéance et
-- quota IA ne se modifient que côté serveur ou par le Super Admin). Le patron
-- peut seulement renommer son entreprise, via cette fonction qui ne touche
-- qu'à la colonne `name` de SA propre organisation.
-- À lancer après add_sur_mesure_groups.sql. Rejouable sans risque.

create or replace function public.rename_my_organization(p_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_old text;
begin
  if length(v_name) = 0 then
    raise exception 'Le nom de l''entreprise est obligatoire.';
  end if;
  if length(v_name) > 80 then
    raise exception 'Le nom de l''entreprise ne doit pas dépasser 80 caractères.';
  end if;
  select name into v_old from public.organizations where owner_id = auth.uid() for update;
  if not found then
    raise exception 'Aucune entreprise rattachée à ce compte.' using errcode = '42501';
  end if;
  if v_old is distinct from v_name then
    update public.organizations set name = v_name where owner_id = auth.uid();
    insert into public.audit_log (actor, action)
    values ('Chef d''entreprise', 'Entreprise « ' || v_old || ' » renommée en « ' || v_name || ' »');
  end if;
  return v_name;
end;
$$;
revoke all on function public.rename_my_organization(text) from public, anon;
grant execute on function public.rename_my_organization(text) to authenticated;
