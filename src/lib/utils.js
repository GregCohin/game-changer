// Petits utilitaires génériques (date, heure, âge, identifiants) — extrait de App.jsx (séparation
// des fichiers, sans changement de comportement). Aucune dépendance, réutilisable partout.

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function formatDateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function computeAge(birthDateIso) {
  if (!birthDateIso) return null;
  const birth = new Date(birthDateIso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// --- Dates AAAA-MM-JJ ---------------------------------------------------------------------------
// Pourquoi ces fonctions : `new Date("2027-03-14")` vaut minuit UTC (01:00 ou 02:00 à Paris). Si on
// l'avance ensuite en heure locale (`setDate`) puis qu'on relit `toISOString()` (UTC), le passage à
// l'heure d'été décale la date d'un jour (01:00 d'été = 23:00 UTC la veille) : un événement du
// mercredi tombait le mardi. Même piège avec `new Date().toISOString().slice(0, 10)` : entre minuit
// et 1 h/2 h du matin, il est encore la veille en UTC.
// Règle du projet : « aujourd'hui » = `todayIso()` (date locale) ; décaler une date = `addDaysIso`
// / `addMonthsIso` (arithmétique UTC pure) ; ne jamais écrire `toISOString().slice(0, 10)` ailleurs
// que dans ce fichier (tests/dates.test.mjs le vérifie).

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseIsoDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === "string" ? iso : "");
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

// Date LOCALE (celle que l'utilisateur lit sur son horloge) d'un objet Date ou d'un horodatage ;
// "" si la valeur n'est pas une date valide.
export function dateIsoLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso() {
  return dateIsoLocal(new Date());
}

// iso + N jours (N négatif possible). "" si `iso` n'est pas une date AAAA-MM-JJ.
export function addDaysIso(iso, days) {
  const p = parseIsoDay(iso);
  if (!p) return "";
  const n = Math.trunc(Number(days)) || 0;
  const t = Date.UTC(p.y, p.m - 1, p.d + n);
  if (isNaN(t)) return ""; // décalage absurde (hors des dates représentables)
  const out = new Date(t).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : ""; // année hors 0000-9999
}

// iso + N mois. Si le jour n'existe pas dans le mois d'arrivée, on prend le dernier jour du mois
// (31 janvier + 1 mois = 28 février), au lieu de déborder sur le mois suivant comme `setMonth`.
export function addMonthsIso(iso, months) {
  const p = parseIsoDay(iso);
  if (!p) return "";
  const total = p.y * 12 + (p.m - 1) + (Math.trunc(Number(months)) || 0);
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  if (!(y >= 0 && y <= 9999)) return ""; // décalage absurde
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${pad2(m + 1)}-${pad2(Math.min(p.d, lastDay))}`;
}

// Nombre de jours entiers entre deux dates AAAA-MM-JJ (a - b). NaN si l'une n'est pas une date.
export function diffDaysIso(a, b) {
  const pa = parseIsoDay(a);
  const pb = parseIsoDay(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

// Dates d'occurrence d'un événement récurrent, de `startIso` à `untilIso` inclus : toutes les
// semaines (même jour de la semaine) ou tous les mois (même quantième, ramené au dernier jour du
// mois s'il n'existe pas). Chaque occurrence se calcule depuis la date de départ — jamais depuis la
// précédente — pour qu'aucun décalage ne s'accumule. Garde-fou à `maxCount` occurrences (~2 ans en
// hebdomadaire) contre une date de fin saisie à tort. Dates invalides : seule la date de départ.
export function occurrenceDatesIso(startIso, untilIso, frequency, maxCount = 104) {
  if (!parseIsoDay(startIso) || !parseIsoDay(untilIso) || untilIso < startIso) return [startIso];
  const dates = [];
  for (let k = 0; k < maxCount; k++) {
    const day = frequency === "monthly" ? addMonthsIso(startIso, k) : addDaysIso(startIso, 7 * k);
    if (!day || day > untilIso) break;
    dates.push(day);
  }
  return dates.length > 0 ? dates : [startIso];
}

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Un joueur ou un membre du staff peut avoir un surnom, affiché à la place du nom partout sur le
// site si `displayNickname` est coché sur sa fiche (Effectif / Club → Staff). Le nom complet reste
// toujours la valeur stockée (utilisé pour le tri, l'export, le rapprochement de données externes
// via normalizeNameForMatch) — seul l'affichage change.
export function playerFullName(p) {
  if (p.displayNickname && p.nickname && p.nickname.trim()) return p.nickname.trim();
  if (p.firstName || p.lastName) return `${p.firstName || ""} ${p.lastName || ""}`.trim();
  return p.name || "Sans nom";
}

export function staffFullName(s) {
  if (s.displayNickname && s.nickname && s.nickname.trim()) return s.nickname.trim();
  return `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Sans nom";
}
