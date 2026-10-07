import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { describeError } from "../lib/errors";
import { ErrorNotice, Field, ui } from "../ui";

// Délai avant de pouvoir redemander un lien : le service d'envoi limite les demandes rapprochées pour une
// même adresse (une par minute par défaut) ; au-delà, il répond « trop de demandes » et le parent croirait
// que ça ne marche pas.
const RESEND_DELAY_SECONDS = 60;

export function LoginScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendLink() {
    setError(null);
    setSending(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
      setCooldown(RESEND_DELAY_SECONDS);
    } catch (err) {
      setError(describeError(err));
    }
    setSending(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendLink();
  }

  if (sent) {
    return (
      <div style={styles.card}>
        <h1 style={styles.title}>Vérifie ta boîte mail</h1>
        <p>On a envoyé un lien de connexion à <strong>{email.trim()}</strong>. Clique sur ce lien pour accéder au portail.</p>
        <p>
          Tu ne le vois pas ? Regarde dans les <strong>indésirables (spam)</strong> : le premier message d'un nouvel
          expéditeur y atterrit souvent. Si tu l'y trouves, marque-le « non indésirable » pour que les prochains arrivent
          dans ta boîte principale.
        </p>
        <ErrorNotice error={error} />
        <button type="button" style={styles.button} disabled={sending || cooldown > 0} onClick={sendLink}>
          {sending ? "Envoi…" : cooldown > 0 ? `Renvoyer le lien (dans ${cooldown} s)` : "Renvoyer le lien"}
        </button>
        <button type="button" style={styles.secondary} onClick={() => { setSent(false); setError(null); }}>
          Changer d'adresse email
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h1 style={styles.title}>Portail joueur/parent</h1>
      <p>Connecte-toi avec ton adresse email pour accéder aux informations de ton enfant.</p>
      <form onSubmit={handleSubmit}>
        <Field id="login-email" label="Ton adresse email">
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="ton.email@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={ui.input}
          />
        </Field>
        <button type="submit" disabled={sending} style={styles.button}>
          {sending ? "Envoi…" : "Recevoir un lien de connexion"}
        </button>
      </form>
      <ErrorNotice error={error} />
    </div>
  );
}

const styles = {
  card: { maxWidth: 400, margin: "40px auto", padding: 24, color: "#EDEFEE", fontFamily: "sans-serif" },
  title: { fontSize: 22, marginBottom: 12 },
  button: { width: "100%", padding: 10, borderRadius: 6, border: "none", background: "#8a4fff", color: "white", cursor: "pointer", marginTop: 4 },
  secondary: { width: "100%", padding: 10, borderRadius: 6, border: "1px solid #555", background: "none", color: "#EDEFEE", cursor: "pointer", marginTop: 10 },
};
