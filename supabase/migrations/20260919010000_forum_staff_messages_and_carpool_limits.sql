-- Trois défauts trouvés par le test de bout en bout du forum et du covoiturage (voir CLAUDE.md).

-- 1. Les messages écrits par le staff ne pouvaient pas être publiés : forum_messages n'avait qu'une
-- policy SELECT pour le staff. Le staff peut maintenant écrire, modifier et supprimer UNIQUEMENT ses
-- propres messages (author_kind = 'staff') — jamais ceux des parents : un upsert de publication qui
-- viserait par erreur l'identifiant d'un message de parent échoue au lieu d'en changer l'auteur.
create policy forum_messages_staff_insert on forum_messages for insert
  with check (is_staff() and author_kind = 'staff');
create policy forum_messages_staff_update on forum_messages for update
  using (is_staff() and author_kind = 'staff') with check (is_staff() and author_kind = 'staff');
create policy forum_messages_staff_delete on forum_messages for delete
  using (is_staff() and author_kind = 'staff');

-- 2. Covoiturage : un même enfant ne peut être inscrit qu'une fois par offre.
alter table carpool_passengers add constraint carpool_passengers_offer_player_key unique (offer_id, player_id);

-- 3. Covoiturage : la limite de places n'était contrôlée que par l'écran. Le verrou sur la ligne de
-- l'offre sérialise les inscriptions simultanées : deux parents ne peuvent pas prendre la dernière place.
create or replace function enforce_carpool_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_seats int; v_taken int;
begin
  select seats_total into v_seats from carpool_offers where id = new.offer_id for update;
  if v_seats is null then
    return new;
  end if;
  select count(*) into v_taken from carpool_passengers where offer_id = new.offer_id;
  if v_taken >= v_seats then
    raise exception 'Offre de covoiturage complète';
  end if;
  return new;
end;
$$;
create trigger carpool_passengers_capacity before insert on carpool_passengers
  for each row execute function enforce_carpool_capacity();

-- 4. Durcissement voisin : la policy d'insertion ne vérifiait que parent_id. Un parent pouvait donc
-- inscrire n'importe quel enfant, ou s'inscrire sur l'offre d'une autre équipe s'il en connaissait
-- l'identifiant. Il ne peut désormais inscrire que ses enfants liés, sur les offres de leur équipe.
drop policy carpool_passengers_insert_own on carpool_passengers;
create policy carpool_passengers_insert_own on carpool_passengers for insert with check (
  parent_id = auth.uid()
  and (player_id is null or player_id in (select player_id from parent_player_links where parent_id = auth.uid()))
  and exists (
    select 1 from carpool_offers o
    join players p on p.team_id = o.team_id and p.season_id = o.season_id
    join parent_player_links l on l.player_id = p.id and l.parent_id = auth.uid()
    where o.id = carpool_passengers.offer_id
  )
);
