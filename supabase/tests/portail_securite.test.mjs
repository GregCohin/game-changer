// Scénarios d'accès du backend Supabase (portail parent + forum), joués sur un vrai Postgres local jetable
// (PGlite, en mémoire) qui REJOUE les vraies migrations de supabase/migrations/ — jamais une copie du schéma.
// Seuls sont simulés les éléments que Supabase fournit lui-même : le schéma `auth` (auth.users, auth.uid()),
// les rôles anon / authenticated / service_role et leurs privilèges par défaut sur le schéma public (le
// cloud accorde « all » aux trois : sans eux, un oubli de row level security passerait inaperçu).
//
// Acteurs : anonyme (clé publique), staff, parent A (enfant p1), parent B (enfant p2, même équipe),
// parent C (enfant p3, autre équipe), parent D (enfants p1 et p2), intrus (compte connecté sans enfant).
//
// PGlite n'est PAS une dépendance du dépôt : l'installer dans un dossier HORS du dépôt, puis lancer
//
//   mkdir /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite
//   cd <dépôt> && PGLITE_DIR=/tmp/pglite node --test supabase/tests/portail_securite.test.mjs
//
// Sans PGLITE_DIR (ni PGlite installé), les tests sont ignorés avec un message. Aucune donnée réelle :
// noms, identifiants et adresses sont inventés. Après une restauration du projet Supabase, refaire les
// mêmes vérifications en production avec supabase/tests/portail_securite_prod.sql (annulé d'office).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const SECURITY_MIGRATION = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_securite_portail.sql"));

async function loadPglite() {
  const dir = process.env.PGLITE_DIR;
  const base = dir ? path.join(dir, "node_modules/@electric-sql/pglite/dist") : null;
  try {
    const main = await import(base ? pathToFileURL(path.join(base, "index.js")).href : "@electric-sql/pglite");
    const contrib = await import(base ? pathToFileURL(path.join(base, "contrib/pgcrypto.js")).href : "@electric-sql/pglite/contrib/pgcrypto");
    return { PGlite: main.PGlite, pgcrypto: contrib.pgcrypto };
  } catch (e) {
    return null;
  }
}
const lib = await loadPglite();
const skip = lib ? false : "PGlite introuvable : voir l'en-tête de supabase/tests/portail_securite.test.mjs";

async function createDb({ withoutSecurity = false } = {}) {
  const db = new lib.PGlite({ extensions: { pgcrypto: lib.pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (withoutSecurity && f === SECURITY_MIGRATION) continue;
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
  }
  return db;
}

const U = {
  staff: "00000000-0000-0000-0000-0000000000a1",
  a: "00000000-0000-0000-0000-0000000000b1",
  b: "00000000-0000-0000-0000-0000000000b2",
  c: "00000000-0000-0000-0000-0000000000b3",
  d: "00000000-0000-0000-0000-0000000000b4",
  intrus: "00000000-0000-0000-0000-0000000000c1",
};
const CODE = "K7M2QX9PRT"; // 10 caractères de l'alphabet sans caractères ambigus
const CODE2 = "H4N8WZ3DFG";

async function as(db, uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
}
async function anon(db, fn) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
// Lignes renvoyées ; en cas d'erreur, { error: { message, code } }.
async function run(db, sql, params) {
  try { const r = await db.query(sql, params); return { rows: r.rows, count: r.affectedRows ?? r.rows.length }; }
  catch (e) { return { error: { message: String(e.message), code: e.code } }; }
}
const rows = async (db, sql, params) => { const r = await run(db, sql, params); assert.ok(!r.error, `${sql}\n→ ${r.error?.message}`); return r.rows; };

async function reset(db) {
  const { rows: t } = await db.query(`select tablename from pg_tables where schemaname = 'public'`);
  const { rows: legacy } = await db.query(`select 1 from information_schema.columns where table_name = 'parent_player_links' and column_name = 'reviewed_at'`);
  const reviewed = legacy.length > 0; // faux avant la migration de sécurité
  await db.exec(`truncate ${t.map((r) => `public."${r.tablename}"`).join(", ")} restart identity cascade; delete from auth.users;`);
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@exemple.invalid`]);
  await db.exec(`
    insert into staff_profiles (id, display_name) values ('${U.staff}', 'Staff');
    insert into players (id, team_id, season_id, first_name, last_name) values
      ('p1','t1','s1','Léo','Durand'), ('p2','t1','s1','Mia','Martin'), ('p3','t2','s1','Zoé','Petit');
    insert into parent_player_links (parent_id, player_id, linked_at${reviewed ? ", reviewed_at" : ""}) values
      ('${U.a}','p1', now()${reviewed ? ", now()" : ""}), ('${U.b}','p2', now()${reviewed ? ", now()" : ""}), ('${U.c}','p3', now()${reviewed ? ", now()" : ""}),
      ('${U.d}','p1', now() - interval '2 days'${reviewed ? ", now()" : ""}), ('${U.d}','p2', now() - interval '1 day'${reviewed ? ", now()" : ""});
    insert into forum_threads (id, team_id, season_id, title, type) values
      ('th1','t1','s1','Général U13','general'), ('th2','t2','s1','Général U15','general'), ('th3','t1','s1','Privé Léo','individuelle');
    insert into forum_thread_participants (thread_id, parent_id) values ('th3','${U.a}');
    insert into carpool_offers (id, team_id, season_id, driver_name, seats_total) values ('o1','t1','s1','Chauffeur',2), ('o2','t2','s1','Autre',3);
    insert into player_invitation_codes (code, player_id, team_id, season_id) values ('${CODE}','p1','t1','s1');
    insert into development_goals (id, player_id, team_id, season_id, label) values ('g1','p1','t1','s1','Jeu de tête'), ('g2','p2','t1','s1','Appuis');
  `);
}

const msg = (id, kind, name, uid, content = "bonjour", thread = "th1") =>
  `insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values ('${id}','${thread}','${kind}','${name}',${uid ? `'${uid}'` : "null"},'${content}')`;

// ---------------------------------------------------------------------------------------------------
test("0. rien n'est ouvert : RLS partout, rôle anonyme sans accès", { skip }, async (t) => {
  const db = await createDb();
  await reset(db);

  await t.test("toutes les tables du schéma public ont la row level security (staff_profiles comprise)", async () => {
    const open = await rows(db, `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`);
    assert.deepEqual(open, []);
  });

  await t.test("un compte connecté ne peut pas s'inscrire comme staff", async () => {
    const r = await as(db, U.intrus, () => run(db, `insert into staff_profiles (id) values ('${U.intrus}')`));
    assert.match(r.error.message, /row-level security/);
    assert.equal((await as(db, U.intrus, () => rows(db, `select is_staff() as s`)))[0].s, false);
  });
  await t.test("…ni modifier ou supprimer les lignes du staff, ni les lire", async () => {
    assert.equal((await as(db, U.intrus, () => run(db, `delete from staff_profiles`))).count, 0);
    assert.equal((await as(db, U.intrus, () => run(db, `update staff_profiles set display_name = 'x'`))).count, 0);
    assert.deepEqual(await as(db, U.intrus, () => rows(db, `select id from staff_profiles`)), []);
    assert.equal((await rows(db, `select count(*)::int n from staff_profiles`))[0].n, 1);
  });
  await t.test("le staff ne voit que sa propre ligne et ne peut pas non plus s'en ajouter d'autres", async () => {
    assert.equal((await as(db, U.staff, () => rows(db, `select id from staff_profiles`))).length, 1);
    const r = await as(db, U.staff, () => run(db, `insert into staff_profiles (id) values ('${U.a}')`));
    assert.match(r.error.message, /row-level security/);
  });

  await t.test("aucune fonction du schéma public (hors extensions) n'est exécutable par l'anonyme ou par PUBLIC", async () => {
    const open = await rows(db, `
      select p.proname from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        and has_function_privilege('anon', p.oid, 'execute')`);
    assert.deepEqual(open.map((r) => r.proname), []);
  });
  await t.test("le staff et les parents gardent ce dont ils ont besoin : is_staff() reste appelable, le plafond de places aussi", async () => {
    assert.equal((await as(db, U.staff, () => rows(db, `select is_staff() as s`)))[0].s, true);
    const full = await as(db, U.a, () => run(db, `insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('o1','${U.a}','p1','x')`));
    assert.equal(full.error, undefined, "le déclencheur de capacité continue de s'exécuter");
  });

  await t.test("l'anonyme n'a le droit de lire aucune table de l'application", async () => {
    const { rows: tables } = await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`);
    for (const { tablename } of tables) {
      const r = await anon(db, () => run(db, `select 1 from public."${tablename}" limit 1`));
      assert.match(r.error?.message ?? "", /permission denied/, `${tablename} lisible par anon`);
    }
    const w = await anon(db, () => run(db, `delete from staff_profiles`));
    assert.match(w.error.message, /permission denied/);
  });
});

// ---------------------------------------------------------------------------------------------------
test("1. codes d'invitation : plus d'oracle, essais limités", { skip }, async (t) => {
  const db = await createDb();

  await t.test("anonyme : même refus pour un code valide et pour un faux code (aucun oracle)", async () => {
    await reset(db);
    const ok = await anon(db, () => run(db, `select * from redeem_invitation_code($1)`, [CODE]));
    const bad = await anon(db, () => run(db, `select * from redeem_invitation_code($1)`, ["ZZZZZZZZZZ"]));
    assert.match(ok.error.message, /permission denied for function redeem_invitation_code/);
    assert.equal(ok.error.message, bad.error.message);
    assert.equal((await rows(db, `select count(*)::int n from parent_player_links where player_id = 'p1' and parent_id is null`))[0].n, 0);
  });

  await t.test("compte connecté : un code valide lie l'enfant, consomme une utilisation, trace le lien", async () => {
    await reset(db);
    const r = await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]));
    assert.deepEqual(r, [{ player_id: "p1", first_name: "Léo", last_name: "Durand" }]);
    const link = (await rows(db, `select linked_via_code, reviewed_at from parent_player_links where parent_id = $1`, [U.intrus]))[0];
    assert.equal(link.linked_via_code, CODE);
    assert.equal(link.reviewed_at, null, "un nouveau lien attend la vérification du staff");
    assert.equal((await rows(db, `select use_count from player_invitation_codes where code = $1`, [CODE]))[0].use_count, 1);
    // l'enfant devient visible, pas les autres
    const seen = await as(db, U.intrus, () => rows(db, `select id from players order by id`));
    assert.deepEqual(seen.map((p) => p.id), ["p1"]);
  });

  await t.test("se relier deux fois au même enfant ne consomme pas une deuxième utilisation", async () => {
    await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]));
    assert.equal((await rows(db, `select use_count from player_invitation_codes where code = $1`, [CODE]))[0].use_count, 1);
  });

  await t.test("minuscules, espaces et tirets sont tolérés", async () => {
    await reset(db);
    const r = await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [" k7m2q-x9 prt "]));
    assert.equal(r.length, 1);
  });

  await t.test("code inconnu, révoqué, expiré, épuisé, trop court, vide ou null : même résultat, aucune erreur", async () => {
    await reset(db);
    await db.exec(`
      insert into player_invitation_codes (code, player_id, team_id, season_id, revoked) values ('RRRRRRRRRR','p1','t1','s1', true);
      insert into player_invitation_codes (code, player_id, team_id, season_id, expires_at) values ('EEEEEEEEEE','p1','t1','s1', now() - interval '1 minute');
      insert into player_invitation_codes (code, player_id, team_id, season_id, max_uses, use_count) values ('UUUUUUUUUU','p1','t1','s1', 2, 2);
    `);
    const results = [];
    for (const c of ["ZZZZZZZZZZ", "RRRRRRRRRR", "EEEEEEEEEE", "UUUUUUUUUU", "K7M2Q", "", null, "0O1I0O1I0O"]) {
      // un compte neuf pour chaque essai : on observe la réponse, pas le blocage
      const id = `00000000-0000-0000-0000-${String(results.length + 100).padStart(12, "0")}`;
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `x${results.length}@exemple.invalid`]);
      results.push(await as(db, id, () => run(db, `select * from redeem_invitation_code($1)`, [c])));
    }
    for (const r of results) { assert.equal(r.error, undefined); assert.deepEqual(r.rows, []); }
  });

  await t.test("un code qui dépasse max_uses refuse le parent suivant", async () => {
    await reset(db);
    await db.exec(`update player_invitation_codes set max_uses = 1 where code = '${CODE}'`);
    assert.equal((await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]))).length, 1);
    await db.query(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c2', 'c2@exemple.invalid')`);
    assert.equal((await as(db, "00000000-0000-0000-0000-0000000000c2", () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]))).length, 0);
  });

  await t.test("six essais ratés bloquent le compte, même avec le bon code, sans révéler si le code était bon", async () => {
    await reset(db);
    for (let i = 0; i < 6; i++) {
      const r = await as(db, U.intrus, () => run(db, `select * from redeem_invitation_code($1)`, [`BAD${i}XXXXXXX`.slice(0, 10)]));
      assert.equal(r.error, undefined, `essai ${i + 1} : pas d'erreur, juste une liste vide`);
    }
    const blockedGood = await as(db, U.intrus, () => run(db, `select * from redeem_invitation_code($1)`, [CODE]));
    const blockedBad = await as(db, U.intrus, () => run(db, `select * from redeem_invitation_code($1)`, ["ZZZZZZZZZZ"]));
    assert.match(blockedGood.error.message, /Trop d'essais/);
    assert.equal(blockedGood.error.message, blockedBad.error.message, "même message pour un bon et un mauvais code");
    assert.equal((await rows(db, `select count(*)::int n from parent_player_links where parent_id = $1`, [U.intrus]))[0].n, 0);
    assert.equal((await rows(db, `select use_count from player_invitation_codes where code = $1`, [CODE]))[0].use_count, 0);
  });

  await t.test("le blocage se lève au bout de 30 minutes ; un succès remet le compteur à zéro", async () => {
    await db.exec(`update invitation_code_attempts set locked_until = now() - interval '1 second', window_started_at = now() - interval '31 minutes'`);
    assert.equal((await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]))).length, 1);
    const att = (await rows(db, `select failed_count, locked_until from invitation_code_attempts where user_id = $1`, [U.intrus]))[0];
    assert.equal(att.failed_count, 0);
    assert.equal(att.locked_until, null);
  });

  await t.test("cinq ratés puis une longue pause : la fenêtre de 15 minutes repart de zéro", async () => {
    await reset(db);
    for (let i = 0; i < 5; i++) await as(db, U.intrus, () => run(db, `select * from redeem_invitation_code($1)`, ["ZZZZZZZZZZ"]));
    await db.exec(`update invitation_code_attempts set window_started_at = now() - interval '16 minutes'`);
    await as(db, U.intrus, () => run(db, `select * from redeem_invitation_code($1)`, ["ZZZZZZZZZZ"]));
    const att = (await rows(db, `select failed_count, locked_until from invitation_code_attempts`))[0];
    assert.equal(att.failed_count, 1);
    assert.equal(att.locked_until, null);
  });

  await t.test("le compteur d'essais n'est lisible ni modifiable par un compte connecté", async () => {
    const r = await as(db, U.intrus, () => run(db, `select * from invitation_code_attempts`));
    assert.match(r.error.message, /permission denied/);
    const w = await as(db, U.intrus, () => run(db, `delete from invitation_code_attempts`));
    assert.match(w.error.message, /permission denied/);
  });

  await t.test("le staff crée un code de 10 caractères : expiration par défaut à 14 jours ; format imposé par la base", async () => {
    await reset(db);
    const r = await as(db, U.staff, () => run(db, `insert into player_invitation_codes (code, player_id, team_id, season_id) values ($1,'p2','t1','s1') returning expires_at`, [CODE2]));
    const days = (new Date(r.rows[0].expires_at) - Date.now()) / 86400000;
    assert.ok(days > 13.9 && days < 14.1, `expiration à ${days} jours`);
    for (const bad of ["ABC234", "k7m2qx9prt", "K7M2QX9PR0", "K7M2QX9PRT0123456789"]) {
      const f = await as(db, U.staff, () => run(db, `insert into player_invitation_codes (code, player_id, team_id, season_id) values ($1,'p2','t1','s1')`, [bad]));
      assert.match(f.error?.message ?? "", /player_invitation_codes_code_format/, `${bad} accepté`);
    }
  });

  await t.test("un parent ne lit ni ne crée de code", async () => {
    assert.deepEqual(await as(db, U.a, () => rows(db, `select code from player_invitation_codes`)), []);
    const w = await as(db, U.a, () => run(db, `insert into player_invitation_codes (code, player_id, team_id, season_id) values ('${CODE2.replace("H", "J")}','p1','t1','s1')`));
    assert.match(w.error.message, /row-level security/);
  });
});

// ---------------------------------------------------------------------------------------------------
test("2. liens parent : alerte du staff, profil non falsifiable", { skip }, async (t) => {
  const db = await createDb();
  await reset(db);
  await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code($1)`, [CODE]));

  await t.test("le staff voit le nouveau lien (et lui seul est « à vérifier »), avec l'e-mail du compte", async () => {
    await as(db, U.intrus, () => run(db, `insert into parent_profiles (id, display_name) values ('${U.intrus}', 'Maman de Léo, Mme Dupont')`));
    const pending = await as(db, U.staff, () => rows(db, `
      select l.parent_id, l.player_id, l.linked_via_code, pp.display_name
      from parent_player_links l left join parent_profiles pp on pp.id = l.parent_id where l.reviewed_at is null`));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].display_name, "intrus@exemple.invalid", "le nom affiché au staff est l'adresse vérifiée, pas un texte libre");
    assert.equal(pending[0].linked_via_code, CODE);
  });
  await t.test("le parent ne peut modifier son profil qu'en gardant l'adresse vérifiée", async () => {
    await as(db, U.intrus, () => run(db, `update parent_profiles set display_name = 'Coach Gregory' where id = '${U.intrus}'`));
    assert.equal((await rows(db, `select display_name from parent_profiles where id = '${U.intrus}'`))[0].display_name, "intrus@exemple.invalid");
  });
  await t.test("le staff confirme un lien ; le parent ne peut ni confirmer, ni créer, ni défaire un lien", async () => {
    const own = await as(db, U.intrus, () => run(db, `update parent_player_links set reviewed_at = now() where parent_id = '${U.intrus}'`));
    assert.equal(own.count, 0);
    const ins = await as(db, U.intrus, () => run(db, `insert into parent_player_links (parent_id, player_id) values ('${U.intrus}','p2')`));
    assert.match(ins.error.message, /row-level security/);
    const del = await as(db, U.intrus, () => run(db, `delete from parent_player_links where parent_id = '${U.intrus}'`));
    assert.equal(del.count, 0);
    const ok = await as(db, U.staff, () => run(db, `update parent_player_links set reviewed_at = now() where parent_id = '${U.intrus}' and player_id = 'p1'`));
    assert.equal(ok.count, 1);
    assert.equal((await as(db, U.staff, () => rows(db, `select 1 from parent_player_links where reviewed_at is null`))).length, 0);
  });
  await t.test("le staff défait un lien : l'enfant disparaît côté parent", async () => {
    await as(db, U.staff, () => run(db, `delete from parent_player_links where parent_id = '${U.intrus}'`));
    assert.deepEqual(await as(db, U.intrus, () => rows(db, `select id from players`)), []);
  });
});

// ---------------------------------------------------------------------------------------------------
test("3. droit à l'effacement", { skip }, async (t) => {
  const db = await createDb();

  const seedContent = async () => {
    await reset(db);
    await db.exec(`
      ${msg("mA", "parent", "Parent de Léo", U.a)};
      ${msg("mB", "parent", "Parent de Mia", U.b)};
      ${msg("mS", "staff", "Coach", null)};
      insert into player_journal_entries (id, player_id, parent_id, date, content) values ('jA','p1','${U.a}','2026-10-01','note A'), ('jB','p2','${U.b}','2026-10-01','note B');
      insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('o1','${U.a}','p1','Léo Durand'), ('o1','${U.b}','p2','Mia Martin');
    `);
  };

  await t.test("la suppression directe d'un compte n'est plus bloquée ; les messages et notes survivent sans compte", async () => {
    await seedContent();
    const r = await run(db, `delete from auth.users where id = '${U.a}'`);
    assert.equal(r.error, undefined, r.error?.message);
    assert.equal((await rows(db, `select parent_id from forum_messages where id = 'mA'`))[0].parent_id, null);
    assert.equal((await rows(db, `select parent_id from player_journal_entries where id = 'jA'`))[0].parent_id, null);
    assert.equal((await rows(db, `select count(*)::int n from carpool_passengers where parent_id is not null and offer_id = 'o1'`))[0].n, 1, "l'inscription de A est partie, pas celle de B");
    assert.equal((await rows(db, `select count(*)::int n from parent_player_links where parent_id = '${U.a}'`))[0].n, 0);
    assert.equal((await rows(db, `select count(*)::int n from forum_thread_participants where parent_id = '${U.a}'`))[0].n, 0);
  });

  await t.test("« supprimer mon compte » (par défaut) efface aussi messages et notes, et rien de ce qui est à un autre", async () => {
    await seedContent();
    await as(db, U.a, () => rows(db, `select delete_my_account()`));
    assert.equal((await rows(db, `select count(*)::int n from auth.users where id = '${U.a}'`))[0].n, 0);
    assert.deepEqual((await rows(db, `select id from forum_messages order by id`)).map((r) => r.id), ["mB", "mS"]);
    assert.deepEqual((await rows(db, `select id from player_journal_entries order by id`)).map((r) => r.id), ["jB"]);
    assert.equal((await rows(db, `select count(*)::int n from carpool_passengers`))[0].n, 1);
    assert.equal((await rows(db, `select count(*)::int n from invitation_code_attempts where user_id = '${U.a}'`))[0].n, 0);
    // B est intact
    assert.equal((await as(db, U.b, () => rows(db, `select id from forum_messages where id = 'mB'`))).length, 1);
  });

  await t.test("avec p_erase_content = false : messages et notes conservés, anonymes", async () => {
    await seedContent();
    await as(db, U.a, () => rows(db, `select delete_my_account(false)`));
    const m = (await rows(db, `select author_name, parent_id from forum_messages where id = 'mA'`))[0];
    assert.deepEqual(m, { author_name: "Ancien parent", parent_id: null });
    assert.equal((await rows(db, `select parent_id from player_journal_entries where id = 'jA'`))[0].parent_id, null);
    assert.equal((await rows(db, `select count(*)::int n from carpool_passengers where player_id = 'p1'`))[0].n, 0);
  });

  await t.test("un compte staff ne peut pas se supprimer ; l'anonyme n'appelle pas la fonction", async () => {
    await seedContent();
    const s = await as(db, U.staff, () => run(db, `select delete_my_account()`));
    assert.match(s.error.message, /compte staff/);
    assert.equal((await rows(db, `select count(*)::int n from staff_profiles`))[0].n, 1);
    const a = await anon(db, () => run(db, `select delete_my_account()`));
    assert.match(a.error.message, /permission denied for function delete_my_account/);
  });

  await t.test("supprimer un joueur emporte ses inscriptions au covoiturage, ses notes, ses liens et ses codes", async () => {
    await seedContent();
    const r = await as(db, U.staff, () => run(db, `delete from players where id = 'p1'`));
    assert.equal(r.error, undefined, r.error?.message);
    for (const [tbl, col] of [["carpool_passengers", "player_id"], ["player_journal_entries", "player_id"], ["parent_player_links", "player_id"], ["player_invitation_codes", "player_id"], ["development_goals", "player_id"]]) {
      assert.equal((await rows(db, `select count(*)::int n from ${tbl} where ${col} = 'p1'`))[0].n, 0, tbl);
    }
    assert.equal((await rows(db, `select count(*)::int n from players where id = 'p2'`))[0].n, 1);
  });
});

// ---------------------------------------------------------------------------------------------------
test("4. suppression par le parent, modération par le staff", { skip }, async (t) => {
  const db = await createDb();
  await reset(db);
  await db.exec(`
    ${msg("mA", "parent", "Parent de Léo", U.a)};
    ${msg("mB", "parent", "Parent de Mia", U.b)};
    ${msg("mS", "staff", "Coach", null)};
    insert into player_journal_entries (id, player_id, parent_id, date, content) values ('jA','p1','${U.a}','2026-10-01','note A'), ('jB','p2','${U.b}','2026-10-01','note B');
    insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('o1','${U.a}','p1','Léo Durand');
  `);

  await t.test("un parent supprime son message, pas celui d'un autre ni celui du staff", async () => {
    assert.equal((await as(db, U.b, () => run(db, `delete from forum_messages where id = 'mA'`))).count, 0);
    assert.equal((await as(db, U.a, () => run(db, `delete from forum_messages where id = 'mS'`))).count, 0);
    assert.equal((await as(db, U.a, () => run(db, `delete from forum_messages where id = 'mA'`))).count, 1);
  });
  await t.test("un parent ne modifie aucun message, y compris le sien", async () => {
    assert.equal((await as(db, U.b, () => run(db, `update forum_messages set content = 'modifié' where id = 'mB'`))).count, 0);
  });
  await t.test("un compte sans enfant ne supprime rien", async () => {
    assert.equal((await as(db, U.intrus, () => run(db, `delete from forum_messages`))).count, 0);
    assert.equal((await as(db, U.intrus, () => run(db, `delete from player_journal_entries`))).count, 0);
  });
  await t.test("le staff supprime un message de parent (modération) et un message du staff", async () => {
    assert.equal((await as(db, U.staff, () => run(db, `delete from forum_messages where id = 'mB'`))).count, 1);
    assert.equal((await as(db, U.staff, () => run(db, `delete from forum_messages where id = 'mS'`))).count, 1);
    assert.deepEqual(await rows(db, `select id from forum_messages`), []);
  });
  await t.test("carnet de bord : le parent supprime ses notes, pas celles d'un autre ; le staff modère", async () => {
    assert.equal((await as(db, U.a, () => run(db, `delete from player_journal_entries where id = 'jB'`))).count, 0);
    assert.equal((await as(db, U.a, () => run(db, `delete from player_journal_entries where id = 'jA'`))).count, 1);
    assert.equal((await as(db, U.staff, () => run(db, `delete from player_journal_entries where id = 'jB'`))).count, 1);
  });
  await t.test("covoiturage : le parent se désinscrit (déjà possible) ; le staff peut retirer un passager", async () => {
    assert.equal((await as(db, U.b, () => run(db, `delete from carpool_passengers`))).count, 0);
    assert.equal((await as(db, U.staff, () => run(db, `delete from carpool_passengers`))).count, 1);
  });
});

// ---------------------------------------------------------------------------------------------------
test("5. ce que le client écrit n'est pas cru sur parole", { skip }, async (t) => {
  const db = await createDb();
  await reset(db);

  await t.test("signature : « Coach Gregory (Staff) » devient « Parent de Léo »", async () => {
    await as(db, U.a, () => rows(db, `${msg("m1", "parent", "Coach Gregory (Staff)", U.a)} returning id`));
    assert.equal((await rows(db, `select author_name, author_kind from forum_messages where id = 'm1'`))[0].author_name, "Parent de Léo");
  });
  await t.test("un parent de deux enfants choisit lequel signe, mais seulement parmi les siens", async () => {
    await as(db, U.d, () => rows(db, `${msg("m2", "parent", "Parent de Mia", U.d)} returning id`));
    await as(db, U.d, () => rows(db, `${msg("m3", "parent", "Parent de Léo", U.d)} returning id`));
    await as(db, U.d, () => rows(db, `${msg("m4", "parent", "Parent de Zoé", U.d)} returning id`));
    const names = Object.fromEntries((await rows(db, `select id, author_name from forum_messages where id in ('m2','m3','m4')`)).map((r) => [r.id, r.author_name]));
    assert.deepEqual(names, { m2: "Parent de Mia", m3: "Parent de Léo", m4: "Parent de Léo" }, "Zoé n'est pas son enfant : retombe sur le premier enfant lié");
  });
  await t.test("l'horodatage d'un message de parent est celui du serveur", async () => {
    await as(db, U.a, () => run(db, `insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content, at) values ('m5','th1','parent','x','${U.a}','bonjour','2000-01-01')`));
    const age = (await rows(db, `select extract(epoch from now() - at) as s from forum_messages where id = 'm5'`))[0].s;
    assert.ok(age < 60, `message daté de ${age}s`);
  });
  await t.test("un parent ne peut pas écrire en tant que staff", async () => {
    const r = await as(db, U.a, () => run(db, `${msg("m6", "staff", "Coach", null)}`));
    assert.match(r.error.message, /row-level security/);
    const r2 = await as(db, U.a, () => run(db, `${msg("m7", "parent", "Parent de Léo", U.b)}`));
    assert.match(r2.error.message, /row-level security/, "ni au nom d'un autre parent");
  });
  await t.test("le staff, lui, garde sa signature libre ; le service garde la main sur l'horodatage", async () => {
    await as(db, U.staff, () => rows(db, `${msg("m8", "staff", "Coach Gregory (U13)", null)} returning id`));
    assert.equal((await rows(db, `select author_name from forum_messages where id = 'm8'`))[0].author_name, "Coach Gregory (U13)");
    await db.exec(`insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content, at) values ('m9','th1','parent','Parent de Léo','${U.a}','archive','2020-05-05')`);
    assert.equal((await rows(db, `select at::date::text d from forum_messages where id = 'm9'`))[0].d, "2020-05-05");
  });

  await t.test("longueurs : 4 000 caractères pour un parent, 50 000 pour le staff, identifiants bornés", async () => {
    const insert = (uid, id, content, kind = "parent") => as(db, uid, () => run(db,
      `insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values ($1,'th1',$2,'Parent de Léo',$3,$4)`,
      [id, kind, kind === "staff" ? null : uid, content]));
    assert.equal((await insert(U.a, "L1", "a".repeat(4000))).error, undefined);
    assert.match((await insert(U.a, "L2", "a".repeat(4001))).error.message, /forum_messages_content_len/);
    assert.match((await insert(U.a, "L3".repeat(51), "x")).error.message, /forum_messages_id_len/);
    assert.equal((await insert(U.staff, "L4", "a".repeat(50000), "staff")).error, undefined);
    assert.match((await insert(U.staff, "L5", "a".repeat(50001), "staff")).error.message, /forum_messages_content_len/);
    const longName = await as(db, U.staff, () => run(db, `insert into forum_messages (id, thread_id, author_kind, author_name, content) values ('L6','th1','staff', repeat('n',121), 'x')`));
    assert.match(longName.error.message, /forum_messages_author_name_len/);
    const note = (id, n) => as(db, U.a, () => run(db, `insert into player_journal_entries (id, player_id, parent_id, date, content) values ($1,'p1',$2,'2026-10-01',$3)`, [id, U.a, "n".repeat(n)]));
    assert.equal((await note("N1", 4000)).error, undefined);
    assert.match((await note("N2", 4001)).error.message, /player_journal_entries_content_len/);
  });

  await t.test("la date d'une note est celle du serveur (le curseur de récupération du staff ne peut pas être contourné)", async () => {
    await as(db, U.a, () => run(db, `insert into player_journal_entries (id, player_id, parent_id, date, content, created_at) values ('N3','p1','${U.a}','2026-10-01','note','2001-01-01')`));
    const age = (await rows(db, `select extract(epoch from now() - created_at) as s from player_journal_entries where id = 'N3'`))[0].s;
    assert.ok(age < 60);
  });

  await t.test("covoiturage : le nom du passager est celui de l'enfant lié, un enfant d'autrui ou sans enfant est refusé", async () => {
    const join = (uid, offer, player, name = "Pirate") => as(db, uid, () => run(db,
      `insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name, created_at) values ($1,$2,$3,$4,'2001-01-01') returning passenger_name, created_at`, [offer, uid, player, name]));
    const ok = await join(U.a, "o1", "p1");
    assert.equal(ok.rows[0].passenger_name, "Léo Durand");
    assert.ok(new Date(ok.rows[0].created_at).getFullYear() >= 2026);
    assert.match((await join(U.a, "o1", "p2")).error.message, /row-level security/, "enfant d'un autre parent");
    assert.match((await join(U.a, "o1", null)).error.message, /row-level security/, "sans enfant");
    assert.match((await join(U.c, "o1", "p3")).error.message, /row-level security/, "offre d'une autre équipe");
    assert.equal((await join(U.b, "o1", "p2")).error, undefined);
    assert.match((await join(U.d, "o1", "p1")).error.message, /complète/, "le plafond de places s'applique toujours");
    assert.equal((await join(U.c, "o2", "p3")).error, undefined);
    assert.equal((await join(U.c, "o2", "p3")).error?.code, "23505", "un enfant ne s'inscrit qu'une fois (offre qui a encore des places)");
  });
});

// ---------------------------------------------------------------------------------------------------
test("6. l'isolation entre familles n'a pas bougé", { skip }, async (t) => {
  const db = await createDb();
  await reset(db);
  await db.exec(`
    ${msg("m1", "parent", "Parent de Léo", U.a)};
    ${msg("m2", "parent", "Parent de Zoé", U.c, "autre équipe", "th2")};
    ${msg("m3", "staff", "Coach", null, "message privé", "th3")};
    insert into player_journal_entries (id, player_id, parent_id, date, content) values ('jA','p1','${U.a}','2026-10-01','note A'), ('jB','p2','${U.b}','2026-10-01','note B');
  `);
  await t.test("un parent ne voit que son enfant, ses objectifs, son carnet, les sujets de son équipe", async () => {
    assert.deepEqual((await as(db, U.a, () => rows(db, `select id from players`))).map((r) => r.id), ["p1"]);
    assert.deepEqual((await as(db, U.a, () => rows(db, `select id from development_goals`))).map((r) => r.id), ["g1"]);
    assert.deepEqual((await as(db, U.a, () => rows(db, `select id from player_journal_entries`))).map((r) => r.id), ["jA"]);
    assert.deepEqual((await as(db, U.a, () => rows(db, `select id from forum_threads order by id`))).map((r) => r.id), ["th1", "th3"]);
    assert.deepEqual((await as(db, U.a, () => rows(db, `select id from forum_messages order by id`))).map((r) => r.id), ["m1", "m3"]);
  });
  await t.test("la conversation privée ne se voit que de ses participants", async () => {
    assert.deepEqual((await as(db, U.b, () => rows(db, `select id from forum_threads order by id`))).map((r) => r.id), ["th1"]);
    assert.deepEqual((await as(db, U.b, () => rows(db, `select id from forum_messages order by id`))).map((r) => r.id), ["m1"]);
  });
  await t.test("un compte sans enfant ne voit rien ; le staff voit tout", async () => {
    for (const tbl of ["players", "development_goals", "forum_threads", "forum_messages", "player_journal_entries", "carpool_offers"]) {
      assert.deepEqual(await as(db, U.intrus, () => rows(db, `select 1 from ${tbl}`)), [], tbl);
    }
    assert.equal((await as(db, U.staff, () => rows(db, `select id from players`))).length, 3);
    assert.equal((await as(db, U.staff, () => rows(db, `select id from forum_messages`))).length, 3);
  });
});

// ---------------------------------------------------------------------------------------------------
test("7. migration jouée sur une base qui contient déjà des données", { skip }, async (t) => {
  const db = await createDb({ withoutSecurity: true });
  await reset(db);
  await db.exec(`
    delete from player_invitation_codes;
    insert into player_invitation_codes (code, player_id, team_id, season_id) values ('ABC234','p1','t1','s1');
    insert into parent_player_links (parent_id, player_id, linked_at) values ('${U.intrus}','p1', now() - interval '3 days');
    ${msg("old1", "parent", "Parent de Léo", U.a, "x".repeat(6000))};
  `);
  // L'état d'avant est bien celui de l'audit : un compte connecté s'inscrit lui-même comme staff, l'anonyme
  // lit la table, et la fonction de liaison répond différemment à un code valide et à un faux code.
  await t.test("(avant) le défaut est reproduit : staff_profiles ouverte, fonction de liaison appelable sans compte", async () => {
    assert.equal((await as(db, U.intrus, () => run(db, `insert into staff_profiles (id) values ('${U.intrus}')`))).error, undefined);
    assert.equal((await as(db, U.intrus, () => rows(db, `select is_staff() as s`)))[0].s, true);
    assert.ok((await anon(db, () => rows(db, `select id from staff_profiles`))).length >= 2);
    const ok = await anon(db, () => run(db, `select * from redeem_invitation_code('ABC234')`));
    const bad = await anon(db, () => run(db, `select * from redeem_invitation_code('ZZZ999')`));
    assert.notEqual(ok.error.message, bad.error.message, "oracle : deux messages différents");
    await db.exec(`delete from staff_profiles where id = '${U.intrus}'`);
  });

  await t.test("la migration s'applique sans erreur sur des données existantes (même trop longues)", async () => {
    // db.exec (et non db.query) : le fichier contient plusieurs instructions
    let error;
    try { await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, SECURITY_MIGRATION), "utf8")); } catch (e) { error = e; }
    assert.equal(error, undefined, error?.message);
  });
  await t.test("les anciens codes de 6 caractères sont révoqués ; les liens existants sont déjà « vus »", async () => {
    assert.equal((await rows(db, `select revoked from player_invitation_codes where code = 'ABC234'`))[0].revoked, true);
    assert.equal((await as(db, U.intrus, () => rows(db, `select * from redeem_invitation_code('ABC234')`))).length, 0);
    assert.equal((await rows(db, `select reviewed_at is not null as seen from parent_player_links where parent_id = '${U.intrus}'`))[0].seen, true);
  });
  await t.test("l'ancien message trop long est ramené à la limite (sinon il bloquerait l'effacement de son auteur), les nouveaux sont bornés", async () => {
    assert.equal((await rows(db, `select char_length(content) n from forum_messages where id = 'old1'`))[0].n, 4000);
    const r = await as(db, U.a, () => run(db, `insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values ('new1','th1','parent','x','${U.a}', repeat('a', 4001))`));
    assert.match(r.error.message, /forum_messages_content_len/);
    const del = await run(db, `delete from auth.users where id = '${U.a}'`);
    assert.equal(del.error, undefined, "l'auteur de l'ancien message peut supprimer son compte");
  });
});

// ---------------------------------------------------------------------------------------------------
test("8. le script de contrôle de production (portail_securite_prod.sql) fait ce qu'il annonce", { skip }, async (t) => {
  const script = fs.readFileSync(path.join(ROOT, "supabase/tests/portail_securite_prod.sql"), "utf8");
  // Le script se termine toujours par une exception « RESULT {json} » : c'est ce qui annule tout ce qu'il a créé.
  const runCheck = async (db) => {
    try { await db.exec(script); } catch (e) {
      const m = String(e.message);
      assert.ok(m.startsWith("RESULT "), `exception inattendue : ${m.slice(0, 300)}`);
      return JSON.parse(m.slice(7));
    }
    assert.fail("le script aurait dû se terminer par une exception qui annule tout");
  };

  await t.test("après la migration : tous les contrôles passent et rien ne reste en base", async () => {
    const db = await createDb();
    const r = await runCheck(db);
    assert.deepEqual(r.echecs, []);
    assert.equal(r.ok, r.total);
    assert.ok(r.total >= 20, `${r.total} contrôles`);
    const left = (await rows(db, `select (select count(*) from auth.users)::int u, (select count(*) from players)::int p, (select count(*) from staff_profiles)::int s, (select count(*) from forum_messages)::int m`))[0];
    assert.deepEqual(left, { u: 0, p: 0, s: 0, m: 0 });
  });

  await t.test("avant la migration : il met en évidence les défauts de l'audit (staff_profiles ouverte, oracle, pas de modération…)", async () => {
    const db = await createDb({ withoutSecurity: true });
    const r = await runCheck(db);
    for (const must of ["S1 ", "B1 ", "B2 ", "B3 ", "B6 ", "B7 ", "B8 ", "B9 ", "B13 "]) {
      assert.ok(r.echecs.some((e) => e.startsWith(must)), `le contrôle ${must.trim()} aurait dû échouer sur l'ancien schéma`);
    }
    const left = (await rows(db, `select (select count(*) from auth.users)::int u, (select count(*) from players)::int p`))[0];
    assert.deepEqual(left, { u: 0, p: 0 }, "même sur l'ancien schéma, rien ne reste");
  });
});
