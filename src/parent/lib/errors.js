import { classifyError } from "../../lib/supabaseErrors.js";
import { rateLimitWaitSeconds } from "../../lib/emailLogin.js";

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
  // Code ou lien de connexion refusé. Le serveur ne dit pas pourquoi (périmé, déjà utilisé, faux) : le message
  // couvre les trois, et donne l'issue qui marche à tous les coups, un nouvel e-mail et le code qu'il contient.
  otp: {
    title: "Ce code ou ce lien n'est plus valable",
    text: "Il a expiré ou il a déjà été utilisé (certaines messageries ouvrent les liens avant toi). Demande un nouveau code, puis saisis celui du dernier e-mail reçu : les anciens ne fonctionnent plus.",
  },
  code_format: {
    title: "Code incomplet",
    text: "Saisis les 6 chiffres du code reçu par e-mail.",
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

// « Trop de demandes » recouvre trois situations qui ne se règlent pas pareil :
//   - « tu ne peux redemander qu'après N secondes » : un e-mail vient déjà de partir vers cette adresse ;
//   - le plafond d'e-mails du portail pour l'heure est atteint (beaucoup de familles se connectent en même temps) :
//     inutile de redemander dans la minute, et ce n'est pas la faute du parent ;
//   - tout autre plafond : message générique.
function rateLimitMessage(err) {
  const wait = rateLimitWaitSeconds(err);
  if (wait !== null) {
    const seconds = Math.max(1, wait);
    return {
      title: "Un e-mail vient déjà de t'être envoyé",
      text: `Regarde ta boîte mail (et les indésirables) : saisis le code reçu. Tu pourras en demander un nouveau dans ${seconds} seconde${seconds > 1 ? "s" : ""}.`,
    };
  }
  if (err && err.code === "over_email_send_rate_limit") {
    return {
      title: "Beaucoup de connexions en ce moment",
      text: "Le portail ne peut pas envoyer d'autre e-mail pour l'instant. Réessaie dans une heure, ou préviens le staff du club.",
    };
  }
  return MESSAGES.rate_limit;
}

export function describeError(err) {
  const kind = classifyError(err);
  const base = kind === "rate_limit" ? rateLimitMessage(err) : (MESSAGES[kind] || MESSAGES.unknown);
  const technical = err && (err.message || String(err));
  return {
    kind,
    title: base.title,
    text: base.text,
    detail: (kind === "unknown" || kind === "server") && technical ? String(technical).slice(0, 300) : "",
  };
}
