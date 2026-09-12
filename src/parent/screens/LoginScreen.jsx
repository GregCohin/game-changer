import { useState } from "react";
import { useAuth } from "../AuthContext";

export function LoginScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError("Impossible d'envoyer le lien de connexion : " + err.message);
    }
    setSending(false);
  }

  if (sent) {
    return (
      <div style={styles.card}>
        <h1 style={styles.title}>Vérifie ta boîte mail</h1>
        <p>On a envoyé un lien de connexion à <strong>{email}</strong>. Clique sur ce lien pour accéder au portail.</p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Portail joueur/parent</h1>
      <p>Connecte-toi avec ton adresse email pour accéder aux informations de ton enfant.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          required
          placeholder="ton.email@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={sending} style={styles.button}>
          {sending ? "Envoi…" : "Recevoir un lien de connexion"}
        </button>
      </form>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  input: { width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #444", boxSizing: "border-box" },
  button: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer" },
  error: { color: "#ff6b6b", marginTop: 12 },
};
