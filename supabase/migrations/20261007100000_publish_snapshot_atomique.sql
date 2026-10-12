-- Publication staff -> portail en UNE transaction (audit du 07/10/2026, points 2 et 3).
--
-- Avant : src/lib/portalSync.js enchaînait ~20 requêtes séparées (DELETE puis INSERT table par table).
-- Une erreur en cours de route (un titre manquant, une date vide, une clé étrangère) laissait le portail
-- à moitié vidé : certaines tables déjà remplacées, d'autres non. Après : une seule fonction SQL, donc
-- une seule transaction — tout est publié, ou rien ne change.
--
-- Contenu de cette migration :
--   1. quelques colonnes que le portail affiche désormais (heures des séances, dates et public des
--      événements du club) ;
--   2. la policy de lecture des événements du club, qui respecte maintenant leur public cible ;
--   3. la fonction publish_snapshot(jsonb).
-- Une migration déjà appliquée ne se réécrit jamais : celle-ci s'ajoute aux précédentes.

-- ============ 1. Colonnes ============

alter table sessions add column if not exists start_time text;
alter table sessions add column if not exists end_time text;

alter table club_events add column if not exists end_date date;
alter table club_events add column if not exists start_time text;
alter table club_events add column if not exists end_time text;
-- Équipes concernées par l'événement. Liste vide = tout le club. Le staff convoque des catégories ou
-- des équipes ; la publication traduit les catégories en identifiants d'équipes (tf_teams).
alter table club_events add column if not exists target_team_ids text[] not null default '{}';

-- ============ 2. Lecture des événements du club ============

-- Avant : tout parent lié à au moins un enfant lisait TOUS les événements. Maintenant : seulement ceux
-- qui concernent l'équipe d'un de ses enfants (ou tout le club). La vraie barrière reste la policy,
-- pas le composant : l'écran parent filtre aussi, mais ne s'y fie pas.
drop policy if exists club_events_select_any_linked_parent on club_events;
create policy club_events_select_targeted on club_events for select
  using (
    (
      cardinality(target_team_ids) = 0
      and exists (select 1 from parent_player_links where parent_id = auth.uid())
    )
    or exists (
      select 1 from parent_player_links l
      join players p on p.id = l.player_id
      where l.parent_id = auth.uid() and p.team_id = any (club_events.target_team_ids)
    )
  );

-- ============ 3. publish_snapshot ============

-- Appelée par le staff (supabase.rpc("publish_snapshot", { p_snapshot })) avec un objet JSON :
--   { team_id, season_id, players, development_goals, individual_programs, injuries, sessions, club_faq,
--     club_events, carpool_offers, competitions, fixtures, matches, match_stats, forum_threads,
--     forum_messages }
-- Chaque collection est OBLIGATOIRE (liste, éventuellement vide) : une clé oubliée par un client
-- n'efface donc jamais une table par accident. Les lignes ne portent pas team_id/season_id : c'est le
-- périmètre de l'objet qui s'applique (une ligne ne peut pas atterrir dans une autre équipe).
--
-- Mêmes règles qu'avant, maintenant dans une seule transaction :
--   - players, matches, match_stats, carpool_offers, forum_threads : UPSERT seulement. Leurs enfants
--     écrits par les parents (journal, passagers, messages) partent en cascade avec elles : un
--     delete-then-insert les effacerait.
--   - development_goals, individual_programs, injuries, sessions, club_faq, competitions/fixtures :
--     remplacées en bloc pour (équipe, saison) — elles n'ont aucun enfant collaboratif.
--   - club_events (club entier) : remplacée en entier.
--   - messages du staff : UPSERT, jamais ceux d'un parent.
--   - participants d'une conversation « individuelle » : figés à la première publication du sujet.
--
-- Sécurité : security INVOKER (la RLS reste une seconde barrière) + contrôle is_staff() en premier,
-- pour répondre « réservé au staff » plutôt qu'un échec de policy obscur.
--
-- Retour : { published_at, counts, skipped, parent_messages_ignored, individual_threads_without_parent }.
--   counts   : lignes écrites par table ;
--   skipped  : lignes reçues mais écartées (joueur absent de l'effectif envoyé, match ou sujet
--              introuvable) — le client valide déjà, c'est une double sécurité qui reste visible ;
--   parent_messages_ignored : messages reçus dont l'identifiant est déjà celui d'un message de parent
--              (attendu, sans conséquence : jamais écrasés) ;
--   individual_threads_without_parent : conversations « individuelles » que personne ne peut lire
--              parce qu'aucun parent n'était lié à leurs joueurs à la première publication.
create or replace function publish_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_team text;
  v_season text;
  v_key text;
  v_step text := 'initialisation';
  v_n int;
  v_in int;
  v_counts jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_roster text[];
  v_match_ids text[];
  v_thread_ids text[];
  v_existing_threads text[];
  v_orphans jsonb;
  v_parent_msgs int := 0;
  v_detail text;
  v_hint text;
begin
  if not is_staff() then
    raise exception 'Publication réservée au staff : ce compte n''est pas reconnu comme staff.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'Publication invalide : un objet JSON est attendu.' using errcode = '22023';
  end if;
  v_team := nullif(btrim(p_snapshot ->> 'team_id'), '');
  v_season := nullif(btrim(p_snapshot ->> 'season_id'), '');
  if v_team is null or v_season is null then
    raise exception 'Publication invalide : team_id et season_id sont obligatoires.' using errcode = '22023';
  end if;
  foreach v_key in array array[
    'players', 'development_goals', 'individual_programs', 'injuries', 'sessions', 'club_faq',
    'club_events', 'carpool_offers', 'competitions', 'fixtures', 'matches', 'match_stats',
    'forum_threads', 'forum_messages'
  ] loop
    if jsonb_typeof(p_snapshot -> v_key) is distinct from 'array' then
      raise exception 'Publication invalide : « % » doit être une liste (éventuellement vide).', v_key
        using errcode = '22023';
    end if;
  end loop;
  -- Garde-fou : publier un effectif vide viderait goals/programmes/blessures/séances/FAQ/matchs du
  -- portail. Cas typique : un navigateur neuf, sans les données locales du staff.
  if jsonb_array_length(p_snapshot -> 'players') = 0 then
    raise exception 'Effectif vide : rien à publier (sur un navigateur neuf, restaure d''abord la sauvegarde).'
      using errcode = '22023';
  end if;

  -- Deux publications simultanées du même périmètre (deux onglets, double clic) s'exécutent l'une
  -- après l'autre, jamais entremêlées.
  perform pg_advisory_xact_lock(hashtext('publish_snapshot:' || v_team || ':' || v_season));

  begin
    v_roster := array(
      select distinct x.id from jsonb_to_recordset(p_snapshot -> 'players') as x(id text) where x.id is not null
    );
    v_match_ids := array(
      select distinct x.id from jsonb_to_recordset(p_snapshot -> 'matches') as x(id text) where x.id is not null
    );
    v_thread_ids := array(
      select distinct x.id from jsonb_to_recordset(p_snapshot -> 'forum_threads') as x(id text) where x.id is not null
    );

    -- ---- Joueurs et matchs d'abord : les autres tables les référencent par clé étrangère ----

    v_step := 'players';
    insert into players (id, team_id, season_id, first_name, last_name, position, updated_at)
      select distinct on (x.id) x.id, v_team, v_season, x.first_name, x.last_name, nullif(x."position", ''), now()
      from jsonb_to_recordset(p_snapshot -> 'players') as x(id text, first_name text, last_name text, "position" text)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id,
      first_name = excluded.first_name, last_name = excluded.last_name,
      position = excluded.position, updated_at = excluded.updated_at;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('players', v_n);

    v_step := 'matches';
    insert into matches (id, team_id, season_id, name, date, closed)
      select distinct on (x.id) x.id, v_team, v_season, nullif(x.name, ''), nullif(x.date, '')::date, coalesce(x.closed, true)
      from jsonb_to_recordset(p_snapshot -> 'matches') as x(id text, name text, date text, closed boolean)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id,
      name = excluded.name, date = excluded.date, closed = excluded.closed;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('matches', v_n);

    -- ---- Remplacement en bloc pour (équipe, saison) ----
    -- « on conflict » : si un même identifiant existait sous un autre périmètre (donnée dupliquée par
    -- une restauration), la ligne est déplacée au lieu de faire échouer toute la publication.

    v_step := 'development_goals';
    delete from development_goals where team_id = v_team and season_id = v_season;
    insert into development_goals (id, player_id, team_id, season_id, label, status, updated_at)
      select distinct on (x.id) x.id, x.player_id, v_team, v_season, x.label, nullif(x.status, ''), now()
      from jsonb_to_recordset(p_snapshot -> 'development_goals') as x(id text, player_id text, label text, status text)
      where x.player_id = any (v_roster)
      order by x.id
    on conflict (id) do update set
      player_id = excluded.player_id, team_id = excluded.team_id, season_id = excluded.season_id,
      label = excluded.label, status = excluded.status, updated_at = excluded.updated_at;
    get diagnostics v_n = row_count;
    v_in := jsonb_array_length(p_snapshot -> 'development_goals');
    v_counts := v_counts || jsonb_build_object('development_goals', v_n);
    if v_n < v_in then v_skipped := v_skipped || jsonb_build_object('development_goals', v_in - v_n); end if;

    v_step := 'individual_programs';
    delete from individual_programs where team_id = v_team and season_id = v_season;
    insert into individual_programs (id, player_id, team_id, season_id, title, content, updated_at)
      select distinct on (x.id) x.id, x.player_id, v_team, v_season, x.title, coalesce(x.content, '{}'::jsonb), now()
      from jsonb_to_recordset(p_snapshot -> 'individual_programs') as x(id text, player_id text, title text, content jsonb)
      where x.player_id = any (v_roster)
      order by x.id
    on conflict (id) do update set
      player_id = excluded.player_id, team_id = excluded.team_id, season_id = excluded.season_id,
      title = excluded.title, content = excluded.content, updated_at = excluded.updated_at;
    get diagnostics v_n = row_count;
    v_in := jsonb_array_length(p_snapshot -> 'individual_programs');
    v_counts := v_counts || jsonb_build_object('individual_programs', v_n);
    if v_n < v_in then v_skipped := v_skipped || jsonb_build_object('individual_programs', v_in - v_n); end if;

    -- Statut RTP seulement : jamais de diagnostic ni de champ clinique (le client n'en envoie pas, et la
    -- table n'a de toute façon aucune colonne pour en recevoir).
    v_step := 'injuries';
    delete from injuries where team_id = v_team and season_id = v_season;
    insert into injuries (id, player_id, team_id, season_id, status, rtp_stage, updated_at)
      select distinct on (x.id) x.id, x.player_id, v_team, v_season, x.status, nullif(x.rtp_stage, ''), now()
      from jsonb_to_recordset(p_snapshot -> 'injuries') as x(id text, player_id text, status text, rtp_stage text)
      where x.player_id = any (v_roster)
      order by x.id
    on conflict (id) do update set
      player_id = excluded.player_id, team_id = excluded.team_id, season_id = excluded.season_id,
      status = excluded.status, rtp_stage = excluded.rtp_stage, updated_at = excluded.updated_at;
    get diagnostics v_n = row_count;
    v_in := jsonb_array_length(p_snapshot -> 'injuries');
    v_counts := v_counts || jsonb_build_object('injuries', v_n);
    if v_n < v_in then v_skipped := v_skipped || jsonb_build_object('injuries', v_in - v_n); end if;

    v_step := 'sessions';
    delete from sessions where team_id = v_team and season_id = v_season;
    insert into sessions (id, team_id, season_id, date, label, start_time, end_time, updated_at)
      select distinct on (x.id) x.id, v_team, v_season, nullif(x.date, '')::date, nullif(x.label, ''),
             nullif(x.start_time, ''), nullif(x.end_time, ''), now()
      from jsonb_to_recordset(p_snapshot -> 'sessions') as x(id text, date text, label text, start_time text, end_time text)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id, date = excluded.date, label = excluded.label,
      start_time = excluded.start_time, end_time = excluded.end_time, updated_at = excluded.updated_at;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('sessions', v_n);

    v_step := 'club_faq';
    delete from club_faq where team_id = v_team and season_id = v_season;
    insert into club_faq (id, team_id, season_id, question, answer)
      select distinct on (x.id) x.id, v_team, v_season, x.question, x.answer
      from jsonb_to_recordset(p_snapshot -> 'club_faq') as x(id text, question text, answer text)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id, question = excluded.question, answer = excluded.answer;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('club_faq', v_n);

    -- Les rencontres partent en cascade avec leur compétition : on remplace les deux ensemble.
    v_step := 'competitions';
    delete from fixtures where team_id = v_team and season_id = v_season;
    delete from competitions where team_id = v_team and season_id = v_season;
    insert into competitions (id, team_id, season_id, name)
      select distinct on (x.id) x.id, v_team, v_season, x.name
      from jsonb_to_recordset(p_snapshot -> 'competitions') as x(id text, name text)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id, name = excluded.name;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('competitions', v_n);

    v_step := 'fixtures';
    insert into fixtures (id, competition_id, team_id, season_id, date, opponent, location)
      select distinct on (x.id) x.id, nullif(x.competition_id, ''), v_team, v_season, nullif(x.date, '')::date,
             nullif(x.opponent, ''), nullif(x.location, '')
      from jsonb_to_recordset(p_snapshot -> 'fixtures') as x(id text, competition_id text, date text, opponent text, location text)
      order by x.id
    on conflict (id) do update set
      competition_id = excluded.competition_id, team_id = excluded.team_id, season_id = excluded.season_id,
      date = excluded.date, opponent = excluded.opponent, location = excluded.location;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('fixtures', v_n);

    -- Événements du club : table commune à toutes les équipes, remplacée en entier. Le « where » du
    -- delete évite le refus « DELETE requires a WHERE clause » de pg_safeupdate côté PostgREST.
    v_step := 'club_events';
    delete from club_events where id is not null;
    insert into club_events (id, title, date, end_date, start_time, end_time, location, target_team_ids)
      select distinct on (x.id) x.id, x.title, nullif(x.date, '')::date, nullif(x.end_date, '')::date,
             nullif(x.start_time, ''), nullif(x.end_time, ''), nullif(x.location, ''),
             array(select jsonb_array_elements_text(coalesce(x.target_team_ids, '[]'::jsonb)))
      from jsonb_to_recordset(p_snapshot -> 'club_events')
        as x(id text, title text, date text, end_date text, start_time text, end_time text, location text, target_team_ids jsonb)
      order by x.id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('club_events', v_n);

    -- ---- Upsert seulement : tables dont les enfants sont écrits par les parents ----

    v_step := 'match_stats';
    insert into match_stats (match_id, player_id, buts, passes_decisives, highlights)
      select distinct on (x.match_id, x.player_id) x.match_id, x.player_id, coalesce(x.buts, 0),
             coalesce(x.passes_decisives, 0), coalesce(x.highlights, '[]'::jsonb)
      from jsonb_to_recordset(p_snapshot -> 'match_stats')
        as x(match_id text, player_id text, buts int, passes_decisives int, highlights jsonb)
      where x.player_id = any (v_roster) and x.match_id = any (v_match_ids)
      order by x.match_id, x.player_id
    on conflict (match_id, player_id) do update set
      buts = excluded.buts, passes_decisives = excluded.passes_decisives, highlights = excluded.highlights;
    get diagnostics v_n = row_count;
    v_in := jsonb_array_length(p_snapshot -> 'match_stats');
    v_counts := v_counts || jsonb_build_object('match_stats', v_n);
    if v_n < v_in then v_skipped := v_skipped || jsonb_build_object('match_stats', v_in - v_n); end if;

    v_step := 'carpool_offers';
    insert into carpool_offers (id, team_id, season_id, driver_name, event_label, date, seats_total)
      select distinct on (x.id) x.id, v_team, v_season, x.driver_name, nullif(x.event_label, ''),
             nullif(x.date, '')::date, coalesce(x.seats_total, 0)
      from jsonb_to_recordset(p_snapshot -> 'carpool_offers')
        as x(id text, driver_name text, event_label text, date text, seats_total int)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id, driver_name = excluded.driver_name,
      event_label = excluded.event_label, date = excluded.date, seats_total = excluded.seats_total;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('carpool_offers', v_n);

    -- ---- Forum ----

    -- Sujets déjà publiés (par identifiant) : on ne figera les participants que pour les nouveaux.
    v_step := 'forum_threads';
    v_existing_threads := array(select t.id from forum_threads t where t.id = any (v_thread_ids));
    insert into forum_threads (id, team_id, season_id, title, type, linked_event_title, linked_event_date, created_at)
      select distinct on (x.id) x.id, v_team, v_season, x.title, x.type, nullif(x.linked_event_title, ''),
             nullif(x.linked_event_date, '')::date, coalesce(nullif(x.created_at, '')::timestamptz, now())
      from jsonb_to_recordset(p_snapshot -> 'forum_threads')
        as x(id text, title text, type text, linked_event_title text, linked_event_date text, created_at text)
      order by x.id
    on conflict (id) do update set
      team_id = excluded.team_id, season_id = excluded.season_id, title = excluded.title, type = excluded.type,
      linked_event_title = excluded.linked_event_title, linked_event_date = excluded.linked_event_date;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('forum_threads', v_n);

    -- Participants d'une conversation « individuelle » : les parents liés aux joueurs visés, FIGÉS à la
    -- première publication du sujet — jamais réévalués ensuite, sinon un parent lié plus tard verrait
    -- l'historique de conversations privées créées avant sa liaison (voulu par Gregory).
    v_step := 'forum_thread_participants';
    insert into forum_thread_participants (thread_id, parent_id)
      select distinct t.id, l.parent_id
      from jsonb_to_recordset(p_snapshot -> 'forum_threads') as t(id text, type text, target_player_ids jsonb)
      cross join lateral jsonb_array_elements_text(coalesce(t.target_player_ids, '[]'::jsonb)) as tp(player_id)
      join parent_player_links l on l.player_id = tp.player_id
      where t.type = 'individuelle' and not (t.id = any (v_existing_threads))
    on conflict (thread_id, parent_id) do nothing;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('forum_thread_participants', v_n);

    -- Conversations individuelles que personne ne peut lire (aucun participant) : à signaler au staff.
    v_orphans := coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title) order by t.title)
      from forum_threads t
      where t.type = 'individuelle' and t.id = any (v_thread_ids)
        and not exists (select 1 from forum_thread_participants p where p.thread_id = t.id)
    ), '[]'::jsonb);

    -- Messages du staff. Un message de parent n'est jamais touché : le tableau local du staff mélange
    -- ses messages et ceux ramenés par « Récupérer les nouveautés ».
    v_step := 'forum_messages';
    -- Messages que la base connaît déjà comme messages de PARENTS (ramenés par « Récupérer » avant que le
    -- client ne les marque) : attendus, jamais renvoyés comme messages du staff, et comptés à part pour ne
    -- pas ressortir à chaque publication comme des lignes « écartées ».
    select count(distinct x.id) into v_parent_msgs
      from jsonb_to_recordset(p_snapshot -> 'forum_messages') as x(id text)
      join forum_messages m on m.id = x.id and m.author_kind = 'parent';
    insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content, at)
      select distinct on (x.id) x.id, x.thread_id, 'staff', coalesce(nullif(x.author_name, ''), 'Staff'), null,
             x.content, coalesce(nullif(x.at, '')::timestamptz, now())
      from jsonb_to_recordset(p_snapshot -> 'forum_messages')
        as x(id text, thread_id text, author_name text, content text, at text)
      where x.thread_id = any (v_thread_ids)
        and not exists (select 1 from forum_messages m where m.id = x.id and m.author_kind = 'parent')
      order by x.id
    on conflict (id) do update set
      author_name = excluded.author_name, content = excluded.content, at = excluded.at
      where forum_messages.author_kind = 'staff';
    get diagnostics v_n = row_count;
    v_in := jsonb_array_length(p_snapshot -> 'forum_messages');
    v_counts := v_counts || jsonb_build_object('forum_messages', v_n);
    if v_n + v_parent_msgs < v_in then v_skipped := v_skipped || jsonb_build_object('forum_messages', v_in - v_n - v_parent_msgs); end if;
  exception when others then
    -- Tout ce qui précède est annulé avec l'exception. On la relance en ajoutant l'étape en cause,
    -- pour que le message affiché au staff dise OÙ ça a échoué.
    get stacked diagnostics v_detail = pg_exception_detail, v_hint = pg_exception_hint;
    raise exception 'Publication annulée (rien n''a été modifié), étape « % » : %', v_step, sqlerrm
      using errcode = sqlstate, detail = v_detail, hint = v_hint;
  end;

  return jsonb_build_object(
    'published_at', now(),
    'counts', v_counts,
    'skipped', v_skipped,
    'parent_messages_ignored', v_parent_msgs,
    'individual_threads_without_parent', v_orphans
  );
end;
$$;

-- Sur Supabase, les fonctions du schéma public sont par défaut exécutables par anon : on retire ce droit
-- (is_staff() refuserait de toute façon, mais autant ne pas exposer la fonction).
revoke all on function publish_snapshot(jsonb) from public, anon;
grant execute on function publish_snapshot(jsonb) to authenticated;
