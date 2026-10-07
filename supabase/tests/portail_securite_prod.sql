-- Contrôle d'accès du portail parent, à rejouer EN PRODUCTION (ou sur tout projet Supabase) sans rien écrire.
--
-- Pourquoi : supabase/tests/portail_securite.test.mjs prouve les règles sur un Postgres local (PGlite) qui SIMULE
-- les rôles et les droits de Supabase. Ce script refait les contrôles qui dépendent de la vraie plateforme
-- (droits par défaut d'anon/authenticated, RLS de staff_profiles, suppression dans auth.users depuis une fonction,
-- policies réellement en place).
--
-- Comment : un seul bloc DO. Il crée des comptes et des lignes temporaires (identifiants « zz-check-… »), simule
-- chaque rôle (set local role + request.jwt.claims), note chaque tentative dans un sous-bloc, puis se termine par
-- un `raise exception` qui porte le résultat : la transaction entière est annulée, RIEN n'est écrit. À envoyer par
-- l'API de gestion (POST /v1/projects/<réf>/database/query, corps { "query": "<ce fichier>" }) avec le jeton
-- d'accès de Gregory, ou à coller dans l'éditeur SQL du tableau de bord. La réponse est une erreur dont le
-- message commence par « RESULT » suivi d'un JSON : { ok, total, echecs: [...], detail: [...] }.
--
-- À lancer deux fois : AVANT d'appliquer la migration …_securite_portail.sql (les défauts de l'audit y sont
-- listés dans « echecs » : preuve de leur présence en production), puis APRÈS (« echecs » doit être vide).
-- Aucune donnée réelle n'est lue ni modifiée. Ne pas lancer en parallèle d'un autre test sur la même base.

do $check$
declare
  v_report jsonb := '[]'::jsonb;
  v_staff uuid := gen_random_uuid();
  v_pa uuid := gen_random_uuid();      -- parent A : enfant zz-check-p1
  v_pb uuid := gen_random_uuid();      -- parent B : enfant zz-check-p2
  v_intrus uuid := gen_random_uuid();  -- compte connecté sans enfant
  v_code constant text := 'ZZCHEK2345';
  v_n int;
  v_msg text;
  v_msg2 text;
  v_txt text;
  v_bool boolean;
  v_i int;
  v_k int;
  v_c int;
  v_l int;
  v_b int;
begin
  -- ---------------------------------------------------------------- données temporaires
  insert into auth.users (id, email) values
    (v_staff, 'zz-check-staff@exemple.invalid'), (v_pa, 'zz-check-a@exemple.invalid'),
    (v_pb, 'zz-check-b@exemple.invalid'), (v_intrus, 'zz-check-intrus@exemple.invalid');
  insert into staff_profiles (id, display_name) values (v_staff, 'zz-check');
  insert into players (id, team_id, season_id, first_name, last_name) values
    ('zz-check-p1', 'zz-check-team', 'zz-check-season', 'Léo', 'Test'),
    ('zz-check-p2', 'zz-check-team', 'zz-check-season', 'Mia', 'Test');
  insert into parent_player_links (parent_id, player_id) values (v_pa, 'zz-check-p1'), (v_pb, 'zz-check-p2');
  insert into forum_threads (id, team_id, season_id, title, type) values ('zz-check-th', 'zz-check-team', 'zz-check-season', 'zz-check', 'general');
  insert into carpool_offers (id, team_id, season_id, driver_name, seats_total) values ('zz-check-o', 'zz-check-team', 'zz-check-season', 'zz-check', 3);
  insert into player_invitation_codes (code, player_id, team_id, season_id) values (v_code, 'zz-check-p1', 'zz-check-team', 'zz-check-season');
  insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values
    ('zz-check-m-a', 'zz-check-th', 'parent', 'Parent de Léo', v_pa, 'x'),
    ('zz-check-m-b', 'zz-check-th', 'parent', 'Parent de Mia', v_pb, 'x'),
    ('zz-check-m-s', 'zz-check-th', 'staff', 'Coach', null, 'x');
  insert into player_journal_entries (id, player_id, parent_id, date, content) values
    ('zz-check-j-a', 'zz-check-p1', v_pa, current_date, 'x'), ('zz-check-j-b', 'zz-check-p2', v_pb, current_date, 'x');
  insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('zz-check-o', v_pa, 'zz-check-p1', 'Léo Test');

  -- ---------------------------------------------------------------- S : structure (sans simuler de rôle)
  select string_agg(relname, ', ') into v_txt from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  v_report := v_report || jsonb_build_object('test', 'S1 row level security activée sur toutes les tables du schéma public', 'ok', v_txt is null, 'detail', coalesce('sans RLS : ' || v_txt, 'toutes protégées'));

  select string_agg(distinct table_name, ', ') into v_txt from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public';
  v_report := v_report || jsonb_build_object('test', 'S2 le rôle anon n''a aucun droit sur les tables du schéma public', 'ok', v_txt is null, 'detail', coalesce('droits sur : ' || v_txt, 'aucun'));

  begin
    v_bool := not has_function_privilege('anon', 'public.redeem_invitation_code(text)', 'execute')
      and has_function_privilege('authenticated', 'public.redeem_invitation_code(text)', 'execute');
    v_report := v_report || jsonb_build_object('test', 'S3 redeem_invitation_code : exécutable par authenticated, pas par anon', 'ok', v_bool, 'detail', '');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'S3 redeem_invitation_code : exécutable par authenticated, pas par anon', 'ok', false, 'detail', sqlerrm);
  end;

  begin
    v_bool := not has_function_privilege('anon', 'public.delete_my_account(boolean)', 'execute')
      and has_function_privilege('authenticated', 'public.delete_my_account(boolean)', 'execute');
    v_report := v_report || jsonb_build_object('test', 'S4 delete_my_account : exécutable par authenticated, pas par anon', 'ok', v_bool, 'detail', '');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'S4 delete_my_account : exécutable par authenticated, pas par anon', 'ok', false, 'detail', 'fonction absente : ' || sqlerrm);
  end;

  select string_agg(conrelid::regclass::text || '.' || a.attname || '=' || c.confdeltype::text, ', ' order by conrelid::regclass::text) into v_txt
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.conrelid in ('forum_messages'::regclass, 'player_journal_entries'::regclass, 'carpool_passengers'::regclass)
      and a.attname = 'parent_id';
  v_report := v_report || jsonb_build_object('test', 'S5 clés étrangères vers auth.users : messages et notes « set null » (n), covoiturage « cascade » (c)',
    'ok', v_txt = 'carpool_passengers.parent_id=c, forum_messages.parent_id=n, player_journal_entries.parent_id=n', 'detail', coalesce(v_txt, ''));

  select (column_default ilike '%14 days%') into v_bool from information_schema.columns
    where table_schema = 'public' and table_name = 'player_invitation_codes' and column_name = 'expires_at';
  v_report := v_report || jsonb_build_object('test', 'S6 les codes d''invitation expirent par défaut (14 jours)', 'ok', coalesce(v_bool, false), 'detail', '');

  select string_agg(p.proname, ', ') into v_txt from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute');
  v_report := v_report || jsonb_build_object('test', 'S7 aucune fonction du schéma public (hors extensions) n''est exécutable par anon', 'ok', v_txt is null, 'detail', coalesce('exécutables par anon : ' || v_txt, 'aucune'));

  -- ---------------------------------------------------------------- B : comportements, un rôle à la fois
  -- B1. un compte connecté ne peut pas s'inscrire comme staff
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_intrus, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into staff_profiles (id) values (v_intrus);
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B1 un compte connecté ne peut pas s''inscrire comme staff', 'ok', false, 'detail', 'insertion ACCEPTÉE : il devient staff');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'B1 un compte connecté ne peut pas s''inscrire comme staff', 'ok', sqlerrm like '%row-level security%', 'detail', sqlerrm);
  end;

  -- B2. l'anonyme ne lit pas staff_profiles
  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    select count(*) into v_n from staff_profiles;
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B2 l''anonyme ne peut pas lire staff_profiles', 'ok', false, 'detail', 'lecture acceptée (' || v_n || ' ligne(s) visibles)');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'B2 l''anonyme ne peut pas lire staff_profiles', 'ok', sqlerrm like '%permission denied%', 'detail', sqlerrm);
  end;

  -- B3. l'anonyme n'appelle pas la fonction de liaison : même refus pour un code valide et un faux code
  v_msg := null; v_msg2 := null;
  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    perform * from redeem_invitation_code(v_code);
    reset role;
    v_msg := 'appel accepté';
  exception when others then v_msg := sqlerrm; end;
  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    perform * from redeem_invitation_code('ZZZZZZZZZZ');
    reset role;
    v_msg2 := 'appel accepté';
  exception when others then v_msg2 := sqlerrm; end;
  v_report := v_report || jsonb_build_object('test', 'B3 anonyme : code valide et faux code refusés de la même façon (aucun oracle)',
    'ok', v_msg = v_msg2 and v_msg like '%permission denied%', 'detail', 'valide : ' || v_msg || ' | faux : ' || v_msg2);

  -- B4. un parent connecté saisit un code valide : lien créé, à vérifier par le staff, utilisation consommée
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pb, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from redeem_invitation_code(v_code);
    reset role;
    select count(*) into v_i from parent_player_links where parent_id = v_pb and player_id = 'zz-check-p1' and reviewed_at is null and linked_via_code = v_code;
    v_report := v_report || jsonb_build_object('test', 'B4 code valide : enfant lié, lien « à vérifier », code tracé', 'ok', v_n = 1 and v_i = 1, 'detail', 'lignes renvoyées ' || v_n || ', liens à vérifier ' || v_i);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B4 code valide : enfant lié, lien « à vérifier », code tracé', 'ok', false, 'detail', sqlerrm);
  end;

  -- B5. faux code : aucune ligne, aucune erreur
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from redeem_invitation_code('ZZZZZZZZZZ');
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B5 faux code : liste vide, aucune erreur', 'ok', v_n = 0, 'detail', '');
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B5 faux code : liste vide, aucune erreur', 'ok', false, 'detail', sqlerrm);
  end;

  -- B6. six essais ratés bloquent le compte, même avec le bon code
  v_msg := null;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_intrus, 'role', 'authenticated')::text, true);
    set local role authenticated;
    for v_i in 1..6 loop
      perform * from redeem_invitation_code('ZZZZZZZZZ' || v_i::text);
    end loop;
    begin
      perform * from redeem_invitation_code(v_code);
      v_msg := 'le septième essai a été accepté';
    exception when others then v_msg := sqlerrm; end;
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B6 six essais ratés : compte bloqué, même avec le bon code', 'ok', v_msg like '%Trop d''essais%', 'detail', v_msg);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B6 six essais ratés : compte bloqué, même avec le bon code', 'ok', false, 'detail', sqlerrm);
  end;

  -- B7. un parent supprime son message, pas celui d'un autre
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    delete from forum_messages where id = 'zz-check-m-b';
    get diagnostics v_n = row_count;
    delete from forum_messages where id = 'zz-check-m-a';
    get diagnostics v_i = row_count;
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B7 un parent supprime son message (1 ligne), pas celui d''un autre (0)', 'ok', v_i = 1 and v_n = 0, 'detail', 'le sien : ' || v_i || ', celui d''un autre : ' || v_n);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B7 un parent supprime son message (1 ligne), pas celui d''un autre (0)', 'ok', false, 'detail', sqlerrm);
  end;

  -- B8. le staff modère : il supprime le message d'un parent
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    set local role authenticated;
    delete from forum_messages where id = 'zz-check-m-b';
    get diagnostics v_n = row_count;
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B8 le staff supprime le message d''un parent (modération)', 'ok', v_n = 1, 'detail', 'lignes supprimées : ' || v_n);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B8 le staff supprime le message d''un parent (modération)', 'ok', false, 'detail', sqlerrm);
  end;

  -- B9. une signature « Coach … (Staff) » écrite par un parent est remplacée
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content)
      values ('zz-check-m-a2', 'zz-check-th', 'parent', 'Coach Gregory (Staff)', v_pa, 'x');
    reset role;
    select author_name into v_txt from forum_messages where id = 'zz-check-m-a2';
    v_report := v_report || jsonb_build_object('test', 'B9 signature usurpée remplacée par « Parent de <prénom> »', 'ok', v_txt = 'Parent de Léo', 'detail', 'signature enregistrée : ' || coalesce(v_txt, ''));
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B9 signature usurpée remplacée par « Parent de <prénom> »', 'ok', false, 'detail', sqlerrm);
  end;

  -- B10. message de 4 001 caractères refusé
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content)
      values ('zz-check-m-long', 'zz-check-th', 'parent', 'Parent de Léo', v_pa, repeat('a', 4001));
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B10 un message de plus de 4 000 caractères est refusé', 'ok', false, 'detail', 'message accepté');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'B10 un message de plus de 4 000 caractères est refusé', 'ok', sqlerrm like '%forum_messages_content_len%', 'detail', sqlerrm);
  end;

  -- B11. le staff voit les nouveaux liens à vérifier (alerte)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from parent_player_links where reviewed_at is null and player_id = 'zz-check-p1';
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B11 le staff voit les liens parent à vérifier', 'ok', v_n >= 1, 'detail', 'liens à vérifier : ' || v_n);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B11 le staff voit les liens parent à vérifier', 'ok', false, 'detail', sqlerrm);
  end;

  -- B12. un compte staff ne peut pas se supprimer depuis le portail
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform delete_my_account();
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B12 un compte staff ne peut pas se supprimer', 'ok', false, 'detail', 'suppression acceptée');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'B12 un compte staff ne peut pas se supprimer', 'ok', sqlerrm like '%compte staff%', 'detail', sqlerrm);
  end;

  -- B13. « supprimer mon compte » : efface le compte (auth.users), ses messages, notes, inscriptions et lien, rien de plus
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pa, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform delete_my_account();
    reset role;
    select count(*) into v_n from auth.users where id = v_pa;
    select count(*) into v_i from forum_messages where parent_id = v_pa or id in ('zz-check-m-a', 'zz-check-m-a2');
    select count(*) into v_k from player_journal_entries where id = 'zz-check-j-a';
    select count(*) into v_c from carpool_passengers where offer_id = 'zz-check-o';
    select count(*) into v_l from parent_player_links where parent_id = v_pa;
    select count(*) into v_b from player_journal_entries where id = 'zz-check-j-b';
    v_report := v_report || jsonb_build_object('test', 'B13 delete_my_account : compte, messages, notes, inscriptions et lien effacés ; le parent B intact',
      'ok', v_n = 0 and v_i = 0 and v_k = 0 and v_c = 0 and v_l = 0 and v_b = 1,
      'detail', 'restant : compte ' || v_n || ', messages ' || v_i || ', notes ' || v_k || ', inscriptions ' || v_c || ', liens ' || v_l || ' ; note du parent B ' || v_b);
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B13 delete_my_account : compte, messages, notes, inscriptions et lien effacés ; le parent B intact', 'ok', false, 'detail', sqlerrm);
  end;

  -- B14. covoiturage : inscrire l'enfant d'un autre est refusé
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_intrus, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('zz-check-o', v_intrus, 'zz-check-p2', 'x');
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B14 covoiturage : inscrire l''enfant d''un autre parent est refusé', 'ok', false, 'detail', 'inscription acceptée');
  exception when others then
    v_report := v_report || jsonb_build_object('test', 'B14 covoiturage : inscrire l''enfant d''un autre parent est refusé', 'ok', sqlerrm like '%row-level security%', 'detail', sqlerrm);
  end;

  -- B15. le nom affiché au staff pour un parent est l'e-mail vérifié du compte (déclencheur lisant auth.users), pas un texte libre
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_pb, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into parent_profiles (id, display_name) values (v_pb, 'Maman de Léo, Mme Dupont');
    reset role;
    select display_name into v_txt from parent_profiles where id = v_pb;
    v_report := v_report || jsonb_build_object('test', 'B15 le nom d''un parent affiché au staff est son e-mail vérifié, pas un texte libre', 'ok', v_txt = 'zz-check-b@exemple.invalid', 'detail', 'enregistré : ' || coalesce(v_txt, ''));
  exception when others then
    reset role;
    v_report := v_report || jsonb_build_object('test', 'B15 le nom d''un parent affiché au staff est son e-mail vérifié, pas un texte libre', 'ok', false, 'detail', sqlerrm);
  end;

  -- ---------------------------------------------------------------- résultat : l'exception annule TOUT ce qui précède
  select count(*) filter (where (e ->> 'ok')::boolean), count(*) into v_n, v_i from jsonb_array_elements(v_report) e;
  raise exception 'RESULT %', jsonb_build_object(
    'ok', v_n,
    'total', v_i,
    'echecs', (select coalesce(jsonb_agg(e ->> 'test'), '[]'::jsonb) from jsonb_array_elements(v_report) e where not (e ->> 'ok')::boolean),
    'detail', v_report
  )::text;
end
$check$;
