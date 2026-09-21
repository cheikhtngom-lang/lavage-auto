-- ════════════════════════════════════════════════════════════════════════
--  Verrou : seul le chef d'entreprise peut changer un collaborateur de station
--
--  À exécuter une fois dans Supabase > SQL Editor. Idempotent.
--
--  Règle métier : déplacer le Super Admin (ou tout collaborateur) d'une
--  station à une autre est une décision du PATRON du groupe, via
--  group_move_station_admin (add_group_move_admin.sql). Personne d'autre :
--  ni le propriétaire d'une station, ni le Super Admin de la station, ni le
--  Super Admin de la plateforme.
--
--  Les trois premiers étaient déjà bloqués (guard_profile_privileged_columns
--  + policies). Restait une brèche : la policy profiles_update laisse le Super
--  Admin de la plateforme modifier n'importe quel profil, et le verrou
--  l'exemptait — il aurait pu, en appelant l'API directement, rattacher un
--  compte à une autre station sans passer par le patron. Ce fichier la ferme.
--
--  La fonction group_move_station_admin, elle, n'est pas concernée : elle
--  s'exécute avec les droits de son propriétaire (current_user n'est alors ni
--  'authenticated' ni 'anon'), donc passe le verrou, mais elle vérifie
--  elle-même que l'appelant est le patron des deux stations.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if coalesce(public.app_role(), '') <> 'super_admin' then
      if new.role is distinct from old.role
         or new.station_id is distinct from old.station_id
         or new.is_group_owner is distinct from old.is_group_owner then
        raise exception 'Modification interdite : le rôle et la station d''un compte ne peuvent pas être changés depuis l''application.'
          using errcode = '42501';
      end if;
    elsif old.role = 'staff' and old.station_id is not null
          and new.station_id is not null and new.station_id is distinct from old.station_id then
      -- Le Super Admin de la plateforme garde tous ses autres droits sur les
      -- profils ; seul ce changement de station d'un collaborateur lui est retiré.
      raise exception 'Le changement de station d''un collaborateur est réservé au chef d''entreprise du groupe.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
