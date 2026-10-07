// « Récupérer les nouveautés » : lecture paginée des écritures des parents, curseur fiable, fusion sans
// doublon dans les données locales du staff. Pur (aucun accès réseau ni localStorage) : testable
// (tests/portal-pull.test.mjs).
//
// Défauts de l'audit du 07/10/2026 corrigés ici (point 3) :
//  - le curseur était l'horloge du NAVIGATEUR relevée à la fin de la récupération : une ligne créée
//    pendant la récupération, ou avec une horloge en avance, était perdue pour toujours. Le curseur est
//    maintenant le plus grand horodatage REÇU (horloge du serveur), et ne bouge pas s'il n'y a rien ;
//  - PostgREST plafonne chaque réponse (1000 lignes) et rien ne paginait, alors que le curseur avançait
//    quand même : tout le reste était perdu. On lit maintenant page après page jusqu'à une page vide ;
//  - une récupération relit toujours les dernières minutes avant le curseur (PULL_OVERLAP_MS) : une ligne
//    créée avant celle qu'on a vue mais validée après elle n'est ainsi jamais ratée. Les doublons que
//    cela provoque sont éliminés par identifiant à la fusion.

export const PULL_PAGE_SIZE = 500;
export const PULL_OVERLAP_MS = 5 * 60 * 1000;
export const PULL_MAX_PAGES = 400; // garde-fou : 200 000 lignes, jamais une boucle sans fin

// Lit toutes les pages d'une requête. `fetchPage(from, to)` renvoie { data, error } (un builder
// supabase-js avec .range(from, to)). On avance du nombre de lignes RÉELLEMENT reçues et on s'arrête à
// la première page vide : un plafond du serveur plus bas que la taille de page ne fait rien sauter.
export async function fetchAllPages(fetchPage, pageSize = PULL_PAGE_SIZE, maxPages = PULL_MAX_PAGES) {
  const rows = [];
  let from = 0;
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) return rows;
    rows.push(...data);
    from += data.length;
  }
  throw new Error("Trop de lignes à récupérer en une fois : réessaie (chaque essai avance).");
}

// Plus grand horodatage de `rows[key]`, en gardant la chaîne brute du serveur (microsecondes comprises)
// plutôt qu'une date JavaScript arrondie à la milliseconde. `previous` si rien de plus récent.
export function latestTimestamp(rows, key, previous = null) {
  let best = previous || null;
  let bestMs = best ? Date.parse(best) : -Infinity;
  if (Number.isNaN(bestMs)) { best = null; bestMs = -Infinity; }
  for (const row of rows || []) {
    const value = row && row[key];
    if (typeof value !== "string") continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > bestMs) { best = value; bestMs = ms; }
  }
  return best;
}

// Borne basse (exclue) à envoyer au serveur : le curseur reculé de PULL_OVERLAP_MS, ou l'origine des temps.
export function pullLowerBound(cursor) {
  const ms = cursor ? Date.parse(cursor) : NaN;
  if (!Number.isFinite(ms)) return "1970-01-01T00:00:00.000Z";
  return new Date(Math.max(0, ms - PULL_OVERLAP_MS)).toISOString();
}

/**
 * Fusionne ce qui vient d'être récupéré dans les données locales du staff, sans doublon.
 * @param {{ journal?: object[], carpoolOffers?: object[], forumMessages?: object[] }} local
 * @param {{ journalEntries?: object[], carpoolPassengers?: {offerId:string, passengerName:string}[], forumMessages?: object[] }} pulled
 * @returns {{ journal: object[], carpoolOffers: object[], forumMessages: object[], added: {journal:number, passengers:number, messages:number} }}
 *   `added` ne compte que les VRAIES nouveautés : relire les dernières minutes (recouvrement du curseur)
 *   ne fait pas afficher « 1 nouveau message » à chaque récupération.
 */
export function mergePulledUpdates(local, pulled) {
  const journal = [...(local.journal || [])];
  const journalIds = new Set(journal.map((j) => j && j.id));
  let addedJournal = 0;
  for (const entry of pulled.journalEntries || []) {
    if (!entry || journalIds.has(entry.id)) continue;
    journalIds.add(entry.id);
    journal.push(entry);
    addedJournal++;
  }

  // Les offres sont modifiées sur une copie : l'appelant n'est jamais muté par surprise.
  const carpoolOffers = (local.carpoolOffers || []).map((o) => ({ ...o, passengers: Array.isArray(o.passengers) ? [...o.passengers] : [] }));
  let addedPassengers = 0;
  for (const p of pulled.carpoolPassengers || []) {
    const offer = carpoolOffers.find((o) => o.id === p.offerId);
    if (!offer || !p.passengerName || offer.passengers.includes(p.passengerName)) continue;
    offer.passengers.push(p.passengerName);
    addedPassengers++;
  }

  const forumMessages = [...(local.forumMessages || [])];
  const messageIds = new Set(forumMessages.map((m) => m && m.id));
  let addedMessages = 0;
  for (const m of pulled.forumMessages || []) {
    if (!m || messageIds.has(m.id)) continue;
    messageIds.add(m.id);
    forumMessages.push(m);
    addedMessages++;
  }

  return { journal, carpoolOffers, forumMessages, added: { journal: addedJournal, passengers: addedPassengers, messages: addedMessages } };
}
