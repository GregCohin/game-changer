// Tests de publish_snapshot (supabase/migrations/20261007100000_publish_snapshot_atomique.sql) sur un
// vrai Postgres local jetable : voir harness.mjs pour l'installation de PGlite et le lancement.
//
// Ce que ces tests verrouillent (audit du 07/10/2026, points 2 et 3) :
//  - les trois défauts qui faisaient échouer toute publication : titre de programme manquant, blessure
//    d'un joueur absent de l'effectif (clé étrangère), date vide '' ;
//  - l'atomicité : une erreur à une étape tardive n'a laissé AUCUNE trace des étapes précédentes ;
//  - les droits : staff seulement (un parent lié et un anonyme sont refusés) ;
//  - les écritures des parents (journal, covoiturage, messages) survivent à une republication ;
//  - les participants d'une conversation individuelle sont figés à la première publication ;
//  - un parent ne lit que les événements de l'équipe de son enfant.

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadPglite, SKIP_MESSAGE, createDb, asUser, asAnon, resetData, createUser, expectError } from "./harness.mjs";

const pglite = await loadPglite();
const STAFF = "00000000-0000-0000-0000-00000000000a";
const PARENT_A = "00000000-0000-0000-0000-0000000000a1";
const PARENT_B = "00000000-0000-0000-0000-0000000000a2";
const PARENT_C = "00000000-0000-0000-0000-0000000000a3";

// Instantané de base : une équipe, une saison, deux joueurs (dont un identifiant hérité « eff-01 », pas un UUID).
function baseSnapshot() {
  return {
    team_id: "t1", season_id: "s1",
    players: [
      { id: "eff-01", first_name: "Léo", last_name: "Test", position: "" },
      { id: "p2", first_name: "Max", last_name: "Exemple", position: "Gardien" },
    ],
    development_goals: [{ id: "g1", player_id: "eff-01", label: "Pied faible", status: "En cours" }],
    individual_programs: [{ id: "i1", player_id: "eff-01", title: "Conduite en slalom", content: { theme: "technique", frequency: "2x/semaine" } }],
    injuries: [{ id: "j1", player_id: "eff-01", status: "en cours", rtp_stage: "reprise_partielle" }],
    sessions: [
      { id: "se1", date: "2026-10-14", label: "Entraînement", start_time: "18:30", end_time: "20:00" },
      { id: "se2", date: "2026-10-21", label: "", start_time: "", end_time: "" },
    ],
    club_faq: [{ id: "f1", question: "Où se retrouve-t-on ?", answer: "Au stade." }],
    club_events: [{ id: "e1", title: "Tournoi du club", date: "2026-11-01", end_date: "", start_time: "", end_time: "", location: "Stade", target_team_ids: ["t1"] }],
    carpool_offers: [{ id: "c1", driver_name: "Marc", event_label: "Match à l'extérieur", date: "", seats_total: 2 }],
    competitions: [{ id: "k1", name: "Championnat" }],
    fixtures: [{ id: "x1", competition_id: "k1", date: "2026-10-18", opponent: "FC Exemple", location: "Domicile" }],
    matches: [{ id: "m1", name: "FC Exemple", date: "2026-09-20", closed: true }],
    match_stats: [{ match_id: "m1", player_id: "eff-01", buts: 1, passes_decisives: 2, highlights: [] }],
    forum_threads: [{ id: "th1", title: "Infos générales", type: "general", linked_event_title: "", linked_event_date: "", created_at: "2026-10-01T10:00:00.000Z", target_player_ids: [] }],
    forum_messages: [{ id: "fm1", thread_id: "th1", author_name: "Coach", content: "Bienvenue", at: "2026-10-01T10:05:00.000Z" }],
  };
}

const TABLES = ["players", "development_goals", "individual_programs", "injuries", "sessions", "club_faq", "club_events",
  "carpool_offers", "competitions", "fixtures", "matches", "match_stats", "forum_threads", "forum_messages", "forum_thread_participants"];

describe("publish_snapshot (Postgres local)", { skip: pglite ? false : SKIP_MESSAGE }, () => {
  let db;
  before(async () => { db = await createDb(pglite); });
  beforeEach(async () => {
    await resetData(db);
    await createUser(db, STAFF, "staff@example.test");
    await db.query(`insert into staff_profiles (id) values ($1)`, [STAFF]);
    await createUser(db, PARENT_A, "parent-a@example.test");
    await createUser(db, PARENT_B, "parent-b@example.test");
    await createUser(db, PARENT_C, "parent-c@example.test");
  });

  const publish = (snap, uid = STAFF) =>
    asUser(db, uid, async () => (await db.query(`select publish_snapshot($1::jsonb) as r`, [JSON.stringify(snap)])).rows[0].r);
  const count = async (table) => (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n;
  const link = (parent, player) => db.query(`insert into parent_player_links (parent_id, player_id) values ($1, $2)`, [parent, player]);
  // Photographie de toutes les tables publiées (updated_at inclus) : sert à prouver qu'un échec n'a rien changé.
  async function fingerprint() {
    const out = {};
    for (const t of TABLES) out[t] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) as r from ${t} x`)).rows[0].r;
    return out;
  }

  it("publie un instantané complet et renvoie des comptes", async () => {
    const r = await publish(baseSnapshot());
    assert.deepEqual(
      { players: r.counts.players, goals: r.counts.development_goals, programs: r.counts.individual_programs, injuries: r.counts.injuries,
        sessions: r.counts.sessions, faq: r.counts.club_faq, events: r.counts.club_events, offers: r.counts.carpool_offers,
        competitions: r.counts.competitions, fixtures: r.counts.fixtures, matches: r.counts.matches, stats: r.counts.match_stats,
        threads: r.counts.forum_threads, messages: r.counts.forum_messages },
      { players: 2, goals: 1, programs: 1, injuries: 1, sessions: 2, faq: 1, events: 1, offers: 1, competitions: 1, fixtures: 1, matches: 1, stats: 1, threads: 1, messages: 1 }
    );
    assert.deepEqual(r.skipped, {});
    assert.deepEqual(r.individual_threads_without_parent, []);
    // Le périmètre vient de l'objet, pas des lignes.
    const { rows } = await db.query(`select team_id, season_id from sessions order by id`);
    assert.deepEqual(rows, [{ team_id: "t1", season_id: "s1" }, { team_id: "t1", season_id: "s1" }]);
    // Heures de séance, date d'événement, lieu et programme : bien stockés.
    assert.deepEqual((await db.query(`select start_time, end_time from sessions where id = 'se1'`)).rows[0], { start_time: "18:30", end_time: "20:00" });
    assert.equal((await db.query(`select content->>'frequency' as f from individual_programs`)).rows[0].f, "2x/semaine");
  });

  describe("les défauts de l'audit ne bloquent plus la publication", () => {
    it("une blessure d'un joueur absent de l'effectif est écartée (au lieu de violer la clé étrangère)", async () => {
      const snap = baseSnapshot();
      snap.injuries.push({ id: "j2", player_id: "parti-depuis", status: "en cours", rtp_stage: "" });
      const r = await publish(snap);
      assert.equal(r.counts.injuries, 1);
      assert.equal(r.skipped.injuries, 1);
      assert.equal(await count("injuries"), 1);
    });

    it("les objectifs et programmes d'un joueur absent de l'effectif sont écartés aussi", async () => {
      const snap = baseSnapshot();
      snap.development_goals.push({ id: "g2", player_id: "parti-depuis", label: "Fantôme", status: "" });
      snap.individual_programs.push({ id: "i2", player_id: "parti-depuis", title: "Fantôme", content: {} });
      const r = await publish(snap);
      assert.deepEqual(r.skipped, { development_goals: 1, individual_programs: 1 });
      assert.equal(await count("development_goals"), 1);
      assert.equal(await count("individual_programs"), 1);
    });

    it("une date vide devient NULL (au lieu de « invalid input syntax for type date »)", async () => {
      const snap = baseSnapshot();
      snap.forum_threads[0].linked_event_date = "";
      snap.carpool_offers[0].date = "";
      snap.club_events[0].end_date = "";
      await publish(snap);
      assert.equal((await db.query(`select date from carpool_offers`)).rows[0].date, null);
      assert.equal((await db.query(`select linked_event_date from forum_threads`)).rows[0].linked_event_date, null);
      assert.equal((await db.query(`select end_date from club_events`)).rows[0].end_date, null);
    });

    it("un programme sans titre fait échouer proprement, en nommant l'étape", async () => {
      const snap = baseSnapshot();
      snap.individual_programs[0].title = null;
      const err = await expectError(publish(snap));
      assert.ok(err, "la publication aurait dû échouer");
      assert.match(err.message, /individual_programs/);
      assert.match(err.message, /rien n'a été modifié/);
      assert.equal(await count("players"), 0, "même les joueurs, écrits avant, sont annulés");
    });
  });

  describe("atomicité", () => {
    it("une erreur à une étape tardive n'a laissé aucune trace des étapes précédentes", async () => {
      await publish(baseSnapshot());
      const before = await fingerprint();

      // Deuxième publication : tout change (joueur renommé, objectif modifié, séances remplacées…) mais
      // une date invalide en séance fait échouer l'étape « sessions », après players/matches/goals/programs/injuries.
      const bad = baseSnapshot();
      bad.players[0].first_name = "Renommé";
      bad.development_goals = [{ id: "g9", player_id: "eff-01", label: "Tout autre objectif", status: "Atteint" }];
      bad.injuries = [];
      bad.matches.push({ id: "m2", name: "Autre match", date: "2026-09-27", closed: true });
      bad.sessions = [{ id: "se9", date: "pas-une-date", label: "Cassée", start_time: "", end_time: "" }];
      const err = await expectError(publish(bad));
      assert.ok(err, "la publication aurait dû échouer");
      assert.match(err.message, /sessions/);
      assert.match(err.message, /pas-une-date/);

      assert.deepEqual(await fingerprint(), before, "le portail doit être exactement dans l'état d'avant");
    });

    it("une collection manquante est refusée (jamais prise pour « tout supprimer »)", async () => {
      await publish(baseSnapshot());
      const before = await fingerprint();
      const snap = baseSnapshot();
      delete snap.injuries;
      const err = await expectError(publish(snap));
      assert.match(err.message, /injuries/);
      assert.deepEqual(await fingerprint(), before);
    });

    it("un effectif vide est refusé (navigateur neuf sans données locales)", async () => {
      await publish(baseSnapshot());
      const before = await fingerprint();
      const snap = baseSnapshot();
      snap.players = [];
      const err = await expectError(publish(snap));
      assert.match(err.message, /Effectif vide/);
      assert.deepEqual(await fingerprint(), before);
    });

    it("team_id ou season_id manquant est refusé", async () => {
      const snap = baseSnapshot();
      snap.season_id = "  ";
      assert.match((await expectError(publish(snap))).message, /season_id/);
    });
  });

  describe("droits", () => {
    it("un parent lié à un enfant ne peut pas publier", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      const before = await fingerprint();
      const err = await expectError(publish(baseSnapshot(), PARENT_A));
      assert.equal(err.code, "42501");
      assert.match(err.message, /réservée au staff/);
      assert.deepEqual(await fingerprint(), before);
    });

    it("un anonyme ne peut même pas appeler la fonction", async () => {
      const err = await expectError(asAnon(db, () => db.query(`select publish_snapshot($1::jsonb)`, [JSON.stringify(baseSnapshot())])));
      assert.match(err.message, /permission denied/);
      assert.equal(await count("players"), 0);
    });

    it("le portail ne contient aucune colonne clinique (statut RTP seulement)", async () => {
      const { rows } = await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'injuries' order by 1`);
      assert.deepEqual(rows.map((r) => r.column_name), ["id", "player_id", "rtp_stage", "season_id", "status", "team_id", "updated_at"]);
    });
  });

  describe("remplacement par périmètre", () => {
    it("remplace en bloc l'équipe/saison publiée sans toucher une autre équipe", async () => {
      await publish(baseSnapshot());
      // Autre équipe, mêmes types de données.
      const other = baseSnapshot();
      other.team_id = "t2";
      other.players = [{ id: "q1", first_name: "Eva", last_name: "Autre", position: "" }];
      other.development_goals = [{ id: "g-t2", player_id: "q1", label: "Autre équipe", status: "" }];
      other.individual_programs = []; other.injuries = []; other.matches = []; other.match_stats = [];
      other.sessions = [{ id: "se-t2", date: "2026-10-15", label: "Autre séance", start_time: "", end_time: "" }];
      other.club_faq = []; other.competitions = []; other.fixtures = []; other.carpool_offers = [];
      other.forum_threads = []; other.forum_messages = [];
      await publish(other);

      // Nouvelle publication de t1 avec une seule séance : l'autre séance de t1 disparaît, celle de t2 reste.
      const next = baseSnapshot();
      next.sessions = [{ id: "se1", date: "2026-10-14", label: "Entraînement", start_time: "", end_time: "" }];
      await publish(next);
      const { rows } = await db.query(`select id, team_id from sessions order by id`);
      assert.deepEqual(rows, [{ id: "se-t2", team_id: "t2" }, { id: "se1", team_id: "t1" }]);
      assert.equal(await count("development_goals"), 2, "les objectifs des deux équipes sont conservés");
    });

    it("remplace la table des événements du club en entier", async () => {
      await publish(baseSnapshot());
      const next = baseSnapshot();
      next.club_events = [{ id: "e2", title: "Stage", date: "2026-12-20", end_date: "2026-12-22", start_time: "09:00", end_time: "17:00", location: "", target_team_ids: [] }];
      await publish(next);
      const { rows } = await db.query(`select id, end_date::text as end_date, start_time, target_team_ids from club_events`);
      assert.deepEqual(rows, [{ id: "e2", end_date: "2026-12-22", start_time: "09:00", target_team_ids: [] }]);
    });

    it("republier deux fois le même instantané ne change rien (hors updated_at)", async () => {
      await publish(baseSnapshot());
      const strip = (fp) => JSON.parse(JSON.stringify(fp, (k, v) => (k === "updated_at" ? undefined : v)));
      const first = strip(await fingerprint());
      const r2 = await publish(baseSnapshot());
      assert.deepEqual(strip(await fingerprint()), first);
      assert.equal(r2.counts.players, 2);
    });

    it("tolère un identifiant en double dans l'instantané (garde le premier au lieu d'échouer)", async () => {
      const snap = baseSnapshot();
      snap.players.push({ id: "eff-01", first_name: "Doublon", last_name: "Test", position: "" });
      snap.sessions.push({ ...snap.sessions[0] });
      await publish(snap);
      assert.equal(await count("players"), 2);
      assert.equal(await count("sessions"), 2);
    });
  });

  describe("les écritures des parents survivent à la republication", () => {
    it("journal, passagers de covoiturage et messages de parents ne sont pas effacés", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      await db.query(`insert into player_journal_entries (id, player_id, parent_id, date, content) values ('pj1', 'eff-01', $1, '2026-10-02', 'Il a bien dormi')`, [PARENT_A]);
      await db.query(`insert into carpool_passengers (offer_id, parent_id, player_id, passenger_name) values ('c1', $1, 'eff-01', 'Léo Test')`, [PARENT_A]);
      await db.query(`insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values ('pm1', 'th1', 'parent', 'Parent de Léo', $1, 'Merci !')`, [PARENT_A]);

      const r = await publish(baseSnapshot());
      assert.equal(r.counts.players, 2);
      assert.equal(await count("player_journal_entries"), 1);
      assert.equal(await count("carpool_passengers"), 1);
      assert.equal(await count("forum_messages where author_kind = 'parent'"), 1);
    });

    it("un message du staff portant l'identifiant d'un message de parent ne l'écrase jamais", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      await db.query(`insert into forum_messages (id, thread_id, author_kind, author_name, parent_id, content) values ('pm1', 'th1', 'parent', 'Parent de Léo', $1, 'Texte du parent')`, [PARENT_A]);
      const snap = baseSnapshot();
      snap.forum_messages.push({ id: "pm1", thread_id: "th1", author_name: "Coach", content: "Texte du staff", at: "" });
      const r = await publish(snap);
      assert.equal(r.parent_messages_ignored, 1, "compté à part : attendu, pas une ligne « écartée » alarmante");
      assert.equal(r.skipped.forum_messages, undefined);
      assert.equal(r.counts.forum_messages, 1, "seul le message du staff « fm1 » est écrit");
      const m = (await db.query(`select author_kind, content from forum_messages where id = 'pm1'`)).rows[0];
      assert.deepEqual(m, { author_kind: "parent", content: "Texte du parent" });
    });

    it("un message du staff déjà publié est mis à jour, sans doublon", async () => {
      await publish(baseSnapshot());
      const snap = baseSnapshot();
      snap.forum_messages[0].content = "Bienvenue à tous (corrigé)";
      await publish(snap);
      assert.equal(await count("forum_messages"), 1);
      assert.equal((await db.query(`select content from forum_messages`)).rows[0].content, "Bienvenue à tous (corrigé)");
    });
  });

  describe("conversations individuelles : participants figés", () => {
    const individual = (targets) => ({ id: "th2", title: "Léo seul", type: "individuelle", linked_event_title: "", linked_event_date: "", created_at: "", target_player_ids: targets });

    it("participants = parents liés au moment de la première publication", async () => {
      await publish(baseSnapshot());              // crée les joueurs
      await link(PARENT_A, "eff-01");
      const snap = baseSnapshot();
      snap.forum_threads.push(individual(["eff-01"]));
      const r = await publish(snap);
      assert.equal(r.counts.forum_thread_participants, 1);
      assert.deepEqual(r.individual_threads_without_parent, []);
      const visible = await asUser(db, PARENT_A, async () => (await db.query(`select id from forum_threads order by id`)).rows.map((x) => x.id));
      assert.deepEqual(visible, ["th1", "th2"]);
    });

    it("un parent lié APRÈS la première publication ne voit jamais l'ancienne conversation", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      const snap = baseSnapshot();
      snap.forum_threads.push(individual(["eff-01"]));
      await publish(snap);
      await link(PARENT_B, "eff-01");             // second parent, lié plus tard
      await publish(snap);                          // republication du même sujet
      const participants = (await db.query(`select parent_id from forum_thread_participants where thread_id = 'th2'`)).rows.map((x) => x.parent_id);
      assert.deepEqual(participants, [PARENT_A]);
      const seenByB = await asUser(db, PARENT_B, async () => (await db.query(`select id from forum_threads order by id`)).rows.map((x) => x.id));
      assert.deepEqual(seenByB, ["th1"], "B voit le sujet général, pas la conversation privée");
    });

    it("une conversation publiée avant tout lien parent est signalée, et le reste après liaison", async () => {
      await publish(baseSnapshot());
      const snap = baseSnapshot();
      snap.forum_threads.push(individual(["eff-01"]));
      const r1 = await publish(snap);
      assert.deepEqual(r1.individual_threads_without_parent, [{ id: "th2", title: "Léo seul" }]);
      assert.equal(await count("forum_thread_participants"), 0);

      await link(PARENT_A, "eff-01");               // le parent est lié ensuite…
      const r2 = await publish(snap);
      // …mais les participants sont figés à la première publication : la conversation reste illisible.
      assert.deepEqual(r2.individual_threads_without_parent, [{ id: "th2", title: "Léo seul" }]);
      assert.equal(await count("forum_thread_participants"), 0);
    });

    it("une conversation qui vise plusieurs joueurs réunit les parents de chacun", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      await link(PARENT_B, "p2");
      await link(PARENT_C, "p2");
      const snap = baseSnapshot();
      snap.forum_threads.push(individual(["eff-01", "p2"]));
      const r = await publish(snap);
      assert.equal(r.counts.forum_thread_participants, 3);
    });
  });

  describe("événements du club : chaque parent ne lit que ceux de l'équipe de son enfant", () => {
    it("filtre par équipe cible, « tout le club » pour une liste vide, rien sans enfant lié", async () => {
      const snap = baseSnapshot();
      snap.club_events = [
        { id: "e-t1", title: "Pour t1", date: "2026-11-01", end_date: "", start_time: "", end_time: "", location: "", target_team_ids: ["t1"] },
        { id: "e-t2", title: "Pour t2", date: "2026-11-02", end_date: "", start_time: "", end_time: "", location: "", target_team_ids: ["t2"] },
        { id: "e-all", title: "Pour tous", date: "2026-11-03", end_date: "", start_time: "", end_time: "", location: "", target_team_ids: [] },
      ];
      await publish(snap);
      await link(PARENT_A, "eff-01"); // enfant de l'équipe t1
      const ids = (uid) => asUser(db, uid, async () => (await db.query(`select id from club_events order by id`)).rows.map((x) => x.id));
      assert.deepEqual(await ids(PARENT_A), ["e-all", "e-t1"]);
      assert.deepEqual(await ids(PARENT_C), [], "un compte sans enfant lié ne lit rien");
      assert.equal((await ids(STAFF)).length, 3, "le staff lit tout");
    });
  });

  describe("lecture par un parent après publication (régression des policies)", () => {
    it("un parent lit les données de son enfant et celles de son équipe, pas celles d'un autre enfant", async () => {
      await publish(baseSnapshot());
      await link(PARENT_A, "eff-01");
      await asUser(db, PARENT_A, async () => {
        const q = async (sql) => (await db.query(sql)).rows;
        assert.deepEqual((await q(`select id from development_goals`)).map((r) => r.id), ["g1"]);
        assert.deepEqual((await q(`select id from individual_programs`)).map((r) => r.id), ["i1"]);
        assert.deepEqual((await q(`select id from injuries`)).map((r) => r.id), ["j1"]);
        assert.equal((await q(`select id from sessions`)).length, 2);
        assert.equal((await q(`select id from fixtures`)).length, 1);
        assert.equal((await q(`select id from players`)).length, 1, "seulement son enfant");
        assert.equal((await q(`select id from match_stats`)).length, 1);
      });
    });
  });
});
