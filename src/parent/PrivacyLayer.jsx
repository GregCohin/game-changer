import { useEffect, useState } from "react";
import { ConfidentialiteScreen } from "./screens/ConfidentialiteScreen";

// Page « Confidentialité et suppression du compte », accessible AVANT la connexion (l'information doit être
// lisible au moment où l'on saisit son adresse e-mail) comme après : un lien en bas de chaque page, et
// l'adresse parent.html#confidentialite. Aucun routeur dans l'app parent : un simple signet d'URL suffit, et
// il n'entre pas en conflit avec le retour du lien magique (#access_token=…).
const HASH = "#confidentialite";

export function PrivacyLayer({ children }) {
  const [open, setOpen] = useState(() => window.location.hash === HASH);

  useEffect(() => {
    const onHashChange = () => setOpen(window.location.hash === HASH);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function close() {
    // replaceState : retire le signet sans laisser un « # » vide ni créer d'entrée d'historique
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setOpen(false);
    window.scrollTo(0, 0);
  }

  if (open) return <ConfidentialiteScreen onBack={close} />;

  // Enveloppe flex : le lien reste en bas de l'écran quand le contenu est court, et suit le contenu quand il est long.
  return (
    <div style={styles.shell}>
      <div style={styles.content}>{children}</div>
      <footer style={styles.footer}>
        <a href={HASH} style={styles.link}>Confidentialité et suppression du compte</a>
      </footer>
    </div>
  );
}

const styles = {
  shell: { minHeight: "100%", display: "flex", flexDirection: "column" },
  content: { flex: "1 0 auto" },
  footer: { textAlign: "center", padding: "8px 16px 24px", fontFamily: "sans-serif" },
  link: { color: "#9aa5a0", fontSize: 14, display: "inline-block", padding: "12px 8px" },
};
