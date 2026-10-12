// Sélection et mise en forme des données du portail parent (src/parent/lib/portalView.js).
//
// Défauts de l'audit du 07/10/2026 rejoués : « Séances à venir » affichait toutes les séances de la saison,
// passées comprises et dans l'ordre de la base ; les rencontres et les événements du club étaient publiés mais
// jamais montrés ; les matchs n'étaient pas triés.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatDayFr, formatTimeRange, formatDateRange, upcomingSessions, upcomingFixtures, upcomingEvents,
  upcomingCarpoolOffers, recentMatchStats, sortJournal, groupPrograms,
} from "../src/parent/lib/portalView.js";

const TODAY = "2026-10-07";

describe("dates et heures", () => {
  test("jour de la semaine correct, indépendant du fuseau", () => {
    assert.equal(formatDayFr("2026-10-07"), "mer. 07/10/2026");
    assert.equal(formatDayFr("2026-10-14"), "mer. 14/10/2026");
    assert.equal(formatDayFr("2027-03-28"), "dim. 28/03/2027", "jour du passage à l'heure d'été");
    assert.equal(formatDayFr("2026-10-07T00:00:00Z"), "mer. 07/10/2026");
  });

  test("date absente ou illisible : texte vide, jamais « undefined »", () => {
    for (const bad of [undefined, null, "", "demain", 12]) assert.equal(formatDayFr(bad), "");
  });

  test("plage d'heures et plage de dates", () => {
    assert.equal(formatTimeRange("18:30", "20:00"), "18:30–20:00");
    assert.equal(formatTimeRange("18:30", null), "18:30");
    assert.equal(formatTimeRange(null, "20:00"), "");
    assert.equal(formatDateRange("2026-12-20", "2026-12-22"), "du dim. 20/12/2026 au mar. 22/12/2026");
    assert.equal(formatDateRange("2026-12-20", null), "dim. 20/12/2026");
    assert.equal(formatDateRange("2026-12-20", "2026-12-20"), "dim. 20/12/2026");
    assert.equal(formatDateRange(null, null), "");
  });
});

describe("séances et rencontres : à venir seulement, de la plus proche à la plus lointaine", () => {
  const sessions = [
    { id: "futur-tard", date: "2026-11-10", start_time: "18:00" },
    { id: "passee", date: "2026-09-30", start_time: "18:00" },
    { id: "aujourdhui-tard", date: "2026-10-07", start_time: "19:00" },
    { id: "aujourdhui-tot", date: "2026-10-07", start_time: "09:00" },
    { id: "futur-proche", date: "2026-10-14", start_time: null },
    { id: "sans-date", date: null },
  ];

  test("exclut les séances passées et celles sans date, trie par date puis par heure", () => {
    assert.deepEqual(upcomingSessions(sessions, TODAY).map((s) => s.id), ["aujourdhui-tot", "aujourdhui-tard", "futur-proche", "futur-tard"]);
  });

  test("ne modifie pas la liste reçue", () => {
    const copy = JSON.stringify(sessions);
    upcomingSessions(sessions, TODAY);
    assert.equal(JSON.stringify(sessions), copy);
  });

  test("listes absentes : vides", () => {
    assert.deepEqual(upcomingSessions(undefined, TODAY), []);
    assert.deepEqual(upcomingFixtures(null, TODAY), []);
  });

  test("rencontres : mêmes règles", () => {
    const fixtures = [{ id: "b", date: "2026-10-25" }, { id: "a", date: "2026-10-18" }, { id: "vieux", date: "2026-09-01" }];
    assert.deepEqual(upcomingFixtures(fixtures, TODAY).map((f) => f.id), ["a", "b"]);
  });
});

describe("événements du club", () => {
  const events = [
    { id: "tous", date: "2026-11-03", target_team_ids: [] },
    { id: "t1", date: "2026-11-01", target_team_ids: ["t1"] },
    { id: "t2", date: "2026-11-02", target_team_ids: ["t2"] },
    { id: "ancien", date: "2026-09-01", target_team_ids: [] },
    { id: "stage-en-cours", date: "2026-10-05", end_date: "2026-10-09", target_team_ids: ["t1"] },
    { id: "ancienne-base", date: "2026-11-04" }, // ligne sans colonne target_team_ids (base pas encore migrée)
  ];

  test("garde ceux de l'équipe de l'enfant et ceux de tout le club, pas ceux d'une autre équipe", () => {
    assert.deepEqual(upcomingEvents(events, TODAY, "t1").map((e) => e.id), ["stage-en-cours", "t1", "tous", "ancienne-base"]);
    assert.deepEqual(upcomingEvents(events, TODAY, "t2").map((e) => e.id), ["t2", "tous", "ancienne-base"]);
  });

  test("un événement sur plusieurs jours reste affiché jusqu'à sa fin", () => {
    assert.ok(upcomingEvents(events, "2026-10-09", "t1").some((e) => e.id === "stage-en-cours"));
    assert.ok(!upcomingEvents(events, "2026-10-10", "t1").some((e) => e.id === "stage-en-cours"));
  });
});

describe("covoiturage", () => {
  test("offres passées retirées ; sans date conservées, après les datées", () => {
    const offers = [{ id: "sans-date", date: null }, { id: "tard", date: "2026-11-01" }, { id: "passee", date: "2026-10-01" }, { id: "proche", date: "2026-10-08" }];
    assert.deepEqual(upcomingCarpoolOffers(offers, TODAY).map((o) => o.id), ["proche", "tard", "sans-date"]);
  });
});

describe("matchs et carnet de bord", () => {
  test("derniers matchs : du plus récent au plus ancien, un match sans date en dernier", () => {
    const stats = [
      { id: "ancien", matches: { date: "2026-08-30" } }, { id: "sans", matches: null },
      { id: "recent", matches: { date: "2026-10-04" } }, { id: "milieu", matches: { date: "2026-09-20" } },
    ];
    assert.deepEqual(recentMatchStats(stats).map((m) => m.id), ["recent", "milieu", "ancien", "sans"]);
  });

  test("carnet : du plus récent au plus ancien, à date égale la dernière note ajoutée d'abord", () => {
    const entries = [
      { id: "a", date: "2026-10-01", created_at: "2026-10-01T08:00:00Z" },
      { id: "c", date: "2026-10-03", created_at: "2026-10-03T08:00:00Z" },
      { id: "b2", date: "2026-10-02", created_at: "2026-10-02T20:00:00Z" },
      { id: "b1", date: "2026-10-02", created_at: "2026-10-02T09:00:00Z" },
    ];
    assert.deepEqual(sortJournal(entries).map((e) => e.id), ["c", "b2", "b1", "a"]);
  });
});

describe("programme individuel", () => {
  test("regroupé par thème dans l'ordre physique / technique / mental / tactique, jamais une clé technique", () => {
    const rows = [
      { id: "1", title: "Gainage", content: { theme: "physique", exerciseName: "Gainage", frequency: "3x/semaine", objectiveTitle: "" } },
      { id: "2", title: "Passes", content: { theme: "tactique", exerciseName: "Passes", frequency: "", objectiveTitle: "Jouer vers l'avant" } },
      { id: "3", title: "Conduite", content: { theme: "technique", exerciseName: "Conduite", frequency: "", objectiveTitle: "" } },
      { id: "4", title: "Inconnu", content: { theme: "theme_futur", exerciseName: "Inconnu" } },
      { id: "5", title: "Sans contenu", content: null },
      { id: "6", title: "", content: { theme: "physique" } },
    ];
    const groups = groupPrograms(rows);
    assert.deepEqual(groups.map((g) => g.label), ["Physique", "Technique", "Tactique", "Autres exercices"]);
    assert.deepEqual(groups[0].items, [{ id: "1", name: "Gainage", frequency: "3x/semaine", objectiveTitle: "" }]);
    assert.equal(groups[2].items[0].objectiveTitle, "Jouer vers l'avant");
    assert.deepEqual(groups[3].items.map((i) => i.name).sort(), ["Inconnu", "Sans contenu"]);
    assert.equal(groups.some((g) => g.items.some((i) => i.name === "")), false, "une ligne sans nom n'est pas affichée");
  });

  test("aucun programme : aucun groupe", () => {
    assert.deepEqual(groupPrograms([]), []);
    assert.deepEqual(groupPrograms(undefined), []);
  });
});
