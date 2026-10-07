-- Sécurité du portail parent avant la première vague d'invitations (audit du 07/10/2026, points 4, 5 et 6).
-- Une migration déjà appliquée ne se réécrit jamais : celle-ci s'ajoute aux précédentes. Elle ne touche
-- ni aux colonnes des tables miroir ni à la fonction publish_snapshot.
--
--   0. staff_profiles n'avait PAS de row level security (voir plus bas) ; le rôle anon perd tout accès direct.
--   1. Codes d'invitation : format (8 à 16 caractères), expiration par défaut, compteur d'essais.
--   2. Liens parent <-> enfant : colonnes de suivi (le staff voit les nouveaux liens et peut les confirmer).
--   3. Liaison par code : réservée aux comptes connectés, erreur unique, essais limités.
--   4. Droit à l'effacement : un compte parent peut être supprimé (clés étrangères corrigées + fonction).
--   5. Forum et carnet de bord : un parent supprime ses propres messages et notes, le staff modère tout.
--   6. Ce que le client écrit n'est plus cru sur parole : signature, horodatage, longueurs.

-- ============ 0. staff_profiles et rôle anon ============

-- La reconstruction du 12/09 (20260912010000) a recréé staff_profiles avec sa policy SELECT mais sans
-- « enable row level security » (la migration d'origine l'avait) : la policy était donc ignorée et la table,
-- ouverte en lecture/écriture à tout compte connecté (qui pouvait s'inscrire comme staff) et en lecture/
-- suppression à un visiteur anonyme. Aucune policy d'écriture n'existe volontairement : un compte staff
-- s'ajoute à la main (éditeur SQL), jamais depuis l'API.
alter table staff_profiles enable row level security;

-- Le rôle anon (clé publique du bundle JavaScript) n'a besoin d'aucune table : connexion et inscription
-- passent par le service d'authentification, pas par l'API des tables. La RLS refuserait déjà la lecture,
-- mais une table oubliée (comme ci-dessus) redeviendrait ouverte : on retire aussi le droit lui-même, pour
-- les tables et séquences existantes et pour celles qui seront créées plus tard.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Fonctions : PostgreSQL rend toute nouvelle fonction exécutable par PUBLIC (donc par anon), et aucun réglage
-- par défaut propre au schéma public ne peut l'empêcher. Chaque fonction retire donc ce droit elle-même
-- (revoke all on function … from public, anon, puis grant à authenticated), comme ci-dessous. Les deux
-- fonctions plus anciennes, que personne n'appelle sans compte :
revoke all on function is_staff() from public, anon;
grant execute on function is_staff() to authenticated;
revoke all on function enforce_carpool_capacity() from public, anon;

-- ============ 1. Codes d'invitation ============

-- Les anciens codes (6 caractères, sans expiration, tirés avec Math.random) sont révoqués : aucune famille
-- réelle n'en a reçu, et ils se devinent bien plus vite que les nouveaux. À faire AVANT la contrainte de
-- format : une contrainte, même NOT VALID, refuse toute mise à jour d'une ligne qui la viole.
update player_invitation_codes set revoked = true where code !~ '^[A-HJ-NP-Z2-9]{8,16}$' and not revoked;

-- Expiration par défaut : 14 jours. Alphabet sans caractères ambigus (ni 0/O ni 1/I), 8 à 16 caractères
-- (le client en tire 10). NOT VALID : les anciens codes, déjà révoqués, ne bloquent pas la migration.
alter table player_invitation_codes alter column expires_at set default (now() + interval '14 days');
alter table player_invitation_codes drop constraint if exists player_invitation_codes_code_format;
alter table player_invitation_codes
  add constraint player_invitation_codes_code_format check (code ~ '^[A-HJ-NP-Z2-9]{8,16}$') not valid;

-- Compteur d'essais ratés par compte. Hors de portée de l'API : seule la fonction ci-dessous (propriétaire
-- de la table) y touche. Supprimé avec le compte.
create table if not exists invitation_code_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count int not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table invitation_code_attempts enable row level security;
revoke all on invitation_code_attempts from anon, authenticated;

-- ============ 2. Liens parent <-> enfant ============

-- Qui s'est lié, avec quel code, et le staff l'a-t-il vu ? reviewed_at vide = nouveau lien à vérifier
-- (alerte dans l'écran « Portail parent » côté staff : confirmer, ou défaire le lien).
alter table parent_player_links add column if not exists linked_via_code text;
alter table parent_player_links add column if not exists reviewed_at timestamptz;
-- Les liens qui existent déjà ont été vus par le staff avant ce mécanisme.
update parent_player_links set reviewed_at = linked_at where reviewed_at is null;

-- ============ 3. Liaison par code d'invitation ============

-- Lie le compte connecté à l'enfant du code. Renvoie la ligne du joueur, ou AUCUNE ligne quel que soit
-- le motif (code inconnu, révoqué, expiré, épuisé, mal formé) : aucune différence observable ne permet de
-- deviner un code valide. Seul un blocage temporaire (trop d'essais ratés, 6 en 15 minutes -> 30 minutes)
-- lève une erreur ; il ne dépend que de l'historique du compte, jamais du code saisi.
-- Une exception annulerait la transaction, donc l'essai raté ne serait pas compté : c'est pourquoi un échec
-- renvoie une liste vide au lieu de lever une erreur.
create or replace function redeem_invitation_code(p_code text)
returns table (player_id text, first_name text, last_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_row player_invitation_codes;
  v_att invitation_code_attempts;
  v_new_link int := 0;
  v_failed int;
  c_max_failures constant int := 6;
  c_window constant interval := interval '15 minutes';
  c_lock constant interval := interval '30 minutes';
begin
  if v_uid is null or not exists (select 1 from auth.users u where u.id = v_uid) then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;

  -- Une ligne par compte, verrouillée pour la durée de l'appel : deux requêtes simultanées du même compte
  -- passent l'une après l'autre et ne contournent donc pas la limite.
  insert into invitation_code_attempts (user_id) values (v_uid) on conflict do nothing;
  select * into v_att from invitation_code_attempts a where a.user_id = v_uid for update;

  if v_att.locked_until is not null and v_att.locked_until > now() then
    raise exception 'Trop d''essais. Réessaie dans quelques minutes.' using errcode = '54000';
  end if;

  -- Espaces, tirets et minuscules sont tolérés : « k7m2q-x9prt » vaut « K7M2QX9PRT ».
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code ~ '^[A-HJ-NP-Z2-9]{8,16}$' then
    select * into v_row from player_invitation_codes c
      where c.code = v_code
        and not c.revoked
        and (c.expires_at is null or c.expires_at > now())
        and c.use_count < c.max_uses
      for update;
  end if;

  if v_row.code is null then
    -- Essai raté : fenêtre de 15 minutes, blocage dès le sixième.
    if v_att.window_started_at < now() - c_window then
      v_failed := 1;
      update invitation_code_attempts a set failed_count = 1, window_started_at = now(), locked_until = null
        where a.user_id = v_uid;
    else
      v_failed := v_att.failed_count + 1;
      update invitation_code_attempts a
        set failed_count = v_failed,
            locked_until = case when v_failed >= c_max_failures then now() + c_lock else null end
        where a.user_id = v_uid;
    end if;
    return;
  end if;

  insert into parent_player_links (parent_id, player_id, linked_via_code)
    values (v_uid, v_row.player_id, v_row.code)
    on conflict do nothing;
  get diagnostics v_new_link = row_count;
  -- Un code ne compte que les nouveaux parents : se relier à un enfant déjà lié ne consomme rien.
  if v_new_link > 0 then
    update player_invitation_codes c set use_count = c.use_count + 1 where c.code = v_row.code;
  end if;

  update invitation_code_attempts a set failed_count = 0, window_started_at = now(), locked_until = null
    where a.user_id = v_uid;

  return query select p.id, p.first_name, p.last_name from players p where p.id = v_row.player_id;
end;
$$;
-- Sur Supabase, les fonctions du schéma public sont par défaut exécutables par anon : on retire ce droit.
revoke all on function redeem_invitation_code(text) from public, anon;
grant execute on function redeem_invitation_code(text) to authenticated;

-- ============ 4. Droit à l'effacement ============

-- Trois clés vers auth.users n'avaient pas d'ON DELETE : elles empêchaient de supprimer un compte parent.
-- Même chose pour carpool_passengers -> players. Les noms de contraintes sont cherchés plutôt que supposés.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'f'
      and (
        (c.confrelid = 'auth.users'::regclass
          and c.conrelid in ('forum_messages'::regclass, 'player_journal_entries'::regclass, 'carpool_passengers'::regclass))
        or (c.confrelid = 'players'::regclass and c.conrelid = 'carpool_passengers'::regclass)
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$$;
-- Messages et notes : le contenu peut survivre au compte (parent_id vide) ; la fonction delete_my_account
-- choisit de l'effacer ou non. Covoiturage : l'inscription n'a plus de sens sans le compte, elle part avec.
alter table forum_messages
  add constraint forum_messages_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete set null;
alter table player_journal_entries
  add constraint player_journal_entries_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete set null;
alter table carpool_passengers
  add constraint carpool_passengers_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete cascade;
-- Supprimer un joueur de la base ne doit pas être bloqué par ses inscriptions au covoiturage (le nom de
-- l'enfant y est recopié : elles partent avec lui).
alter table carpool_passengers
  add constraint carpool_passengers_player_id_fkey foreign key (player_id) references players(id) on delete cascade;

create index if not exists forum_messages_parent_id_idx on forum_messages (parent_id);
create index if not exists player_journal_entries_parent_id_idx on player_journal_entries (parent_id);
create index if not exists carpool_passengers_parent_id_idx on carpool_passengers (parent_id);

-- « Supprimer mon compte » : efface l'adresse e-mail (profil), le lien avec les enfants, les inscriptions au
-- covoiturage, la participation aux conversations privées et le compte lui-même. p_erase_content = true
-- (par défaut) efface aussi ses messages de forum et ses notes ; false les conserve sous « Ancien parent »,
-- sans plus aucun lien avec le compte. Refusé pour un compte staff (il se retirerait l'accès par erreur).
create or replace function delete_my_account(p_erase_content boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '28000';
  end if;
  if exists (select 1 from staff_profiles s where s.id = v_uid) then
    raise exception 'Un compte staff ne se supprime pas depuis le portail parent.' using errcode = '42501';
  end if;

  if coalesce(p_erase_content, true) then
    delete from forum_messages m where m.parent_id = v_uid;
    delete from player_journal_entries j where j.parent_id = v_uid;
  else
    update forum_messages m set author_name = 'Ancien parent' where m.parent_id = v_uid;
  end if;

  -- Cascade : parent_profiles, parent_player_links, forum_thread_participants, carpool_passengers,
  -- invitation_code_attempts. Set null : messages et notes conservés.
  delete from auth.users u where u.id = v_uid;
end;
$$;
revoke all on function delete_my_account(boolean) from public, anon;
grant execute on function delete_my_account(boolean) to authenticated;

-- ============ 5. Suppression et modération ============

-- Un parent supprime ses propres messages et notes. Le staff supprime ceux de n'importe qui (modération) ;
-- il ne pouvait jusqu'ici supprimer que les siens (0 ligne touchée pour un message de parent).
create policy forum_messages_delete_own on forum_messages for delete
  using (author_kind = 'parent' and parent_id = auth.uid());
drop policy if exists forum_messages_staff_delete on forum_messages;
create policy forum_messages_staff_delete on forum_messages for delete using (is_staff());

create policy player_journal_delete_own on player_journal_entries for delete using (parent_id = auth.uid());
create policy player_journal_staff_delete on player_journal_entries for delete using (is_staff());

create policy carpool_passengers_staff_delete on carpool_passengers for delete using (is_staff());

-- Covoiturage : un parent n'inscrit qu'un de ses enfants liés (player_id obligatoire : un passager sans
-- enfant n'était qu'un texte libre visible de toute l'équipe).
drop policy if exists carpool_passengers_insert_own on carpool_passengers;
create policy carpool_passengers_insert_own on carpool_passengers for insert with check (
  parent_id = auth.uid()
  and player_id is not null
  and player_id in (select l.player_id from parent_player_links l where l.parent_id = auth.uid())
  and exists (
    select 1 from carpool_offers o
    join players p on p.team_id = o.team_id and p.season_id = o.season_id
    join parent_player_links l on l.player_id = p.id and l.parent_id = auth.uid()
    where o.id = carpool_passengers.offer_id
  )
);

-- ============ 6. Ce que le client écrit n'est plus cru sur parole ============
-- Les déclencheurs ci-dessous ne s'appliquent qu'aux appels portant un compte connecté (auth.uid() non
-- vide) : le staff qui publie, l'éditeur SQL et les tests de service gardent la main sur les valeurs.

-- Signature d'un message de parent : « Parent de <prénom> » pour l'un de ses enfants liés. Ce que le client
-- envoie n'est gardé que s'il correspond à l'un d'eux (un parent de plusieurs enfants choisit lequel) ; une
-- signature « Coach … (Staff) » est remplacée. L'horodatage est celui du serveur.
create or replace function forum_messages_enforce_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_names text[];
begin
  if auth.uid() is null or new.author_kind <> 'parent' then
    return new;
  end if;
  select coalesce(array_agg(s.n order by s.linked_at), '{}') into v_names
  from (
    select 'Parent de ' || (regexp_split_to_array(btrim(p.first_name), '\s+'))[1] as n, l.linked_at
    from parent_player_links l
    join players p on p.id = l.player_id
    where l.parent_id = new.parent_id and btrim(p.first_name) <> ''
  ) s;
  if not (new.author_name = any (v_names)) then
    new.author_name := coalesce(v_names[1], 'Parent');
  end if;
  new.at := now();
  return new;
end;
$$;
drop trigger if exists forum_messages_enforce_author on forum_messages;
create trigger forum_messages_enforce_author before insert on forum_messages
  for each row execute function forum_messages_enforce_author();
revoke all on function forum_messages_enforce_author() from public, anon, authenticated;

-- Nom du passager : celui de l'enfant lié (tel qu'affiché jusqu'ici : prénom et nom). C'est ici qu'il suffirait
-- de changer une ligne pour n'afficher que « Prénom N. » aux autres familles, si le club le décide.
create or replace function carpool_passengers_enforce_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_name text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select btrim(p.first_name || ' ' || p.last_name) into v_name from players p where p.id = new.player_id;
  if v_name is not null and v_name <> '' then
    new.passenger_name := v_name;
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists carpool_passengers_enforce_name on carpool_passengers;
create trigger carpool_passengers_enforce_name before insert on carpool_passengers
  for each row execute function carpool_passengers_enforce_name();
revoke all on function carpool_passengers_enforce_name() from public, anon, authenticated;

-- Une note du carnet de bord est horodatée par le serveur : le curseur de « Récupérer les nouveautés »
-- (created_at) ne peut plus être faussé par une date antérieure.
create or replace function player_journal_entries_enforce_time()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists player_journal_entries_enforce_time on player_journal_entries;
create trigger player_journal_entries_enforce_time before insert on player_journal_entries
  for each row execute function player_journal_entries_enforce_time();
revoke all on function player_journal_entries_enforce_time() from public, anon, authenticated;

-- Nom affiché au staff pour un parent lié : l'adresse e-mail vérifiée par le lien magique, pas un texte
-- que le parent aurait choisi (le staff s'en sert pour confirmer ou défaire un lien).
create or replace function parent_profiles_enforce_display_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select u.email into new.display_name from auth.users u where u.id = new.id;
  return new;
end;
$$;
drop trigger if exists parent_profiles_enforce_display_name on parent_profiles;
create trigger parent_profiles_enforce_display_name before insert or update on parent_profiles
  for each row execute function parent_profiles_enforce_display_name();
revoke all on function parent_profiles_enforce_display_name() from public, anon, authenticated;

-- Longueurs maximales : messages de parents et notes 4 000 caractères, messages du staff 50 000 (publiés tels
-- qu'écrits dans le forum local), signatures 120, identifiants 100. Les lignes qui dépasseraient déjà sont
-- d'abord ramenées à la limite : une contrainte, même NOT VALID, s'applique à toute mise à jour d'une ligne
-- existante, y compris le « set null » en cascade quand son auteur supprime son compte — une ancienne ligne
-- trop longue aurait bloqué cet effacement. En pratique la table ne contient rien d'aussi long.
update forum_messages
  set content = left(content, case when author_kind = 'staff' then 50000 else 4000 end)
  where char_length(content) > case when author_kind = 'staff' then 50000 else 4000 end;
update forum_messages set author_name = left(author_name, 120) where char_length(author_name) > 120;
update player_journal_entries set content = left(content, 4000) where char_length(content) > 4000;
update carpool_passengers set passenger_name = left(passenger_name, 120) where char_length(passenger_name) > 120;
update parent_profiles set display_name = left(display_name, 320) where char_length(display_name) > 320;

alter table forum_messages drop constraint if exists forum_messages_content_len;
alter table forum_messages add constraint forum_messages_content_len
  check (char_length(content) <= (case when author_kind = 'staff' then 50000 else 4000 end));
alter table forum_messages drop constraint if exists forum_messages_author_name_len;
alter table forum_messages add constraint forum_messages_author_name_len check (char_length(author_name) <= 120);
alter table forum_messages drop constraint if exists forum_messages_id_len;
alter table forum_messages add constraint forum_messages_id_len check (char_length(id) <= 100);

alter table player_journal_entries drop constraint if exists player_journal_entries_content_len;
alter table player_journal_entries add constraint player_journal_entries_content_len check (char_length(content) <= 4000);
alter table player_journal_entries drop constraint if exists player_journal_entries_id_len;
alter table player_journal_entries add constraint player_journal_entries_id_len check (char_length(id) <= 100);

alter table carpool_passengers drop constraint if exists carpool_passengers_name_len;
alter table carpool_passengers add constraint carpool_passengers_name_len check (char_length(passenger_name) <= 120);

alter table parent_profiles drop constraint if exists parent_profiles_display_name_len;
alter table parent_profiles add constraint parent_profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 320);
