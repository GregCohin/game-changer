import { ConfirmationPage } from "../lib/ConfirmationPage.jsx";
import { isConfirmationHash, parseAuthRedirectError, parseConfirmationLink } from "../lib/emailLogin.js";
import { classifyError } from "../lib/supabaseErrors.js";
import { confirmStaffLink, describeStaffLoginError } from "../lib/portalSync.js";

// Page d'arrivée du lien de connexion du staff : <adresse de l'app>/#confirmation?token_hash=…&type=email (le modèle
// d'e-mail Supabase utilise l'adresse de redirection que l'app a demandée, voir signInStaff). Affichée par src/main.jsx
// à la place de l'app tant que l'adresse porte ce signet ; le jeton n'est vérifié qu'à l'appui sur le bouton
// (lib/ConfirmationPage.jsx). Gère aussi le retour d'un ANCIEN lien magique périmé (#error=…otp_expired…).
export function arrivedFromEmailLink() {
  return isConfirmationHash(window.location.hash) || !!parseAuthRedirectError(window.location.hash, window.location.search);
}

export default function StaffConfirmation({ onDone }) {
  const hash = window.location.hash;
  const search = window.location.search;
  const redirectError = isConfirmationHash(hash) ? null : parseAuthRedirectError(hash, search);
  // Le texte d'un retour d'erreur vient de l'adresse, donc de n'importe qui : seul un lien périmé (famille « otp ») a un message
  // écrit ici ; toute autre erreur reçoit un texte fixe, jamais celui de l'adresse (un lien forgé n'affiche pas de texte libre).
  const link = redirectError
    ? classifyError(redirectError) === "otp"
      ? { ok: false, title: "Ce lien de connexion n'est plus valable", reason: describeStaffLoginError(redirectError) }
      : { ok: false, title: "Ce lien de connexion n'a pas pu servir", reason: "Redemande un e-mail de connexion depuis l'application, puis saisis le code à 6 chiffres qu'il contient." }
    : parseConfirmationLink(hash, search);

  function leave() {
    window.history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <ConfirmationPage
      link={link}
      audience="staff"
      confirm={() => confirmStaffLink(link.tokenHash, link.type)}
      describe={(err) => ({ title: "Connexion impossible", text: err.message })}
      onDone={leave}
      onRestart={leave}
      buttonStyle={{ fontSize: 16, minHeight: 44 }}
    />
  );
}
