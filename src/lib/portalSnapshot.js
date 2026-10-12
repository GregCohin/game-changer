// Construction de l'instantané envoyé au portail parent (fonction `publish_snapshot` de Supabase).
//
// Ce fichier est PUR : il ne lit ni localStorage ni le réseau, il reçoit les données locales du staff
// (rassemblées par buildPortalSnapshot dans App.jsx) et renvoie ce qu'il faut envoyer, plus un compte
// rendu de ce qu'il a écarté et pourquoi. Pur = testable (tests/portal-snapshot.test.mjs).
//
// Ce qu'il garantit (audit du 07/10/2026) :
//  - le format attendu par la base : noms de colonnes Postgres, dates AAAA-MM-JJ ou absentes (jamais ''),
//    heures HH:MM, aucun doublon d'identifiant ;
//  - « valider avant d'envoyer » : une fiche invalide (séance sans date, question de FAQ vide…) n'est pas
//    envoyée et est NOMMÉE dans `problems`, au lieu de faire échouer toute la publication avec un message
//    de base de données ;
//  - rien qui sorte du cadre du portail : blessures, objectifs et programmes des seuls joueurs de
//    l'effectif ; blessures réduites au statut de retour au jeu (jamais de diagnostic ni de champ
//    clinique : la ligne est reconstruite champ par champ, jamais recopiée) ; événements et sujets du
//    forum réservés au staff ou destinés à d'autres équipes jamais publiés.
//
// Ce qui est « écarté » se divise en deux : `problems` (fiches à corriger côté staff) et `notices`
// (exclusions voulues, signalées pour que l'absence ne surprenne pas).

import { formatDateFr, todayIso } from "./utils.js";

const THREAD_TYPES = ["general", "event", "individuelle"];

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null || typeof v === "object" ? "" : String(v).trim());
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
// Valeur facultative absente = null, jamais '' : '' n'est pas une date valide pour Postgres (« invalid
// input syntax for type date »), et null dit honnêtement « pas de valeur ». La base normalise aussi
// (nullif), c'est une seconde sécurité.
const nul = (v) => (v === "" || v == null ? null : v);

// AAAA-MM-JJ réel (le 30 février n'existe pas, et Postgres le refuserait).
export function isIsoDate(v) {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// Date AAAA-MM-JJ utilisable, ou "" (absente ou invalide). Tolère un horaire accolé (« …T00:00:00Z »).
export function cleanDate(v) {
  const s = str(v);
  const day = s.length > 10 && /^[T ]/.test(s.slice(10)) ? s.slice(0, 10) : s;
  return isIsoDate(day) ? day : "";
}

// Heure HH:MM (0:00–23:59), ou "".
export function cleanTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// Horodatage ISO d'un nombre de millisecondes (Date.now()) ou d'une date en texte ; `fallbackMs` si absent
// ou illisible.
function isoFromMs(value, fallbackMs) {
  let n = fallbackMs;
  if (typeof value === "number" && Number.isFinite(value)) n = value;
  else if (typeof value === "string" && Number.isFinite(Date.parse(value))) n = Date.parse(value);
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const quoted = (name) => (name ? `« ${name} »` : "(sans nom)");
const onDate = (iso) => (iso ? ` du ${formatDateFr(iso)}` : "");

/**
 * @param {object} input
 *   teamId, seasonId        périmètre publié (équipe + saison actives)
 *   team, teams             équipe active et toutes les équipes ({ id, name, category }) — pour traduire une
 *                           catégorie convoquée en équipes
 *   locations               lieux du club ({ id, name }) — pour nommer le lieu d'un événement
 *   today                   AAAA-MM-JJ local (défaut : aujourd'hui) — les événements terminés ne sont pas publiés
 *   roster                  effectif (tf_roster)
 *   devPlans, programs      objectifs et programmes individuels, indexés par identifiant de joueur
 *   injuries, sessions, faq, clubEvents, carpool    tableaux locaux tels que stockés
 *   competitions            liste des compétitions (chacune avec ses `fixtures`)
 *   matches                 matchs clôturés ({ id, name, date })
 *   matchStats              statistiques par joueur et par match ({ matchId, playerId, buts, passesDecisives, highlights })
 *   forumThreads, forumMessages   sujets et messages locaux
 *   nowMs                   horloge (tests)
 * @returns {{ snapshot: object|null, blocking: string[], problems: {what:string,label:string,reason:string}[], notices: string[] }}
 *   `snapshot` est null quand `blocking` n'est pas vide : la publication ne doit pas partir.
 */
export function assemblePortalSnapshot(input) {
  const teamId = str(input.teamId);
  const seasonId = str(input.seasonId);
  const teams = arr(input.teams);
  const team = input.team || teams.find((t) => str(t && t.id) === teamId) || null;
  const today = cleanDate(input.today) || todayIso();
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();

  const blocking = [];
  const problems = [];
  const notices = [];
  const problem = (what, label, reason) => problems.push({ what, label, reason });

  if (!teamId || !seasonId) blocking.push("Équipe ou saison active introuvable : rien à publier.");

  // ---- Joueurs : l'effectif envoyé est le périmètre de tout le reste ----

  const playerLabel = new Map();
  const rosterIds = new Set();
  const players = [];
  let duplicates = 0;
  for (const p of arr(input.roster)) {
    if (!p || typeof p !== "object") continue;
    const id = str(p.id);
    const first = str(p.firstName) || str(p.name);
    const last = str(p.lastName);
    const label = [first, last].filter(Boolean).join(" ");
    if (!id) { problem("Joueur", quoted(label), "identifiant interne manquant"); continue; }
    if (!first && !last) { problem("Joueur", `n° ${id}`, "aucun nom"); continue; }
    if (rosterIds.has(id)) { duplicates++; continue; }
    rosterIds.add(id);
    playerLabel.set(id, label);
    players.push({ id, first_name: first, last_name: last, position: nul(str(p.position)) });
  }
  if (players.length === 0 && blocking.length === 0) {
    blocking.push("L'effectif est vide : rien à publier. Sur un navigateur neuf (ou après avoir vidé le stockage), restaure d'abord ta sauvegarde.");
  }

  // Les collections ci-dessous qui dépendent d'un joueur ne gardent que ceux de l'effectif ; on compte
  // ce qui est écarté pour le signaler.
  const orphanCount = (byPlayer) =>
    Object.entries(byPlayer || {}).reduce((n, [pid, list]) => n + (rosterIds.has(pid) ? 0 : arr(list).length), 0);

  // ---- Objectifs de développement ----

  const seenGoals = new Set();
  const development_goals = [];
  for (const p of players) {
    for (const g of arr(input.devPlans && input.devPlans[p.id])) {
      const id = str(g && g.id), title = str(g && g.title);
      if (!id || !title) { problem("Objectif", `${playerLabel.get(p.id)} — ${quoted(title)}`, !title ? "titre manquant" : "identifiant interne manquant"); continue; }
      if (seenGoals.has(id)) { duplicates++; continue; }
      seenGoals.add(id);
      development_goals.push({ id, player_id: p.id, label: title, status: nul(str(g.status)) });
    }
  }

  // ---- Programmes individuels ----
  // Le titre publié est le nom de l'exercice : les entrées de tf_individual_programs n'ont pas de champ
  // `title` (c'était la cause du NOT NULL qui faisait échouer toute publication). Le détail utile au
  // parent est regroupé dans `content` ; l'objectif lié est résolu ici en titre lisible.

  const seenPrograms = new Set();
  const individual_programs = [];
  for (const p of players) {
    const objectives = arr(input.devPlans && input.devPlans[p.id]);
    for (const pr of arr(input.programs && input.programs[p.id])) {
      const id = str(pr && pr.id), name = str(pr && pr.exerciseName);
      if (!id || !name) { problem("Programme individuel", playerLabel.get(p.id), !name ? "exercice sans nom" : "identifiant interne manquant"); continue; }
      if (seenPrograms.has(id)) { duplicates++; continue; }
      seenPrograms.add(id);
      const objective = pr.objectiveId ? objectives.find((o) => o && o.id === pr.objectiveId) : null;
      individual_programs.push({
        id, player_id: p.id, title: name,
        content: { theme: str(pr.theme), exerciseName: name, frequency: str(pr.frequency), objectiveTitle: objective ? str(objective.title) : "" },
      });
    }
  }

  // ---- Blessures : statut de retour au jeu seulement ----

  const seenInjuries = new Set();
  const injuries = [];
  let orphanInjuries = 0;
  for (const i of arr(input.injuries)) {
    const pid = str(i && i.playerId);
    if (!rosterIds.has(pid)) { orphanInjuries++; continue; }
    const id = str(i.id), status = str(i.status);
    if (!id || !status) { problem("Blessure", playerLabel.get(pid), !status ? "statut manquant" : "identifiant interne manquant"); continue; }
    if (seenInjuries.has(id)) { duplicates++; continue; }
    seenInjuries.add(id);
    // Champ par champ, jamais `{ ...i }` : type, cause, notes et programme de soin restent chez le staff.
    injuries.push({ id, player_id: pid, status, rtp_stage: nul(str(i.rtpStage)) });
  }

  const orphanGoals = orphanCount(input.devPlans);
  const orphanPrograms = orphanCount(input.programs);
  if (orphanGoals) notices.push(`${plural(orphanGoals, "objectif", "objectifs")} d'un joueur qui n'est plus dans l'effectif : non publié${orphanGoals > 1 ? "s" : ""}.`);
  if (orphanPrograms) notices.push(`${plural(orphanPrograms, "programme individuel", "programmes individuels")} d'un joueur qui n'est plus dans l'effectif : non publié${orphanPrograms > 1 ? "s" : ""}.`);
  if (orphanInjuries) notices.push(`${plural(orphanInjuries, "blessure", "blessures")} d'un joueur qui n'est plus dans l'effectif : non publiée${orphanInjuries > 1 ? "s" : ""}.`);

  // ---- Séances ----

  const seenSessions = new Set();
  const sessions = [];
  for (const s of arr(input.sessions)) {
    const id = str(s && s.id), name = str(s && s.name), date = cleanDate(s && s.date);
    if (!id || !date) {
      const raw = str(s && s.date);
      problem("Séance", `${quoted(name)}${raw ? ` (« ${raw} »)` : ""}`, !date ? (raw ? "date invalide" : "date manquante") : "identifiant interne manquant");
      continue;
    }
    if (seenSessions.has(id)) { duplicates++; continue; }
    seenSessions.add(id);
    sessions.push({ id, date, label: nul(name), start_time: nul(cleanTime(s.startTime)), end_time: nul(cleanTime(s.endTime)) });
  }

  // ---- FAQ ----

  const seenFaq = new Set();
  const club_faq = [];
  for (const f of arr(input.faq)) {
    const id = str(f && f.id), question = str(f && f.question), answer = str(f && f.answer);
    if (!id || !question || !answer) {
      problem("Question de la FAQ", quoted(question), !question ? "question vide" : !answer ? "réponse vide" : "identifiant interne manquant");
      continue;
    }
    if (seenFaq.has(id)) { duplicates++; continue; }
    seenFaq.add(id);
    club_faq.push({ id, question, answer });
  }

  // ---- Événements du club (table commune à toutes les équipes) ----
  // Jamais publiés : ceux sans « Joueurs concernés » (réunions de staff…), ceux dont la convocation ne
  // désigne aucune équipe existante, et ceux déjà terminés. Les autres portent la liste des équipes
  // convoquées : les catégories sont traduites en équipes ici, car le parent ne connaît que l'équipe de
  // son enfant.

  const seenEvents = new Set();
  const club_events = [];
  let staffOnlyEvents = 0, unresolvedEvents = 0;
  for (const e of arr(input.clubEvents)) {
    if (!e || typeof e !== "object") continue;
    if (e.includePlayers === false) { staffOnlyEvents++; continue; }
    const id = str(e.id), name = str(e.name), date = cleanDate(e.date);
    const endDate = cleanDate(e.endDate);
    const lastDay = date && endDate && endDate >= date ? endDate : date;
    if (date && lastDay < today) continue; // terminé : sans intérêt pour un parent (et plus à corriger)
    if (!id || !name || !date) {
      const raw = str(e.date);
      problem("Événement du club", `${quoted(name)}${raw ? ` (« ${raw} »)` : ""}`, !name ? "nom manquant" : !date ? (raw ? "date invalide" : "date manquante") : "identifiant interne manquant");
      continue;
    }
    if (seenEvents.has(id)) { duplicates++; continue; }

    const targetIds = new Set(arr(e.targetTeamIds).map(str).filter(Boolean));
    const categories = arr(e.targetCategories).map(str).filter(Boolean);
    const hasTargets = targetIds.size > 0 || categories.length > 0;
    for (const t of teams) if (t && categories.includes(str(t.category)) && str(t.id)) targetIds.add(str(t.id));
    if (hasTargets && targetIds.size === 0) { unresolvedEvents++; continue; }

    seenEvents.add(id);
    const loc = arr(input.locations).find((l) => l && str(l.id) && str(l.id) === str(e.locationId));
    club_events.push({
      id, title: name, date, end_date: nul(endDate && endDate >= date ? endDate : ""),
      start_time: nul(cleanTime(e.startTime)), end_time: nul(cleanTime(e.endTime)),
      location: nul(loc ? str(loc.name) : ""), target_team_ids: [...targetIds],
    });
  }
  if (staffOnlyEvents) notices.push(`${plural(staffOnlyEvents, "événement", "événements")} sans « Joueurs concernés » (réservé${staffOnlyEvents > 1 ? "s" : ""} au staff) : non publié${staffOnlyEvents > 1 ? "s" : ""}.`);
  if (unresolvedEvents) notices.push(`${plural(unresolvedEvents, "événement", "événements")} convoquant une catégorie ou une équipe qui n'existe pas dans Club → Équipes : non publié${unresolvedEvents > 1 ? "s" : ""}.`);

  // ---- Covoiturage ----

  const seenOffers = new Set();
  const carpool_offers = [];
  for (const o of arr(input.carpool)) {
    const id = str(o && o.id), driver = str(o && o.driverName);
    const rawDate = str(o && o.eventDate), date = cleanDate(o && o.eventDate);
    if (!id || !driver || (rawDate && !date)) {
      problem("Offre de covoiturage", `${quoted(str(o && o.eventTitle))}${driver ? ` (conducteur : ${driver})` : ""}`, !driver ? "conducteur manquant" : !id ? "identifiant interne manquant" : "date invalide");
      continue;
    }
    if (seenOffers.has(id)) { duplicates++; continue; }
    seenOffers.add(id);
    const seats = Math.trunc(Number(o.seats));
    carpool_offers.push({ id, driver_name: driver, event_label: nul(str(o.eventTitle)), date: nul(date), seats_total: Number.isFinite(seats) && seats > 0 ? seats : 0 });
  }

  // ---- Compétitions et rencontres ----

  const seenCompetitions = new Set(), seenFixtures = new Set();
  const competitions = [], fixtures = [];
  for (const c of arr(input.competitions)) {
    const id = str(c && c.id);
    if (!id) { problem("Compétition", quoted(str(c && c.name)), "identifiant interne manquant"); continue; }
    if (seenCompetitions.has(id)) { duplicates++; continue; }
    seenCompetitions.add(id);
    const name = str(c.name) || "Compétition";
    competitions.push({ id, name });
    for (const f of arr(c.fixtures)) {
      const fid = str(f && f.id), date = cleanDate(f && f.date), raw = str(f && f.date);
      if (!fid || !date) {
        problem("Match du calendrier", `${name} — vs ${str(f && f.opponent) || "(adversaire non renseigné)"}`, !date ? (raw ? `date invalide (« ${raw} »)` : "date manquante") : "identifiant interne manquant");
        continue;
      }
      if (seenFixtures.has(fid)) { duplicates++; continue; }
      seenFixtures.add(fid);
      fixtures.push({ id: fid, competition_id: id, date, opponent: nul(str(f.opponent)), location: nul(str(f.venue)) });
    }
  }

  // ---- Matchs analysés et statistiques ----

  const seenMatches = new Set();
  const matches = [];
  for (const m of arr(input.matches)) {
    const id = str(m && m.id), name = str(m && m.name), date = cleanDate(m && m.date), raw = str(m && m.date);
    if (!id || !date) {
      problem("Match analysé", quoted(name), !date ? (raw ? `date invalide (« ${raw} »)` : "date manquante") : "identifiant interne manquant");
      continue;
    }
    if (seenMatches.has(id)) { duplicates++; continue; }
    seenMatches.add(id);
    matches.push({ id, name: nul(name), date, closed: true });
  }

  const seenStats = new Set();
  const match_stats = [];
  const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.trunc(Number(v)) : 0);
  for (const s of arr(input.matchStats)) {
    const key = `${str(s && s.matchId)}\u0000${str(s && s.playerId)}`;
    if (!seenMatches.has(str(s && s.matchId)) || !rosterIds.has(str(s && s.playerId)) || seenStats.has(key)) continue;
    seenStats.add(key);
    match_stats.push({
      match_id: str(s.matchId), player_id: str(s.playerId), buts: count(s.buts), passes_decisives: count(s.passesDecisives),
      highlights: arr(s.highlights),
    });
  }

  // ---- Forum ----
  // Un sujet publié est lisible par les parents de l'équipe (sujet général ou lié à un événement) ou par
  // ses seuls participants (conversation individuelle). Donc jamais publiés : les sujets sans « Joueurs
  // concernés » (discussions de staff), ceux destinés à d'autres équipes, et les conversations qui ne
  // visent aucun joueur (entre membres du staff).

  const teamCategory = str(team && team.category);
  const seenThreads = new Set();
  const forum_threads = [];
  let staffOnlyThreads = 0, otherTeamThreads = 0, staffConversations = 0;
  for (const t of arr(input.forumThreads)) {
    if (!t || typeof t !== "object") continue;
    const id = str(t.id), title = str(t.title), type = str(t.type);
    if (!id || !title || !THREAD_TYPES.includes(type)) {
      problem("Sujet du forum", quoted(title), !title ? "titre manquant" : !id ? "identifiant interne manquant" : `type inconnu (« ${type} »)`);
      continue;
    }
    let targetPlayerIds = [];
    if (type === "individuelle") {
      targetPlayerIds = [...new Set(arr(t.targetIndividuals)
        .map((p) => (typeof p === "string" ? str(p) : p && p.kind === "player" ? str(p.id) : ""))
        .filter(Boolean))];
      if (targetPlayerIds.length === 0) { staffConversations++; continue; }
    } else {
      if (t.includePlayers === false) { staffOnlyThreads++; continue; }
      const targetTeams = arr(t.targetTeamIds).map(str).filter(Boolean);
      const targetCategories = arr(t.targetCategories).map(str).filter(Boolean);
      if ((targetTeams.length > 0 || targetCategories.length > 0)
        && !targetTeams.includes(teamId) && !(teamCategory && targetCategories.includes(teamCategory))) {
        otherTeamThreads++;
        continue;
      }
    }
    if (seenThreads.has(id)) { duplicates++; continue; }
    seenThreads.add(id);
    forum_threads.push({
      id, title, type, linked_event_title: nul(str(t.linkedEventTitle)), linked_event_date: nul(cleanDate(t.linkedEventDate)),
      created_at: isoFromMs(t.createdAt, nowMs), target_player_ids: targetPlayerIds,
    });
  }
  if (staffOnlyThreads) notices.push(`${plural(staffOnlyThreads, "sujet du forum", "sujets du forum")} sans « Joueurs concernés » (réservé${staffOnlyThreads > 1 ? "s" : ""} au staff) : non publié${staffOnlyThreads > 1 ? "s" : ""}.`);
  if (otherTeamThreads) notices.push(`${plural(otherTeamThreads, "sujet du forum", "sujets du forum")} destiné${otherTeamThreads > 1 ? "s" : ""} à d'autres équipes ou catégories : non publié${otherTeamThreads > 1 ? "s" : ""} depuis cette équipe.`);
  if (staffConversations) notices.push(`${plural(staffConversations, "conversation individuelle", "conversations individuelles")} sans joueur concerné (entre membres du staff) : non publiée${staffConversations > 1 ? "s" : ""}.`);

  // Messages du staff. Ceux ramenés des parents par « Récupérer les nouveautés » portent `fromPortal` :
  // ils ne sont jamais republiés, même si le message d'origine disparaissait un jour de la base (sinon
  // un message de parent supprimé ressusciterait sous la signature du staff).
  const seenMessages = new Set();
  const forum_messages = [];
  let textlessMessages = 0;
  for (const m of arr(input.forumMessages)) {
    if (!m || typeof m !== "object" || m.fromPortal) continue;
    const id = str(m.id), threadId = str(m.threadId);
    if (!seenThreads.has(threadId)) continue; // sujet non publié : ses messages non plus (déjà signalé plus haut)
    if (!id) continue;
    if (!str(m.content)) { textlessMessages++; continue; }
    if (seenMessages.has(id)) { duplicates++; continue; }
    seenMessages.add(id);
    forum_messages.push({ id, thread_id: threadId, author_name: str(m.authorName) || "Staff", content: String(m.content), at: isoFromMs(m.at, nowMs) });
  }
  if (textlessMessages) notices.push(`${plural(textlessMessages, "message du forum", "messages du forum")} sans texte (pièce jointe seule) : non publié${textlessMessages > 1 ? "s" : ""} — les pièces jointes ne sont pas publiées.`);

  if (duplicates) notices.push(`${plural(duplicates, "doublon", "doublons")} d'identifiant ignoré${duplicates > 1 ? "s" : ""}.`);

  if (blocking.length > 0) return { snapshot: null, blocking, problems, notices };

  return {
    snapshot: {
      team_id: teamId, season_id: seasonId,
      players, development_goals, individual_programs, injuries, sessions, club_faq, club_events, carpool_offers,
      competitions, fixtures, matches, match_stats, forum_threads, forum_messages,
    },
    blocking, problems, notices,
  };
}

// Étiquettes françaises des tables du compte rendu renvoyé par publish_snapshot (`counts`).
const COUNT_LABELS = [
  ["players", "joueur", "joueurs"], ["sessions", "séance", "séances"], ["fixtures", "match du calendrier", "matchs du calendrier"],
  ["matches", "match analysé", "matchs analysés"], ["club_events", "événement du club", "événements du club"],
  ["development_goals", "objectif", "objectifs"], ["individual_programs", "programme individuel", "programmes individuels"],
  ["injuries", "blessure suivie", "blessures suivies"], ["carpool_offers", "offre de covoiturage", "offres de covoiturage"],
  ["club_faq", "question de la FAQ", "questions de la FAQ"], ["forum_threads", "sujet du forum", "sujets du forum"],
  ["forum_messages", "message du staff", "messages du staff"],
];

// « 20 joueurs, 12 séances, … » à partir de `counts` ; les tables vides sont omises.
export function describePublishedCounts(counts) {
  return COUNT_LABELS
    .filter(([key]) => Number(counts && counts[key]) > 0)
    .map(([key, one, many]) => plural(Number(counts[key]), one, many))
    .join(", ");
}

// Conversations individuelles que personne ne peut lire (renvoyées par publish_snapshot ou par le
// contrôle avant publication) : texte à afficher au staff.
export function describeUnreachableThreads(threads) {
  const list = arr(threads);
  if (list.length === 0) return [];
  return list.map((t) =>
    `Conversation individuelle « ${str(t && t.title)} » : aucun parent n'est lié à ce joueur, donc personne ne peut la lire. Les parents ne sont rattachés qu'à la première publication du sujet : lie d'abord les parents (codes d'invitation), puis recrée la conversation.`
  );
}
