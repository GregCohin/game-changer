import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { describeError } from "./lib/errors";
import { ConfirmationPage } from "../lib/ConfirmationPage.jsx";
import { isConfirmationHash, parseAuthRedirectError, parseConfirmationLink } from "../lib/emailLogin.js";

// Page d'arrivée du lien de connexion reçu par e-mail : parent.html#confirmation?token_hash=…&type=email.
// Comme PrivacyLayer : aucun routeur dans l'app parent, un signet d'URL suffit. Le jeton est dans la partie « # »
// de l'adresse, que le navigateur n'envoie jamais au serveur (ni journaux d'accès, ni en-tête Referer).
//
// Tant que la personne n'a pas appuyé sur le bouton, RIEN n'est vérifié (voir lib/ConfirmationPage.jsx) : un scanner
// de messagerie qui ouvre le lien ne consomme pas le jeton. Une fois connecté, ou si la personne repart de zéro,
// l'adresse est nettoyée (replaceState : pas d'entrée d'historique, et le jeton ne reste ni dans la barre d'adresse
// ni dans les signets) et l'app s'affiche.
//
// Cette couche explique aussi l'échec d'un ANCIEN lien magique (celui du modèle d'e-mail d'origine, qui passe par le
// serveur Supabase) : périmé ou déjà consommé, il revient sur #error=access_denied&error_code=otp_expired…, que
// supabase-js ignore. Sans ce message, le parent retombait sur l'écran de connexion sans comprendre pourquoi.
export function ConfirmationLayer({ children }) {
  const { confirmLink } = useAuth();
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const confirming = isConfirmationHash(hash);
  const redirectError = confirming ? null : parseAuthRedirectError(hash, window.location.search);
  if (!confirming && !redirectError) return children;

  function leave() {
    window.history.replaceState(null, "", window.location.pathname);
    setHash("");
    window.scrollTo(0, 0);
  }

  let link;
  if (redirectError) {
    const described = describeError(redirectError);
    link = { ok: false, title: described.title, reason: described.text };
  } else {
    link = parseConfirmationLink(hash, window.location.search);
  }

  return (
    <ConfirmationPage
      link={link}
      audience="parent"
      confirm={() => confirmLink(link.tokenHash, link.type)}
      describe={describeError}
      onDone={leave}
      onRestart={leave}
    />
  );
}
