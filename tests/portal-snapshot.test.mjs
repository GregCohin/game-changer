// Tests de assemblePortalSnapshot (src/lib/portalSnapshot.js) : ce qui est envoyé au portail parent, ce
// qui est écarté, et ce que le staff en est informé. Aucune donnée réelle : noms et dates inventés.
//
// Ces tests rejouent les défauts de l'audit du 07/10/2026 (point 2) du côté JavaScript :
//  - les programmes individuels n'avaient pas de `title` (NOT NULL en base) → toute publication échouait ;
//  - la blessure d'un joueur retiré de l'effectif violait la clé étrangère ;
//  - une date vide '' donnait « invalid input syntax for type date » ;
// et les règles de confidentialité de la publication : jamais de champ clinique, jamais de contenu réservé
// au staff, jamais de contenu destiné à une autre équipe.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assemblePortalSnapshot, cleanDate, cleanTime, isIsoDate, describePublishedCounts, describeUnreachableThreads } from "../src/lib/portalSnapshot.js";

import { local } from "./fixtures/portal-local-data.mjs";

const build = (overrides) => assemblePortalSnapshot(local(overrides));

describe("les défauts de l'audit ne bloquent plus la publication", () => {
  test("un programme individuel reçoit un titre (le nom de l'exercice) et un contenu lisible", () => {
    const { snapshot, problems } = build();
    assert.deepEqual(problems, []);
    assert.equal(snapshot.individual_programs.length, 1);
    const program = snapshot.individual_programs[0];
    assert.equal(program.title, "Conduite en slalom");
    assert.deepEqual(program.content, { theme: "technique", exerciseName: "Conduite en slalom", frequency: "2x/semaine", objectiveTitle: "Pied faible" });
    // Aucun identifiant interne ni horodatage dans ce que voit le parent.
    assert.equal("exerciseId" in program.content, false);
    assert.equal("addedAt" in program.content, false);
  });

  test("la blessure d'un joueur absent de l'effectif est écartée avec une information, pas une erreur", () => {
    const base = local();
    const { snapshot, problems, notices } = assemblePortalSnapshot({
      ...base, injuries: [...base.injuries, { id: "j2", playerId: "parti-depuis", status: "en cours", rtpStage: "" }],
    });
    assert.equal(snapshot.injuries.length, 1);
    assert.equal(problems.length, 0);
    assert.ok(notices.some((n) => /1 blessure d'un joueur qui n'est plus dans l'effectif/.test(n)), notices.join(" | "));
  });

  test("objectifs et programmes d'un joueur absent de l'effectif sont écartés aussi", () => {
    const base = local();
    const { snapshot, notices } = assemblePortalSnapshot({
      ...base,
      devPlans: { ...base.devPlans, "parti-depuis": [{ id: "g9", title: "Fantôme", status: "" }] },
      programs: { ...base.programs, "parti-depuis": [{ id: "pr9", theme: "physique", exerciseName: "Fantôme" }] },
    });
    assert.deepEqual(snapshot.development_goals.map((g) => g.id), ["g1"]);
    assert.deepEqual(snapshot.individual_programs.map((p) => p.id), ["pr1"]);
    assert.equal(notices.length, 2);
  });

  test("une date facultative vide devient null, jamais ''", () => {
    const { snapshot } = build();
    assert.equal(snapshot.carpool_offers[0].date, null);
    assert.equal(snapshot.forum_threads[0].linked_event_date, null);
    assert.equal(snapshot.club_events[0].end_date, null);
    assert.equal(snapshot.players[1].position, null);
    // Aucune chaîne vide dans aucune ligne publiée, sauf les textes obligatoires non vides.
    const empties = [];
    for (const [table, rows] of Object.entries(snapshot)) {
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, i) => Object.entries(row).forEach(([k, v]) => { if (v === "") empties.push(`${table}[${i}].${k}`); }));
    }
    assert.deepEqual(empties, []);
  });
});

describe("rien de clinique ne part vers le portail", () => {
  test("une blessure est réduite à (id, joueur, statut, étape de retour au jeu)", () => {
    const { snapshot } = build();
    assert.deepEqual(snapshot.injuries, [{ id: "j1", player_id: "eff-01", status: "en cours", rtp_stage: "reprise_partielle" }]);
    const text = JSON.stringify(snapshot);
    for (const secret of ["Entorse", "Ligamentaire", "note médicale", "Choc", "phase 1", "dateDebut", "programPhases"]) {
      assert.equal(text.includes(secret), false, `« ${secret} » ne doit jamais être publié`);
    }
  });

  test("les notes internes d'un objectif ne partent pas", () => {
    const text = JSON.stringify(build().snapshot);
    assert.equal(text.includes("interne"), false);
  });
});

describe("validation avant envoi : la fiche en cause est nommée", () => {
  test("une séance sans date n'est pas publiée et le staff sait laquelle", () => {
    const base = local();
    const { snapshot, problems } = assemblePortalSnapshot({ ...base, sessions: [...base.sessions, { id: "se2", name: "Séance fantôme", date: "" }] });
    assert.deepEqual(snapshot.sessions.map((s) => s.id), ["se1"]);
    assert.deepEqual(problems, [{ what: "Séance", label: "« Séance fantôme »", reason: "date manquante" }]);
  });

  test("une date invalide (30 février) est refusée avec la valeur saisie", () => {
    const base = local();
    const { snapshot, problems } = assemblePortalSnapshot({ ...base, sessions: [{ id: "se3", name: "Cassée", date: "2026-02-30" }] });
    assert.equal(snapshot.sessions.length, 0);
    assert.equal(problems[0].reason, "date invalide");
    assert.match(problems[0].label, /2026-02-30/);
  });

  test("un match du calendrier sans date indique la compétition et l'adversaire", () => {
    const base = local();
    const comp = { id: "k2", name: "Coupe", fixtures: [{ id: "x9", date: "", opponent: "AS Exemple", venue: "Extérieur" }] };
    const { snapshot, problems } = assemblePortalSnapshot({ ...base, competitions: [...base.competitions, comp] });
    assert.equal(snapshot.fixtures.length, 1);
    assert.equal(snapshot.competitions.length, 2, "la compétition reste publiée");
    assert.deepEqual(problems, [{ what: "Match du calendrier", label: "Coupe — vs AS Exemple", reason: "date manquante" }]);
  });

  test("question de FAQ sans réponse, offre de covoiturage sans conducteur, objectif sans titre", () => {
    const base = local();
    const { snapshot, problems } = assemblePortalSnapshot({
      ...base,
      faq: [{ id: "f2", question: "Question seule", answer: "" }],
      carpool: [{ id: "c2", eventDate: "2026-10-20", eventTitle: "Match", driverName: "", seats: 2 }],
      devPlans: { "eff-01": [{ id: "g2", title: "", status: "" }] },
    });
    assert.equal(snapshot.club_faq.length + snapshot.carpool_offers.length + snapshot.development_goals.length, 0);
    assert.deepEqual(problems.map((p) => `${p.what}: ${p.reason}`).sort(), ["Objectif: titre manquant", "Offre de covoiturage: conducteur manquant", "Question de la FAQ: réponse vide"]);
  });

  test("un identifiant en double n'est publié qu'une fois", () => {
    const base = local();
    const { snapshot, notices } = assemblePortalSnapshot({ ...base, roster: [...base.roster, { id: "eff-01", firstName: "Doublon", lastName: "Test" }], sessions: [...base.sessions, { ...base.sessions[0] }] });
    assert.equal(snapshot.players.length, 2);
    assert.equal(snapshot.players.find((p) => p.id === "eff-01").first_name, "Léo", "le premier est conservé");
    assert.equal(snapshot.sessions.length, 1);
    assert.ok(notices.some((n) => /2 doublons/.test(n)));
  });

  test("un nombre de places absurde devient 0, une date de covoiturage invalide est signalée", () => {
    const base = local();
    const { snapshot, problems } = assemblePortalSnapshot({
      ...base,
      carpool: [{ id: "c1", eventDate: "", eventTitle: "A", driverName: "Marc", seats: "beaucoup" }, { id: "c3", eventDate: "demain", eventTitle: "B", driverName: "Eva", seats: 2 }],
    });
    assert.equal(snapshot.carpool_offers.length, 1);
    assert.equal(snapshot.carpool_offers[0].seats_total, 0);
    assert.deepEqual(problems.map((p) => p.reason), ["date invalide"]);
  });
});

describe("blocages : la publication ne part pas", () => {
  test("effectif vide", () => {
    const { snapshot, blocking } = build({ roster: [] });
    assert.equal(snapshot, null);
    assert.match(blocking[0], /effectif est vide/);
    assert.match(blocking[0], /sauvegarde/);
  });

  test("équipe ou saison introuvable", () => {
    assert.equal(build({ teamId: "" }).snapshot, null);
    assert.equal(build({ seasonId: "" }).snapshot, null);
  });
});

describe("événements du club", () => {
  const event = (over) => ({ id: "e", name: "Événement", date: "2026-11-01", endDate: "", startTime: "", endTime: "", targetCategories: [], targetTeamIds: [], includePlayers: true, includeStaff: true, locationId: "", ...over });

  test("un événement sans « Joueurs concernés » (réunion de staff) n'est jamais publié, et le staff en est informé", () => {
    const { snapshot, notices } = build({ clubEvents: [event({ id: "e1", name: "Réunion du staff", includePlayers: false, targetTeamIds: ["t1"] }), event({ id: "e2", name: "Tournoi", targetTeamIds: ["t1"] })] });
    assert.deepEqual(snapshot.club_events.map((e) => e.id), ["e2"]);
    assert.ok(notices.some((n) => /1 événement sans « Joueurs concernés »/.test(n)));
    assert.equal(JSON.stringify(snapshot).includes("Réunion du staff"), false);
  });

  test("une catégorie convoquée est traduite en identifiants d'équipes ; sans convocation = tout le club", () => {
    const { snapshot } = build({ clubEvents: [event({ id: "a", targetCategories: ["U13"] }), event({ id: "b", targetCategories: ["U13", "U15"] }), event({ id: "c" }), event({ id: "d", targetTeamIds: ["t2"] })] });
    const byId = Object.fromEntries(snapshot.club_events.map((e) => [e.id, e.target_team_ids.sort()]));
    assert.deepEqual(byId, { a: ["t1"], b: ["t1", "t2"], c: [], d: ["t2"] });
  });

  test("une convocation qui ne désigne aucune équipe existante n'est pas publiée (information au staff)", () => {
    const { snapshot, notices } = build({ clubEvents: [event({ id: "x", targetCategories: ["U99"] })] });
    assert.equal(snapshot.club_events.length, 0);
    assert.ok(notices.some((n) => /n'existe pas dans Club → Équipes/.test(n)));
  });

  test("les événements terminés ne sont pas publiés, un stage en cours oui, sans réclamer de correction", () => {
    const { snapshot, problems } = build({ clubEvents: [
      event({ id: "passe", date: "2026-09-01" }),
      event({ id: "passe-sans-nom", name: "", date: "2026-09-02" }),
      event({ id: "stage", date: "2026-10-05", endDate: "2026-10-09" }),
      event({ id: "aujourdhui", date: "2026-10-07" }),
    ] });
    assert.deepEqual(snapshot.club_events.map((e) => e.id).sort(), ["aujourdhui", "stage"]);
    assert.deepEqual(problems, []);
  });

  test("lieu résolu depuis les lieux du club, heures et date de fin normalisées", () => {
    const { snapshot } = build({ clubEvents: [event({ id: "e", date: "2026-12-20", endDate: "2026-12-22", startTime: "9:00", endTime: "17:30", locationId: "loc1" })] });
    assert.deepEqual(snapshot.club_events[0], {
      id: "e", title: "Événement", date: "2026-12-20", end_date: "2026-12-22", start_time: "09:00", end_time: "17:30",
      location: "Stade municipal", target_team_ids: [],
    });
  });

  test("un événement sans date est signalé (on ne peut pas dire qu'il est passé)", () => {
    const { problems } = build({ clubEvents: [event({ id: "e", name: "Sans date", date: "" })] });
    assert.deepEqual(problems, [{ what: "Événement du club", label: "« Sans date »", reason: "date manquante" }]);
  });
});

describe("forum", () => {
  const thread = (over) => ({ id: "t", title: "Sujet", type: "general", linkedEventTitle: "", linkedEventDate: "", createdAt: 1759300000000, targetCategories: [], targetTeamIds: [], includePlayers: true, includeStaff: true, targetIndividuals: [], ...over });
  const message = (over) => ({ id: "m", threadId: "t", authorName: "Coach", content: "Texte", at: 1759300100000, attachment: null, ...over });

  test("un sujet réservé au staff n'est pas publié, ni ses messages", () => {
    const { snapshot, notices } = build({
      forumThreads: [thread({ id: "staff", title: "Discussion du staff", includePlayers: false }), thread({ id: "ok" })],
      forumMessages: [message({ id: "m1", threadId: "staff", content: "Confidentiel" }), message({ id: "m2", threadId: "ok", content: "Public" })],
    });
    assert.deepEqual(snapshot.forum_threads.map((t) => t.id), ["ok"]);
    assert.deepEqual(snapshot.forum_messages.map((m) => m.id), ["m2"]);
    assert.equal(JSON.stringify(snapshot).includes("Confidentiel"), false);
    assert.ok(notices.some((n) => /1 sujet du forum sans « Joueurs concernés »/.test(n)));
  });

  test("un sujet destiné à une autre catégorie ou équipe n'est pas publié depuis celle-ci", () => {
    const { snapshot, notices } = build({ forumThreads: [
      thread({ id: "autre", targetCategories: ["U15"] }),
      thread({ id: "autre-equipe", targetTeamIds: ["t2"] }),
      thread({ id: "mienne", targetCategories: ["U13"] }),
      thread({ id: "mon-equipe", targetTeamIds: ["t1"] }),
      thread({ id: "tous" }),
    ] });
    assert.deepEqual(snapshot.forum_threads.map((t) => t.id).sort(), ["mienne", "mon-equipe", "tous"]);
    assert.ok(notices.some((n) => /2 sujets du forum destinés à d'autres équipes/.test(n)));
  });

  test("conversation individuelle : les joueurs visés sont lus dans targetIndividuals (objets), les membres du staff ignorés", () => {
    // Le staff stocke targetIndividuals sous la forme { kind, id, name } : l'ancienne publication envoyait
    // ces objets comme identifiants de joueurs, si bien qu'aucun parent n'était jamais rattaché.
    const { snapshot } = build({ forumThreads: [thread({ id: "ind", type: "individuelle", targetIndividuals: [
      { kind: "player", id: "eff-01", name: "Léo Test" }, { kind: "staff", id: "s1", name: "Coach" }, { kind: "player", id: "eff-01", name: "Léo Test" }, "p2",
    ] })] });
    assert.deepEqual(snapshot.forum_threads[0].target_player_ids, ["eff-01", "p2"]);
  });

  test("une conversation entre membres du staff seulement n'est pas publiée", () => {
    const { snapshot, notices } = build({ forumThreads: [thread({ id: "ind", type: "individuelle", targetIndividuals: [{ kind: "staff", id: "s1", name: "Coach" }] })] });
    assert.equal(snapshot.forum_threads.length, 0);
    assert.ok(notices.some((n) => /1 conversation individuelle sans joueur concerné/.test(n)));
  });

  test("un message récupéré d'un parent n'est jamais republié comme message du staff", () => {
    const { snapshot } = build({
      forumThreads: [thread({ id: "ok" })],
      forumMessages: [message({ id: "staff-1", threadId: "ok" }), message({ id: "parent-1", threadId: "ok", authorName: "Parent de Léo", fromPortal: true })],
    });
    assert.deepEqual(snapshot.forum_messages.map((m) => m.id), ["staff-1"]);
  });

  test("un message sans texte (pièce jointe seule) est signalé, pas publié", () => {
    const { snapshot, notices } = build({ forumThreads: [thread({ id: "ok" })], forumMessages: [message({ id: "pj", threadId: "ok", content: "  " })] });
    assert.equal(snapshot.forum_messages.length, 0);
    assert.ok(notices.some((n) => /1 message du forum sans texte/.test(n)));
  });

  test("horodatages : date de création du sujet et du message au format ISO", () => {
    const { snapshot } = build({ forumThreads: [thread({ id: "ok", createdAt: Date.UTC(2026, 9, 1, 10, 0, 0) })], forumMessages: [message({ id: "m", threadId: "ok", at: Date.UTC(2026, 9, 1, 10, 5, 0) })] });
    assert.equal(snapshot.forum_threads[0].created_at, "2026-10-01T10:00:00.000Z");
    assert.equal(snapshot.forum_messages[0].at, "2026-10-01T10:05:00.000Z");
  });

  test("type de sujet inconnu : signalé", () => {
    const { problems } = build({ forumThreads: [thread({ id: "x", type: "mystere" })] });
    assert.equal(problems[0].what, "Sujet du forum");
    assert.match(problems[0].reason, /type inconnu/);
  });
});

describe("forme de l'instantané complet", () => {
  test("toutes les collections sont présentes (la base refuse une collection manquante) et sérialisables en JSON", () => {
    const { snapshot } = build();
    const keys = ["players", "development_goals", "individual_programs", "injuries", "sessions", "club_faq", "club_events", "carpool_offers", "competitions", "fixtures", "matches", "match_stats", "forum_threads", "forum_messages"];
    for (const key of keys) assert.ok(Array.isArray(snapshot[key]), key);
    assert.equal(snapshot.team_id, "t1");
    assert.equal(snapshot.season_id, "s1");
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot, "aucune valeur non sérialisable (undefined, Date…)");
  });

  test("aucune ligne ne porte team_id / season_id : c'est le périmètre de l'objet qui s'applique", () => {
    const { snapshot } = build();
    for (const key of Object.keys(snapshot)) {
      if (!Array.isArray(snapshot[key])) continue;
      for (const row of snapshot[key]) assert.equal("team_id" in row || "season_id" in row, false, key);
    }
  });

  test("statistiques : seulement pour un match publié et un joueur de l'effectif", () => {
    const base = local();
    const { snapshot } = assemblePortalSnapshot({ ...base, matchStats: [
      ...base.matchStats,
      { matchId: "m-inconnu", playerId: "eff-01", buts: 5, passesDecisives: 0, highlights: [] },
      { matchId: "m1", playerId: "parti-depuis", buts: 5, passesDecisives: 0, highlights: [] },
    ] });
    assert.equal(snapshot.match_stats.length, 1);
    assert.deepEqual(snapshot.match_stats[0], { match_id: "m1", player_id: "eff-01", buts: 1, passes_decisives: 2, highlights: [{ eventKey: "but", time: 12 }] });
  });

  test("un match sans date n'est pas publié, ses statistiques non plus", () => {
    const base = local();
    const { snapshot, problems } = assemblePortalSnapshot({ ...base, matches: [{ id: "m1", name: "Sans date", date: "" }] });
    assert.equal(snapshot.matches.length, 0);
    assert.equal(snapshot.match_stats.length, 0);
    assert.equal(problems[0].what, "Match analysé");
  });
});

describe("outils de mise en forme", () => {
  test("cleanDate / isIsoDate", () => {
    assert.equal(cleanDate("2026-10-07"), "2026-10-07");
    assert.equal(cleanDate(" 2026-10-07T00:00:00.000Z"), "2026-10-07");
    assert.equal(cleanDate("2026-10-07 18:30"), "2026-10-07");
    for (const bad of ["", null, undefined, "07/10/2026", "2026-13-01", "2026-02-30", "0000-01-01", "demain", 20261007, {}]) assert.equal(cleanDate(bad), "", String(bad));
    assert.equal(isIsoDate("2028-02-29"), true);
    assert.equal(isIsoDate("2027-02-29"), false);
  });

  test("cleanTime", () => {
    assert.equal(cleanTime("18:30"), "18:30");
    assert.equal(cleanTime("9:05"), "09:05");
    for (const bad of ["", "24:00", "12:60", "midi", null, "1830"]) assert.equal(cleanTime(bad), "", String(bad));
  });

  test("describePublishedCounts : accords au pluriel, tables vides omises", () => {
    assert.equal(describePublishedCounts({ players: 1, sessions: 12, fixtures: 0, club_events: 3 }), "1 joueur, 12 séances, 3 événements du club");
    assert.equal(describePublishedCounts({}), "");
  });

  test("describeUnreachableThreads : un message par conversation, avec la marche à suivre", () => {
    assert.deepEqual(describeUnreachableThreads([]), []);
    const [line] = describeUnreachableThreads([{ id: "th", title: "Léo seul" }]);
    assert.match(line, /« Léo seul »/);
    assert.match(line, /recrée la conversation/);
  });
});
