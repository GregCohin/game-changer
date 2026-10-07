// Contrat entre les deux moitiés de la publication : ce que assemblePortalSnapshot (src/lib/portalSnapshot.js)
// fabrique à partir des données locales du staff doit être accepté tel quel par publish_snapshot sur la vraie
// base (migrations rejouées dans PGlite — voir harness.mjs). Un test de chaque côté ne verrait pas une
// divergence de format entre les deux ; celui-ci la voit.
//
// Il rejoue aussi, de bout en bout, les défauts de l'audit du 07/10/2026 : avec les données ci-dessous, la
// publication d'AVANT échouait (programme sans titre, blessure d'un joueur parti, date vide), et les
// participants d'une conversation individuelle n'étaient jamais enregistrés (le staff stocke ses cibles sous
// la forme { kind, id, name } et l'ancien code les envoyait comme des identifiants).

import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadPglite, SKIP_MESSAGE, createDb, asUser, resetData, createUser } from "./harness.mjs";
import { assemblePortalSnapshot } from "../../src/lib/portalSnapshot.js";
import { local } from "../../tests/fixtures/portal-local-data.mjs";

const pglite = await loadPglite();
const STAFF = "00000000-0000-0000-0000-00000000000a";
const PARENT = "00000000-0000-0000-0000-0000000000a1";

describe("contrat JS ↔ SQL", { skip: pglite ? false : SKIP_MESSAGE }, () => {
  let db;
  before(async () => { db = await createDb(pglite); });
  beforeEach(async () => {
    await resetData(db);
    await createUser(db, STAFF, "staff@example.test");
    await db.query(`insert into staff_profiles (id) values ($1)`, [STAFF]);
    await createUser(db, PARENT, "parent@example.test");
  });

  const publish = (snapshot) =>
    asUser(db, STAFF, async () => (await db.query(`select publish_snapshot($1::jsonb) as r`, [JSON.stringify(snapshot)])).rows[0].r);

  // Données locales « sales » : cumule les défauts qui faisaient échouer la publication d'avant.
  const dirty = () => {
    const base = local();
    return {
      ...base,
      injuries: [...base.injuries, { id: "j2", playerId: "parti-depuis", status: "en cours", rtpStage: "" }],
      sessions: [...base.sessions, { id: "se-sans-date", name: "Sans date", date: "" }],
      forumThreads: [
        ...base.forumThreads,
        { id: "th-ind", title: "Point avec les parents de Léo", type: "individuelle", createdAt: 1759300000000, linkedEventTitle: "", linkedEventDate: "",
          targetIndividuals: [{ kind: "player", id: "eff-01", name: "Léo Test" }, { kind: "staff", id: "s1", name: "Coach" }] },
      ],
      forumMessages: [...base.forumMessages, { id: "fm2", threadId: "th-ind", authorName: "Coach", content: "Bonjour", at: 1759300200000, attachment: null }],
    };
  };

  it("la base accepte l'instantané construit à partir de données locales défectueuses", async () => {
    const { snapshot, problems } = assemblePortalSnapshot(dirty());
    assert.equal(problems.length, 1, "seule la séance sans date est signalée");
    const result = await publish(snapshot);
    assert.deepEqual(result.skipped, {}, "le client a déjà tout filtré : le serveur n'écarte rien");
    assert.equal(result.counts.individual_programs, 1);
    assert.equal(result.counts.injuries, 1);
    assert.equal((await db.query(`select count(*)::int as n from sessions`)).rows[0].n, 1);
    // Valeurs facultatives absentes = NULL en base.
    assert.equal((await db.query(`select date from carpool_offers`)).rows[0].date, null);
    assert.equal((await db.query(`select position from players where id = 'p2'`)).rows[0].position, null);
  });

  it("une conversation individuelle est rattachée aux parents liés aux joueurs visés (bogue des cibles { kind, id, name })", async () => {
    // L'effectif doit exister côté base pour pouvoir y lier un parent.
    await publish(assemblePortalSnapshot(local()).snapshot);
    await db.query(`insert into parent_player_links (parent_id, player_id) values ($1, 'eff-01')`, [PARENT]);

    const { snapshot } = assemblePortalSnapshot(dirty());
    const result = await publish(snapshot);
    assert.equal(result.counts.forum_thread_participants, 1);
    assert.deepEqual(result.individual_threads_without_parent, []);
    const visible = await asUser(db, PARENT, async () => (await db.query(`select id from forum_threads order by id`)).rows.map((r) => r.id));
    assert.deepEqual(visible, ["th-ind", "th1"]);
    const messages = await asUser(db, PARENT, async () => (await db.query(`select id, author_kind from forum_messages order by id`)).rows);
    assert.deepEqual(messages, [{ id: "fm1", author_kind: "staff" }, { id: "fm2", author_kind: "staff" }]);
  });

  it("événement ciblé : le parent d'une autre équipe ne le lit pas", async () => {
    const base = local();
    const events = [
      { ...base.clubEvents[0], id: "pour-t1", name: "Pour U13", targetCategories: ["U13"] },
      { ...base.clubEvents[0], id: "pour-t2", name: "Pour U15", targetCategories: ["U15"] },
      { ...base.clubEvents[0], id: "pour-tous", name: "Pour tous", targetCategories: [], targetTeamIds: [] },
    ];
    const { snapshot } = assemblePortalSnapshot({ ...base, clubEvents: events });
    await publish(snapshot);
    await db.query(`insert into parent_player_links (parent_id, player_id) values ($1, 'eff-01')`, [PARENT]); // eff-01 est dans l'équipe t1 (U13)
    const ids = await asUser(db, PARENT, async () => (await db.query(`select id from club_events order by id`)).rows.map((r) => r.id));
    assert.deepEqual(ids, ["pour-t1", "pour-tous"]);
  });

  it("republier les mêmes données locales est stable (compte identique)", async () => {
    const { snapshot } = assemblePortalSnapshot(dirty());
    const first = await publish(snapshot);
    const second = await publish(snapshot);
    assert.deepEqual(second.counts, first.counts);
  });
});
