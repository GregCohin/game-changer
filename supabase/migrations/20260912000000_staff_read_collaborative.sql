-- pullPortalUpdates (src/lib/portalSync.js) lit player_journal_entries, carpool_passengers et
-- forum_messages depuis la session STAFF — mais ces trois tables n'avaient de policy SELECT que
-- pour le parent auteur de chaque ligne, jamais pour le staff. Trouvé en testant le bouton
-- "Récupérer les nouveautés" en conditions réelles : il retournait silencieusement 0 résultat
-- malgré des lignes bien présentes en base (RLS bloquait, pas une histoire de timestamp).

create policy player_journal_staff_select on player_journal_entries for select using (is_staff());
create policy carpool_passengers_staff_select on carpool_passengers for select using (is_staff());
create policy forum_messages_staff_select on forum_messages for select using (is_staff());
