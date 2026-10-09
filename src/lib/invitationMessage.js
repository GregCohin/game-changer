// Message d'invitation d'une famille au portail parent + compteur d'invitations (écran « Portail parent » du staff).
//
// Rien n'est envoyé automatiquement : le staff copie le texte, ou l'ouvre dans sa messagerie / WhatsApp, et c'est
// lui qui appuie sur « Envoyer ». Le texte ne contient ni le prénom de l'enfant ni l'adresse du parent, et aucune
// adresse web construite ici (mailto:, wa.me) n'en contient non plus : le seul secret du message est le code
// d'invitation, qui voyage avec le message comme n'importe quel message envoyé par la même voie.
//
// Sans dépendance (testé sous Node) : l'horloge, le stockage et le générateur aléatoire sont des paramètres.

import { dateIsoLocal } from "./utils.js";

export const PORTAL_PAGE = "/parent.html";
export const PORTAL_URL_KEY = "tf_portal_public_url";       // adresse publique du portail, valable pour tout le club
export const INVITATION_LOG_KEY = "tf_portal_invitations_log"; // propre à CE navigateur : jamais exporté ni restauré

// ---- Adresse du portail ------------------------------------------------------------------------------------------

// Adresses qui n'existent que sur l'appareil ou le réseau du staff : inutiles dans un message pour des familles.
const PRIVATE_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.test|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1?\])$/i;

// Vérifie l'adresse que le staff a saisie (ou déduite de la page courante) et la met en forme.
//   { ok: true,  url, problem: "" }   adresse utilisable telle quelle dans un message ;
//   { ok: false, url: "", problem }   problème, écrit pour le staff.
// Une adresse sans chemin (« https://exemple.fr ») désigne l'app du staff : on la complète par la page du portail.
export function checkPortalUrl(input) {
  const bad = (problem) => ({ ok: false, url: "", problem });
  let text = String(input ?? "").trim();
  if (!text) return bad("Saisis l'adresse du portail parent, celle que les familles ouvriront.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;
  let url;
  try { url = new URL(text); } catch (e) { return bad("Cette adresse n'est pas valable. Exemple : https://football-analysis-ten.vercel.app"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") return bad("L'adresse doit commencer par https://.");
  if (url.username || url.password) return bad("L'adresse ne doit contenir ni identifiant ni mot de passe.");
  if (!url.hostname.includes(".") || PRIVATE_HOST_RE.test(url.hostname)) {
    return bad("Cette adresse ne s'ouvre que depuis cet appareil ou ce réseau : les familles ne pourraient pas l'ouvrir. Saisis l'adresse publique du portail.");
  }
  if (url.protocol === "http:") return bad("Utilise une adresse en https:// (http:// n'est pas sécurisé).");
  url.hash = "";
  url.search = "";
  if (url.pathname === "/") url.pathname = PORTAL_PAGE;
  return { ok: true, url: url.toString(), problem: "" };
}

// Adresse proposée par défaut : celle de la page courante, si elle est publique (en développement, sur
// localhost, rien n'est proposé plutôt qu'une adresse qui ne marcherait pas chez les familles).
export function defaultPortalUrl(origin) {
  const checked = checkPortalUrl(origin);
  return checked.ok ? checked.url : "";
}

// ---- Texte du message --------------------------------------------------------------------------------------------

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// « 21 octobre 2026 » (jour local de l'appareil) ; "" si la date est absente ou illisible.
export function formatLongDateFr(value) {
  if (!value) return "";
  const iso = dateIsoLocal(new Date(value));
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MONTHS_FR[m - 1]} ${y}`;
}

// { subject, body } — `body` en texte brut, lignes séparées par « \n ». Le staff peut le modifier avant de l'envoyer.
export function composeInvitation({ clubName = "", portalUrl, code, expiresAt = null, signature = "", now = new Date() }) {
  if (!portalUrl) throw new Error("Adresse du portail manquante.");
  if (!code) throw new Error("Code d'invitation manquant.");
  const club = String(clubName || "").trim();
  const stillValid = expiresAt && new Date(expiresAt).getTime() > new Date(now).getTime();
  const expiry = stillValid ? formatLongDateFr(expiresAt) : "";
  const lines = [
    "Bonjour,",
    "",
    `${club ? `Le club ${club}` : "Le club"} ouvre un portail pour les familles : prochains matchs et séances, objectifs de ton enfant, covoiturage et forum.`,
    "",
    "Pour y accéder :",
    `1. Ouvre cette adresse : ${portalUrl}`,
    "2. Saisis ton adresse e-mail. Tu reçois un e-mail avec un code à 6 chiffres : saisis-le sur la page, ou clique sur le lien de l'e-mail.",
    `3. Saisis ensuite ce code d'invitation pour relier ton compte à ton enfant : ${code}`,
    "",
    "Tu ne vois pas l'e-mail ? Regarde dans les indésirables (spam) : le premier message d'un nouvel expéditeur s'y range souvent. Marque-le « non indésirable » pour recevoir les suivants.",
    "",
    `Ce code est réservé à ta famille${expiry ? ` et valable jusqu'au ${expiry}` : ""}. Ne le diffuse pas, notamment dans un groupe de discussion.`,
  ];
  const sign = String(signature || "").trim();
  if (sign) lines.push("", sign);
  return {
    subject: `Ton accès au portail du club${club ? ` ${club}` : ""}`,
    body: lines.join("\n"),
  };
}

// Lien « e-mail » : sans destinataire (le staff le choisit dans sa messagerie, l'adresse du parent ne passe donc
// jamais par ici). Retours à la ligne en CRLF, comme l'attend la norme des liens mailto:.
export function mailtoLink({ subject, body }) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(String(body).replace(/\r?\n/g, "\r\n"))}`;
}

// Lien WhatsApp sans numéro : WhatsApp demande à qui l'envoyer.
export function whatsappLink({ body }) {
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

// ---- Journal et compteur d'invitations ---------------------------------------------------------------------------

// Plafonds d'envoi des e-mails de connexion (documentation officielle, consultée en oct. 2026 — à revoir si l'offre change) :
//   - Resend, offre gratuite : 100 e-mails par jour (3 000 par mois) ;
//   - Supabase Auth, avec un SMTP personnalisé : 30 e-mails par heure par défaut, réglable (Authentication → Rate Limits) ;
//   - un même parent ne peut redemander un e-mail qu'une fois par minute.
export const EMAIL_LIMITS = Object.freeze({ perHour: 30, perDay: 100 });
// Une famille invitée déclenche en pratique plus d'un e-mail de connexion (premier envoi, puis renvoi : indésirables,
// code expiré, deuxième parent…). On en compte 2 : une ESTIMATION, pas une mesure.
export const EMAILS_PER_INVITATION = 2;
export const WARN_RATIO = 0.7; // à partir de 70 % d'un plafond : avertissement

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LOG_KEEP_MS = 2 * DAY_MS;
const LOG_MAX = 500;
export const INVITATION_CHANNELS = ["copy", "email", "whatsapp"];

// Identifiant aléatoire d'un message préparé : plusieurs actions sur le même message (le copier, puis l'ouvrir dans
// WhatsApp) ne comptent que pour UNE invitation. Aucune donnée personnelle.
export function newInvitationId(cryptoSource = globalThis.crypto) {
  const bytes = new Uint8Array(8);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Relit le journal (tolérant : texte absent, JSON abîmé, entrées malformées) et écarte ce qui date de plus de 48 h.
export function parseInvitationLog(raw, now = Date.now()) {
  let list;
  try { list = JSON.parse(raw || "[]"); } catch (e) { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e.id === "string" && e.id && Number.isFinite(e.at) && e.at > now - LOG_KEEP_MS)
    .map((e) => ({ at: e.at, id: e.id, channel: INVITATION_CHANNELS.includes(e.channel) ? e.channel : "copy" }))
    .slice(-LOG_MAX);
}

// Note qu'un message a été copié / ouvert dans la messagerie / ouvert dans WhatsApp. `storage` : { getItem, setItem }.
// Renvoie { ok, events } ; ok = false si l'écriture a échoué (stockage plein) — le compteur est alors en dessous de la réalité.
export function recordInvitation(storage, { id, channel }, now = Date.now()) {
  const events = parseInvitationLog(storage.getItem(INVITATION_LOG_KEY), now);
  events.push({ at: now, id, channel: INVITATION_CHANNELS.includes(channel) ? channel : "copy" });
  const kept = events.slice(-LOG_MAX);
  try {
    storage.setItem(INVITATION_LOG_KEY, JSON.stringify(kept));
    return { ok: true, events: kept };
  } catch (e) {
    return { ok: false, events: kept };
  }
}

// Où en est-on par rapport aux plafonds d'e-mails de connexion ?
//   level : "ok" (sous 70 % des plafonds), "warn" (70 % ou plus), "stop" (plafond atteint selon l'estimation).
// Les durées sont glissantes (dernière heure, dernières 24 h) : plus prudent qu'un jour calendaire.
export function invitationBudget(events, now = Date.now()) {
  const distinct = (spanMs) => new Set(events.filter((e) => e.at > now - spanMs).map((e) => e.id)).size;
  const lastHour = distinct(HOUR_MS);
  const lastDay = distinct(DAY_MS);
  const emailsHour = lastHour * EMAILS_PER_INVITATION;
  const emailsDay = lastDay * EMAILS_PER_INVITATION;
  const hourRatio = emailsHour / EMAIL_LIMITS.perHour;
  const dayRatio = emailsDay / EMAIL_LIMITS.perDay;
  const ratio = Math.max(hourRatio, dayRatio);
  const level = ratio >= 1 ? "stop" : ratio >= WARN_RATIO ? "warn" : "ok";
  const limitingWindow = hourRatio >= dayRatio ? "hour" : "day";

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const headline = lastDay === 0
    ? ""
    : `${plural(lastDay, "invitation préparée", "invitations préparées")} depuis ce navigateur ces dernières 24 h, dont ${lastHour} dans la dernière heure.`;
  const estimate = lastDay === 0
    ? ""
    : `Estimation : environ ${EMAILS_PER_INVITATION} e-mails de connexion par famille, soit ${emailsDay} sur les ${EMAIL_LIMITS.perDay} autorisés par jour et ${emailsHour} sur les ${EMAIL_LIMITS.perHour} autorisés par heure.`;

  let advice = "";
  if (level === "warn" && limitingWindow === "hour") advice = `Tu approches du plafond horaire (${EMAIL_LIMITS.perHour} e-mails par heure) : attends une heure avant d'inviter d'autres familles.`;
  if (level === "stop" && limitingWindow === "hour") advice = `Plafond horaire atteint selon l'estimation : un parent qui demanderait son e-mail maintenant risque de ne pas le recevoir. Attends une heure avant d'inviter d'autres familles.`;
  if (level === "warn" && limitingWindow === "day") advice = `Tu approches du plafond quotidien (${EMAIL_LIMITS.perDay} e-mails par jour sur l'offre gratuite de Resend) : invite les familles restantes demain, ou par vagues.`;
  if (level === "stop" && limitingWindow === "day") advice = `Plafond quotidien atteint selon l'estimation : au-delà, les e-mails de connexion ne partent plus avant le lendemain. Invite les familles suivantes demain.`;

  return { lastHour, lastDay, emailsHour, emailsDay, hourRatio, dayRatio, level, limitingWindow, headline, estimate, advice };
}

// Conseils « par vagues » affichés à côté du compteur et repris dans docs/connexion-parent.md.
export const WAVE_STEPS = [
  "Invite une dizaine de familles, pas plus.",
  "Attends qu'elles se connectent : elles apparaissent dans « nouveaux parents liés à vérifier » ; confirme-les au fur et à mesure.",
  "Invite les suivantes une heure plus tard, ou le lendemain si le compteur est orange ou rouge.",
];
