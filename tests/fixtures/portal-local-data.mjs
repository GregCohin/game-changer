// Données locales du staff (formes réellement stockées par l'app, voir src/App.jsx) pour tester la
// publication vers le portail. Entièrement inventées : aucune donnée réelle dans le dépôt public.
// Partagées par tests/portal-snapshot.test.mjs (le constructeur d'instantané) et par
// supabase/tests/snapshot_contract.test.mjs (ce que la vraie base accepte).

export const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);

// Données locales du staff, dans les formes réellement stockées par l'app (voir App.jsx).
export function local(overrides = {}) {
  return {
    teamId: "t1", seasonId: "s1",
    team: { id: "t1", name: "U13", category: "U13" },
    teams: [{ id: "t1", name: "U13", category: "U13" }, { id: "t2", name: "U15", category: "U15" }],
    locations: [{ id: "loc1", name: "Stade municipal" }],
    today: "2026-10-07", nowMs: NOW,
    roster: [
      { id: "eff-01", firstName: "Léo", lastName: "Test", position: "Milieu" },
      { id: "p2", firstName: "Max", lastName: "Exemple", position: "" },
    ],
    devPlans: { "eff-01": [{ id: "g1", theme: "technique", title: "Pied faible", status: "En cours", description: "interne", progressNotes: "interne" }] },
    programs: { "eff-01": [{ id: "pr1", theme: "technique", exerciseId: "ex-9", exerciseName: "Conduite en slalom", frequency: "2x/semaine", objectiveId: "g1", addedAt: 1759000000000 }] },
    injuries: [{
      id: "j1", playerId: "eff-01", status: "en cours", rtpStage: "reprise_partielle",
      type: "Entorse de la cheville", category: "Ligamentaire", cause: "Choc", notes: "note médicale", dateDebut: "2026-09-30", dureeEstimeeJours: 21,
      programPhases: [{ label: "phase 1" }], programTemplateId: "tpl",
    }],
    sessions: [{ id: "se1", name: "Entraînement", date: "2026-10-14", startTime: "18:30", endTime: "20:00", blocks: [], presence: {} }],
    faq: [{ id: "f1", question: "Où se retrouve-t-on ?", answer: "Au stade." }],
    clubEvents: [{ id: "e1", name: "Tournoi du club", date: "2026-11-01", endDate: "", startTime: "", endTime: "", targetCategories: ["U13"], targetTeamIds: [], includePlayers: true, includeStaff: true, locationId: "loc1" }],
    carpool: [{ id: "c1", eventDate: "", eventTitle: "Match à l'extérieur", driverName: "Marc", seats: 3, departureLocation: "Parking", departureTime: "13:00", passengers: ["Un enfant"] }],
    competitions: [{ id: "k1", name: "Championnat", fixtures: [{ id: "x1", date: "2026-10-18", opponent: "FC Exemple", venue: "Domicile", ourScore: "", theirScore: "", label: "J5" }] }],
    matches: [{ id: "m1", name: "FC Exemple", date: "2026-09-20" }],
    matchStats: [{ matchId: "m1", playerId: "eff-01", buts: 1, passesDecisives: 2, highlights: [{ eventKey: "but", time: 12 }] }],
    forumThreads: [{ id: "th1", title: "Infos générales", type: "general", linkedEventTitle: "", linkedEventDate: "", createdAt: 1759300000000, targetCategories: [], targetTeamIds: [], includePlayers: true, includeStaff: true, targetIndividuals: [] }],
    forumMessages: [{ id: "fm1", threadId: "th1", authorName: "Coach", content: "Bienvenue", at: 1759300100000, attachment: null }],
    ...overrides,
  };
}

