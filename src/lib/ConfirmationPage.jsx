import { useRef, useState } from "react";

// Page affichée quand quelqu'un ouvre le lien de connexion reçu par e-mail (…#confirmation?token_hash=…&type=email),
// pour le portail parent ET pour l'app du staff.
//
// Le jeton n'est vérifié QUE lorsque la personne appuie sur le bouton. Ouvrir la page ne consomme rien : c'est ce qui
// protège contre les scanners de messagerie (Outlook Safe Links, passerelles de sécurité…) qui ouvrent chaque lien d'un
// e-mail avant son destinataire et, avec un lien magique ordinaire, le « brûlent » (jeton à usage unique). Un scanner qui
// n'exécute pas de JavaScript ne voit jamais cette page ; un scanner qui en exécute ne clique pas sur un bouton.
//
// Les props décident de tout ce qui change selon l'application :
//   link      résultat de parseConfirmationLink (lib/emailLogin.js) : { ok: true, tokenHash, type } ou { ok: false, reason }
//             (+ `title` facultatif : l'erreur d'un ancien lien magique périmé arrive déjà décrite, voir parseAuthRedirectError)
//   confirm   async () => …    vérifie le jeton ; lève une erreur en cas d'échec
//   describe  (erreur) => { title, text }   message affichable
//   onDone    appelé une fois connecté
//   onRestart appelé par le bouton de repli (nouveau code côté parent, retour à l'app côté staff)
//   audience  "parent" | "staff"
//   buttonStyle  style ajouté aux boutons : le portail parent n'en a pas besoin (règles globales de parent.html :
//                16 px, 44 px de haut) ; l'app du staff n'en a pas.

const COPY = {
  parent: {
    intro: "Appuie sur le bouton pour te connecter au portail.",
    restart: "Recevoir un nouveau code",
  },
  staff: {
    intro: "Appuie sur le bouton pour te connecter avec ton compte staff.",
    restart: "Retourner à l'application",
  },
};

export function ConfirmationPage({ link, audience = "parent", confirm, describe, onDone, onRestart, buttonStyle }) {
  const copy = COPY[audience] || COPY.parent;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const running = useRef(false); // verrou : deux appuis très rapprochés ne lancent qu'une vérification

  async function handleConfirm() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    let ok = false;
    try {
      await confirm();
      ok = true;
    } catch (e) {
      setError(describe(e));
    }
    running.current = false;
    if (ok) onDone();
    else setBusy(false);
  }

  const failure = !link.ok ? { title: link.title || "Lien de connexion inutilisable", text: link.reason } : error;

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>{link.ok ? "Confirme ta connexion" : "Ce lien ne peut pas servir"}</h1>
      {link.ok && <p>{copy.intro}</p>}
      {link.ok && (
        <button type="button" style={{ ...styles.button, ...buttonStyle }} disabled={busy} onClick={handleConfirm}>
          {busy ? "Connexion…" : "Me connecter"}
        </button>
      )}
      {failure && (
        <div role="alert" style={styles.error}>
          <strong>{failure.title}</strong>
          <p style={{ margin: "6px 0 10px" }}>{failure.text}</p>
          <button type="button" style={{ ...styles.button, marginTop: 0, ...buttonStyle }} onClick={onRestart}>{copy.restart}</button>
        </div>
      )}
      {link.ok && !failure && (
        <p style={styles.note}>Cette étape évite qu'une messagerie utilise ton lien à ta place. Rien ne se passe tant que tu n'appuies pas.</p>
      )}
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  button: { width: "100%", padding: "12px 10px", borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer", marginTop: 4 },
  error: { border: "1px solid #ff6b6b", borderRadius: 8, padding: 12, margin: "16px 0 12px", color: "#ffd6d6", background: "rgba(255,107,107,0.08)" },
  note: { fontSize: 13, color: "#aab3ae", marginTop: 16 },
};
