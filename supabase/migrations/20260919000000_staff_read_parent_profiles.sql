-- L'écran staff « Parents liés » (listPlayerLinks, src/lib/portalSync.js) affiche l'email des parents
-- liés à un joueur. parent_profiles n'avait de policy SELECT que pour le parent lui-même : le staff
-- ne pouvait lire que sa propre ligne, jamais celles des autres parents.

create policy parent_profiles_staff_select on parent_profiles for select using (is_staff());
