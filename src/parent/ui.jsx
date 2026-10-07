import { useCallback, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { describeError } from "./lib/errors";

// Éléments communs des écrans parent : styles, bloc d'erreur, champ avec libellé, envoi protégé contre
// le double appui. Les règles de confort téléphone (champs à 16 px, cibles tactiles à 44 px, bouton
// désactivé grisé, coupure des mots longs) vivent dans les règles CSS globales de parent.html : elles
// s'appliquent à tout ce qui est écrit ici, sans qu'aucun style en ligne n'ait à les répéter (ni à les
// écraser : ne jamais poser de `fontSize` ou de `minHeight` sur un champ ou un bouton).

const button = { padding: "6px 12px", borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer" };

export const ui = {
  section: { marginBottom: 24 },
  h2: { fontSize: 16, marginBottom: 8, color: "#ccc" },
  card: { background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 10, marginBottom: 8 },
  meta: { fontSize: 13, color: "#aab3ae", marginTop: 2 },
  empty: { color: "#aab3ae" },
  label: { display: "block", fontSize: 14, color: "#ccc", marginBottom: 4 },
  input: { width: "100%", padding: 10, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box" },
  textarea: { width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box" },
  button,
  cardButton: { ...button, marginTop: 10 }, // bouton sous du texte, dans une carte
  secondaryButton: { padding: "6px 12px", borderRadius: 6, border: "1px solid #555", background: "none", color: "#EDEFEE", cursor: "pointer" },
  linkButton: { background: "none", border: "none", color: "#b794ff", cursor: "pointer", padding: "6px 0", textDecoration: "underline" },
  error: { border: "1px solid #ff6b6b", borderRadius: 8, padding: 12, marginBottom: 12, color: "#ffd6d6", background: "rgba(255,107,107,0.08)" },
};

// Libellé visible + champ relié (htmlFor/id) : un placeholder seul disparaît à la saisie et ne se lit
// pas avec un lecteur d'écran. `children` est le champ, qui doit porter le même `id`.
export function Field({ id, label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={ui.label}>{label}</label>
      {children}
    </div>
  );
}

// Erreur affichée au parent, avec « Réessayer » quand un nouvel essai a un sens. Une session expirée
// propose « Se reconnecter » à la place (réessayer ne servirait à rien).
export function ErrorNotice({ error, onRetry }) {
  const { signOut } = useAuth();
  if (!error) return null;
  return (
    <div role="alert" style={ui.error}>
      <strong>{error.title}</strong>
      <p style={{ margin: "6px 0 10px" }}>{error.text}</p>
      {error.detail && <p style={{ margin: "0 0 10px", fontSize: 12, opacity: 0.8 }}>Détail technique : {error.detail}</p>}
      {error.kind === "auth"
        ? <button type="button" style={ui.button} onClick={signOut}>Se reconnecter</button>
        : onRetry && <button type="button" style={ui.button} onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

// Lance une action d'envoi (note, message, inscription…) en ignorant tout nouvel appui tant qu'elle
// n'est pas terminée. Le verrou est une référence, pas seulement un état : deux appuis très rapprochés
// partent avant que React ait redessiné le bouton désactivé, et sans cela les deux envoyaient.
//   run(action, describe?) -> true si l'action a réussi, false sinon (l'erreur est alors dans `error`).
export function useAsyncAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const running = useRef(false);

  const run = useCallback(async (action, describe = describeError) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(describe(e));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { run, busy, error, clearError };
}
