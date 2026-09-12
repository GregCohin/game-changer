import { useState } from "react";
import { redeemInvitationCode } from "../lib/api";

export function LinkChildScreen({ onLinked }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [linkedPlayer, setLinkedPlayer] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setConfirming(true);
    try {
      const player = await redeemInvitationCode(code.trim().toUpperCase());
      if (!player) throw new Error("Code invalide ou expiré.");
      setLinkedPlayer(player);
    } catch (err) {
      setError(err.message);
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
        <button style={styles.button} onClick={onLinked}>Continuer</button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Code d'invitation</h1>
      <p>Le staff du club t'a remis un code pour lier ton compte à ton enfant. Saisis-le ci-dessous.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          required
          placeholder="ex. A3F9K2"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={confirming} style={styles.button}>
          {confirming ? "Vérification…" : "Valider le code"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  input: { width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box", textTransform: "uppercase" },
  button: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer" },
  error: { color: "#ff6b6b", marginTop: 12 },
};
