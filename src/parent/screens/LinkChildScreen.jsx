import { useState } from "react";
import { redeemInvitationCode } from "../lib/api";
import { describeError } from "../lib/errors";
import { ErrorNotice, Field, ui } from "../ui";

// `onCancel` : présent quand le parent a déjà un enfant lié et en ajoute un autre — il doit pouvoir
// revenir au portail. `onSignOut` : toujours proposé, pour qu'un parent connecté avec la mauvaise adresse
// ne reste pas bloqué sur cet écran.
export function LinkChildScreen({ onLinked, onCancel, onSignOut }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [linkedPlayer, setLinkedPlayer] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (confirming) return;
    setError(null);
    setConfirming(true);
    try {
      const player = await redeemInvitationCode(code.trim().toUpperCase());
      if (!player) throw new Error("Code invalide ou expiré.");
      setLinkedPlayer(player);
    } catch (err) {
      // Une erreur de la base sur un code (« Code invalide ou expiré ») est déjà écrite pour le parent ;
      // une coupure réseau, elle, ne doit pas se faire passer pour un mauvais code.
      const described = describeError(err);
      setError(described.kind === "unknown" ? { ...described, title: "Code non accepté", text: err.message || "Code invalide ou expiré.", detail: "" } : described);
    }
    setConfirming(false);
  }

  if (linkedPlayer) {
    return (
      <div style={styles.card}>
        <h1 style={styles.title}>Compte lié !</h1>
        <p>
          Ton compte est maintenant lié à <strong>{linkedPlayer.first_name} {linkedPlayer.last_name}</strong>.
        </p>
        <button type="button" style={styles.button} onClick={onLinked}>Continuer</button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Code d'invitation</h1>
      <p>Le staff du club t'a remis un code pour lier ton compte à ton enfant. Saisis-le ci-dessous.</p>
      <form onSubmit={handleSubmit}>
        <Field id="invitation-code" label="Code d'invitation">
          <input
            id="invitation-code"
            type="text"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ex. K7M2QX9PRT"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ ...ui.input, textTransform: "uppercase" }}
          />
        </Field>
        <button type="submit" disabled={confirming} style={styles.button}>
          {confirming ? "Vérification…" : "Valider le code"}
        </button>
      </form>
      <ErrorNotice error={error} />
      {onCancel && <button type="button" style={styles.secondary} onClick={onCancel}>Annuler</button>}
      {onSignOut && <button type="button" style={ui.linkButton} onClick={onSignOut}>Se déconnecter</button>}
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  button: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer", marginTop: 4 },
  secondary: { width: "100%", padding: 10, borderRadius: 6, border: "1px solid #555", background: "none", color: "#EDEFEE", cursor: "pointer", marginTop: 10 },
};
