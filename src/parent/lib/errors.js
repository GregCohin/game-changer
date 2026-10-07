import { classifyError } from "../../lib/supabaseErrors.js";

// Message affichable au parent pour une erreur de chargement ou d'envoi. Le point important (audit du
// 07/10/2026) : « le serveur ne répond pas » ne doit JAMAIS ressembler à « aucun enfant lié » — avant,
// toute erreur de chargement renvoyait le parent sur l'écran du code d'invitation.
//
// `detail` (texte technique) n'est donné que pour les erreurs que le parent ne sait pas interpréter :
// il pourra le recopier ou le photographier pour le staff. Jamais pour une simple coupure réseau.
const MESSAGES = {
  network: {
    title: "Impossible de joindre le serveur",
    text: "Vérifie ta connexion internet, puis réessaie. Si ta connexion est bonne, le portail est peut-être momentanément indisponible : réessaie un peu plus tard.",
  },
  auth: {
    title: "Ta session a expiré",
    text: "Reconnecte-toi pour continuer.",
  },
  forbidden: {
    title: "Accès refusé",
    text: "Ton compte n'a pas accès à cette information. Si cela te semble anormal, préviens le staff du club.",
  },
  rate_limit: {
    title: "Trop de demandes",
    text: "Attends une minute puis réessaie.",
  },
  missing_function: {
    title: "Portail en cours de mise à jour",
    text: "Réessaie dans quelques minutes.",
  },
  server: {
    title: "Le serveur a rencontré un problème",
    text: "Réessaie dans quelques instants. Si le problème continue, préviens le staff du club.",
  },
  unknown: {
    title: "Une erreur est survenue",
    text: "Réessaie. Si le problème continue, préviens le staff du club.",
  },
};

export function describeError(err) {
  const kind = classifyError(err);
  const base = MESSAGES[kind] || MESSAGES.unknown;
  const technical = err && (err.message || String(err));
  return {
    kind,
    title: base.title,
    text: base.text,
    detail: (kind === "unknown" || kind === "server") && technical ? String(technical).slice(0, 300) : "",
  };
}
