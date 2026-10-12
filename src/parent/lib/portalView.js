import { formatDateFr } from "../../lib/utils.js";

// Sélection, tri et mise en forme des données du portail — fonctions pures, sans React ni réseau
// (tests/parent-portal-view.test.mjs). Elles remplacent des listes qui affichaient tout, dans l'ordre
// de la base : « Séances à venir » montrait toute la saison, passées comprises et non triées (audit du
// 07/10/2026). Les dates sont des chaînes AAAA-MM-JJ, comparées comme des chaînes (aucun fuseau).

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

// « mar. 14/10/2026 », ou "" si la date est absente ou illisible.
export function formatDayFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === "string" ? iso : "");
  if (!m) return "";
  const weekday = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WEEKDAYS[weekday]} ${formatDateFr(iso.slice(0, 10))}`;
}

// « 18:30–20:00 », « 18:30 » ou "".
export function formatTimeRange(start, end) {
  if (start && end) return `${start}–${end}`;
  return start || "";
}

// Un jour, ou « du … au … » pour un événement sur plusieurs jours.
export function formatDateRange(date, endDate) {
  if (!date) return "";
  if (endDate && endDate > date) return `du ${formatDayFr(date)} au ${formatDayFr(endDate)}`;
  return formatDayFr(date);
}

const byDateThenTime = (a, b) =>
  String(a.date).localeCompare(String(b.date)) || String(a.start_time || "").localeCompare(String(b.start_time || ""));

// Séances d'aujourd'hui et à venir, de la plus proche à la plus lointaine.
export function upcomingSessions(sessions, today) {
  return (sessions || []).filter((s) => s.date && s.date >= today).sort(byDateThenTime);
}

// Rencontres d'aujourd'hui et à venir.
export function upcomingFixtures(fixtures, today) {
  return (fixtures || []).filter((f) => f.date && f.date >= today).sort(byDateThenTime);
}

// Événements du club non terminés (un stage de plusieurs jours reste affiché jusqu'à sa fin), destinés à
// l'équipe de l'enfant ou à tout le club. La base applique déjà ce ciblage (policy RLS) : ce filtre est
// une seconde sécurité, et reste correct si les lignes viennent d'une version plus ancienne de la base.
export function upcomingEvents(events, today, teamId) {
  return (events || [])
    .filter((e) => e.date && (e.end_date && e.end_date > e.date ? e.end_date : e.date) >= today)
    .filter((e) => !Array.isArray(e.target_team_ids) || e.target_team_ids.length === 0 || e.target_team_ids.includes(teamId))
    .sort(byDateThenTime);
}

// Offres de covoiturage à venir. Une offre sans date reste affichée (on ne peut pas dire qu'elle est
// passée), après celles qui en ont une.
export function upcomingCarpoolOffers(offers, today) {
  const upcoming = (offers || []).filter((o) => !o.date || o.date >= today);
  return [...upcoming.filter((o) => o.date).sort(byDateThenTime), ...upcoming.filter((o) => !o.date)];
}

// Statistiques de match, du plus récent au plus ancien.
export function recentMatchStats(matchStats) {
  return [...(matchStats || [])].sort((a, b) => String(b.matches?.date || "").localeCompare(String(a.matches?.date || "")));
}

// Carnet de bord, du plus récent au plus ancien.
export function sortJournal(entries) {
  return [...(entries || [])].sort(
    (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );
}

// Thèmes des objectifs et programmes : mêmes clés que DEV_THEMES dans src/App.jsx, recopiées ici parce
// que l'app parent n'importe jamais App.jsx (même raison que RTP_STAGE_LABELS dans PortailScreen.jsx).
export const PROGRAM_THEME_LABELS = { physique: "Physique", technique: "Technique", mental: "Mental", tactique: "Tactique" };

// Programme individuel regroupé par thème, dans l'ordre physique / technique / mental / tactique, puis le reste.
export function groupPrograms(programs) {
  const groups = new Map();
  for (const row of programs || []) {
    const content = row.content && typeof row.content === "object" ? row.content : {};
    const name = content.exerciseName || row.title;
    if (!name) continue;
    const key = PROGRAM_THEME_LABELS[content.theme] ? content.theme : "autre";
    if (!groups.has(key)) groups.set(key, { theme: key, label: PROGRAM_THEME_LABELS[key] || "Autres exercices", items: [] });
    groups.get(key).items.push({ id: row.id, name, frequency: content.frequency || "", objectiveTitle: content.objectiveTitle || "" });
  }
  const order = [...Object.keys(PROGRAM_THEME_LABELS), "autre"];
  return order.filter((k) => groups.has(k)).map((k) => groups.get(k));
}
